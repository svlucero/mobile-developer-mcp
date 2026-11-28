package mobile

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"time"
)

type Object = map[string]any

const maxReportBytes = 5 * 1024 * 1024

type DomainError struct{ Code, Message string }

func (e *DomainError) Error() string         { return e.Message }
func domainError(code, message string) error { return &DomainError{code, message} }

// Raw provider errors and response bodies never cross the MCP boundary.
func safeError(err error) Object {
	var known *DomainError
	if !errors.As(err, &known) {
		known = &DomainError{"PROVIDER", "The provider request could not be completed."}
	}
	return Object{"error": Object{"code": known.Code, "message": known.Message}}
}

type Options struct {
	Environment Environment
	HTTPClient  *http.Client
	GoogleToken func(context.Context, string) (string, error)
	Now         func() time.Time
}

type Service struct {
	env         Environment
	http        *http.Client
	googleToken func(context.Context, string) (string, error)
	now         func() time.Time
}

func NewService(opts Options) *Service {
	if opts.Environment == nil {
		opts.Environment = os.Getenv
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	client := http.Client{Timeout: 30 * time.Second}
	if opts.HTTPClient != nil {
		client = *opts.HTTPClient
	}
	if client.Timeout == 0 {
		client.Timeout = 30 * time.Second
	}
	// Never forward credentials to a redirect target or follow signed URLs.
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	s := &Service{env: opts.Environment, http: &client, now: opts.Now, googleToken: opts.GoogleToken}
	if s.googleToken == nil {
		s.googleToken = s.googleAccessToken
	}
	return s
}

func readBounded(r io.Reader, limit int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil || int64(len(b)) > limit {
		return nil, domainError("PROVIDER", "The response exceeds its size limit or could not be read.")
	}
	return b, nil
}

func (s *Service) get(ctx context.Context, address, token string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, domainError("PROVIDER", "The provider request could not be created.")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	response, err := s.http.Do(req)
	if err != nil {
		return nil, domainError("PROVIDER", "The provider request could not be completed.")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		switch response.StatusCode {
		case 401, 403:
			return nil, domainError("AUTHORIZATION", "Provider credentials are invalid, expired, or lack permission.")
		case 404:
			return nil, domainError("NOT_FOUND", "The requested provider resource or report was not found.")
		case 429:
			return nil, domainError("PROVIDER", "The provider rate limited the request.")
		default:
			return nil, domainError("PROVIDER", "The provider could not complete the request.")
		}
	}
	if response.ContentLength > maxReportBytes {
		return nil, domainError("PROVIDER", "The response exceeds the 5 MiB size limit.")
	}
	return readBounded(response.Body, maxReportBytes)
}

func decodeJSON(data []byte, target any) error {
	if json.Unmarshal(data, target) != nil {
		return domainError("PROVIDER", "The provider returned an invalid response.")
	}
	return nil
}

func isMissing(err error) bool {
	var known *DomainError
	return errors.As(err, &known) && known.Code == "NOT_FOUND"
}

func pick(source Object, keys ...string) Object {
	out := Object{}
	for _, key := range keys {
		if value, ok := source[key]; ok && value != nil {
			out[key] = value
		}
	}
	return out
}

func text(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return jsonNumber(v)
	case json.Number:
		return v.String()
	}
	return ""
}
