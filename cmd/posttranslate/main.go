// Command posttranslate applies glossary replacements to an existing
// translations.json sidecar. It is intentionally separate from cmd/translate:
// retranslation can reintroduce known mistranslations, so this pass can be
// rerun after every translation/repair run.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

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

type rule struct {
	from string
	to   string
	re   *regexp.Regexp
}

type replaceFlag []string

func (r *replaceFlag) String() string {
	return strings.Join(*r, ",")
}

func (r *replaceFlag) Set(value string) error {
	*r = append(*r, value)
	return nil
}

func splitRule(value string) (string, string, error) {
	i := strings.Index(value, "=")
	if i < 0 {
		return "", "", fmt.Errorf("replacement %q must be old=new", value)
	}
	from, to := value[:i], value[i+1:]
	if from == "" {
		return "", "", fmt.Errorf("replacement %q has an empty source", value)
	}
	return from, to, nil
}

func compileRules(values []string, caseSensitive bool) ([]rule, error) {
	rules := make([]rule, 0, len(values))
	for _, value := range values {
		from, to, err := splitRule(value)
		if err != nil {
			return nil, err
		}
		var re *regexp.Regexp
		if !caseSensitive {
			re = regexp.MustCompile("(?i)" + regexp.QuoteMeta(from))
		}
		rules = append(rules, rule{from: from, to: to, re: re})
	}
	return rules, nil
}

func replaceAll(s string, r rule) (string, int) {
	if r.re == nil {
		n := strings.Count(s, r.from)
		if n == 0 {
			return s, 0
		}
		return strings.ReplaceAll(s, r.from, r.to), n
	}
	n := len(r.re.FindAllStringIndex(s, -1))
	if n == 0 {
		return s, 0
	}
	return r.re.ReplaceAllString(s, r.to), n
}

func readTranslationFile(path string) (*translationFile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	file := &translationFile{}
	if err := json.Unmarshal(raw, file); err != nil {
		return nil, err
	}
	if file.Scenes == nil {
		file.Scenes = map[string]map[string]entry{}
	}
	return file, nil
}

func writeTranslationFile(path string, file *translationFile, backup bool) error {
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	if backup {
		old, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path+".bak", old, 0o644); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func main() {
	dataDir := flag.String("data", "./data", "extracted data directory")
	pack := flag.String("pack", "dvd", "pack id")
	out := flag.String("file", "", "translation file (default <data>/<pack>/translations.json)")
	caseSensitive := flag.Bool("case-sensitive", false, "match source text case-sensitively")
	write := flag.Bool("write", false, "write changes (default: dry run)")
	backup := flag.Bool("backup", false, "write a .bak copy before replacing the file")
	examples := flag.Int("examples", 8, "number of changed entries to print in dry-run mode")
	replacements := replaceFlag{}
	flag.Var(&replacements, "replace", "replacement old=new; may be repeated")
	flag.Parse()

	if len(replacements) == 0 {
		log.Fatal("at least one -replace old=new is required")
	}
	rules, err := compileRules(replacements, *caseSensitive)
	if err != nil {
		log.Fatal(err)
	}
	if *out == "" {
		*out = filepath.Join(*dataDir, *pack, "translations.json")
	}
	file, err := readTranslationFile(*out)
	if err != nil {
		log.Fatalf("read %s: %v", *out, err)
	}

	scenes := make([]string, 0, len(file.Scenes))
	for scene := range file.Scenes {
		scenes = append(scenes, scene)
	}
	sort.Strings(scenes)

	occurrences := 0
	textEntries := 0
	optionValues := 0
	shown := 0
	for _, scene := range scenes {
		entries := file.Scenes[scene]
		keys := make([]string, 0, len(entries))
		for key := range entries {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			item := entries[key]
			before := item.Text
			for _, r := range rules {
				var n int
				item.Text, n = replaceAll(item.Text, r)
				occurrences += n
			}
			if item.Text != before {
				textEntries++
				if !*write && shown < *examples {
					fmt.Printf("%s[%s] %q -> %q\n", scene, key, before, item.Text)
					shown++
				}
			}
			if len(item.Options) > 0 {
				optionKeys := make([]string, 0, len(item.Options))
				for k := range item.Options {
					optionKeys = append(optionKeys, k)
				}
				sort.Strings(optionKeys)
				changed := false
				for _, k := range optionKeys {
					beforeValue := item.Options[k]
					value := beforeValue
					for _, r := range rules {
						var n int
						value, n = replaceAll(value, r)
						occurrences += n
					}
					if value != beforeValue {
						item.Options[k] = value
						optionValues++
						changed = true
					}
				}
				if changed {
					entries[key] = item
				}
			}
			entries[key] = item
		}
	}

	log.Printf("%d occurrences across %d text entries and %d option values", occurrences, textEntries, optionValues)
	if occurrences == 0 {
		return
	}
	if !*write {
		log.Printf("dry run; rerun with -write to update %s", *out)
		return
	}
	if err := writeTranslationFile(*out, file, *backup); err != nil {
		log.Fatalf("write %s: %v", *out, err)
	}
	log.Printf("wrote %s", *out)
}
