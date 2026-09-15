package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
	"github.com/terva-sh/git-ticket-canvas/internal/state"
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
	opts    RegistryOptions
	// idle is how long an untouched store with nobody watching is kept. It is
	// guarded by mu rather than read from opts, because the janitor reads it
	// from its own goroutine.
	idle time.Duration
	// now is time.Now, replaced by a test that needs eviction to happen
	// without waiting for it.
	now func() time.Time
	// ctx is what an activated store's coordinator runs under. It is set by
	// Start, because a store opened by a request has to outlive that request.
	ctx    context.Context
	stop   chan struct{}
	closed bool
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
	name    string
	display string
	path    string
	// spec is what the store will be opened with, kept because opening is
	// deferred until somebody asks for the store.
	spec     StoreSpec
	server   *Server
	actor    ticket.Actor
	readOnly bool
	reason   string
	note     string
	// lastUsed is when a request last reached this store. It decides which
	// store is evicted when the active set is full, and which the janitor
	// closes for being idle.
	lastUsed time.Time
}

// StoreSpec describes a store to serve, before anything opens it.
//
// Actor is the preferred actor: a store's own configured actor, or the global
// --actor, whichever the caller decided. Empty means the store falls back to
// whatever its own config.yml declares.
type StoreSpec struct {
	Name string
	// Display is what a person is shown instead of Name. It defaults to the
	// directory holding the store, because an id has to be unique across a
	// workspace while a name only has to be recognisable under its heading.
	Display  string
	Path     string
	Actor    string
	ReadOnly bool
	// Root is the configured root this store was found under, empty for a
	// store somebody named. The browser groups by it.
	Root string
	// Parent is the id of the store that declared this one as a child, empty
	// for everything else. The browser renders a child under its parent.
	Parent string
}

// StoreStatus is what the registry knows about one store.
type StoreStatus struct {
	Name string `json:"name"`
	// Display is the label for this store, which is not unique and is not what
	// a route or a selection is keyed on. Name is.
	Display string `json:"display"`
	Path    string `json:"path"`
	// Available is whether this store can be served. It is answered without
	// opening the store, from the same check the walk uses.
	Available bool `json:"available"`
	// Active is whether the store is open right now, holding a watcher and a
	// live stream. Listed, open, and broken are three states, and a browser
	// that cannot tell them apart shows a spinner for a store nobody asked for.
	Active bool `json:"active"`
	// Favorite is whether the person using the canvas marked this store. The
	// picker orders on it, so it is answered here rather than in a second
	// request.
	Favorite bool `json:"favorite"`
	// Root is the configured root this store was found under, and Parent is the
	// store that declared it as a child. Both are what the browser groups and
	// nests by, and neither is derivable from a path alone.
	Root     string `json:"root,omitempty"`
	Parent   string `json:"parent,omitempty"`
	ReadOnly bool   `json:"readOnly"`
	Actor    string `json:"actor,omitempty"`
	ActorID  string `json:"actorId,omitempty"`
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
	// MaxActive caps how many stores hold a watcher at once. Zero takes
	// DefaultMaxActive.
	MaxActive int
	// IdleTimeout is how long an active store with no subscribers is kept
	// before it is closed. Zero takes DefaultIdleTimeout, and a negative value
	// turns idle eviction off.
	IdleTimeout time.Duration
	// Warm is a list of store paths to activate at startup, matched against
	// registered stores by resolved path. Exceeding MaxActive warns rather than
	// failing: a configuration with forty favorites should start, serve the
	// limit, and say so.
	Warm []string
	// Rescan is the configuration and merge settings POST /api/stores/rescan
	// runs again. A zero value refuses the route, which is what a registry
	// built by a test wants.
	Rescan RescanSource
	// State is what the canvas remembers between runs: which stores are
	// favorites and which one was open last. A nil value keeps nothing, which
	// is what a test wants and what a canvas over one store does not need.
	State *state.Store
}

