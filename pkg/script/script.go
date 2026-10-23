// Package script parses the text command scripts used by the ARCANA engine.
//
// The scenario files are CP932 text. Commands are prefixed with a white square
// (U+25A1) and written with full-width Latin letters, for example:
//
//	□ＢＭＰ　００＿１
//	□ＵＰＤ　クロス
//	□ＷＡＩＴ　１０００
//
// Lines beginning with "//" (or its full-width spelling) are comments.
// Unknown command words are treated as jump labels. Lines without the command
// marker are dialogue; a quoted block may span several physical lines.
package script

import (
	"bufio"
	"fmt"
	"io"
	"strings"
	"unicode"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

// Cue is an inline voice/sound annotation such as （ＹＲ１＿０２＿０１７４＿１）
// or （SE034）. Page is zero-based within the message's ￥-separated pages.
type Cue struct {
	Page int    `json:"page"`
	Name string `json:"name"`
	Kind string `json:"kind"` // "voice" or "se"
}

// Option is one entry of an SLT/MSLT choice menu.
type Option struct {
	Text  string `json:"text"`
	Label string `json:"label"`
}

// Command is one executable line.
type Command struct {
	Line    int      `json:"line"`
	Cmd     string   `json:"cmd,omitempty"`
	Args    []string `json:"args,omitempty"`
	Label   string   `json:"label,omitempty"`
	Text    string   `json:"text,omitempty"` // original line, for debugging
	Speaker string   `json:"speaker,omitempty"`
	Message string   `json:"message,omitempty"`
	Cues    []Cue    `json:"cues,omitempty"`
	Options []Option `json:"options,omitempty"`
}

// Script is a parsed command stream.
type Script struct {
	Commands []Command      `json:"commands"`
	Labels   map[string]int `json:"labels"`
}

// known lists the engine commands we understand. Unknown command words are
// labels, which is how the scenario's "メインA" jump targets are stored.
var known = map[string]bool{
	"BMP": true, "UPD": true, "WAIT": true, "MUS": true, "SEV": true,
	"JMP": true, "END": true, "STS": true, "LOD": true, "SEND": true,
	"SHAEND": true, "SLT": true, "MSLT": true, "IFT": true, "EQU": true,
	"FLG": true, "INC": true, "DEC": true, "FCK": true, "RND": true,
	"SAV": true, "MAP": true, "TITLE": true, "PARTY": true, "BATTLE": true,
	"LEVEL": true, "SPRATE": true, "FADE": true, "SHA": true, "WIN": true,
	"LOSE": true, "VICTORY": true, "EQF": true, "UIW": true, "GSB": true,
	"EVT": true, "LOAD": true, "G_OVER": true,
}

// Parse reads a CP932 script.
func Parse(r io.Reader) (*Script, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	text, _, err := transform.Bytes(japanese.ShiftJIS.NewDecoder(), raw)
	if err != nil {
		return nil, fmt.Errorf("script: decode CP932: %w", err)
	}
	return ParseString(string(text)), nil
}

// ParseString parses an already-decoded script.
func ParseString(text string) *Script {
	s := &Script{Labels: map[string]int{}}
	lines := splitLines(text)
	for i := 0; i < len(lines); i++ {
		raw := strings.TrimSpace(lines[i])
		line := strings.TrimSpace(normalize(raw))
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if !strings.HasPrefix(line, "□") && !strings.HasPrefix(line, "■") {
			// Dialogue. Gather until the closing quote.
			if c, next, ok := parseText(lines, i); ok {
				s.Commands = append(s.Commands, c)
				i = next - 1
			}
			continue
		}
		body := strings.TrimSpace(line[3:]) // □ / ■ are three UTF-8 bytes
		if body == "" {
			continue
		}
		fields := strings.Fields(body)
		if len(fields) == 0 {
			continue
		}
		cmd := strings.ToUpper(fields[0])
		if !known[cmd] || !isASCII(cmd) {
			// Label definition.
			s.Labels[fields[0]] = len(s.Commands)
			s.Commands = append(s.Commands, Command{Line: i + 1, Label: fields[0], Text: body})
			continue
		}
		c := Command{Line: i + 1, Cmd: cmd, Text: body}
		if len(fields) > 1 {
			c.Args = fields[1:]
		}
		if cmd == "SLT" || cmd == "MSLT" {
			c.Options, i = parseOptions(lines, i)
		}
		s.Commands = append(s.Commands, c)
	}
	return s
}

// parseOptions consumes the quoted option lines following SLT/MSLT.
func parseOptions(lines []string, start int) ([]Option, int) {
	var opts []Option
	i := start + 1
	for ; i < len(lines); i++ {
		line := strings.TrimSpace(normalize(lines[i]))
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "□") || strings.HasPrefix(line, "■") {
			break
		}
		open := strings.Index(line, "「")
		close := strings.LastIndex(line, "」")
		if open < 0 || close < open {
			continue
		}
		text := line[open+len("「") : close]
		label := strings.TrimSpace(line[close+len("」"):])
		opts = append(opts, Option{Text: text, Label: label})
	}
	// The menu block is terminated by □SEND. Consume it here so the runtime
	// never falls through into the branch labels below the menu.
	for ; i < len(lines); i++ {
		line := strings.TrimSpace(normalize(lines[i]))
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		if line == "□SEND" || line == "■SEND" {
			i++
		}
		break
	}
	return opts, i - 1
}

