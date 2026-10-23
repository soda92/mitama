// Package battle parses the ARCANA battle definition files (.pty / .chr).
//
// The files are Shift-JIS text. Lines may carry // comments; quoted strings
// contain names and asset file names. The formats are regular enough to parse
// field-by-field rather than with a full expression grammar.
package battle

import (
	"bufio"
	"io"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/transform"
)

// Member is one slot in a .pty party file.
type Member struct {
	File   string `json:"file"`
	Action int    `json:"action"`
}

// Party is the contents of a .pty file.
type Party struct {
	Name     string   `json:"name"`
	Gauge    string   `json:"gauge"`
	BGM      string   `json:"bgm"`
	MaxHP    int      `json:"maxHp"`
	Enter    string   `json:"enter"`
	Exit     string   `json:"exit"`
	Members  []Member `json:"members"`
	WinText  string   `json:"winText,omitempty"`
	LoseText string   `json:"loseText,omitempty"`
}

// Character is the subset of a .chr file needed by the web battle screen.
type Character struct {
	File          string   `json:"file"`
	Name          string   `json:"name"`
	Skills        [3]int   `json:"skills"`
	DefaultAction int      `json:"defaultAction"`
	Resist        [3]int   `json:"resist"`
	Survive       int      `json:"survive"`
	Object        string   `json:"object"`
	ActionRates   [][4]int `json:"actionRates,omitempty"`
}

// Encounter combines an enemy party with the characters it references.
type Encounter struct {
	Party      Party       `json:"party"`
	Characters []Character `json:"characters"`
}

// ParseParty reads a .pty file.
func ParseParty(r io.Reader) (Party, error) {
	lines, err := readLines(r)
	if err != nil {
		return Party{}, err
	}
	var p Party
	var values []string
	for _, line := range lines {
		if strings.HasPrefix(line, ":") {
			// :renzoku, :win, :lose and :end all end the fixed field block.
			break
		}
		values = append(values, line)
	}
	if len(values) < 6 {
		return p, nil
	}
	p.Name = unquote(values[0])
	p.Gauge = unquote(values[1])
	p.BGM = unquote(values[2])
	p.MaxHP = firstInt(values[3])
	p.Enter = unquote(values[4])
	p.Exit = unquote(values[5])
	for _, value := range values[6:] {
		file, action := splitMember(value)
		if file != "" && !strings.EqualFold(file, "empty") {
			p.Members = append(p.Members, Member{File: file, Action: action})
		}
	}

	// The :win / :lose sections are useful feedback for the battle screen.
	for i, line := range lines {
		if strings.EqualFold(line, ":win") && i+1 < len(lines) {
			p.WinText = unquote(lines[i+1])
		} else if strings.EqualFold(line, ":lose") && i+1 < len(lines) {
			p.LoseText = unquote(lines[i+1])
		}
	}
	return p, nil
}

// ParseCharacter reads a .chr file.
func ParseCharacter(r io.Reader) (Character, error) {
	lines, err := readLines(r)
	if err != nil {
		return Character{}, err
	}
	var c Character
	var values []string
	section := ""
	for _, line := range lines {
		if strings.HasPrefix(line, ":") {
			section = strings.ToLower(line)
			continue
		}
		switch section {
		case "":
			values = append(values, line)
		case ":actionrate":
			nums := ints(line)
			if len(nums) >= 4 {
				c.ActionRates = append(c.ActionRates, [4]int{nums[0], nums[1], nums[2], nums[3]})
			}
		}
	}
	if len(values) >= 6 {
		c.Name = unquote(values[0])
		skills := ints(values[1])
		for i := 0; i < 3 && i < len(skills); i++ {
			c.Skills[i] = skills[i]
		}
		c.DefaultAction = firstInt(values[2])
		resist := ints(values[3])
		for i := 0; i < 3 && i < len(resist); i++ {
			c.Resist[i] = resist[i]
		}
		c.Survive = firstInt(values[4])
		c.Object = unquote(values[5])
	}
	return c, nil
}

func readLines(r io.Reader) ([]string, error) {
	decoded, err := io.ReadAll(transform.NewReader(r, japanese.ShiftJIS.NewDecoder()))
	if err != nil {
		return nil, err
	}
	var out []string
	sc := bufio.NewScanner(strings.NewReader(string(decoded)))
	for sc.Scan() {
		line := strings.TrimSpace(stripComment(sc.Text()))
		if line != "" {
			out = append(out, line)
		}
	}
	return out, sc.Err()
}

func stripComment(line string) string {
	quoted := false
	for i := 0; i+1 < len(line); i++ {
		if line[i] == '"' {
			quoted = !quoted
			continue
		}
		if !quoted && line[i] == '/' && line[i+1] == '/' {
			return line[:i]
		}
	}
	return line
}

func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

func ints(s string) []int {
	parts := strings.Split(s, ",")
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil {
			out = append(out, n)
		}
	}
	return out
}

func firstInt(s string) int {
	if n := ints(s); len(n) > 0 {
		return n[0]
	}
	return 0
}

func splitMember(s string) (string, int) {
	quote := strings.LastIndex(s, `"`)
	if quote < 0 {
		return unquote(s), 0
	}
	file := unquote(s[:quote+1])
	action := 0
	if rest := strings.TrimSpace(s[quote+1:]); strings.HasPrefix(rest, ",") {
		action = firstInt(rest[1:])
	}
	return file, action
}
