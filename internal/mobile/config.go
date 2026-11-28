package mobile

import (
	"encoding/json"
	"os"
	"regexp"
)

type Environment func(string) string

type Config struct {
	Apps []App `json:"apps"`
}

type App struct {
	ID         string        `json:"id"`
	GooglePlay *GoogleConfig `json:"googlePlay,omitempty"`
	AppStore   *AppleConfig  `json:"appStore,omitempty"`
}

type GoogleConfig struct {
	PackageName     string   `json:"packageName"`
	Tracks          []string `json:"tracks"`
	ReportingBucket string   `json:"reportingBucket,omitempty"`
}

type AppleConfig struct {
	AppID        string `json:"appId"`
	VendorNumber string `json:"vendorNumber,omitempty"`
}

var (
	aliasPattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,99}$`)
	packagePattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$`)
	bucketPattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$`)
	digitsPattern  = regexp.MustCompile(`^[0-9]+$`)
	vendorPattern  = regexp.MustCompile(`^[A-Za-z0-9-]{1,100}$`)
)

func LoadConfig(env Environment) (Config, error) {
	cfg := Config{Apps: []App{}}
	path := env("MOBILE_DEVELOPER_MCP_CONFIG_PATH")
	if path == "" {
		return cfg, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return cfg, domainError("CONFIGURATION", "The local application configuration could not be read.")
	}
	defer f.Close()
	data, err := readBounded(f, 1024*1024)
	if err != nil {
		return cfg, domainError("CONFIGURATION", "The local application configuration exceeds its size limit or could not be read.")
	}
	if json.Unmarshal(data, &cfg) != nil || cfg.Apps == nil || len(cfg.Apps) > 100 {
		return Config{}, invalidConfig()
	}
	seen := map[string]bool{}
	for _, app := range cfg.Apps {
		if !aliasPattern.MatchString(app.ID) || seen[app.ID] || (app.GooglePlay == nil && app.AppStore == nil) {
			return Config{}, invalidConfig()
		}
		seen[app.ID] = true
		if g := app.GooglePlay; g != nil {
			if !packagePattern.MatchString(g.PackageName) || len(g.PackageName) > 255 || len(g.Tracks) < 1 || len(g.Tracks) > 20 {
				return Config{}, invalidConfig()
			}
			for _, track := range g.Tracks {
				if len(track) < 1 || len(track) > 100 {
					return Config{}, invalidConfig()
				}
			}
			if g.ReportingBucket != "" && !bucketPattern.MatchString(g.ReportingBucket) {
				return Config{}, invalidConfig()
			}
		}
		if a := app.AppStore; a != nil {
			if !digitsPattern.MatchString(a.AppID) || (a.VendorNumber != "" && !vendorPattern.MatchString(a.VendorNumber)) {
				return Config{}, invalidConfig()
			}
		}
	}
	return cfg, nil
}

func invalidConfig() error {
	return domainError("CONFIGURATION", "The local application configuration is invalid.")
}

func (s *Service) app(id string, provider string) (App, error) {
	cfg, err := LoadConfig(s.env)
	if err != nil {
		return App{}, err
	}
	for _, app := range cfg.Apps {
		if app.ID == id && ((provider == "google-play" && app.GooglePlay != nil) || (provider == "app-store" && app.AppStore != nil)) {
			return app, nil
		}
	}
	return App{}, domainError("NOT_FOUND", "The application is not configured locally for this provider.")
}
