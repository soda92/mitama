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

// Special is one :special block in a .chr file.
type Special struct {
	Name       string `json:"name,omitempty"`
	Chance     int    `json:"chance"`
	Conditions [2]int `json:"conditions"`
	AttackType int    `json:"attackType"`
	Multiplier int    `json:"multiplier"`
	Motion     int    `json:"motion"`
}

// Character is the subset of a .chr file needed by the web battle screen.
type Character struct {
	File          string       `json:"file"`
	Name          string       `json:"name"`
	Skills        [3]int       `json:"skills"`
	DefaultAction int          `json:"defaultAction"`
	Resist        [3]int       `json:"resist"`
	Survive       int          `json:"survive"`
	Object        string       `json:"object"`
	ActionRates   [][4]int     `json:"actionRates,omitempty"`
	Specials      []Special    `json:"specials,omitempty"`
	Sprite        *Sprite      `json:"sprite,omitempty"`
	Motions       []MotionClip `json:"motions,omitempty"`
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
	var specials []Special
	var current *Special
	specialField := 0
	type specialName struct {
		id   int
		name string
	}
	var names []specialName
	nameField := 0
	nameID := 0

	flushSpecial := func() {
		if current != nil {
			specials = append(specials, *current)
			current = nil
		}
		specialField = 0
	}

	for _, line := range lines {
		if strings.HasPrefix(line, ":") {
			flushSpecial()
			section = strings.ToLower(line)
			if section == ":special" || section == ":speical" {
				current = &Special{}
			}
			if section == ":spname" {
				nameField = 0
			}
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
		case ":special", ":speical":
			if current == nil {
				continue
			}
			nums := ints(line)
			switch specialField {
			case 0:
				current.Chance = firstInt(line)
			case 1:
				if len(nums) > 0 {
					current.Conditions[0] = nums[0]
				}
				if len(nums) > 1 {
					current.Conditions[1] = nums[1]
				}
			case 2:
				current.AttackType = firstInt(line)
			case 3:
				current.Multiplier = firstInt(line)
			case 7:
				current.Motion = firstInt(line)
			}
			specialField++
		case ":spname":
			if nameField == 0 {
				nameID = firstInt(line)
			} else if nameField == 1 {
				names = append(names, specialName{id: nameID, name: unquote(line)})
			}
			nameField++
		}
	}
	flushSpecial()

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
	for i := range specials {
		for _, n := range names {
			if n.id == i {
				specials[i].Name = n.name
				break
			}
		}
	}
	c.Specials = specials
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

// SpriteFrame is one rectangle in a .spt file.
type SpriteFrame struct {
	X  int `json:"x"`
	Y  int `json:"y"`
	W  int `json:"w"`
	H  int `json:"h"`
	CX int `json:"cx"`
	CY int `json:"cy"`
}

// Sprite is the frame list referenced by a character object.
type Sprite struct {
	Frames []SpriteFrame `json:"frames"`
	Idle   []int         `json:"idle"`
	BMP    string        `json:"bmp"`
}

// Object is the .o file that maps sprite and motion numbers.
type Object struct {
	SpriteFiles []string `json:"spriteFiles"`
	MotionFiles []string `json:"motionFiles"`
}

// MotionStep is one displayed frame and its hold time in a .mtn file.
type MotionStep struct {
	Sprite int `json:"sprite"`
	Frame  int `json:"frame"`
	Wait   int `json:"wait"`
}

// MotionEvent is an event attached to the frame at which it occurs.
type MotionEvent struct {
	At    int    `json:"at"`
	Kind  string `json:"kind"`
	Value string `json:"value,omitempty"`
}

// Motion is a parsed .mtn file.
type Motion struct {
	Sprite   int           `json:"sprite"`
	Frames   []int         `json:"frames"`
	AnimTime int           `json:"animTime"`
	Steps    []MotionStep  `json:"steps,omitempty"`
	Events   []MotionEvent `json:"events,omitempty"`
}

// MotionStepFrame is a fully resolved motion frame for the browser.
type MotionStepFrame struct {
	BMP   string      `json:"bmp"`
	Frame SpriteFrame `json:"frame"`
	Wait  int         `json:"wait"`
}

// MotionClip is a resolved animation for one .o motion slot.
type MotionClip struct {
	Index  int               `json:"index"`
	File   string            `json:"file"`
	Steps  []MotionStepFrame `json:"steps"`
	Events []MotionEvent     `json:"events,omitempty"`
}

// ParseObject reads a character .o file.
func ParseObject(r io.Reader) (Object, error) {
	lines, err := readLines(r)
	if err != nil {
		return Object{}, err
	}
	var out Object
	section := ""
	for _, line := range lines {
		if strings.HasPrefix(line, ":") {
			section = strings.ToLower(line)
			continue
		}
		switch section {
		case ":sprite":
			out.SpriteFiles = append(out.SpriteFiles, unquote(line))
		case ":motion":
			out.MotionFiles = append(out.MotionFiles, unquote(line))
		}
	}
	return out, nil
}

// ParseSprite reads a .spt frame list.
func ParseSprite(r io.Reader) ([]SpriteFrame, error) {
	lines, err := readLines(r)
	if err != nil {
		return nil, err
	}
	var frames []SpriteFrame
	for i, line := range lines {
		nums := ints(line)
		if i == 0 || len(nums) < 4 {
			continue
		}
		frame := SpriteFrame{X: nums[0], Y: nums[1], W: nums[2], H: nums[3]}
		if len(nums) > 4 {
			frame.CX = nums[4]
		}
		if len(nums) > 5 {
			frame.CY = nums[5]
		}
		frames = append(frames, frame)
	}
	return frames, nil
}

// ParseMotion reads the sprite/frame sequence from a .mtn file.
func ParseMotion(r io.Reader) (Motion, error) {
	lines, err := readLines(r)
	if err != nil {
		return Motion{}, err
	}
	var out Motion
	sprite := 0
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch strings.ToLower(fields[0]) {
		case "spno":
			sprite = firstInt(fields[1])
			out.Sprite = sprite
		case "spidx":
			frame := firstInt(fields[1])
			out.Frames = append(out.Frames, frame)
			out.Steps = append(out.Steps, MotionStep{Sprite: sprite, Frame: frame})
		case "wait":
			if len(out.Steps) > 0 {
				out.Steps[len(out.Steps)-1].Wait = firstInt(fields[1])
			}
		case "animtime":
			out.AnimTime = firstInt(fields[1])
		case "flash", "se", "c_se", "se_attack", "effectem", "attack", "attackend":
			value := ""
			if len(fields) > 1 {
				value = strings.Join(fields[1:], " ")
			}
			out.Events = append(out.Events, MotionEvent{
				At:    len(out.Steps),
				Kind:  strings.ToLower(fields[0]),
				Value: value,
			})
		}
	}
	return out, nil
}

// Effect is the resolved first effect sprite/motion pair.
type Effect struct {
	BMP    string        `json:"bmp"`
	Frames []SpriteFrame `json:"frames"`
	Wait   int           `json:"wait"`
}
