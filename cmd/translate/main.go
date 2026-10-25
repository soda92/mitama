// Command translate builds data/<pack>/translations.json from the scenario
// files. It uses the public Google Translate web endpoint, batches strings,
// retries rate limits, and writes after every successful batch so it can be
// resumed.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"mitama/pkg/script"
)

const endpoint = "https://clients5.google.com/translate_a/t"

type entry struct {
	Source  string            `json:"source,omitempty"`
	Text    string            `json:"text,omitempty"`
	Options map[string]string `json:"options,omitempty"`
}

type translationFile struct {
	Version int                         `json:"version"`
	Source  string                      `json:"source,omitempty"`
	Target  string                      `json:"target,omitempty"`
	Scenes  map[string]map[string]entry `json:"scenes"`
}

type job struct {
	Scene  string
	PC     int
	Kind   string // "text" or "option"
	Page   int
	Source string
}

type textPlan struct {
	Scene string
	PC    int
	Pages []string
	Got   map[int]string
}

type batch struct {
	Start int
	End   int
	Texts []string
}

type batchResult struct {
	Batch      batch
	Translated []string
	Err        error
}

func splitPages(s string) []string {
	raw := strings.FieldsFunc(s, func(r rune) bool { return r == '￥' || r == '¥' })
	out := make([]string, 0, len(raw))
	for _, page := range raw {
		if strings.TrimSpace(page) != "" {
			out = append(out, strings.TrimSpace(page))
		}
	}
	return out
}

func readTranslationFile(path string) (*translationFile, error) {
	file := &translationFile{
		Version: 1,
		Source:  "ja",
		Target:  "en",
		Scenes:  map[string]map[string]entry{},
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return file, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, file); err != nil {
		return nil, err
	}
	if file.Scenes == nil {
		file.Scenes = map[string]map[string]entry{}
	}
	file.Version = 1
	file.Source = "ja"
	file.Target = "en"
	return file, nil
}

func writeTranslationFile(path string, file *translationFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func translateBatch(client *http.Client, texts []string) ([]string, error) {
	if len(texts) == 0 {
		return []string{}, nil
	}
	values := url.Values{}
	values.Set("client", "dict-chrome-ex")
	values.Set("sl", "ja")
	values.Set("tl", "en")
	for _, text := range texts {
		values.Add("q", text)
	}
	target := endpoint + "?" + values.Encode()
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(1<<attempt) * time.Second)
		}
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
			continue
		}
		if resp.StatusCode == http.StatusBadRequest && len(texts) > 1 {
			// Long GET URLs are rejected with 400 on some Google frontends.
			mid := len(texts) / 2
			left, err := translateBatch(client, texts[:mid])
			if err != nil {
				return nil, err
			}
			right, err := translateBatch(client, texts[mid:])
			if err != nil {
				return nil, err
			}
			return append(left, right...), nil
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("translate: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}
		var raw []json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, fmt.Errorf("translate: decode: %w (%s)", err, string(body))
		}
		if len(raw) != len(texts) {
			return nil, fmt.Errorf("translate: got %d results for %d inputs", len(raw), len(texts))
		}
		out := make([]string, len(raw))
		for i, item := range raw {
			var translated string
			if err := json.Unmarshal(item, &translated); err != nil {
				var nested []string
				if err := json.Unmarshal(item, &nested); err != nil || len(nested) == 0 {
					return nil, fmt.Errorf("translate: unexpected result %s", item)
				}
				translated = nested[0]
			}
			out[i] = translated
		}
		return out, nil
	}
	return nil, lastErr
}

