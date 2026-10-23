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
	if text.Cmd != "TEXT" || text.Speaker != "説" {
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