// RescanSource is what a rescan searches again.
type RescanSource struct {
	Config config.Config
	Merge  MergeOptions
}

// DefaultMaxActive is how many stores may hold a watcher at once.
//
// One active store is one inotify instance. A Debian 13 workstation reports 128
// in /proc/sys/fs/inotify/max_user_instances, shared with every editor the
// person is running, so a canvas taking eight is asking for a sixteenth of the
// budget. Eight canvases open at once is also more than anybody reads.
const DefaultMaxActive = 8

// DefaultIdleTimeout is how long an untouched store with nobody watching it is
// kept open.
const DefaultIdleTimeout = 15 * time.Minute

// NewRegistry returns an empty Registry.
func NewRegistry(opts RegistryOptions) *Registry {
	version := opts.Version
	if version.IsZero() {
		version = buildinfo.Parse(nil)
	}
	if opts.MaxActive <= 0 {
		opts.MaxActive = DefaultMaxActive
	}
	if opts.IdleTimeout == 0 {
		opts.IdleTimeout = DefaultIdleTimeout
	}
	return &Registry{
		entries: make(map[string]*entry),
		assets:  opts.Assets,
		version: version,
		opts:    opts,
		idle:    opts.IdleTimeout,
		now:     time.Now,
		stop:    make(chan struct{}),
	}
}

// Add registers an already-open store under a name.
func (r *Registry) Add(name string, s *Server) error {
	return r.put(&entry{
		name: name, path: s.store.Path(), server: s,
		actor: s.actor, readOnly: s.readOnly, lastUsed: r.now(),
	})
}

// Register records a store without opening it.
//
// Finding a store is cheap and opening one is not: an open store holds a
// watcher, a snapshot, and a goroutine, and a watcher is one inotify instance
// out of a budget shared with every editor on the machine. A walk over a
// workspace finds twenty-two stores and a person reads one, so the list is
// built from registrations and the opening waits for somebody to ask.
//
// The one check made here is the walk's own gate, which costs two system calls
// and no watcher: is there a store at or above this path. A path with no store
// is registered anyway, unavailable, carrying the message that says what to do
// about it.
func (r *Registry) Register(spec StoreSpec) error {
	if spec.Display == "" {
		spec.Display = DisplayName(spec.Path)
	}
	e := &entry{name: spec.Name, display: spec.Display, path: spec.Path, spec: spec, readOnly: spec.ReadOnly}
	if at, ok := discover.Nearest(spec.Path); ok {
		e.path = filepath.Join(at, discover.StoreDir)
	} else {
		e.readOnly = true
		e.reason = fmt.Sprintf("no %s store at or above %s; run `git-ticket init` first",
			discover.StoreDir, spec.Path)
	}
	return r.put(e)
}

// OpenStore registers a store and opens it now.
//
// A store that cannot be opened becomes an unavailable entry carrying the
// reason, and OpenStore still returns nil. The only error is a duplicate name,
// which is a mistake in configuration rather than a problem with a store, and
// which no later request could resolve because two stores would answer one URL.
func (r *Registry) OpenStore(spec StoreSpec) error {
	if err := r.Register(spec); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.activateLocked(r.entries[spec.Name])
	return nil
}

