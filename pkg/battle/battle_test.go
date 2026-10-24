package battle

import (
	"strings"
	"testing"
)

func TestParseParty(t *testing.T) {
	src := `"Yahiro & Ran"		// name
"guibn007.bmp"		// gauge
"S024.xa"		// bgm
416			// hp
"taizi_in.o"
"taizi_out.o"
"nanami.chr"
"goki.chr",0
"Empty",2
:win
"won"
:lose
"lost"
:end
`
	p, err := ParseParty(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	if p.Name != "Yahiro & Ran" || p.MaxHP != 416 || p.BGM != "S024.xa" {
		t.Fatalf("party = %#v", p)
	}
	if len(p.Members) != 2 || p.Members[0].File != "nanami.chr" || p.Members[1].Action != 0 {
		t.Fatalf("members = %#v", p.Members)
	}
	if p.WinText != "won" || p.LoseText != "lost" {
		t.Fatalf("win/lose = %q / %q", p.WinText, p.LoseText)
	}
}

func TestParseCharacter(t *testing.T) {
	src := `"Yahiro"		// name
1,2,3			// skills
0			// default
0,0,0			// resist
20			// survive
"cc_yahiro.o"
:actionrate
	0,1,8,1
:actionrate
	1,5,4,1
:end
`
	c, err := ParseCharacter(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	if c.Name != "Yahiro" || c.Skills != [3]int{1, 2, 3} || c.Object != "cc_yahiro.o" {
		t.Fatalf("character = %#v", c)
	}
	if len(c.ActionRates) != 2 || c.ActionRates[1] != [4]int{1, 5, 4, 1} {
		t.Fatalf("action rates = %#v", c.ActionRates)
	}
}

func TestParseObjectSpriteAndMotion(t *testing.T) {
	objSrc := `640
:sprite
	"yahiro00.spt"
	"yahiro01.spt"
:motion
	"def_jmpin.mtn"
	"def_kamae.mtn"
:end
`
	obj, err := ParseObject(strings.NewReader(objSrc))
	if err != nil {
		t.Fatal(err)
	}
	if len(obj.SpriteFiles) != 2 || obj.SpriteFiles[1] != "yahiro01.spt" {
		t.Fatalf("object = %#v", obj)
	}
	if len(obj.MotionFiles) != 2 || obj.MotionFiles[1] != "def_kamae.mtn" {
		t.Fatalf("motions = %#v", obj.MotionFiles)
	}

	frames, err := ParseSprite(strings.NewReader("2\n0,0,112,128,56,128\n112,0,112,128,56,128\n"))
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 2 || frames[1].X != 112 || frames[0].CY != 128 {
		t.Fatalf("frames = %#v", frames)
	}

	motion, err := ParseMotion(strings.NewReader("spno 3\nspidx 0\nwait 16\nspidx 1\nwait 16\n"))
	if err != nil {
		t.Fatal(err)
	}
	if motion.Sprite != 3 || len(motion.Frames) != 2 || motion.Frames[1] != 1 {
		t.Fatalf("motion = %#v", motion)
	}
	if len(motion.Steps) != 2 || motion.Steps[0].Wait != 16 || motion.Steps[1].Frame != 1 {
		t.Fatalf("motion steps = %#v", motion.Steps)
	}
}

func TestParseCharacterSpecials(t *testing.T) {
	src := `"Yahiro"
1,1,1
0
0,0,0
20
"cc_yahiro.o"
:speical
	25
	0,0
	0
	1
	0
	0
	0
	20
:spname
	0
	"Nidan"
	0
	3
:end
`
	c, err := ParseCharacter(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Specials) != 1 {
		t.Fatalf("specials = %#v", c.Specials)
	}
	sp := c.Specials[0]
	if sp.Name != "Nidan" || sp.Chance != 25 || sp.Motion != 20 || sp.Multiplier != 1 {
		t.Fatalf("special = %#v", sp)
	}
}
