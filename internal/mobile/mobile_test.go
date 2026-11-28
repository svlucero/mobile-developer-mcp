package mobile

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func testService(t *testing.T) *Service {
	t.Helper()
	configPath := t.TempDir() + "/apps.json"
	env := Environment(func(name string) string {
		if name == "MOBILE_DEVELOPER_MCP_CONFIG_PATH" {
			return configPath
		}
		if name == "GOOGLE_OAUTH_ACCESS_TOKEN" {
			return "test-google-token"
		}
		return ""
	})
	path := env("MOBILE_DEVELOPER_MCP_CONFIG_PATH")
	if err := osWrite(path, `{"apps":[{"id":"sample-app","googlePlay":{"packageName":"com.example.app","tracks":["production"],"reportingBucket":"example-bucket"},"appStore":{"appId":"1234567890","vendorNumber":"12345678"}}]}`); err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Transport: roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet {
			t.Errorf("unexpected method %s", r.Method)
		}
		if r.Header.Get("Authorization") == "" {
			t.Error("missing authorization")
		}
		body := `{}`
		switch {
		case strings.Contains(r.URL.Path, "/tracks/production/releases"):
			body = `{"releases":[{"releaseName":"1.0","releaseLifecycleState":"IN_PROGRESS","activeArtifacts":[{"versionCode":42}]}]}`
		case strings.Contains(r.URL.Path, "/appStoreVersions"):
			body = `{"data":[{"id":"version-1","attributes":{"versionString":"1.0","platform":"IOS","appStoreState":"READY_FOR_SALE"}}]}`
		case strings.Contains(r.URL.Path, "/reviews"):
			body = `{"reviews":[]}`
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
	})}
	return NewService(Options{Environment: env, HTTPClient: client})
}

func osWrite(path, value string) error { return os.WriteFile(path, []byte(value), 0600) }

func connect(t *testing.T, server *mcp.Server) *mcp.ClientSession {
	t.Helper()
	ctx := context.Background()
	left, right := mcp.NewInMemoryTransports()
	if _, err := server.Connect(ctx, left, nil); err != nil {
		t.Fatal(err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "1"}, nil)
	session, err := client.Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { session.Close() })
	return session
}

func TestMCPToolsExposeReadOnlyContract(t *testing.T) {
	service := testService(t)
	session := connect(t, NewServer(service, "test"))
	ctx := context.Background()
	tools, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 12 {
		t.Fatalf("got %d tools, want 12", len(tools.Tools))
	}
	for _, tool := range tools.Tools {
		if tool.Annotations == nil || !tool.Annotations.ReadOnlyHint {
			t.Fatalf("%s must be read-only", tool.Name)
		}
	}
	for _, call := range []struct {
		name string
		args Object
	}{
		{"mobile_developer_list_apps", Object{}},
		{"mobile_developer_google_play_releases", Object{"appId": "sample-app", "track": "production"}},
	} {
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: call.name, Arguments: call.args})
		if err != nil {
			t.Fatal(err)
		}
		if result.IsError {
			t.Fatalf("%s returned error: %#v", call.name, result.StructuredContent)
		}
	}
	bad, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "mobile_developer_google_play_releases", Arguments: Object{"appId": "sample-app"}})
	if err != nil {
		t.Fatal(err)
	}
	if !bad.IsError {
		t.Fatal("missing required parameter should be a tool error")
	}
}

func TestReportParsingAndLimits(t *testing.T) {
	installs, err := parseInstallations([]byte("Date,Installs,Country\n2026-01-01,7,AR\n"), "2026-01-01", "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(installs) != 1 || installs[0]["value"] != float64(7) {
		t.Fatalf("unexpected installations %#v", installs)
	}
	sales, err := parseSales([]byte("Provider\tUnits\tProduct Type Identifier\tOrder Type\nACME\t2\t1\tRedownload\n"), "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(sales) != 1 || sales[0]["name"] != "redownloads" {
		t.Fatalf("unexpected sales %#v", sales)
	}
	months, err := monthlyObjects("2026-01-31", "2026-02-01")
	if err != nil || strings.Join(months, ",") != "202601,202602" {
		t.Fatalf("unexpected months %#v %v", months, err)
	}
}