// activateLocked opens a registered store and starts it if the registry is
// running. It records the reason on the entry rather than returning it, because
// a store that will not open is a store to report, not a failure of the caller.
//
// A registry that has not been started yet opens the store and leaves the
// coordinator alone; Start starts everything already open. That keeps a test
// that opens stores and starts them afterwards working exactly as before.
func (r *Registry) activateLocked(e *entry) {
	if e == nil || e.server != nil || e.reason != "" && e.spec.Path == "" {
		return
	}
	st, err := ticket.Discover(e.spec.Path)
	if err != nil {
		reason := err.Error()
		if ticket.CodeOf(err) == ticket.CodeStoreNotFound {
			// Keep the hint the single-store path has always given. This is the
			// error somebody hits on their first run, and the next step is not
			// obvious from the absence alone.
			reason = fmt.Sprintf("no %s store at or above %s; run `git-ticket init` first",
				discover.StoreDir, e.spec.Path)
		}
		e.server, e.readOnly, e.reason = nil, true, reason
		return
	}

	e.path, e.lastUsed = st.Path(), r.now()
	actor, note, err := resolveActor(st, e.spec.Actor)
	if err != nil {
		// No actor to write as. The store still reads, so serve it read-only
		// rather than withholding it. Read-only is what keeps the zero actor
		// from ever reaching a write.
		e.actor, e.readOnly, e.reason, e.note = ticket.Actor{}, true, err.Error(), ""
		e.server = New(st, Options{ReadOnly: true, Version: r.version})
	} else {
		e.actor, e.readOnly, e.reason, e.note = actor, e.spec.ReadOnly, "", note
		e.server = New(st, Options{Actor: actor, ReadOnly: e.readOnly, Version: r.version})
	}
	if r.ctx == nil {
		return
	}
	if err := e.server.Start(r.ctx); err != nil {
		e.server, e.readOnly, e.reason = nil, true, err.Error()
	}
}

// acquire returns the server for a store, opening it if this is the first time
// anybody has asked.
//
// The fast path is a read lock and nothing else, because every request to an
// already-open store takes it.
func (r *Registry) acquire(name string) (*Server, string, bool) {
	r.mu.RLock()
	e, configured := r.entries[name]
	if configured && e.server != nil {
		server := e.server
		r.mu.RUnlock()
		r.touch(name)
		return server, "", true
	}
	r.mu.RUnlock()
	if !configured {
		return nil, "", false
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	e, configured = r.entries[name]
	if !configured {
		return nil, "", false
	}
	if e.server != nil {
		e.lastUsed = r.now()
		return e.server, "", true
	}
	if e.reason != "" {
		return nil, e.reason, true
	}
	if err := r.makeRoomLocked(); err != nil {
		return nil, err.Error(), true
	}
	r.activateLocked(e)
	if e.server == nil {
		return nil, e.reason, true
	}
	e.lastUsed = r.now()
	// Recorded while the lock is held, which is safe because the state keeps
	// its own and never calls back into the registry.
	r.rememberLast(e)
	return e.server, "", true
}

// touch records that a store was used, so that eviction picks the store nobody
// has looked at rather than the one somebody is reading.
func (r *Registry) touch(name string) {
	r.mu.Lock()
	e, ok := r.entries[name]
	if ok {
		e.lastUsed = r.now()
	}
	r.mu.Unlock()
	if ok {
		r.rememberLast(e)
	}
}

// favorite reports whether a store is marked. It is called with the registry
// lock held, and the state has its own.
func (r *Registry) favorite(e *entry) bool {
	if r.opts.State == nil {
		return false
	}
	return r.opts.State.Favorite(discover.Key(e.spec.Path))
}

// rememberLast records the store somebody is looking at.
//
// The state saves only when the value changed, so this is one write per switch
// rather than one per request.
func (r *Registry) rememberLast(e *entry) {
	if r.opts.State == nil {
		return
	}
	if err := r.opts.State.SetLastStore(discover.Key(e.spec.Path)); err != nil {
		log.Printf("warn   the store last used could not be saved: %v", err)
	}
}

// makeRoomLocked closes the least recently used store when the active set is
// full.
//
// A store with a live subscriber is never closed. An open EventSource is
// somebody watching, and taking their board away to make room for a store they
// have not opened yet is the wrong trade. When every active store has a
// subscriber the request fails, naming the limit and the flag, which is a
// better answer than running the machine out of inotify instances and failing
// somewhere unrelated.
func (r *Registry) makeRoomLocked() error {
	for {
		active := 0
		var oldest *entry
		for _, name := range r.order {
			e := r.entries[name]
			if e.server == nil {
				continue
			}
			active++
			if e.server.LiveStats().Subscribers > 0 {
				continue
			}
			if oldest == nil || e.lastUsed.Before(oldest.lastUsed) {
				oldest = e
			}
		}
		if active < r.opts.MaxActive {
			return nil
		}
		if oldest == nil {
			return fmt.Errorf(
				"%d stores are open and being watched, which is the limit set by --max-active; close a canvas or raise the limit",
				active)
		}
		r.deactivateLocked(oldest)
	}
}

// deactivateLocked closes an active store, leaving it registered.
func (r *Registry) deactivateLocked(e *entry) {
	server := e.server
	e.server = nil
	if server == nil {
		return
	}
	// Closing waits for the coordinator's goroutine, and the registry lock is
	// not what that goroutine needs, so this is safe to do while held.
	_ = server.Close()
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
			Name: e.name, Display: e.display, Path: e.path,
			Available: e.reason == "" || e.server != nil,
			Active:    e.server != nil, Favorite: r.favorite(e),
			Root: e.spec.Root, Parent: e.spec.Parent, ReadOnly: e.readOnly,
			Actor: e.actor.Name, ActorID: e.actor.ID,
			Reason: e.reason, Note: e.note,
		})
	}
	return list
}