// parseText builds a TEXT command from lines[start] and its continuation lines.
func parseText(lines []string, start int) (Command, int, bool) {
	first := strings.TrimSpace(lines[start])
	open := strings.Index(first, "「")
	if open < 0 {
		// Orphan continuation: treat it as narration rather than dropping it.
		return Command{Line: start + 1, Cmd: "TEXT", Message: first}, start + 1, true
	}
	speaker := strings.TrimSpace(first[:open])
	content := first[open+len("「"):]
	var parts []string
	i := start
	for {
		if close := strings.Index(content, "」"); close >= 0 {
			parts = append(parts, content[:close])
			i++
			break
		}
		parts = append(parts, content)
		i++
		if i >= len(lines) {
			break
		}
		content = strings.TrimSpace(lines[i])
	}
	msg, cues := extractCues(strings.Join(parts, "\n"))
	return Command{
		Line:    start + 1,
		Cmd:     "TEXT",
		Speaker: speaker,
		Message: msg,
		Cues:    cues,
		Text:    first,
	}, i, true
}

// extractCues removes engine annotations such as （ＹＲ１＿０２＿０１７４＿１）
// and （SE034） from dialogue and returns them as page-scoped voice/SE cues.
// Japanese parenthetical text is preserved.
func extractCues(s string) (string, []Cue) {
	var b strings.Builder
	var cues []Cue
	runes := []rune(s)
	page := 0
	for i := 0; i < len(runes); i++ {
		switch runes[i] {
		case '￥', '¥':
			page++
			b.WriteRune(runes[i])
			continue
		case '（':
		default:
			b.WriteRune(runes[i])
			continue
		}
		j := i + 1
		for j < len(runes) && runes[j] != '）' {
			j++
		}
		if j >= len(runes) {
			b.WriteRune(runes[i])
			continue
		}
		inner := string(runes[i+1 : j])
		ascii := normalize(inner)
		if isAnnotation(ascii) {
			kind := "voice"
			if strings.HasPrefix(strings.ToUpper(ascii), "SE") {
				kind = "se"
			}
			cues = append(cues, Cue{Page: page, Name: strings.ToUpper(ascii), Kind: kind})
			i = j
			continue
		}
		b.WriteString(string(runes[i : j+1]))
		i = j
	}
	return b.String(), cues
}

func stripAnnotations(s string) string {
	clean, _ := extractCues(s)
	return clean
}

func isAnnotation(s string) bool {
	if s == "" || len([]rune(s)) > 48 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9', r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r == '_':
		default:
			return false
		}
	}
	return true
}

func splitLines(s string) []string {
	sc := bufio.NewScanner(strings.NewReader(s))
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)
	var out []string
	for sc.Scan() {
		out = append(out, sc.Text())
	}
	return out
}

func isASCII(s string) bool {
	for _, r := range s {
		if r > unicode.MaxASCII {
			return false
		}
	}
	return true
}

// normalize converts full-width ASCII and ideographic spaces to their ASCII
// equivalents so commands and numbers can be parsed uniformly. Dialogue text
// is normalized the same way because the game writes it with full-width Latin
// and digits as well.
func normalize(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r >= 0xFF01 && r <= 0xFF5E:
			b.WriteRune(r - 0xFEE0)
		case r == 0x3000:
			b.WriteByte(' ')
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}