func main() {
	dataDir := flag.String("data", "./data", "extracted data directory")
	pack := flag.String("pack", "dvd", "pack id")
	out := flag.String("out", "", "output file (default <data>/<pack>/translations.json)")
	batchSize := flag.Int("batch", 40, "strings per Google Translate request")
	maxChars := flag.Int("max-chars", 600, "approximate source characters per request")
	maxURL := flag.Int("max-url", 7000, "maximum encoded request URL length")
	sleep := flag.Duration("sleep", 700*time.Millisecond, "delay between batches")
	force := flag.Bool("force", false, "retranslate existing entries")
	limit := flag.Int("limit", 0, "maximum jobs to translate (0 = all)")
	sceneFilter := flag.String("scene", "", "comma-separated scene names/prefixes to translate")
	workers := flag.Int("workers", 4, "parallel Google Translate requests")
	saveEvery := flag.Int("save-every", 10, "batches between progress writes")
	flag.Parse()

	root := filepath.Join(*dataDir, *pack, "text")
	files, err := filepath.Glob(filepath.Join(root, "*.txt"))
	if err != nil || len(files) == 0 {
		log.Fatalf("no scripts under %s", root)
	}
	sort.Strings(files)
	if *out == "" {
		*out = filepath.Join(*dataDir, *pack, "translations.json")
	}
	file, err := readTranslationFile(*out)
	if err != nil {
		log.Fatalf("read translations: %v", err)
	}

	jobs := make([]job, 0, 1024)
	plans := map[string]*textPlan{}
	filters := []string{}
	for _, part := range strings.Split(*sceneFilter, ",") {
		if part = strings.TrimSpace(strings.ToLower(part)); part != "" {
			filters = append(filters, part)
		}
	}
	for _, path := range files {
		scene := strings.ToLower(strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)))
		if len(filters) > 0 {
			match := false
			for _, prefix := range filters {
				if strings.HasPrefix(scene, prefix) {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		}
		f, err := os.Open(path)
		if err != nil {
			log.Printf("%s: %v", path, err)
			continue
		}
		sc, err := script.Parse(f)
		_ = f.Close()
		if err != nil {
			log.Printf("%s: %v", path, err)
			continue
		}
		sceneMap := file.Scenes[scene]
		if sceneMap == nil {
			sceneMap = map[string]entry{}
			file.Scenes[scene] = sceneMap
		}
		for pc, command := range sc.Commands {
			key := strconv.Itoa(pc)
			current := sceneMap[key]
			switch command.Cmd {
			case "TEXT":
				if command.Message == "" {
					continue
				}
				if !*force && current.Text != "" && current.Source == command.Message {
					continue
				}
				pages := splitPages(command.Message)
				if len(pages) == 0 {
					continue
				}
				current.Source = command.Message
				current.Text = ""
				sceneMap[key] = current
				planID := scene + ":" + key
				plans[planID] = &textPlan{
					Scene: scene,
					PC:    pc,
					Pages: pages,
					Got:   map[int]string{},
				}
				for pageIndex, page := range pages {
					jobs = append(jobs, job{Scene: scene, PC: pc, Kind: "text", Page: pageIndex, Source: page})
				}
			case "SLT", "MSLT":
				if len(command.Options) == 0 {
					continue
				}
				if current.Options == nil {
					current.Options = map[string]string{}
				}
				changed := false
				for _, option := range command.Options {
					if option.Text == "" {
						continue
					}
					if translated, ok := current.Options[option.Text]; ok && translated != "" && !*force {
						continue
					}
					jobs = append(jobs, job{Scene: scene, PC: pc, Kind: "option", Source: option.Text})
					changed = true
				}
				if changed {
					sceneMap[key] = current
				}
			}
		}
	}

	if *limit > 0 && len(jobs) > *limit {
		jobs = jobs[:*limit]
	}
	log.Printf("translating %d strings into %s", len(jobs), *out)
	batches := make([]batch, 0, 1024)
	for start := 0; start < len(jobs); {
		end := start
		chars := 0
		urlChars := len(endpoint) + 80
		for end < len(jobs) && end-start < *batchSize {
			length := len([]rune(jobs[end].Source))
			encoded := len(url.QueryEscape(jobs[end].Source)) + 2
			if end > start && (chars+length > *maxChars || urlChars+encoded > *maxURL) {
				break
			}
			chars += length
			urlChars += encoded
			end++
		}
		texts := make([]string, end-start)
		for i, item := range jobs[start:end] {
			texts[i] = item.Source
		}
		batches = append(batches, batch{Start: start, End: end, Texts: texts})
		start = end
	}
	if *workers < 1 {
		*workers = 1
	}
	client := &http.Client{Timeout: 45 * time.Second}
	results := make(chan batchResult, len(batches))
	for _, work := range batches {
		go func(work batch) {
			translated, err := translateBatch(client, work.Texts)
			if err == nil && *sleep > 0 {
				time.Sleep(*sleep)
			}
			results <- batchResult{Batch: work, Translated: translated, Err: err}
		}(work)
	}
	processed := 0
	completed := 0
	failed := 0
	sinceSave := 0
	for range batches {
		result := <-results
		completed++
		if result.Err != nil {
			failed++
			log.Printf("batch %d-%d: %v", result.Batch.Start, result.Batch.End, result.Err)
			continue
		}
		for i, item := range jobs[result.Batch.Start:result.Batch.End] {
			sceneMap := file.Scenes[item.Scene]
			entry := sceneMap[strconv.Itoa(item.PC)]
			if item.Kind == "option" {
				if entry.Options == nil {
					entry.Options = map[string]string{}
				}
				entry.Options[item.Source] = result.Translated[i]
				sceneMap[strconv.Itoa(item.PC)] = entry
				continue
			}
			plan := plans[item.Scene+":"+strconv.Itoa(item.PC)]
			plan.Got[item.Page] = result.Translated[i]
			if len(plan.Got) == len(plan.Pages) {
				parts := make([]string, len(plan.Pages))
				for pageIndex := range plan.Pages {
					parts[pageIndex] = plan.Got[pageIndex]
				}
				entry.Text = strings.Join(parts, "￥")
				sceneMap[strconv.Itoa(item.PC)] = entry
			}
		}
		processed += result.Batch.End - result.Batch.Start
		sinceSave++
		if sinceSave >= *saveEvery {
			if err := writeTranslationFile(*out, file); err != nil {
				log.Fatalf("write translations: %v", err)
			}
			sinceSave = 0
			log.Printf("%d/%d strings, %d/%d batches", processed, len(jobs), completed, len(batches))
		}
	}
	if err := writeTranslationFile(*out, file); err != nil {
		log.Fatalf("write translations: %v", err)
	}
	log.Printf("%d/%d strings, %d failures", processed, len(jobs), failed)
	if failed > 0 {
		log.Fatalf("%d batches failed; rerun to resume", failed)
	}
}
