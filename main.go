// Command git-ticket-canvas serves a git-ticket store as an infinite canvas.
//
// The store on disk stays the source of truth: every edit made here goes
// through the library's typed mutations, under its lock, with the same
// revision preconditions the CLI uses. Shared read snapshots are rebuilt from
// authoritative files. Card positions live beside the tickets as text.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
)

//go:embed all:web/dist
var webFS embed.FS

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "git-ticket-canvas:", err)
		os.Exit(1)
	}
}

// stringList collects a repeatable flag such as --store or --root.
type stringList []string

func (f *stringList) String() string { return strings.Join(*f, ", ") }

func (f *stringList) Set(value string) error {
	*f = append(*f, value)
	return nil
}

// recursiveFlag is -R, which takes its depth or leaves it at the default.
//
// IsBoolFlag is what lets `-R` stand alone. It also means `-R 3` does not do
// what it looks like: the flag package takes the default and leaves `3` as a
// positional argument. run rejects leftover arguments for exactly that reason,
// and --depth exists as the spelling that cannot be misread.
type recursiveFlag struct {
	set   bool
	depth int
}

func (f *recursiveFlag) String() string {
	if f == nil || !f.set {
		return "false"
	}
	return strconv.Itoa(f.depth)
}

func (f *recursiveFlag) Set(value string) error {
	f.set = true
	if value == "true" {
		return nil
	}
	depth, err := strconv.Atoi(value)
	if err != nil {
		return fmt.Errorf("depth %q is not a number; write -R=N", value)
	}
	if depth < 0 {
		return fmt.Errorf("depth %d is negative", depth)
	}
	f.depth = depth
	return nil
}

func (f *recursiveFlag) IsBoolFlag() bool { return true }

