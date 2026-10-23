// Command extract unpacks Ciel ARCANA archives (or an ISO/CloneCD image
// containing them) into a directory tree the engine can serve.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mitama/pkg/arc"
	"mitama/pkg/disc"
)

func main() {
	var (
		src  = flag.String("src", "", "game directory, ISO, IMG or MDF image")
		out  = flag.String("out", "./data", "output directory")
		pack = flag.String("pack", "", "pack name (default: derived from -src)")
		only = flag.String("only", "", "comma-separated archive names to extract (e.g. game,bgm)")
		skip = flag.Bool("skip-existing", true, "skip files that already exist")
	)
	flag.Parse()
	if *src == "" {
		log.Fatal("-src is required")
	}
	st, err := os.Stat(*src)
	if err != nil {
		log.Fatal(err)
	}
	name := *pack
	if name == "" {
		name = defaultPackName(*src)
	}
	dest := filepath.Join(*out, name)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		log.Fatal(err)
	}

	var filters []string
	if *only != "" {
		for _, s := range strings.Split(*only, ",") {
			filters = append(filters, strings.TrimSpace(strings.ToLower(s)))
		}
	}
	keep := func(p string) bool {
		if len(filters) == 0 {
			return true
		}
		base := strings.ToLower(strings.TrimSuffix(filepath.Base(p), filepath.Ext(p)))
		for _, f := range filters {
			if base == f {
				return true
			}
		}
		return false
	}

	total := 0
	if st.IsDir() {
		entries, err := os.ReadDir(*src)
		if err != nil {
			log.Fatal(err)
		}
		var arcs []string
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			p := filepath.Join(*src, e.Name())
			ext := strings.ToLower(filepath.Ext(p))
			switch {
			case ext == ".arc" && keep(p):
				arcs = append(arcs, p)
			case ext == ".txt" || ext == ".ini":
				// Scripts and configuration are external in the demo.
				if err := copyFile(p, filepath.Join(dest, e.Name()), *skip); err != nil {
					log.Printf("copy %s: %v", p, err)
				}
			}
		}
		sort.Strings(arcs)
		for _, p := range arcs {
			n, err := extractArchive(p, dest, *skip)
			if err != nil {
				log.Printf("%s: %v", filepath.Base(p), err)
			}
			total += n
		}
	} else {
		img, err := disc.Open(*src)
		if err != nil {
			log.Fatal(err)
		}
		defer img.Close()
		files, err := img.Files()
		if err != nil {
			log.Fatal(err)
		}
		for _, f := range files {
			if f.Dir || !strings.EqualFold(filepath.Ext(f.Path), ".arc") || !keep(f.Path) {
				continue
			}
			ra := img.ReaderAt(f)
			a, err := arc.New(ra, int64(f.Size))
			if err != nil {
				log.Printf("%s: %v", f.Path, err)
				continue
			}
			base := strings.TrimSuffix(filepath.Base(f.Path), filepath.Ext(f.Path))
			n, err := extractFrom(a, filepath.Join(dest, base), *skip)
			if err != nil {
				log.Printf("%s: %v", f.Path, err)
			}
			total += n
			fmt.Printf("  %-24s %5d files\n", f.Path, n)
		}
	}

	fmt.Printf("Extracted %d files into %s\n", total, dest)
}

func defaultPackName(src string) string {
	base := filepath.Base(filepath.Clean(src))
	ext := strings.ToLower(filepath.Ext(base))
	if ext == ".iso" || ext == ".img" || ext == ".mdf" {
		return strings.TrimSuffix(base, filepath.Ext(base))
	}
	return base
}

func extractArchive(path, dest string, skip bool) (int, error) {
	a, err := arc.Open(path)
	if err != nil {
		return 0, err
	}
	defer a.Close()
	base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	n, err := extractFrom(a, filepath.Join(dest, base), skip)
	fmt.Printf("  %-24s %5d files\n", filepath.Base(path), n)
	return n, err
}

func extractFrom(a *arc.Archive, dest string, skip bool) (int, error) {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return 0, err
	}
	n := 0
	for _, e := range a.Entries {
		name := safeName(e.Name)
		if name == "" {
			continue
		}
		p := filepath.Join(dest, name)
		if skip {
			if st, err := os.Stat(p); err == nil && st.Size() > 0 {
				n++
				continue
			}
		}
		var (
			data []byte
			err  error
		)
		if strings.EqualFold(filepath.Ext(e.Name), ".xa") {
			// .xa entries are KWD1 audio blocks (a codec, not the LZSS
			// compression used by images/scripts). Keep them raw; the server
			// decodes them on demand.
			data, err = a.StoredBytes(e)
		} else {
			data, err = a.Read(e)
		}
		if err != nil {
			log.Printf("    %s: %v", e.Name, err)
			continue
		}
		if err := os.WriteFile(p, data, 0o644); err != nil {
			log.Printf("    %s: %v", e.Name, err)
			continue
		}
		n++
		if n%250 == 0 {
			fmt.Printf("    ... %d\n", n)
		}
	}
	return n, nil
}

func safeName(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	name = filepath.Base(name)
	if name == "." || name == ".." || name == "" {
		return ""
	}
	return name
}

func copyFile(src, dst string, skip bool) error {
	if skip {
		if st, err := os.Stat(dst); err == nil && st.Size() > 0 {
			return nil
		}
	}
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	w, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer w.Close()
	_, err = io.Copy(w, f)
	return err
}
