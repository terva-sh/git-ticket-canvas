package api

import (
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"sync"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
)

// Registry serves several stores behind one handler, routing by store name.
//
// Each store keeps its own Server, and a Server owns one store, one layout
// writer, one coordinator, one actor, and one mutation lock. Nothing is shared
// between them, so a write to one store cannot change another's ETag or wake
// another's file watcher. That independence is the point of holding several
// Servers rather than teaching one Server about several stores.
type Registry struct {
	// mu guards entries and order. Nothing mutates them yet, and the lock is
	// here so that rescan can add and remove stores later without retrofitting
	// locking into code written as though there were none.
	mu      sync.RWMutex
	order   []string
	entries map[string]*Server

	assets  fs.FS
	version buildinfo.Info
	started []*Server
}

// RegistryOptions configures a Registry.
type RegistryOptions struct {
	// Assets is the built frontend, served at /. A nil value serves no files,
	// which is what the API tests want.
	Assets fs.FS
	// Version is the executable's build identity. It is answered from here
	// rather than from a store, so the browser can label the server even while
	// no store is readable.
	Version buildinfo.Info
}

// NewRegistry returns an empty Registry.
func NewRegistry(opts RegistryOptions) *Registry {
	version := opts.Version
	if version.IsZero() {
		version = buildinfo.Parse(nil)
	}
	return &Registry{entries: make(map[string]*Server), assets: opts.Assets, version: version}
}

// Add registers a store under a name. The name has already been validated by
// internal/config; Add refuses a duplicate because two stores answering one
// URL is not something a later request could resolve.
func (r *Registry) Add(name string, s *Server) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.entries[name]; exists {
		return fmt.Errorf("two stores named %q", name)
	}
	r.entries[name] = s
	r.order = append(r.order, name)
	return nil
}

// Len is how many stores are registered.
func (r *Registry) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.order)
}

// Lookup finds a store's server by name.
func (r *Registry) Lookup(name string) (*Server, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.entries[name]
	return s, ok
}

// Names lists the registered stores in configured order.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, len(r.order))
	copy(names, r.order)
	return names
}

// Start starts every registered store.
//
// A store that will not start stops the whole process, which is what one store
// does today. Reporting one store unavailable while the rest serve is a
// deliberate change of behavior and belongs to its own ticket, so a failure
// here closes whatever already started and returns.
func (r *Registry) Start(ctx context.Context) error {
	r.mu.RLock()
	servers := make([]*Server, 0, len(r.order))
	names := make([]string, 0, len(r.order))
	for _, name := range r.order {
		servers = append(servers, r.entries[name])
		names = append(names, name)
	}
	r.mu.RUnlock()

	for i, s := range servers {
		if err := s.Start(ctx); err != nil {
			for _, started := range r.started {
				_ = started.Close()
			}
			r.started = nil
			return fmt.Errorf("store %s: %w", names[i], err)
		}
		r.started = append(r.started, s)
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

// storeEntry is one row of the GET /api/stores index.
//
// Later tickets add whether a store is merely discovered or actually open,
// whether it is a favorite, and which root it was found under. The fields here
// are the ones that exist while every configured store is opened at startup.
type storeEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	ReadOnly bool   `json:"readOnly"`
}

type storesResponse struct {
	Stores []storeEntry `json:"stores"`
}

func (r *Registry) handleStores(w http.ResponseWriter, _ *http.Request) {
	r.mu.RLock()
	list := make([]storeEntry, 0, len(r.order))
	for _, name := range r.order {
		s := r.entries[name]
		list = append(list, storeEntry{Name: name, Path: s.store.Path(), ReadOnly: s.readOnly})
	}
	r.mu.RUnlock()
	w.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(w, http.StatusOK, storesResponse{Stores: list})
}

// handleStore routes one request to the store named in its path.
func (r *Registry) handleStore(w http.ResponseWriter, req *http.Request) {
	name := req.PathValue("store")
	s, ok := r.Lookup(name)
	if !ok {
		writeJSON(w, http.StatusNotFound, errBody{
			Code:    "unknown_store",
			Message: fmt.Sprintf("no store named %q is configured", name),
		})
		return
	}
	http.StripPrefix("/api/stores/"+name, s.apiRoutes()).ServeHTTP(w, req)
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
		only := r.entries[r.order[0]]
		mux.Handle("/api/", http.StripPrefix("/api", only.apiRoutes()))
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
