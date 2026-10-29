package main

import "testing"

func TestReplaceAllCaseInsensitive(t *testing.T) {
	rules, err := compileRules([]string{"chintz=Sarasa"}, false)
	if err != nil {
		t.Fatal(err)
	}
	got, n := replaceAll("The Chintz and the chintz.", rules[0])
	if got != "The Sarasa and the Sarasa." || n != 2 {
		t.Fatalf("got %q (%d), want two replacements", got, n)
	}
}

func TestReplaceAllCaseSensitive(t *testing.T) {
	rules, err := compileRules([]string{"chintz=Sarasa"}, true)
	if err != nil {
		t.Fatal(err)
	}
	got, n := replaceAll("Chintz and chintz.", rules[0])
	if got != "Chintz and Sarasa." || n != 1 {
		t.Fatalf("got %q (%d), want one replacement", got, n)
	}
}

func TestSplitRule(t *testing.T) {
	if _, _, err := splitRule("no separator"); err == nil {
		t.Fatal("expected malformed rule error")
	}
	from, to, err := splitRule("chintz=Sarasa")
	if err != nil || from != "chintz" || to != "Sarasa" {
		t.Fatalf("from=%q to=%q err=%v", from, to, err)
	}
}