// Start makes the registry live: it remembers the context activated stores run
// under, opens the stores asked for by name, and starts the janitor.
//
// A store that will not start is marked unavailable with its reason and the
// rest carry on. Before this, one unreadable store stopped the process, which
// is right for a canvas over one store and wrong for a canvas over a list.
func (r *Registry) Start(ctx context.Context) error {
	r.mu.Lock()
	r.ctx = ctx
	pending := make([]*entry, 0, len(r.order))
	for _, name := range r.order {
		if e := r.entries[name]; e.server != nil {
			pending = append(pending, e)
		}
	}
	r.mu.Unlock()

	for _, e := range pending {
		if err := e.server.Start(ctx); err != nil {
			r.mu.Lock()
			e.server, e.readOnly, e.reason = nil, true, err.Error()
			r.mu.Unlock()
			continue
		}
	}

	r.warm()
	if r.idleTimeout() > 0 {
		go r.janitor()
	}
	return nil
}

// warm opens the stores somebody asked to have ready.
//
// Favorites and the store last used are the common case, and waiting for the
// first request to open them wastes the one moment when nobody is waiting. A
// warm list longer than the limit warns rather than failing: a configuration
// with forty favorites should start, serve the limit, and say which ones it
// left closed.
func (r *Registry) warm() {
	if len(r.opts.Warm) == 0 {
		return
	}
	wanted := make(map[string]bool, len(r.opts.Warm))
	for _, path := range r.opts.Warm {
		wanted[discover.Key(path)] = true
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, name := range r.order {
		e := r.entries[name]
		if e.server != nil || e.reason != "" || !wanted[discover.Key(e.spec.Path)] {
			continue
		}
		if err := r.makeRoomLocked(); err != nil {
			log.Printf("warn   %s is not opened at startup: %v", name, err)
			return
		}
		r.activateLocked(e)
	}
}

// janitor closes stores nobody is using.
//
// It wakes often enough that a store is closed within a fraction of the idle
// period rather than a multiple of it, and it never closes a store with a
// subscriber: an open EventSource is somebody watching, however long ago their
// last request was.
// SetIdleTimeout changes how long an untouched store is kept. A value of zero
// or less turns idle eviction off for the stores that are already open; the
// janitor is started once, by Start, and simply finds nothing to do.
func (r *Registry) SetIdleTimeout(d time.Duration) {
	r.mu.Lock()
	r.idle = d
	r.mu.Unlock()
}

func (r *Registry) idleTimeout() time.Duration {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.idle
}

func (r *Registry) janitor() {
	interval := r.idleTimeout() / 4
	if interval < time.Second {
		interval = time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-r.stop:
			return
		case <-ticker.C:
			r.EvictIdle()
		}
	}
}

