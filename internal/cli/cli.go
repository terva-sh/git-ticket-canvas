// Package cli is the body of both canvas commands.
//
// There are two of them, and the split is the point rather than an accident of
// packaging. `git-ticket-canvas` is the tool on somebody's desk: loopback, no
// authentication, writable, pointed at repositories they already own.
// `git-ticket-canvas-server` is the tool published at a hostname: an identity
// provider is required before it starts, and access is granted per store.
//
// Almost everything they do is the same, which is why it is here once. What
// differs is a default, a refusal, and a requirement, and each of those is a
// switch on Kind rather than a flag somebody can move.
package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
	"github.com/terva-sh/git-ticket-canvas/web"
)

// Kind is which of the two canvases is running.
type Kind int

const (
	// Desk is git-ticket-canvas: a tool on one person's machine, reading
	// repositories they already have. It stays writable by default, because
	// loopback plus your own repository plus one person is the case where
	// writing is the entire point, and a read-only default there is a flag
	// people alias around within a week.
	Desk Kind = iota
	// Served is git-ticket-canvas-server: a canvas published at a hostname. It
	// refuses to start without an identity provider and defaults to read-only.
	Served
)

// String is the executable's name, which is what an error message has to say
// and what the usage line already prints.
func (k Kind) String() string {
	if k == Served {
		return "git-ticket-canvas-server"
	}
	return "git-ticket-canvas"
}