func run() error {
	var stores, roots stringList
	var recursive recursiveFlag
	flag.Var(&stores, "store", "a store to serve, as PATH or NAME=PATH; repeatable")
	flag.Var(&roots, "root", "a directory to search for stores; repeatable")
	flag.Var(&recursive, "R", "search for stores below each root, with an optional depth as -R=N")
	var (
		configPath = flag.String("config", "", "configuration file listing the stores to serve")
		depth      = flag.Int("depth", 0, "how far below a root to search; the default is 4")
		addr       = flag.String("addr", "127.0.0.1:7777", "address to listen on")
		actorID    = flag.String("actor", "", "actor to record writes as; defaults to each store's configured actor")
		readOnly   = flag.Bool("read-only", false, "refuse every write, including card placement")
		version    = flag.Bool("version", false, "print build version and exit")
		asJSON     = flag.Bool("json", false, "print --version as JSON")
	)
	flag.Parse()

	// -R takes its depth with an equals sign. Written `-R 3`, the flag package
	// keeps the default and leaves the 3 here, so a leftover argument is
	// usually somebody who meant to set a depth and did not.
	if extra := flag.Args(); len(extra) > 0 {
		return fmt.Errorf("unexpected argument %q; -R takes its depth as -R=N rather than -R N, or use --depth N", extra[0])
	}

	if *version {
		return writeVersion(os.Stdout, *asJSON)
	}
	if *asJSON {
		return errors.New("--json requires --version")
	}

	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	cfg, err := config.Load(*configPath, os.Getenv(config.EnvStores), stores, cwd)
	if err != nil {
		return err
	}
	// Searching is on when anything asked for it: -R, --depth, a --root, or a
	// roots block in the configuration file. Naming a root is itself the
	// request, so -R is not also required.
	searching := recursive.set || *depth > 0 || len(roots) > 0 || len(cfg.Roots) > 0

	if len(cfg.Stores) == 0 && !searching {
		// No file, environment variable, or flag named a store. Fall back to the
		// working directory, which is what --store defaulted to before the flag
		// became repeatable.
		cfg, err = config.Load("", "", []string{"."}, cwd)
		if err != nil {
			return err
		}
	}

	if searching {
		wanted := config.DefaultDepth
		if recursive.depth > 0 {
			wanted = recursive.depth
		}
		if *depth > 0 {
			wanted = *depth
		}
		if err := cfg.AddRoots(roots, wanted, cwd); err != nil {
			return err
		}
		if len(cfg.Roots) == 0 {
			// -R with no root named searches below the store directory, which
			// is the working directory unless --store said otherwise.
			from := cwd
			if len(cfg.Stores) > 0 {
				from = cfg.Stores[0].Path
			}
			if err := cfg.AddRoots([]string{from}, wanted, cwd); err != nil {
				return err
			}
		}
	}

	assets, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		return err
	}

	// Assets are served once by the registry rather than by every store.
	registry := api.NewRegistry(api.RegistryOptions{Assets: assets, Version: buildinfo.Read()})
	for _, configured := range cfg.Stores {
		// A store's own configured actor wins over the global --actor, and a
		// store configured read-only stays read-only whatever the flag says.
		want := *actorID
		if configured.Actor != "" {
			want = configured.Actor
		}
		if err := registry.OpenStore(api.StoreSpec{
			Name:     configured.Name,
			Path:     configured.Path,
			Actor:    want,
			ReadOnly: *readOnly || configured.ReadOnly,
		}); err != nil {
			return err
		}
	}

	// Stores found by searching a root. The full rule, that an explicitly named
	// store is always listed and that the two sets merge on resolved path, is
	// still to come; this skips a discovered store whose path or name a
	// configured one already holds, and says so.
	if len(cfg.Roots) > 0 {
		takenPath := make(map[string]bool, len(cfg.Stores))
		takenName := make(map[string]bool, len(cfg.Stores))
		for _, s := range cfg.Stores {
			takenPath[s.Path] = true
			takenName[s.Name] = true
		}
		for _, f := range discover.Walk(cfg.Roots).Stores {
			name := config.SlugName(f.Root, f.Path)
			if takenPath[f.Path] || takenName[name] {
				log.Printf("found  %s  already configured, leaving it as named", f.Path)
				continue
			}
			takenPath[f.Path], takenName[name] = true, true
			if err := registry.OpenStore(api.StoreSpec{
				Name: name, Path: f.Path, Actor: *actorID, ReadOnly: *readOnly,
			}); err != nil {
				return err
			}
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := registry.Start(ctx); err != nil {
		return err
	}
	defer registry.Close()

	// Report every store, including the ones that did not open. An unavailable
	// store is loud here as well as visible in GET /api/stores, because a
	// canvas that quietly serves four of your five repositories is worse than
	// one that says which one it dropped.
	available := 0
	for _, s := range registry.Statuses() {
		if !s.Available {
			log.Printf("store  %s  %s  unavailable: %s", s.Name, s.Path, s.Reason)
			continue
		}
		available++
		mode := ""
		if s.ReadOnly {
			mode = "  (read-only)"
		}
		log.Printf("store  %s  %s%s", s.Name, s.Path, mode)
		if s.Actor != "" {
			log.Printf("actor  %s <%s>", s.Actor, s.ActorID)
		}
		if s.Reason != "" {
			log.Printf("note   %s: %s", s.Name, s.Reason)
		}
		if s.Note != "" {
			log.Printf("note   %s: %s", s.Name, s.Note)
		}
	}
	// Serving nothing is not a degraded canvas, it is a broken invocation, and
	// the reasons are already on stderr above.
	if available == 0 {
		return errors.New("no configured store could be opened")
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	http := &http.Server{
		Handler:           registry.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("canvas http://%s", ln.Addr())

	errc := make(chan error, 1)
	go func() { errc <- http.Serve(ln) }()

	select {
	case err := <-errc:
		if errors.Is(err, net.ErrClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// Closing live streams first lets HTTP Shutdown finish without waiting
		// for EventSource connections that are intended to stay open. Every
		// store holds its own, so this closes all of them.
		_ = registry.Close()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return http.Shutdown(shutdown)
	}
}