// EvictIdle closes every active store with no subscribers that has not been
// used within the idle period. It returns how many it closed.
func (r *Registry) EvictIdle() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.idle <= 0 {
		return 0
	}
	cutoff := r.now().Add(-r.idle)
	closed := 0
	for _, name := range r.order {
		e := r.entries[name]
		if e.server == nil || !e.lastUsed.Before(cutoff) {
			continue
		}
		if e.server.LiveStats().Subscribers > 0 {
			continue
		}
		r.deactivateLocked(e)
		closed++
	}
	return closed
}

// Rescan searches the configured roots again and reconciles the result.
//
// A store that has appeared is registered. A store that is no longer found is
// dropped only when it is not open, because closing a store somebody is looking
// at to reflect a change on disk is the wrong trade. An open store is otherwise
// untouched: same server, same watcher, same ETag, same stream.
func (r *Registry) Rescan() (added, removed int, err error) {
	cfg := r.opts.Rescan.Config
	if len(cfg.Stores) == 0 && len(cfg.Roots) == 0 {
		return 0, 0, errors.New("this canvas was not started with a configuration to search again")
	}
	specs, _ := Merge(cfg, discover.Scan(cfg), r.opts.Rescan.Merge)

	wanted := make(map[string]StoreSpec, len(specs))
	for _, spec := range specs {
		wanted[spec.Name] = spec
	}

	r.mu.Lock()
	var keep []string
	for _, name := range r.order {
		e := r.entries[name]
		if _, still := wanted[name]; still || e.server != nil {
			keep = append(keep, name)
			continue
		}
		delete(r.entries, name)
		removed++
	}
	r.order = keep
	r.mu.Unlock()

	for _, spec := range specs {
		r.mu.RLock()
		_, exists := r.entries[spec.Name]
		r.mu.RUnlock()
		if exists {
			continue
		}
		if err := r.Register(spec); err != nil {
			return added, removed, err
		}
		added++
	}
	return added, removed, nil
}

// Close closes every store that started, and stops the janitor. It is safe to
// call more than once.
func (r *Registry) Close() error {
	r.mu.Lock()
	if !r.closed {
		r.closed = true
		close(r.stop)
	}
	var started []*Server
	for _, name := range r.order {
		e := r.entries[name]
		if e.server != nil {
			started = append(started, e.server)
			e.server = nil
		}
	}
	r.mu.Unlock()

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
	server, reason, configured := r.acquire(name)

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
	mux.HandleFunc("GET /api/favorites", r.handleFavorites)
	mux.HandleFunc("PUT /api/favorites", r.handleSetFavorite)
	mux.HandleFunc("POST /api/stores/rescan", r.handleRescan)
	mux.HandleFunc("/api/stores/{store}/", r.handleStore)
	mux.HandleFunc("GET /api/version", r.handleVersion)
	mux.HandleFunc("/api/", r.handleFlat)

	if r.assets != nil {
		mux.Handle("/", http.FileServerFS(r.assets))
	}
	return http.NewCrossOriginProtection().Handler(mux)
}

