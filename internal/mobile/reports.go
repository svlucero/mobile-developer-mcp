package mobile

import (
	"bytes"
	"compress/gzip"
	"encoding/csv"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"golang.org/x/text/encoding/unicode"
)

func jsonNumber(n float64) string { return strconv.FormatFloat(n, 'f', -1, 64) }

func reportRows(data []byte, delimiter rune) ([][]string, error) {
	if len(data) >= 2 && data[0] == 0x1f && data[1] == 0x8b {
		r, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, domainError("PROVIDER", "The compressed report is invalid.")
		}
		defer r.Close()
		data, err = readBounded(r, maxReportBytes)
		if err != nil {
			return nil, err
		}
	}
	if len(data) >= 2 && ((data[0] == 0xff && data[1] == 0xfe) || (data[0] == 0xfe && data[1] == 0xff)) {
		decoded, err := unicode.UTF16(unicode.LittleEndian, unicode.UseBOM).NewDecoder().Bytes(data)
		if err != nil {
			return nil, domainError("PROVIDER", "The report encoding is invalid.")
		}
		data = decoded
	}
	r := csv.NewReader(strings.NewReader(strings.TrimPrefix(string(data), "\uFEFF")))
	r.Comma = delimiter
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		return nil, domainError("PROVIDER", "The report contains invalid delimited data.")
	}
	return rows, nil
}

func cell(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
}
func column(headers []string, name string) int {
	for i, header := range headers {
		if strings.EqualFold(strings.TrimSpace(header), name) {
			return i
		}
	}
	return -1
}
func numericCell(value string) (float64, bool) {
	if strings.TrimSpace(value) == "" {
		return 0, false
	}
	n, err := strconv.ParseFloat(value, 64)
	return n, err == nil && !math.IsNaN(n) && !math.IsInf(n, 0)
}
func period(start, end string) Object { return Object{"start": start, "end": end} }

func installationColumn(name string) (entity, temporal string, ok bool) {
	lower := strings.ToLower(name)
	if !strings.Contains(lower, "install") {
		return "", "", false
	}
	entity, temporal = "events", "flow"
	if strings.Contains(lower, "user") {
		entity = "users"
	} else if strings.Contains(lower, "device") {
		entity = "devices"
	}
	if strings.Contains(lower, "total") || strings.Contains(lower, "active") || strings.Contains(lower, "current") {
		temporal = "stock"
	}
	return entity, temporal, true
}

func parseInstallations(data []byte, start, end string) ([]Object, error) {
	rows, err := reportRows(data, ',')
	if err != nil {
		return nil, err
	}
	metrics := []Object{}
	if len(rows) == 0 {
		return metrics, nil
	}
	headers := rows[0]
	for i := range headers {
		headers[i] = strings.TrimSpace(headers[i])
	}
	dateIndex := column(headers, "Date")
	if dateIndex < 0 {
		return nil, domainError("PROVIDER", "Installation report does not contain a Date column.")
	}
	for _, row := range rows[1:] {
		date := cell(row, dateIndex)
		if date < start || date > end {
			continue
		}
		if _, err := time.Parse(time.DateOnly, date); err != nil {
			return nil, domainError("PROVIDER", "Installation report contains an invalid date.")
		}
		dimensions := Object{}
		for i, name := range headers {
			if _, _, ok := installationColumn(name); !ok && i != dateIndex {
				dimensions[name] = cell(row, i)
			}
		}
		for i, name := range headers {
			entity, temporal, ok := installationColumn(name)
			if !ok {
				continue
			}
			value, ok := numericCell(cell(row, i))
			if !ok {
				continue
			}
			metrics = append(metrics, Object{"name": name, "value": value, "unit": "count", "entity": entity, "temporalType": temporal, "source": "google-play-statistics-gcs", "period": period(date, date), "dimensions": dimensions})
		}
	}
	return metrics, nil
}

func parseSales(data []byte, date string) ([]Object, error) {
	rows, err := reportRows(data, '\t')
	if err != nil {
		return nil, err
	}
	metrics := []Object{}
	if len(rows) == 0 {
		return metrics, nil
	}
	headers := rows[0]
	units, product, order := column(headers, "Units"), column(headers, "Product Type Identifier"), column(headers, "Order Type")
	if units < 0 || product < 0 {
		return nil, domainError("PROVIDER", "Sales report does not contain required download columns.")
	}
	for _, row := range rows[1:] {
		if cell(row, product) != "1" {
			continue
		}
		value, ok := numericCell(cell(row, units))
		if !ok {
			continue
		}
		name := "downloads"
		if order >= 0 {
			name = "initialDownloads"
			if strings.Contains(strings.ToLower(cell(row, order)), "redownload") {
				name = "redownloads"
			}
		}
		dimensions := Object{}
		for i, h := range headers {
			if i != units {
				dimensions[h] = cell(row, i)
			}
		}
		metrics = append(metrics, Object{"name": name, "value": value, "source": "app-store-sales-and-trends", "period": period(date, date), "dimensions": dimensions})
	}
	return metrics, nil
}

func monthlyObjects(start, end string) ([]string, error) {
	first, e1 := time.Parse(time.DateOnly, start)
	last, e2 := time.Parse(time.DateOnly, end)
	if e1 != nil || e2 != nil || first.After(last) {
		return nil, domainError("CONFIGURATION", "Installation report dates must be valid and start must be on or before end.")
	}
	months := []string{}
	for cursor := time.Date(first.Year(), first.Month(), 1, 0, 0, 0, 0, time.UTC); !cursor.After(last); cursor = cursor.AddDate(0, 1, 0) {
		months = append(months, fmt.Sprintf("%04d%02d", cursor.Year(), cursor.Month()))
		if len(months) > 13 {
			return nil, domainError("CONFIGURATION", "Installation report periods are limited to 13 monthly objects.")
		}
	}
	return months, nil
}
