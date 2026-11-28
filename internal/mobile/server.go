package mobile

import (
	"bytes"
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Params is the deliberately small public input contract shared by the read-only tools.
type Params struct {
	AppID               string   `json:"appId"`
	Track               string   `json:"track"`
	Limit               int      `json:"limit"`
	Cursor              string   `json:"cursor"`
	TranslationLanguage string   `json:"translationLanguage"`
	Start               string   `json:"start"`
	End                 string   `json:"end"`
	VersionCodes        []string `json:"versionCodes"`
	Types               []string `json:"types"`
	Dimension           string   `json:"dimension"`
	Platform            string   `json:"platform"`
	Version             string   `json:"version"`
	Territory           string   `json:"territory"`
	BuildID             string   `json:"buildId"`
	Date                string   `json:"date"`
	InstanceID          string   `json:"instanceId"`
	Provider            string   `json:"provider"`
}

var (
	languagePattern  = regexp.MustCompile(`^[a-z]{2,3}([_-][A-Z]{2})?$`)
	dimensionPattern = regexp.MustCompile(`^[a-z0-9_]{1,80}$`)
	territoryPattern = regexp.MustCompile(`^[A-Z]{2,3}$`)
	digitsOnly       = regexp.MustCompile(`^[0-9]+$`)
)

func (p Params) pageLimit() int {
	if p.Limit == 0 {
		return 50
	}
	return p.Limit
}

func decodeParams(raw json.RawMessage) (Params, error) {
	var p Params
	if len(raw) == 0 {
		raw = []byte("{}")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&p); err != nil || decoder.More() {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	if p.Limit < 0 || p.Limit > 100 || len(p.Cursor) > 1024 || len(p.AppID) > 100 || len(p.BuildID) > 100 || len(p.InstanceID) > 100 || len(p.Version) > 100 || len(p.Platform) > 30 {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	if p.TranslationLanguage != "" && !languagePattern.MatchString(p.TranslationLanguage) {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	if p.Dimension != "" && !dimensionPattern.MatchString(p.Dimension) {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	if p.Territory != "" && !territoryPattern.MatchString(p.Territory) {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	if len(p.VersionCodes) > 20 || len(p.Types) > 3 {
		return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
	}
	for _, code := range p.VersionCodes {
		if !digitsOnly.MatchString(code) {
			return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
		}
	}
	for _, kind := range p.Types {
		if kind != "CRASH" && kind != "ANR" && kind != "NON_FATAL" {
			return p, domainError("CONFIGURATION", "Tool arguments are invalid.")
		}
	}
	return p, nil
}

func requires(p Params, names ...string) error {
	for _, name := range names {
		value := map[string]string{"appId": p.AppID, "track": p.Track, "start": p.Start, "end": p.End, "buildId": p.BuildID, "date": p.Date}[name]
		if value == "" {
			return domainError("CONFIGURATION", "Required tool arguments are missing.")
		}
	}
	return nil
}

func schema(required ...string) Object {
	properties := Object{
		"appId": Object{"type": "string", "maxLength": 100}, "track": Object{"type": "string", "maxLength": 100}, "limit": Object{"type": "integer", "minimum": 1, "maximum": 100, "default": 50}, "cursor": Object{"type": "string", "maxLength": 1024},
		"translationLanguage": Object{"type": "string", "pattern": "^[a-z]{2,3}([_-][A-Z]{2})?$"}, "start": Object{"type": "string"}, "end": Object{"type": "string"}, "versionCodes": Object{"type": "array", "maxItems": 20, "items": Object{"type": "string", "pattern": "^[0-9]+$"}},
		"types": Object{"type": "array", "maxItems": 3, "items": Object{"type": "string", "enum": []string{"CRASH", "ANR", "NON_FATAL"}}}, "dimension": Object{"type": "string", "pattern": "^[a-z0-9_]{1,80}$"}, "platform": Object{"type": "string", "maxLength": 30}, "version": Object{"type": "string", "maxLength": 100},
		"territory": Object{"type": "string", "pattern": "^[A-Z]{2,3}$"}, "buildId": Object{"type": "string", "maxLength": 100}, "date": Object{"type": "string", "format": "date"}, "instanceId": Object{"type": "string", "maxLength": 100}, "provider": Object{"type": "string", "enum": []string{"google-play", "app-store"}},
	}
	return Object{"type": "object", "additionalProperties": false, "properties": properties, "required": required}
}

func toolResult(value Object, err error) *mcp.CallToolResult {
	if err != nil {
		value = safeError(err)
	}
	b, _ := json.Marshal(value)
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(b)}}, StructuredContent: value, IsError: err != nil}
}

// NewServer returns the complete local, read-only MCP server.
func NewServer(service *Service, version string) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "mobile-developer-mcp", Version: version}, nil)
	closed := false
	add := func(name, description string, required []string, run func(context.Context, Params) (Object, error)) {
		server.AddTool(&mcp.Tool{Name: name, Title: strings.ReplaceAll(strings.TrimPrefix(name, "mobile_developer_"), "_", " "), Description: description, InputSchema: schema(required...), Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, DestructiveHint: &closed, OpenWorldHint: &closed}}, func(ctx context.Context, request *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			p, err := decodeParams(request.Params.Arguments)
			if err == nil {
				err = requires(p, required...)
			}
			if err != nil {
				return toolResult(nil, err), nil
			}
			value, err := run(ctx, p)
			return toolResult(value, err), nil
		})
	}
	add("mobile_developer_list_apps", "List locally configured applications without exposing credentials or vendor data.", nil, func(_ context.Context, p Params) (Object, error) {
		if p.Provider != "" && p.Provider != "google-play" && p.Provider != "app-store" {
			return nil, domainError("CONFIGURATION", "Tool arguments are invalid.")
		}
		cfg, err := LoadConfig(service.env)
		if err != nil {
			return nil, err
		}
		apps := []Object{}
		for _, a := range cfg.Apps {
			if p.Provider == "" || (p.Provider == "google-play" && a.GooglePlay != nil) || (p.Provider == "app-store" && a.AppStore != nil) {
				item := Object{"id": a.ID, "providers": []string{}}
				if a.GooglePlay != nil {
					item["providers"] = append(item["providers"].([]string), "google-play")
				}
				if a.AppStore != nil {
					item["providers"] = append(item["providers"].([]string), "app-store")
				}
				apps = append(apps, item)
			}
		}
		limit := p.pageLimit()
		truncated := len(apps) > limit
		if truncated {
			apps = apps[:limit]
		}
		return Object{"apps": apps, "metadata": Object{"source": "local-configuration", "limits": Object{"maxItems": limit, "truncated": truncated}}}, nil
	})
	add("mobile_developer_provider_status", "Report whether local credentials are configured for each provider.", nil, func(_ context.Context, _ Params) (Object, error) {
		_, google := service.appleCredentials("unused")
		return Object{"providers": []Object{{"provider": "google-play", "credentialsConfigured": service.env("GOOGLE_OAUTH_ACCESS_TOKEN") != "" || service.env("GOOGLE_APPLICATION_CREDENTIALS") != ""}, {"provider": "app-store", "credentialsConfigured": google}}}, nil
	})
	add("mobile_developer_google_play_releases", "List active releases for a configured Google Play track.", []string{"appId", "track"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "google-play")
		if e != nil {
			return nil, e
		}
		allowed := false
		for _, t := range a.GooglePlay.Tracks {
			if t == p.Track {
				allowed = true
			}
		}
		if !allowed {
			return nil, domainError("NOT_FOUND", "The Google Play track is not configured locally.")
		}
		v, e := service.googleReleases(ctx, a.GooglePlay.PackageName, p.Track)
		return enrich(v, "google-play", p.pageLimit(), false), e
	})
	add("mobile_developer_google_play_reviews", "List Google Play user reviews.", []string{"appId"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "google-play")
		if e != nil {
			return nil, e
		}
		v, e := service.googleReviews(ctx, a.GooglePlay.PackageName, p)
		return enrich(v, "google-play", p.pageLimit(), false), e
	})
	add("mobile_developer_google_play_vital_issues", "List Google Play Android vitals error issues.", []string{"appId", "start", "end"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "google-play")
		if e != nil {
			return nil, e
		}
		v, e := service.googleVitals(ctx, a.GooglePlay.PackageName, p)
		return enrich(v, "google-play", p.pageLimit(), false), e
	})
	add("mobile_developer_google_play_installation_metrics", "Read Google Play installation metrics from configured Cloud Storage reports.", []string{"appId", "start", "end"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "google-play")
		if e != nil {
			return nil, e
		}
		if a.GooglePlay.ReportingBucket == "" {
			return nil, domainError("CONFIGURATION", "A reporting bucket is not configured for this application.")
		}
		v, e := service.googleInstallations(ctx, a.GooglePlay, p)
		return enrich(v, "google-play", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_versions", "List App Store versions.", []string{"appId"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "app-store")
		if e != nil {
			return nil, e
		}
		v, e := service.appleList(ctx, "versions", a.AppStore.AppID, p)
		return enrich(v, "app-store", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_builds", "List App Store Connect builds.", []string{"appId"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "app-store")
		if e != nil {
			return nil, e
		}
		v, e := service.appleList(ctx, "builds", a.AppStore.AppID, p)
		return enrich(v, "app-store", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_reviews", "List App Store customer reviews without replies.", []string{"appId"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "app-store")
		if e != nil {
			return nil, e
		}
		v, e := service.appleList(ctx, "reviews", a.AppStore.AppID, p)
		return enrich(v, "app-store", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_diagnostic_signatures", "List diagnostic signatures for an App Store build.", []string{"buildId"}, func(ctx context.Context, p Params) (Object, error) {
		v, e := service.appleList(ctx, "diagnostics", "", p)
		return enrich(v, "app-store", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_sales_downloads", "Read available daily App Store Sales and Trends download rows.", []string{"appId", "date"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "app-store")
		if e != nil {
			return nil, e
		}
		if a.AppStore.VendorNumber == "" {
			return nil, domainError("CONFIGURATION", "A vendor number is not configured for this application.")
		}
		v, e := service.appleSales(ctx, a.AppStore.VendorNumber, p)
		return enrich(v, "app-store-sales-and-trends", p.pageLimit(), false), e
	})
	add("mobile_developer_app_store_analytics_existing", "List existing App Store analytics report metadata and segment identifiers without downloading reports.", []string{"appId"}, func(ctx context.Context, p Params) (Object, error) {
		a, e := service.app(p.AppID, "app-store")
		if e != nil {
			return nil, e
		}
		v, e := service.appleAnalytics(ctx, a.AppStore.AppID, p)
		return enrich(v, "app-store-analytics", p.pageLimit(), false), e
	})
	return server
}

func enrich(value Object, source string, limit int, truncated bool) Object {
	if value == nil {
		return nil
	}
	value["metadata"] = Object{"source": source, "unit": "count", "limits": Object{"maxItems": limit, "truncated": truncated}}
	return value
}