// Main runs one of the two commands and exits.
func Main(kind Kind) {
	if err := Run(kind, os.Args); err != nil {
		fmt.Fprintln(os.Stderr, kind.String()+":", err)
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
// positional argument. Run rejects leftover arguments for exactly that reason,
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

// Run parses args and serves. args is the whole command line including the
// executable's own name, which is what the usage line is built from.
func Run(kind Kind, args []string) error {
	name := kind.String()
	if len(args) > 0 {
		name = args[0]
	}
	flags := flag.NewFlagSet(name, flag.ExitOnError)

	var stores, roots, exclude stringList
	var recursive recursiveFlag
	flags.Var(&stores, "store", "a store to serve, as PATH or NAME=PATH; repeatable")
	flags.Var(&roots, "root", "a directory to search for stores; repeatable")
	flags.Var(&recursive, "R", "search for stores below each root, with an optional depth as -R=N")
	flags.Var(&exclude, "exclude", "a name, path, or pattern to keep out of the search; repeatable")
	var (
		configPath = flags.String("config", "", "configuration file listing the stores to serve")
		depth      = flags.Int("depth", 0, "how far below a root to search; the default is 4")
		addr       = flags.String("addr", "127.0.0.1:7777", "address to listen on")
		actorID    = flags.String("actor", "", "actor to record writes as; defaults to each store's configured actor")
		readOnly   = flags.Bool("read-only", kind == Served, "refuse every write, including card placement")
		scan       = flags.Bool("scan", false, "print what discovery decided about every candidate, then exit")
		maxActive  = flags.Int("max-active", api.DefaultMaxActive, "how many stores may be open at once; each open store holds one file watcher")
		storeIdle  = flags.Duration("store-idle", api.DefaultIdleTimeout, "close a store nobody is watching after this long; 0 never closes one")
		statePath  = flags.String("state", "", "file holding favorites and the store last used; defaults to the canvas state directory")
		version    = flags.Bool("version", false, "print build version and exit")
		asJSON     = flags.Bool("json", false, "print --version as JSON")
	)
	// The two commands diverge here, in the flags that exist at all rather than
	// in what a shared flag means. A flag that is absent cannot be passed by
	// mistake, and a flag whose meaning depends on which binary you are running
	// is the thing this split exists to avoid.
	var unsafePublish *bool
	var identity identityFlags
	switch kind {
	case Desk:
		unsafePublish = flags.Bool(unsafePublishFlag, false,
			"serve a non-loopback address with no authentication, for a container whose port is published to a loopback mapping")
	case Served:
		identity.register(flags)
	}
	if err := flags.Parse(argsAfterName(args)); err != nil {
		return err
	}

	// -R takes its depth with an equals sign. Written `-R 3`, the flag package
	// keeps the default and leaves the 3 here, so a leftover argument is
	// usually somebody who meant to set a depth and did not.
	if extra := flags.Args(); len(extra) > 0 {
		return fmt.Errorf("unexpected argument %q; -R takes its depth as -R=N rather than -R N, or use --depth N", extra[0])
	}

	if *version {
		return writeVersion(os.Stdout, kind, *asJSON)
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

	// Who the canvas trusts to log in, and where it may listen. Both are
	// settled before a single store is opened, so a misconfigured canvas fails
	// at startup rather than after it is already serving.
	switch kind {
	case Desk:
		if err := checkDeskAddr(*addr, *unsafePublish); err != nil {
			return err
		}
		if cfg.Identity.Configured() {
			log.Printf("note   this configuration names an identity provider, which %s ignores; that belongs to %s",
				Desk, Served)
		}
	case Served:
		if cfg.Identity, err = identity.resolve(cfg.Identity); err != nil {
			return err
		}
		// TKT-01M2MEBN is what makes this configuration do anything. Until it
		// lands, the provider is checked and then not used, and a canvas served
		// by this build answers every request without asking who is asking.
		log.Printf("warn   this build has no sign-on yet: the identity provider is required and not yet consulted, " +
			"so every request is served unauthenticated; do not publish it")
	}

	// Searching is on when anything asked for it: -R, --depth, a --root, or a
	// roots block in the configuration file. Naming a root is itself the
	// request, so -R is not also required.
	searching := recursive.set || *depth > 0 || len(roots) > 0 || len(cfg.Roots) > 0

	if len(cfg.Stores) == 0 && !searching {
		// No file, environment variable, or flag named a store. Fall back to the
		// working directory, which is what --store defaulted to before the flag
		// became repeatable.
		// Reloading replaces the whole configuration, and who the canvas
		// trusts to log in was already settled above. Carrying it across keeps
		// a served canvas in the directory it was started in from losing its
		// provider to a fallback about stores.
		provider := cfg.Identity
		cfg, err = config.Load("", "", []string{"."}, cwd)
		if err != nil {
			return err
		}
		cfg.Identity = provider
	}

	cfg.Exclude = append(cfg.Exclude, exclude...)

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

	// One discovery, whether it is being explained or served. An explanation of
	// a discovery that is not the one being run would be worse than none.
	found := discover.Scan(cfg)
	if *scan {
		return discover.Format(cfg, found, os.Stdout)
	}

	assets, err := web.FS()
	if err != nil {
		return err
	}

	// Which stores to serve, what they are called, and how each is configured.
	// The rule lives beside the registry because a later rescan needs it and
	// this function will not be running then.
	merging := api.MergeOptions{Actor: *actorID, ReadOnly: *readOnly}
	specs, notes, err := api.Merge(cfg, found, merging)
	if err != nil {
		return err
	}

	// Assets are served once by the registry rather than by every store.
	idle := *storeIdle
	if idle == 0 {
		// A zero duration on the command line means never close one, which the
		// registry spells as a negative value so that zero can still mean "take
		// the default" for a caller that set no option at all.
		idle = -1
	}
	// Favorites and the store last used live outside every repository, and are
	// what the registry opens at startup so the common case is already warm.
	remembered, warning := openState(*statePath)
	if warning != "" {
		log.Printf("warn   %s", warning)
	}
	var warm []string
	if remembered != nil {
		// The desk canvas has one person at it, so the one key is the one to
		// warm. A served canvas does not know who will log in, and opening
		// somebody's favorites before they arrive would spend the watcher
		// budget on a guess.
		if kind == Desk {
			warm = remembered.Warm(state.LocalUser)
		}
	}

	registry := api.NewRegistry(api.RegistryOptions{
		Assets:      assets,
		Version:     buildinfo.Read(),
		MaxActive:   *maxActive,
		IdleTimeout: idle,
		Warm:        warm,
		Rescan:      api.RescanSource{Config: cfg, Merge: merging},
		State:       remembered,
	})
	for _, warning := range found.Warnings {
		log.Printf("warn   %s", warning)
	}
	for _, note := range notes {
		log.Printf("note   %s", note)
	}
	// Registered, not opened. A store costs a watcher only once somebody looks
	// at it, which is what makes a canvas over twenty-two repositories
	// affordable on a budget of 128 inotify instances shared with every editor
	// on the machine.
	for _, spec := range specs {
		if err := registry.Register(spec); err != nil {
			return err
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := registry.Start(ctx); err != nil {
		return err
	}
	defer registry.Close()

	if err := reportStores(registry); err != nil {
		return err
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	server := &http.Server{
		Handler:           registry.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("canvas http://%s", ln.Addr())

	errc := make(chan error, 1)
	go func() { errc <- server.Serve(ln) }()

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
		return server.Shutdown(shutdown)
	}
}

// argsAfterName drops the executable's own name, tolerating a caller that
// passed only the arguments.
func argsAfterName(args []string) []string {
	if len(args) == 0 {
		return nil
	}
	return args[1:]
}

// reportStores logs every store, including the ones that will not open.
//
// An unavailable store is loud here as well as visible in GET /api/stores,
// because a canvas that quietly serves four of your five repositories is worse
// than one that says which one it dropped. Most stores are listed here without
// having been opened, so there is no actor to report yet.
func reportStores(registry *api.Registry) error {
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
		opening := ""
		if !s.Active {
			opening = "  (opens on first use)"
		}
		log.Printf("store  %s  %s%s%s", s.Name, s.Path, mode, opening)
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
	return nil
}

// openState opens the file the canvas remembers favorites in.
//
// A canvas that cannot find a state directory still runs, keeping nothing. That
// is a degraded canvas rather than a broken one, and refusing to start over a
// missing home directory would be the wrong trade.
func openState(path string) (*state.Store, string) {
	if path == "" {
		dir, err := state.Dir()
		if err != nil {
			return nil, fmt.Sprintf("favorites are not being kept: %v", err)
		}
		path = filepath.Join(dir, state.FileName)
	}
	return state.Open(path)
}
