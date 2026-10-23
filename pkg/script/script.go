// Package script parses the text command scripts used by the ARCANA engine.
//
// The demo script is CP932 text. Commands are prefixed with a white square
// (U+25A1) and written with full-width Latin letters, for example:
//
//	□ＢＭＰ　００＿１
//	□ＵＰＤ　クロス
//	□ＷＡＩＴ　１０００
//
// Lines beginning with "//" (or its full-width spelling) are comments.
// Unknown command words are treated as jump labels.
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

// Command is one executable line.
type Command struct {
	Line  int      `json:"line"`
	Cmd   string   `json:"cmd,omitempty"`
	Args  []string `json:"args,omitempty"`
	Label string   `json:"label,omitempty"`
	Text  string   `json:"text,omitempty"` // original line, for debugging
}

// Script is a parsed command stream.
type Script struct {
	Commands []Command      `json:"commands"`
	Labels   map[string]int `json:"labels"`
}

// known lists the engine commands we understand. Unknown command words are
// labels, which is how the demo's "デモスタート" jump target is stored.
var known = map[string]bool{
	"BMP": true, "UPD": true, "WAIT": true, "MUS": true, "SEV": true,
	"JMP": true, "END": true, "EVT": true, "LOD": true, "RND": true,
	"SAV": true, "MAP": true, "IFT": true, "DEC": true, "INC": true,
	"EQU": true, "EQF": true, "UIW": true, "GSB": true, "FCK": true,
	"FLG": true, "SEN": true, "SEND": true, "SHAEND": true,
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
	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(normalize(sc.Text()))
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		// Accept both markers seen in the engine data.
		if strings.HasPrefix(line, "□") || strings.HasPrefix(line, "■") {
			line = strings.TrimSpace(line[3:]) // U+25A1 / U+25A0 are 3 bytes
		}
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		cmd := strings.ToUpper(fields[0])
		if !known[cmd] || !isASCII(cmd) {
			// Label definition.
			s.Labels[fields[0]] = len(s.Commands)
			s.Commands = append(s.Commands, Command{Line: lineNo, Label: fields[0], Text: line})
			continue
		}
		c := Command{Line: lineNo, Cmd: cmd, Text: line}
		if len(fields) > 1 {
			c.Args = fields[1:]
		}
		s.Commands = append(s.Commands, c)
	}
	return s
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
// equivalents so commands and numbers can be parsed uniformly.
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
