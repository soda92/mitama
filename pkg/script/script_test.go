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
