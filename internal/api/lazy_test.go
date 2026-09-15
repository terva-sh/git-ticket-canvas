package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket/ticket"
)

// subscribe opens a live subscription the way an EventSource does, and returns
// the function that closes it.
func subscribe(t *testing.T, s *Server) func() {
	t.Helper()
	ch, ok := s.live.subscribe()
	if !ok {
		t.Fatal("the store refused a live subscription")
	}
	return func() { s.live.unsubscribe(ch) }
}

// inotifyCount is how many inotify instances this process holds.
//
// One active store is one watcher and one watcher is one instance, so this is
// the cost the whole ticket is about. Counting the real descriptors is the only
// check that cannot pass while the bug is present: a count derived from the
// registry's own bookkeeping would agree with the registry even when the
// registry is wrong.
func inotifyCount(t *testing.T) int {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("inotify instances are a Linux file descriptor")
	}
	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Skip("no /proc/self/fd to count")
	}
	count := 0
	for _, e := range entries {
		if target, err := os.Readlink(filepath.Join("/proc/self/fd", e.Name())); err == nil &&
			strings.Contains(target, "inotify") {
			count++
		}
	}
	return count
}

// lazyRegistry registers n stores without opening any of them.
// evictNow makes every open store look idle, whatever the clock's resolution.
//
// Setting a one-nanosecond timeout and sweeping assumes the clock ticked
// between the request that opened the store and the sweep. On Windows it often
// has not: lastUsed equals now, the store looks freshly used, and nothing is
// evicted. Moving the registry's own clock forward asserts the eviction rule
// rather than the host's timer resolution.
func evictNow(r *Registry) int {
	r.mu.Lock()
	r.now = func() time.Time { return time.Now().Add(time.Hour) }
	r.mu.Unlock()
	r.SetIdleTimeout(time.Minute)
	return r.EvictIdle()
}

func lazyRegistry(t *testing.T, opts RegistryOptions, n int) (*Registry, []string) {
	t.Helper()
	r := NewRegistry(opts)
	var paths []string
	for i := 0; i < n; i++ {
		dir := t.TempDir()
		if _, err := ticket.Init(dir, ticket.InitOptions{Actor: testActor}); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, dir)
		if err := r.Register(StoreSpec{Name: string(rune('a' + i)), Path: dir}); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _ = r.Close() })
	return r, paths
}

// The definition of done. Registering costs nothing, the first request costs
// exactly one watcher, and eviction gives it back.
func TestWatcherCountFollowsActiveStoresNotDiscoveredOnes(t *testing.T) {
	before := inotifyCount(t)
	r, _ := lazyRegistry(t, RegistryOptions{}, 3)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := inotifyCount(t); got != before {
		t.Errorf("registering three stores took %d watchers, want none", got-before)
	}

	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)
	if got := inotifyCount(t); got != before+1 {
		t.Errorf("one active store holds %d watchers, want 1", got-before)
	}

	request(t, server, "GET", "/api/stores/b/board", "", http.StatusOK)
	if got := inotifyCount(t); got != before+2 {
		t.Errorf("two active stores hold %d watchers, want 2", got-before)
	}

	// Idle eviction gives the descriptors back.
	if closed := evictNow(r); closed != 2 {
		t.Errorf("evicted %d stores, want 2", closed)
	}
	if got := inotifyCount(t); got != before {
		t.Errorf("after eviction %d watchers are held, want none", got-before)
	}
}

// Listing is the cheap operation. A picker over twenty-two repositories must
// not open twenty-two stores to draw itself.
func TestListingDoesNotOpenAnything(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{}, 3)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	body := decodeResponse[storesResponse](t, request(t, server, "GET", "/api/stores", "", http.StatusOK))
	if len(body.Stores) != 3 {
		t.Fatalf("listed %d stores, want 3", len(body.Stores))
	}
	for _, s := range body.Stores {
		if !s.Available {
			t.Errorf("store %q is listed unavailable: %s", s.Name, s.Reason)
		}
		if s.Active {
			t.Errorf("store %q was opened by listing", s.Name)
		}
	}
}

func TestAStoreOpensOnFirstAccessAndReopensAfterEviction(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	active := func() bool { return r.Statuses()[0].Active }
	if active() {
		t.Fatal("the store is open before anybody asked for it")
	}
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)
	if !active() {
		t.Fatal("the store did not open on first access")
	}

	evictNow(r)
	if active() {
		t.Fatal("the idle store was not closed")
	}
	// And it comes back, serving the same board rather than an error.
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)
	if !active() {
		t.Error("the store did not reopen after eviction")
	}
}

// A store somebody is watching is never closed for being idle. An open
// EventSource is somebody watching, however long ago their last request was.
func TestAWatchedStoreIsNotEvicted(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{IdleTimeout: time.Nanosecond}, 1)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)

	only, ok := r.Lookup("a")
	if !ok {
		t.Fatal("the store did not open")
	}
	stop := subscribe(t, only)
	defer stop()

	if closed := r.EvictIdle(); closed != 0 {
		t.Errorf("evicted %d watched stores, want 0", closed)
	}
}

// The limit exists because nothing stops somebody marking forty stores as
// favorites. Under it, the least recently used store gives way.
func TestTheActiveLimitEvictsTheLeastRecentlyUsed(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{MaxActive: 2}, 3)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	for _, name := range []string{"a", "b", "c"} {
		request(t, server, "GET", "/api/stores/"+name+"/board", "", http.StatusOK)
	}
	byName := map[string]bool{}
	for _, s := range r.Statuses() {
		byName[s.Name] = s.Active
	}
	if byName["a"] {
		t.Error("the least recently used store stayed open past the limit")
	}
	if !byName["b"] || !byName["c"] {
		t.Errorf("active = %v, want the two most recent", byName)
	}
}

