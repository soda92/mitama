package script

import "testing"

func TestParseCommandsAndText(t *testing.T) {
	src := `□ＳＴＳ　旅立
／／ comment
□ＢＭＰ　ＢＬＡＣＫ
□ＵＰＤ　クロス
説「文永捨壱年　文永の役￥
弘安四年　　弘安の役」
□ＪＭＰ　ラベル
□ラベル
`
	s := ParseString(src)
	if len(s.Commands) != 6 {
		t.Fatalf("commands = %d: %#v", len(s.Commands), s.Commands)
	}
	if s.Commands[0].Cmd != "STS" || s.Commands[0].Args[0] != "旅立" {
		t.Fatalf("STS = %#v", s.Commands[0])
	}
	if s.Commands[1].Cmd != "BMP" || s.Commands[1].Args[0] != "BLACK" {
		t.Fatalf("BMP = %#v", s.Commands[1])
	}
	text := s.Commands[3]
	if text.Cmd != "TEXT" || text.Speaker != "" {
		t.Fatalf("TEXT = %#v", text)
	}
	want := "文永捨壱年　文永の役￥\n弘安四年　　弘安の役"
	if text.Message != want {
		t.Fatalf("message = %q, want %q", text.Message, want)
	}
	if _, ok := s.Labels["ラベル"]; !ok {
		t.Fatalf("label map = %#v", s.Labels)
	}
}

func TestBattleResultLabels(t *testing.T) {
	src := `□ＢＡＴＴＬＥ　BGB01_1　YR4_03_30
□ＩＦＴ　２０　＝　０１　ＷＩＮ
□ＷＩＮ
□ＢＭＰ　ＢＬＡＣＫ
□ＬＯＳＥ
`
	s := ParseString(src)
	if len(s.Commands) != 5 {
		t.Fatalf("commands = %d: %#v", len(s.Commands), s.Commands)
	}
	if got := s.Labels["WIN"]; got != 2 {
		t.Fatalf("WIN label = %d, want 2; labels = %#v", got, s.Labels)
	}
	if got := s.Labels["LOSE"]; got != 4 {
		t.Fatalf("LOSE label = %d, want 4; labels = %#v", got, s.Labels)
	}
	if s.Commands[2].Label != "WIN" || s.Commands[2].Cmd != "" {
		t.Fatalf("WIN command = %#v", s.Commands[2])
	}
	if s.Commands[4].Label != "LOSE" || s.Commands[4].Cmd != "" {
		t.Fatalf("LOSE command = %#v", s.Commands[4])
	}
}

func TestParseSLTOptions(t *testing.T) {
	src := `□ＳＬＴ
「右に進もう」　ａ
「左に進もう」　ｂ
□ＳＥＮＤ
`
	s := ParseString(src)
	if len(s.Commands) != 1 {
		t.Fatalf("commands = %d: %#v", len(s.Commands), s.Commands)
	}
	slt := s.Commands[0]
	if slt.Cmd != "SLT" || len(slt.Options) != 2 {
		t.Fatalf("SLT = %#v", slt)
	}
	if slt.Options[0].Text != "右に進もう" || slt.Options[0].Label != "a" {
		t.Fatalf("option 0 = %#v", slt.Options[0])
	}
}

func TestStripAnnotations(t *testing.T) {
	src := "蘭「ご神体なんだろ？￥（ＹＲ１＿０２＿０１７４＿１）\nそれを譲り受けるとでも？」"
	s := ParseString(src)
	if len(s.Commands) != 1 {
		t.Fatalf("commands = %d", len(s.Commands))
	}
	want := "ご神体なんだろ？￥\nそれを譲り受けるとでも？"
	if s.Commands[0].Message != want {
		t.Fatalf("message = %q, want %q", s.Commands[0].Message, want)
	}
	if len(s.Commands[0].Cues) != 1 {
		t.Fatalf("cues = %#v", s.Commands[0].Cues)
	}
	cue := s.Commands[0].Cues[0]
	if cue.Page != 1 || cue.Name != "YR1_02_0174_1" || cue.Kind != "voice" {
		t.Fatalf("cue = %#v", cue)
	}
	if got := stripAnnotations("（笑）と（SE034）"); got != "（笑）と" {
		t.Fatalf("strip = %q", got)
	}
}
