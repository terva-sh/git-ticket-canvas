package api

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"sync"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
	"github.com/terva-sh/git-ticket/ticket"
)

// Registry serves several stores behind one handler, routing by store name.
//
// Each store keeps its own Server, and a Server owns one store, one layout
// writer, one coordinator, one actor, and one mutation lock. Nothing is shared
// between them, so a write to one store cannot change another's ETag or wake
// another's file watcher. That independence is the point of holding several
// Servers rather than teaching one Server about several stores.
//
// A store that cannot be opened is held as an unavailable entry rather than
// dropped or turned into a startup failure. One canvas over a list of
// repositories is only useful if a single stale path costs you that one store
// and not the page.
type Registry struct {
	// mu guards entries and order. OpenStore writes under it, and rescan will
	// add and remove stores later.
	mu      sync.RWMutex
	order   []string
	entries map[string]*entry

	assets  fs.FS
	version buildinfo.Info
	started []*Server
}

// entry is one store's state.
//
// A nil server means the store could not be opened, and reason says why. A
// non-nil server with a reason is a store that opened and is degraded, which
// today means it has no actor to write as and is therefore read-only.
//
// note is separate from reason on purpose. A note is informational and a
// healthy store can carry one, so folding the two together would make the
// browser badge an ordinary store as degraded.
type entry struct {
	name     string
	path     string
	server   *Server
	actor    ticket.Actor
	readOnly bool
	reason   string
	note     string
}

// StoreSpec describes a store to serve, before anything opens it.
//
// Actor is the preferred actor: a store's own configured actor, or the global
// --actor, whichever the caller decided. Empty means the store falls back to
// whatever its own config.yml declares.
type StoreSpec struct {
	Name     string
	Path     string
	Actor    string
	ReadOnly bool
}

// StoreStatus is what the registry knows about one store.
type StoreStatus struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	Available bool   `json:"available"`
	ReadOnly  bool   `json:"readOnly"`
	Actor     string `json:"actor,omitempty"`
	ActorID   string `json:"actorId,omitempty"`
	// Reason is empty when nothing is wrong. It says why a store is
	// unavailable, or why an available one is forced read-only. A store with a
	// reason is degraded and should be presented that way.
	Reason string `json:"reason,omitempty"`
	// Note is informational and carries no fault. A healthy store writing as
	// the first listed actor because config.yml declares no default has one.
	Note string `json:"note,omitempty"`
}

// RegistryOptions configures a Registry.
type RegistryOptions struct {
	// Assets is the built frontend, served at /. A nil value serves no files,
	// which is what the API tests want.
	Assets fs.FS
	// Version is the executable's build identity. It is answered from here
	// rather than from a store, so the browser can label the server even when
	// no store is readable.
	Version buildinfo.Info
}

// NewRegistry returns an empty Registry.
func NewRegistry(opts RegistryOptions) *Registry {
	version := opts.Version
	if version.IsZero() {
		version = buildinfo.Parse(nil)
	}
	return &Registry{entries: make(map[string]*entry), assets: opts.Assets, version: version}
}

// Add registers an already-open store under a name.
func (r *Registry) Add(name string, s *Server) error {
	return r.put(&entry{
		name: name, path: s.store.Path(), server: s,
		actor: s.actor, readOnly: s.readOnly,
	})
}

// OpenStore opens a store and registers it under its name.
//
// A store that cannot be opened becomes an unavailable entry carrying the
// reason, and OpenStore still returns nil. The only error is a duplicate name,
// which is a mistake in configuration rather than a problem with a store, and
// which no later request could resolve because two stores would answer one URL.
func (r *Registry) OpenStore(spec StoreSpec) error {
	st, err := ticket.Discover(spec.Path)
	if err != nil {
		reason := err.Error()
		if ticket.CodeOf(err) == ticket.CodeStoreNotFound {
			// Keep the hint the single-store path has always given. This is the
			// error somebody hits on their first run, and the next step is not
			// obvious from the absence alone.
			reason = fmt.Sprintf("no .tickets store at or above %s; run `git-ticket init` first", spec.Path)
		}
		return r.put(&entry{name: spec.Name, path: spec.Path, readOnly: true, reason: reason})
	}

	actor, note, err := resolveActor(st, spec.Actor)
	if err != nil {
		// No actor to write as. The store still reads, so serve it read-only
		// rather than withholding it. Read-only is what keeps the zero actor
		// from ever reaching a write.
		return r.put(&entry{
			name: spec.Name, path: st.Path(), readOnly: true, reason: err.Error(),
			server: New(st, Options{ReadOnly: true, Version: r.version}),
		})
	}

	readOnly := spec.ReadOnly
	return r.put(&entry{
		name: spec.Name, path: st.Path(), actor: actor, readOnly: readOnly, note: note,
		server: New(st, Options{Actor: actor, ReadOnly: readOnly, Version: r.version}),
	})
}

func (r *Registry) put(e *entry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.entries[e.name]; exists {
		return fmt.Errorf("two stores named %q", e.name)
	}
	r.entries[e.name] = e
	r.order = append(r.order, e.name)
	return nil
}

