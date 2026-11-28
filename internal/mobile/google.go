package mobile

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	publisherBase  = "https://androidpublisher.googleapis.com/androidpublisher/v3"
	reportingBase  = "https://playdeveloperreporting.googleapis.com/v1beta1"
	publisherScope = "https://www.googleapis.com/auth/androidpublisher"
	reportingScope = "https://www.googleapis.com/auth/playdeveloperreporting"
	storageScope   = "https://www.googleapis.com/auth/devstorage.read_only"
)

func (s *Service) googleAccessToken(ctx context.Context, scope string) (string, error) {
	if token := s.env("GOOGLE_OAUTH_ACCESS_TOKEN"); token != "" {
		return token, nil
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, s.http)
	var credentials *google.Credentials
	var err error
	if path := s.env("GOOGLE_APPLICATION_CREDENTIALS"); path != "" {
		var data []byte
		data, err = os.ReadFile(path)
		if err == nil {
			credentials, err = google.CredentialsFromJSON(ctx, data, scope)
		}
	} else {
		credentials, err = google.FindDefaultCredentials(ctx, scope)
	}
	if err != nil {
		return "", domainError("AUTHORIZATION", "Google application default credentials could not be used.")
	}
	token, err := credentials.TokenSource.Token()
	if err != nil || token.AccessToken == "" {
		return "", domainError("AUTHORIZATION", "Google credentials did not return an access token.")
	}
	return token.AccessToken, nil
}

func (s *Service) googleGet(ctx context.Context, address, scope string, target any) error {
	token, err := s.googleToken(ctx, scope)
	if err != nil {
		return domainError("AUTHORIZATION", "Google credentials could not be used.")
	}
	data, err := s.get(ctx, address, token)
	if err != nil {
		return err
	}
	return decodeJSON(data, target)
}

func (s *Service) googleReleases(ctx context.Context, packageName, track string) (Object, error) {
	var response struct {
		Releases []struct {
			ReleaseName string `json:"releaseName"`
			State       string `json:"releaseLifecycleState"`
			Artifacts   []struct {
				VersionCode any `json:"versionCode"`
			} `json:"activeArtifacts"`
		} `json:"releases"`
	}
	err := s.googleGet(ctx, publisherBase+"/applications/"+url.PathEscape(packageName)+"/tracks/"+url.PathEscape(track)+"/releases", publisherScope, &response)
	if err != nil {
		return nil, err
	}
	out := []Object{}
	for _, release := range response.Releases {
		codes := []string{}
		for _, artifact := range release.Artifacts {
			if code := text(artifact.VersionCode); code != "" {
				codes = append(codes, code)
			}
		}
		item := Object{"versionCodes": codes}
		if release.ReleaseName != "" {
			item["name"] = release.ReleaseName
		}
		if release.State != "" {
			item["status"] = release.State
		}
		out = append(out, item)
	}
	return Object{"releases": out}, nil
}

func (s *Service) googleReviews(ctx context.Context, packageName string, p Params) (Object, error) {
	q := url.Values{"maxResults": {strconv.Itoa(p.pageLimit())}}
	if p.Cursor != "" {
		q.Set("token", p.Cursor)
	}
	if p.TranslationLanguage != "" {
		q.Set("translationLanguage", p.TranslationLanguage)
	}
	var response struct {
		Reviews []struct {
			ID       string `json:"reviewId"`
			Author   string `json:"authorName"`
			Comments []struct {
				User Object `json:"userComment"`
			} `json:"comments"`
		} `json:"reviews"`
		Pagination struct {
			Next string `json:"nextPageToken"`
		} `json:"tokenPagination"`
	}
	if err := s.googleGet(ctx, publisherBase+"/applications/"+url.PathEscape(packageName)+"/reviews?"+q.Encode(), publisherScope, &response); err != nil {
		return nil, err
	}
	reviews := []Object{}
	for _, review := range response.Reviews {
		if review.ID == "" {
			continue
		}
		for _, comment := range review.Comments {
			if comment.User == nil {
				continue
			}
			item := pick(comment.User, "text", "originalText", "appVersionName", "reviewerLanguage")
			item["reviewId"] = review.ID
			if review.Author != "" {
				item["authorName"] = review.Author
			}
			if score, ok := comment.User["starRating"]; ok {
				item["score"] = score
			}
			if code := text(comment.User["appVersionCode"]); code != "" {
				item["appVersionCode"] = code
			}
			if stamp, ok := comment.User["lastModified"].(map[string]any); ok {
				seconds, err := strconv.ParseInt(text(stamp["seconds"]), 10, 64)
				if err == nil {
					nanos, _ := strconv.ParseInt(text(stamp["nanos"]), 10, 64)
					item["lastModified"] = time.Unix(seconds, nanos).UTC().Format("2006-01-02T15:04:05.000Z")
				}
			}
			reviews = append(reviews, item)
			break
		}
	}
	result := Object{"reviews": reviews}
	if response.Pagination.Next != "" {
		result["nextCursor"] = response.Pagination.Next
	}
	return result, nil
}

