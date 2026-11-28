package mobile

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const appleBase = "https://api.appstoreconnect.apple.com/v1"

type appleCredential struct{ KeyPath, KeyID, IssuerID string }

func (s *Service) appleCredentials(role string) (appleCredential, bool) {
	prefix := "APP_STORE_CONNECT"
	if role != "" {
		prefix += "_" + strings.ToUpper(role)
	}
	value := func(suffix string) string {
		if v := s.env(prefix + suffix); v != "" {
			return v
		}
		return s.env("APP_STORE_CONNECT" + suffix)
	}
	c := appleCredential{value("_KEY_PATH"), value("_KEY_ID"), value("_ISSUER_ID")}
	return c, c.KeyPath != "" && c.KeyID != "" && c.IssuerID != ""
}

func createAppleJWT(c appleCredential, now time.Time) (string, error) {
	data, err := os.ReadFile(c.KeyPath)
	if err != nil {
		return "", domainError("CONFIGURATION", "The local App Store Connect signing key could not be read.")
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return "", domainError("CONFIGURATION", "The local App Store Connect key is not valid PEM.")
	}
	var parsed any
	if block.Type == "EC PRIVATE KEY" {
		parsed, err = x509.ParseECPrivateKey(block.Bytes)
	} else {
		parsed, err = x509.ParsePKCS8PrivateKey(block.Bytes)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if err != nil || !ok || key.Curve != elliptic.P256() {
		return "", domainError("CONFIGURATION", "App Store Connect requires a P-256 ES256 signing key.")
	}
	encode := func(v any) string { b, _ := json.Marshal(v); return base64.RawURLEncoding.EncodeToString(b) }
	input := encode(Object{"alg": "ES256", "kid": c.KeyID, "typ": "JWT"}) + "." + encode(Object{"iss": c.IssuerID, "iat": now.Unix(), "exp": now.Unix() + 1140, "aud": "appstoreconnect-v1"})
	digest := sha256.Sum256([]byte(input))
	r, ss, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		return "", domainError("AUTHORIZATION", "The local App Store key could not sign a token.")
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	ss.FillBytes(signature[32:])
	return input + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (s *Service) appleGet(ctx context.Context, path string, q url.Values, role string) ([]byte, error) {
	c, ok := s.appleCredentials(role)
	if !ok {
		return nil, domainError("CONFIGURATION", "Local App Store Connect credentials are not configured.")
	}
	token, err := createAppleJWT(c, s.now())
	if err != nil {
		return nil, err
	}
	return s.get(ctx, appleBase+path+"?"+q.Encode(), token)
}

type appleItem struct {
	ID         string `json:"id"`
	Attributes Object `json:"attributes"`
}
type appleCollection struct {
	Data  []appleItem `json:"data"`
	Links struct {
		Next string `json:"next"`
	} `json:"links"`
}

func (s *Service) appleCollection(ctx context.Context, path string, q url.Values, role string) (appleCollection, error) {
	var result appleCollection
	data, err := s.appleGet(ctx, path, q, role)
	if err != nil {
		return result, err
	}
	if err = decodeJSON(data, &result); err != nil {
		return result, err
	}
	if result.Data == nil {
		return result, domainError("PROVIDER", "App Store Connect returned an invalid collection.")
	}
	return result, nil
}

func applePage(p Params) url.Values {
	q := url.Values{"limit": {strconv.Itoa(p.pageLimit())}}
	if p.Cursor != "" {
		q.Set("cursor", p.Cursor)
	}
	return q
}

func nextCursor(link string) string {
	u, err := url.Parse(link)
	if err != nil {
		return ""
	}
	return u.Query().Get("cursor")
}

func (s *Service) appleList(ctx context.Context, resource, appleID string, p Params) (Object, error) {
	q := applePage(p)
	var path, key string
	var fields []string
	switch resource {
	case "versions":
		path, key = "/apps/"+url.PathEscape(appleID)+"/appStoreVersions", "versions"
		fields = []string{"versionString", "platform", "appStoreState", "releaseType"}
		if p.Platform != "" {
			q.Set("filter[platform]", p.Platform)
		}
	case "builds":
		path, key = "/builds", "builds"
		q.Set("filter[app]", appleID)
		fields = []string{"version", "uploadedDate", "processingState", "usesNonExemptEncryption"}
		if p.Version != "" {
			q.Set("filter[version]", p.Version)
		}
	case "reviews":
		path, key = "/apps/"+url.PathEscape(appleID)+"/customerReviews", "reviews"
		fields = []string{"rating", "title", "body", "reviewerNickname", "createdDate", "territory"}
		if p.Territory != "" {
			q.Set("filter[territory]", p.Territory)
		}
	case "diagnostics":
		path, key = "/builds/"+url.PathEscape(p.BuildID)+"/diagnosticSignatures", "signatures"
		fields = []string{"diagnosticType", "signature", "weight"}
	}
	response, err := s.appleCollection(ctx, path, q, "")
	if err != nil {
		return nil, err
	}
	items := []Object{}
	for _, item := range response.Data {
		out := pick(item.Attributes, fields...)
		out["id"] = item.ID
		items = append(items, out)
	}
	result := Object{key: items}
	if cursor := nextCursor(response.Links.Next); cursor != "" {
		result["nextCursor"] = cursor
	}
	return result, nil
}

func (s *Service) appleSales(ctx context.Context, vendor string, p Params) (Object, error) {
	if _, err := time.Parse(time.DateOnly, p.Date); err != nil {
		return nil, domainError("CONFIGURATION", "Sales report date must be a valid YYYY-MM-DD date.")
	}
	q := url.Values{"filter[frequency]": {"DAILY"}, "filter[reportType]": {"SALES"}, "filter[reportSubType]": {"SUMMARY"}, "filter[reportDate]": {p.Date}, "filter[vendorNumber]": {vendor}}
	data, err := s.appleGet(ctx, "/salesReports", q, "sales")
	if isMissing(err) {
		return Object{"metrics": []Object{}, "reportAvailable": false}, nil
	}
	if err != nil {
		return nil, err
	}
	metrics, err := parseSales(data, p.Date)
	if err != nil {
		return nil, err
	}
	return Object{"metrics": metrics, "reportAvailable": true}, nil
}

func (s *Service) appleAnalytics(ctx context.Context, appleID string, p Params) (Object, error) {
	if p.InstanceID != "" {
		response, err := s.appleCollection(ctx, "/analyticsReportInstances/"+url.PathEscape(p.InstanceID)+"/segments", applePage(p), "analytics")
		if err != nil {
			return nil, err
		}
		segments := []Object{}
		for _, item := range response.Data {
			segments = append(segments, Object{"id": item.ID})
		}
		return Object{"segments": segments, "dataAvailable": len(segments) > 0}, nil
	}
	requests, err := s.appleCollection(ctx, "/apps/"+url.PathEscape(appleID)+"/analyticsReportRequests", applePage(p), "analytics")
	if err != nil {
		return nil, err
	}
	out := []Object{}
	for i, request := range requests.Data {
		if i >= p.pageLimit() {
			break
		}
		reports, err := s.appleCollection(ctx, "/analyticsReportRequests/"+url.PathEscape(request.ID)+"/reports", url.Values{"limit": {"1"}}, "analytics")
		if err != nil {
			return nil, err
		}
		row := Object{"id": request.ID, "reports": []Object{}}
		if len(reports.Data) > 0 {
			report := reports.Data[0]
			for key, value := range pick(report.Attributes, "name", "category") {
				row[key] = value
			}
			instances, err := s.appleCollection(ctx, "/analyticsReports/"+url.PathEscape(report.ID)+"/instances", url.Values{"limit": {strconv.Itoa(min(p.pageLimit(), 10))}}, "analytics")
			if err != nil {
				return nil, err
			}
			rows := []Object{}
			for j, instance := range instances.Data {
				if j >= min(p.pageLimit(), 10) {
					break
				}
				entry := pick(instance.Attributes, "processingDate")
				entry["id"] = instance.ID
				entry["reportId"] = report.ID
				rows = append(rows, entry)
			}
			row["reports"] = rows
		}
		out = append(out, row)
	}
	result := Object{"requests": out}
	if cursor := nextCursor(requests.Links.Next); cursor != "" {
		result["nextCursor"] = cursor
	}
	return result, nil
}