// handleFlat serves the unprefixed routes when there is exactly one store.
//
// The decision is made per request rather than when the handler is built,
// because a rescan can take a canvas from one store to two, and a flat route
// left over from startup would have to guess which store it meant. Guessing
// wrong writes a ticket into the wrong repository.
func (r *Registry) handleFlat(w http.ResponseWriter, req *http.Request) {
	r.mu.RLock()
	only := ""
	if len(r.order) == 1 {
		only = r.order[0]
	}
	count := len(r.order)
	r.mu.RUnlock()

	if only == "" {
		writeJSON(w, http.StatusNotFound, errBody{
			Code: "store_required",
			Message: fmt.Sprintf(
				"this canvas serves %d stores, so a request has to name one at /api/stores/{store}/", count),
		})
		return
	}
	server, reason, _ := r.acquire(only)
	if server == nil {
		w.Header().Set("Retry-After", "5")
		writeJSON(w, http.StatusServiceUnavailable, errBody{
			Code:    "store_unavailable",
			Message: fmt.Sprintf("store %q is not available: %s", only, reason),
		})
		return
	}
	http.StripPrefix("/api", server.apiRoutes()).ServeHTTP(w, req)
}

type rescanResponse struct {
	Added   int           `json:"added"`
	Removed int           `json:"removed"`
	Stores  []StoreStatus `json:"stores"`
}

func (r *Registry) handleRescan(w http.ResponseWriter, _ *http.Request) {
	added, removed, err := r.Rescan()
	if err != nil {
		writeJSON(w, http.StatusConflict, errBody{Code: "rescan_unavailable", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, rescanResponse{Added: added, Removed: removed, Stores: r.Statuses()})
}

type favoritesResponse struct {
	// Stores are the ids of the favorite stores this canvas is serving. The
	// browser routes by id, so it gets ids.
	Stores []string `json:"stores"`
	// Paths are the favorites as stored, including any that this canvas is not
	// serving, so that a canvas started on a different root does not look like
	// it lost them.
	Paths []string `json:"paths"`
	// LastStore is the path last looked at, and LastStoreID is the id this
	// canvas serves it under, empty when this canvas does not serve it. The
	// browser routes by id and cannot map a path to one.
	LastStore   string `json:"lastStore,omitempty"`
	LastStoreID string `json:"lastStoreId,omitempty"`
}

type favoriteRequest struct {
	Store    string `json:"store"`
	Favorite bool   `json:"favorite"`
}

func (r *Registry) handleFavorites(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(w, http.StatusOK, r.favorites())
}

func (r *Registry) handleSetFavorite(w http.ResponseWriter, req *http.Request) {
	if r.opts.State == nil {
		writeJSON(w, http.StatusConflict, errBody{
			Code:    "state_unavailable",
			Message: "this canvas is not keeping favorites",
		})
		return
	}
	var body favoriteRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, req.Body, 4096)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "invalid_body", Message: err.Error()})
		return
	}

	r.mu.RLock()
	e, known := r.entries[body.Store]
	var path string
	if known {
		path = discover.Key(e.spec.Path)
	}
	r.mu.RUnlock()
	if !known {
		writeJSON(w, http.StatusNotFound, errBody{
			Code:    "unknown_store",
			Message: fmt.Sprintf("no store named %q is configured", body.Store),
		})
		return
	}
	if err := r.opts.State.SetFavorite(path, body.Favorite); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody{Code: "state_write_failed", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, r.favorites())
}

// favorites answers with ids for the stores this canvas serves and paths for
// everything remembered, so a canvas started on a different root shows what it
// can reach without looking as though the rest were forgotten.
func (r *Registry) favorites() favoritesResponse {
	out := favoritesResponse{Stores: []string{}, Paths: []string{}}
	if r.opts.State == nil {
		return out
	}
	snapshot := r.opts.State.Snapshot()
	out.Paths = append(out.Paths, snapshot.Favorites...)
	out.LastStore = snapshot.LastStore

	marked := make(map[string]bool, len(snapshot.Favorites))
	for _, path := range snapshot.Favorites {
		marked[path] = true
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, name := range r.order {
		key := discover.Key(r.entries[name].spec.Path)
		if marked[key] {
			out.Stores = append(out.Stores, name)
		}
		if key == snapshot.LastStore {
			out.LastStoreID = name
		}
	}
	return out
}

func (r *Registry) handleVersion(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	writeJSON(w, http.StatusOK, r.version)
}