func hourUTC(value string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339Nano, value)
	if err != nil || !strings.HasSuffix(value, "Z") || t.Minute() != 0 || t.Second() != 0 || t.Nanosecond() != 0 {
		return time.Time{}, domainError("CONFIGURATION", "Android vitals periods must be UTC hour-aligned timestamps.")
	}
	return t, nil
}

func dateTimeQuery(q url.Values, prefix string, t time.Time) {
	q.Set(prefix+".year", strconv.Itoa(t.Year()))
	q.Set(prefix+".month", strconv.Itoa(int(t.Month())))
	q.Set(prefix+".day", strconv.Itoa(t.Day()))
	q.Set(prefix+".hours", strconv.Itoa(t.Hour()))
	q.Set(prefix+".timeZone.id", "UTC")
}

func (s *Service) googleVitals(ctx context.Context, packageName string, p Params) (Object, error) {
	start, err := hourUTC(p.Start)
	if err != nil {
		return nil, err
	}
	end, err := hourUTC(p.End)
	if err != nil {
		return nil, err
	}
	if !start.Before(end) {
		return nil, domainError("CONFIGURATION", "Android vitals start must be before end.")
	}
	q := url.Values{"pageSize": {strconv.Itoa(p.pageLimit())}, "sampleErrorReportLimit": {"0"}}
	dateTimeQuery(q, "interval.startTime", start)
	dateTimeQuery(q, "interval.endTime", end)
	if p.Cursor != "" {
		q.Set("pageToken", p.Cursor)
	}
	clauses := []string{}
	for _, group := range []struct {
		field  string
		values []string
	}{{"versionCode", p.VersionCodes}, {"errorIssueType", p.Types}} {
		terms := []string{}
		for _, value := range group.values {
			terms = append(terms, group.field+" = "+value)
		}
		if len(terms) > 0 {
			clauses = append(clauses, strings.Join(terms, " OR "))
		}
	}
	if len(clauses) > 0 {
		q.Set("filter", strings.Join(clauses, " AND "))
	}
	var response struct {
		Issues []Object `json:"errorIssues"`
		Next   string   `json:"nextPageToken"`
	}
	if err := s.googleGet(ctx, reportingBase+"/apps/"+url.PathEscape(packageName)+"/errorIssues:search?"+q.Encode(), reportingScope, &response); err != nil {
		return nil, err
	}
	issues := []Object{}
	for _, issue := range response.Issues {
		item := pick(issue, "name", "errorReportCount", "distinctUsers", "issueUri")
		if kind, ok := issue["type"]; ok {
			item["issueType"] = kind
		}
		issues = append(issues, item)
	}
	result := Object{"issues": issues}
	if response.Next != "" {
		result["nextCursor"] = response.Next
	}
	return result, nil
}

func (s *Service) googleInstallations(ctx context.Context, g *GoogleConfig, p Params) (Object, error) {
	months, err := monthlyObjects(p.Start, p.End)
	if err != nil {
		return nil, err
	}
	metrics := []Object{}
	read := 0
	for _, month := range months {
		suffix := ""
		if p.Dimension != "" {
			suffix = "_" + p.Dimension
		}
		object := fmt.Sprintf("stats/installs/installs_%s_%s%s.csv", g.PackageName, month, suffix)
		address := "https://storage.googleapis.com/storage/v1/b/" + url.PathEscape(g.ReportingBucket) + "/o/" + url.PathEscape(object) + "?alt=media"
		token, err := s.googleToken(ctx, storageScope)
		if err != nil {
			return nil, domainError("AUTHORIZATION", "Google credentials could not be used.")
		}
		data, err := s.get(ctx, address, token)
		if isMissing(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		parsed, err := parseInstallations(data, p.Start, p.End)
		if err != nil {
			return nil, err
		}
		metrics = append(metrics, parsed...)
		read++
	}
	return Object{"metrics": metrics, "objectsRead": read}, nil
}