// When every open store is being watched there is nothing to give back, so the
// request fails saying so rather than running the machine out of descriptors.
func TestTheLimitRefusesWhenEveryStoreIsWatched(t *testing.T) {
	r, _ := lazyRegistry(t, RegistryOptions{MaxActive: 1}, 2)
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "GET", "/api/stores/a/board", "", http.StatusOK)

	held, _ := r.Lookup("a")
	stop := subscribe(t, held)
	defer stop()

	body := request(t, server, "GET", "/api/stores/b/board", "", http.StatusServiceUnavailable)
	if !strings.Contains(string(body), "--max-active") {
		t.Errorf("the refusal does not name the limit: %s", body)
	}
}

// Favorites and the store last used are warmed at startup, so the common case
// is already open when the browser asks. The list itself arrives in
// TKT-01M2HPBAE; this is the mechanism it fills.
func TestWarmOpensTheStoresAskedFor(t *testing.T) {
	r, paths := lazyRegistry(t, RegistryOptions{}, 3)
	r.opts.Warm = []string{paths[1]}
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, s := range r.Statuses() {
		if want := s.Name == "b"; s.Active != want {
			t.Errorf("store %q active = %v, want %v", s.Name, s.Active, want)
		}
	}
}

func TestWarmStopsAtTheLimitWithoutFailing(t *testing.T) {
	r, paths := lazyRegistry(t, RegistryOptions{MaxActive: 2}, 4)
	r.opts.Warm = paths
	if err := r.Start(context.Background()); err != nil {
		t.Fatalf("a warm list longer than the limit failed startup: %v", err)
	}
	active := 0
	for _, s := range r.Statuses() {
		if s.Active {
			active++
		}
	}
	if active != 2 {
		t.Errorf("%d stores warmed, want the limit of 2", active)
	}
}

// A rescan reflects the disk without disturbing anybody reading.
func TestRescanAddsAndRemovesWithoutTouchingActiveStores(t *testing.T) {
	root := t.TempDir()
	first := storeDir(t, root, "first")
	cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}

	r := NewRegistry(RegistryOptions{Rescan: RescanSource{Config: cfg}})
	defer r.Close()
	// The id has to be the one Merge derives, or the rescan below reads this
	// store as a second one that happens to share a path.
	firstID := hashedID(first)
	if err := r.Register(StoreSpec{Name: firstID, Path: first}); err != nil {
		t.Fatal(err)
	}
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()
	request(t, server, "GET", "/api/stores/"+firstID+"/board", "", http.StatusOK)
	opened, _ := r.Lookup(firstID)

	storeDir(t, root, "second")
	added, removed, err := r.Rescan()
	if err != nil {
		t.Fatal(err)
	}
	if added != 1 || removed != 0 {
		t.Errorf("rescan added %d and removed %d, want 1 and 0", added, removed)
	}
	if again, _ := r.Lookup(firstID); again != opened {
		t.Error("the rescan replaced a store somebody was reading")
	}

	// A store that is gone and is not open is dropped. One that is open stays,
	// because closing a board somebody is looking at to reflect the disk is the
	// wrong trade.
	if err := os.RemoveAll(filepath.Join(root, "second")); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(root, "first", ".tickets")); err != nil {
		t.Fatal(err)
	}
	if _, removed, err = r.Rescan(); err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Errorf("rescan removed %d stores, want the closed one", removed)
	}
	if _, still := r.Lookup(firstID); !still {
		t.Error("the rescan dropped a store somebody was reading")
	}
}

func TestRescanRouteReportsTheChange(t *testing.T) {
	root := t.TempDir()
	storeDir(t, root, "one")
	cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}
	r := NewRegistry(RegistryOptions{Rescan: RescanSource{Config: cfg}})
	defer r.Close()
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	body := decodeResponse[rescanResponse](t, request(t, server, "POST", "/api/stores/rescan", "", http.StatusOK))
	if body.Added != 1 || len(body.Stores) != 1 {
		t.Errorf("rescan reported %+v, want the one store it found", body)
	}

	// A canvas started with no roots has nothing to search again, and says so
	// rather than pretending it rescanned.
	bare := NewRegistry(RegistryOptions{})
	defer bare.Close()
	bareServer := httptest.NewServer(bare.Handler())
	defer bareServer.Close()
	request(t, bareServer, "POST", "/api/stores/rescan", "", http.StatusConflict)
}

// The flat routes belong to a canvas over one store. The decision is made per
// request, so a rescan that finds a second store cannot leave a route behind
// that has to guess which store it meant.
func TestFlatRoutesFollowTheStoreCount(t *testing.T) {
	root := t.TempDir()
	storeDir(t, root, "one")
	cfg := config.Config{Roots: []config.Root{{Path: root, Depth: 3}}}
	r := NewRegistry(RegistryOptions{Rescan: RescanSource{Config: cfg}})
	defer r.Close()
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	defer server.Close()

	if _, _, err := r.Rescan(); err != nil {
		t.Fatal(err)
	}
	request(t, server, "GET", "/api/board", "", http.StatusOK)

	storeDir(t, root, "two")
	if _, _, err := r.Rescan(); err != nil {
		t.Fatal(err)
	}
	body := request(t, server, "GET", "/api/board", "", http.StatusNotFound)
	if !strings.Contains(string(body), "store_required") {
		t.Errorf("the flat route did not explain itself: %s", body)
	}
}
