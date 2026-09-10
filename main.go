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
	"syscall"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/api"
	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
	"github.com/terva-sh/git-ticket/ticket"
)

//go:embed all:web/dist
var webFS embed.FS

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "git-ticket-canvas:", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		dir      = flag.String("store", ".", "directory to discover the .tickets store from")
		addr     = flag.String("addr", "127.0.0.1:7777", "address to listen on")
		actorID  = flag.String("actor", "", "actor to record writes as; defaults to the store's configured actor")
		readOnly = flag.Bool("read-only", false, "refuse every write, including card placement")
		version  = flag.Bool("version", false, "print build version and exit")
		asJSON   = flag.Bool("json", false, "print --version as JSON")
	)
	flag.Parse()

	if *version {
		return writeVersion(os.Stdout, *asJSON)
	}
	if *asJSON {
		return errors.New("--json requires --version")
	}

	st, err := ticket.Discover(*dir)
	if err != nil {
		if ticket.CodeOf(err) == ticket.CodeStoreNotFound {
			return fmt.Errorf("no .tickets store at or above %s; run `git-ticket init` first", *dir)
		}
		return err
	}

	actor, err := resolveActor(st, *actorID)
	if err != nil {
		return err
	}

	assets, err := fs.Sub(webFS, "web/dist")
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	srv := api.New(st, api.Options{Actor: actor, Assets: assets, ReadOnly: *readOnly, Version: buildinfo.Read()})
	if err := srv.Start(ctx); err != nil {
		return err
	}
	defer srv.Close()

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	http := &http.Server{
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	mode := ""
	if *readOnly {
		mode = "  (read-only)"
	}
	log.Printf("store  %s", st.Path())
	log.Printf("actor  %s <%s>%s", actor.Name, actor.ID, mode)
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
		// for EventSource connections that are intended to stay open.
		_ = srv.Close()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return http.Shutdown(shutdown)
	}
}

// resolveActor decides who writes are recorded as.
//
// It refuses rather than inventing one. The library refuses a create with no
// actor for a good reason — attributing a write to somebody who did not ask
// for it is worse than failing — and a server that guessed a name from the
// environment would put that guess in every ticket's updated_by.
func resolveActor(st *ticket.Store, want string) (ticket.Actor, error) {
	cfg := st.Config()
	if want != "" {
		for _, a := range cfg.Actors {
			if a.ID == want || a.Name == want {
				return a, nil
			}
		}
		// An actor the store does not list is still usable; the allowlist for
		// actors is not enforced the way series are. Taking it as an ID keeps
		// `--actor me@example.com` working in a store that never declared one.
		return ticket.Actor{ID: want, Name: want}, nil
	}
	a, declared, ok := cfg.DefaultActor()
	if !ok {
		return ticket.Actor{}, errors.New("this store declares no actor; pass --actor")
	}
	if !declared {
		log.Printf("note: no defaults.actor in config.yml; writing as %q, the first listed actor", a.Name)
	}
	return a, nil
}
