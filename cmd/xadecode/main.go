// Command xadecode converts ARCANA KWD1 .xa audio to WAV.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"mitama/pkg/xa"
)

func main() {
	out := flag.String("o", "", "output .wav (default: input with .wav)")
	flag.Parse()
	if flag.NArg() != 1 {
		log.Fatal("usage: xadecode [-o out.wav] input.xa")
	}
	in := flag.Arg(0)
	data, err := os.ReadFile(in)
	if err != nil {
		log.Fatal(err)
	}
	audio, err := xa.Decode(data)
	if err != nil {
		log.Fatal(err)
	}
	dst := *out
	if dst == "" {
		dst = in + ".wav"
	}
	if err := os.WriteFile(dst, xa.EncodeWAV(audio), 0o644); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("%s: %d Hz, %d ch, %d ms -> %s\n", in, audio.SampleRate, audio.Channels, audio.DurationMS(), dst)
}