// resolveActor decides who writes to this store are recorded as.
//
// It refuses rather than inventing one. The library refuses a create with no
// actor for a good reason, because attributing a write to somebody who did not
// ask for it is worse than failing, and a server that guessed a name from the
// environment would put that guess in every ticket's updated_by.
//
// The returned note is non-empty when the answer was a fallback worth saying
// out loud rather than a declared default.
func resolveActor(st *ticket.Store, want string) (ticket.Actor, string, error) {
	cfg := st.Config()
	if want != "" {
		for _, a := range cfg.Actors {
			if a.ID == want || a.Name == want {
				return a, "", nil
			}
		}
		// An actor the store does not list is still usable; the allowlist for
		// actors is not enforced the way series are. Taking it as an ID keeps
		// `--actor me@example.com` working in a store that never declared one.
		return ticket.Actor{ID: want, Name: want}, "", nil
	}
	a, declared, ok := cfg.DefaultActor()
	if !ok {
		return ticket.Actor{}, "", errors.New("this store declares no actor, so it is read-only; pass --actor or set one in its config.yml")
	}
	if !declared {
		return a, fmt.Sprintf("no defaults.actor in config.yml; writing as %q, the first listed actor", a.Name), nil
	}
	return a, "", nil
}

// Len is how many stores are registered, available or not.
func (r *Registry) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.order)
}

// Lookup finds an available store's server by name. A configured store that
// could not be opened is not found here; Statuses reports it.
func (r *Registry) Lookup(name string) (*Server, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.entries[name]
	if !ok || e.server == nil {
		return nil, false
	}
	return e.server, true
}

// Names lists the registered stores in configured order.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, len(r.order))
	copy(names, r.order)
	return names
}

// Statuses reports every store in configured order.
func (r *Registry) Statuses() []StoreStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]StoreStatus, 0, len(r.order))
	for _, name := range r.order {
		e := r.entries[name]
		list = append(list, StoreStatus{
			Name: e.name, Path: e.path, Available: e.server != nil,
			ReadOnly: e.readOnly, Actor: e.actor.Name, ActorID: e.actor.ID,
			Reason: e.reason, Note: e.note,
		})
	}
	return list
}

// Start starts every store that opened.
//
// A store that will not start is marked unavailable with its reason and the
// rest carry on. Before this, one unreadable store stopped the process, which
// is right for a canvas over one store and wrong for a canvas over a list.
//
// It returns nil today. The error is kept in the signature because opening a
// store moves off startup in the lazy-activation work, where a cancelled
// context is a failure of the call rather than of any one store.
func (r *Registry) Start(ctx context.Context) error {
	r.mu.RLock()
	pending := make([]*entry, 0, len(r.order))
	for _, name := range r.order {
		if e := r.entries[name]; e.server != nil {
			pending = append(pending, e)
		}
	}
	r.mu.RUnlock()

	for _, e := range pending {
		if err := e.server.Start(ctx); err != nil {
			r.mu.Lock()
			e.server, e.readOnly, e.reason = nil, true, err.Error()
			r.mu.Unlock()
			continue
		}
		r.started = append(r.started, e.server)
	}
	return nil
}

// Close closes every store that started. It is safe to call more than once.
func (r *Registry) Close() error {
	started := r.started
	r.started = nil
	var err error
	for _, s := range started {
		if closeErr := s.Close(); closeErr != nil && err == nil {
			err = closeErr
		}
	}
	return err
}

type storesResponse struct {
	Stores []StoreStatus `json:"stores"`
}

func (r *Registry) handleStores(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(w, http.StatusOK, storesResponse{Stores: r.Statuses()})
}

// handleStore routes one request to the store named in its path.
func (r *Registry) handleStore(w http.ResponseWriter, req *http.Request) {
	name := req.PathValue("store")
	r.mu.RLock()
	e, configured := r.entries[name]
	var server *Server
	var reason string
	if configured {
		server, reason = e.server, e.reason
	}
	r.mu.RUnlock()

	switch {
	case !configured:
		writeJSON(w, http.StatusNotFound, errBody{
			Code:    "unknown_store",
			Message: fmt.Sprintf("no store named %q is configured", name),
		})
	case server == nil:
		// Configured but not serving. This is a different answer from 404: the
		// store exists in the configuration and something is wrong with it, so
		// the browser should say so rather than claim it was never asked for.
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusServiceUnavailable, errBody{
			Code:    "store_unavailable",
			Message: fmt.Sprintf("store %q is not available: %s", name, reason),
		})
	default:
		http.StripPrefix("/api/stores/"+name, server.apiRoutes()).ServeHTTP(w, req)
	}
}

// Handler returns the router.
//
// Go's mux prefers the most specific pattern, so GET /api/stores and the
// /api/stores/{store}/ subtree both win over the flat /api/ mount below them.
func (r *Registry) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/stores", r.handleStores)
	mux.HandleFunc("/api/stores/{store}/", r.handleStore)
	mux.HandleFunc("GET /api/version", r.handleVersion)

	// One store keeps the flat routes, so `git-ticket-canvas --store .` is
	// unchanged. Several stores do not get them, because a flat route would
	// have to guess which store it meant, and guessing wrong writes a ticket
	// into the wrong repository.
	r.mu.RLock()
	if len(r.order) == 1 {
		if only := r.entries[r.order[0]]; only.server != nil {
			mux.Handle("/api/", http.StripPrefix("/api", only.server.apiRoutes()))
		}
	}
	r.mu.RUnlock()

	if r.assets != nil {
		mux.Handle("/", http.FileServerFS(r.assets))
	}
	return http.NewCrossOriginProtection().Handler(mux)
}

func (r *Registry) handleVersion(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(w, http.StatusOK, r.version)
}
