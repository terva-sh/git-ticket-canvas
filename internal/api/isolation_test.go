package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/terva-sh/git-ticket/ticket"
)

// goodStore is a store with a declared actor, which is the ordinary case.
func goodStore(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if _, err := ticket.Init(dir, ticket.InitOptions{Actor: testActor}); err != nil {
		t.Fatal(err)
	}
	return dir
}

// actorlessStore opens fine and has nobody to write as.
func actorlessStore(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if _, err := ticket.Init(dir, ticket.InitOptions{}); err != nil {
		t.Fatal(err)
	}
	return dir
}

// malformedStore has a .tickets directory whose config.yml is not YAML, which
// git-ticket reports as parse_error when the store is opened.
func malformedStore(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".tickets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".tickets", "config.yml"),
		[]byte("this: [is: not: valid: yaml\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return dir
}

// absentStore is a path with nothing at it.
func absentStore(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "does-not-exist")
}

// serveSpecs opens every spec and serves the registry.
func serveSpecs(t *testing.T, specs ...StoreSpec) (*httptest.Server, *Registry) {
	t.Helper()
	reg := NewRegistry(RegistryOptions{})
	for _, spec := range specs {
		if err := reg.OpenStore(spec); err != nil {
			t.Fatal(err)
		}
	}
	if err := reg.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(reg.Handler())
	s.Client().Timeout = 5 * time.Second
	t.Cleanup(func() { _ = reg.Close(); s.Close() })
	return s, reg
}

func statusOf(t *testing.T, reg *Registry, name string) StoreStatus {
	t.Helper()
	for _, s := range reg.Statuses() {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("no store named %q in %v", name, reg.Statuses())
	return StoreStatus{}
}

// This is the definition of done: one good store and one broken store, and the
// good one still serves.
func TestABrokenStoreDoesNotStopTheOthers(t *testing.T) {
	s, reg := serveSpecs(t,
		StoreSpec{Name: "broken", Path: absentStore(t)},
		StoreSpec{Name: "healthy", Path: goodStore(t)},
	)

	request(t, s, "POST", "/api/stores/healthy/tickets", `{"title":"Still working"}`, http.StatusCreated)
	board := decodeResponse[boardResponse](t, request(t, s, "GET", "/api/stores/healthy/board", "", http.StatusOK))
	if len(board.Tickets) != 1 {
		t.Errorf("healthy store has %d tickets, want 1", len(board.Tickets))
	}
	if got := statusOf(t, reg, "healthy"); !got.Available {
		t.Errorf("healthy store reports unavailable: %s", got.Reason)
	}
	if got := statusOf(t, reg, "broken"); got.Available {
		t.Error("broken store reports available")
	}
}

func TestUnopenableStoresAreReportedNotFatal(t *testing.T) {
	for _, tc := range []struct {
		name      string
		path      func(*testing.T) string
		wantInRea string
	}{
		{"absent path", absentStore, "no .tickets store at or above"},
		{"malformed config", malformedStore, "parse_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, reg := serveSpecs(t, StoreSpec{Name: "broken", Path: tc.path(t)})
			got := statusOf(t, reg, "broken")
			if got.Available {
				t.Fatal("store reports available")
			}
			if !strings.Contains(got.Reason, tc.wantInRea) {
				t.Errorf("reason = %q, want it to mention %q", got.Reason, tc.wantInRea)
			}
		})
	}
}

// A configured-but-broken store is a different answer from a name nobody
// configured, and the browser has to be able to tell them apart.
func TestUnavailableStoreIsNotTheSameAsUnknown(t *testing.T) {
	s, _ := serveSpecs(t, StoreSpec{Name: "broken", Path: absentStore(t)})

	unavailable := request(t, s, "GET", "/api/stores/broken/board", "", http.StatusServiceUnavailable)
	assertErrorCode(t, unavailable, "store_unavailable")
	if !strings.Contains(string(unavailable), "no .tickets store at or above") {
		t.Errorf("503 body does not carry the reason: %s", unavailable)
	}

	assertErrorCode(t, request(t, s, "GET", "/api/stores/never-configured/board", "", http.StatusNotFound), "unknown_store")
}

func TestStoreWithNoActorReadsButRefusesWrites(t *testing.T) {
	s, reg := serveSpecs(t, StoreSpec{Name: "anon", Path: actorlessStore(t)})

	got := statusOf(t, reg, "anon")
	// It opened. Withholding a readable store because nobody can write to it
	// would lose the reading, which is most of what a canvas is for.
	if !got.Available {
		t.Fatalf("store reports unavailable: %s", got.Reason)
	}
	if !got.ReadOnly {
		t.Error("a store with no actor must be read-only; otherwise a write would be attributed to nobody")
	}
	if !strings.Contains(got.Reason, "declares no actor") {
		t.Errorf("reason = %q, want it to explain the missing actor", got.Reason)
	}

	request(t, s, "GET", "/api/stores/anon/board", "", http.StatusOK)
	assertErrorCode(t, request(t, s, "POST", "/api/stores/anon/tickets",
		`{"title":"Refused"}`, http.StatusForbidden), "read_only")
}

// Passing --actor is what makes an actorless store writable.
func TestGlobalActorMakesAnActorlessStoreWritable(t *testing.T) {
	s, reg := serveSpecs(t, StoreSpec{Name: "anon", Path: actorlessStore(t), Actor: "human:someone"})
	if got := statusOf(t, reg, "anon"); got.ReadOnly {
		t.Fatalf("store is read-only with --actor given: %s", got.Reason)
	}
	created := decodeResponse[ticketResponse](t, request(t, s, "POST", "/api/stores/anon/tickets",
		`{"title":"Written"}`, http.StatusCreated))
	if created.Ticket.CreatedBy != "human:someone" {
		t.Errorf("createdBy = %q, want human:someone", created.Ticket.CreatedBy)
	}
}

func TestEachStoreResolvesItsOwnActor(t *testing.T) {
	// The store's own config.yml supplies the actor when nothing overrides it,
	// and a per-store actor overrides it for that store alone.
	_, reg := serveSpecs(t,
		StoreSpec{Name: "own", Path: goodStore(t)},
		StoreSpec{Name: "overridden", Path: goodStore(t), Actor: "agent:other/session"},
	)
	if got := statusOf(t, reg, "own"); got.ActorID != testActor.ID {
		t.Errorf("own store writes as %q, want its own configured %q", got.ActorID, testActor.ID)
	}
	if got := statusOf(t, reg, "overridden"); got.ActorID != "agent:other/session" {
		t.Errorf("overridden store writes as %q, want agent:other/session", got.ActorID)
	}
}

func TestIndexReportsAvailabilityAndReason(t *testing.T) {
	s, _ := serveSpecs(t,
		StoreSpec{Name: "healthy", Path: goodStore(t)},
		StoreSpec{Name: "broken", Path: absentStore(t)},
		StoreSpec{Name: "anon", Path: actorlessStore(t)},
	)
	index := decodeResponse[storesResponse](t, request(t, s, "GET", "/api/stores", "", http.StatusOK))
	if len(index.Stores) != 3 {
		t.Fatalf("index lists %d stores, want 3; a broken store must still be listed", len(index.Stores))
	}
	by := map[string]StoreStatus{}
	for _, row := range index.Stores {
		by[row.Name] = row
	}
	// A healthy store carries no reason. It may carry a note: a store whose
	// config.yml lists an actor without naming a default writes as the first
	// one listed, and says so. That is information, not a fault, so it must not
	// land in Reason where the browser would badge the store as degraded.
	if !by["healthy"].Available || by["healthy"].Reason != "" {
		t.Errorf("healthy = %+v, want available with no reason", by["healthy"])
	}
	if by["broken"].Available || by["broken"].Reason == "" {
		t.Errorf("broken = %+v, want unavailable with a reason", by["broken"])
	}
	if !by["anon"].Available || !by["anon"].ReadOnly || by["anon"].Reason == "" {
		t.Errorf("anon = %+v, want available, read-only, with a reason", by["anon"])
	}
}

// One store that is broken must not leave the flat routes mounted onto nothing.
func TestSingleBrokenStoreServesNoFlatRoutes(t *testing.T) {
	s, _ := serveSpecs(t, StoreSpec{Name: "broken", Path: absentStore(t)})
	resp, err := s.Client().Get(s.URL + "/api/board")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		t.Error("/api/board answered 200 with the only store unavailable")
	}
}

func TestDuplicateNameIsStillRefusedWhenOpening(t *testing.T) {
	reg := NewRegistry(RegistryOptions{})
	path := goodStore(t)
	if err := reg.OpenStore(StoreSpec{Name: "same", Path: path}); err != nil {
		t.Fatal(err)
	}
	if err := reg.OpenStore(StoreSpec{Name: "same", Path: goodStore(t)}); err == nil {
		t.Fatal("want an error for a duplicate name")
	}
	t.Cleanup(func() { _ = reg.Close() })
}

// A note is informational and must not be mistaken for a fault. A store whose
// config.yml lists an actor but names no default writes as the first listed
// actor, which is worth saying and is not a problem with the store.
func TestAnInformationalNoteIsNotAFault(t *testing.T) {
	_, reg := serveSpecs(t, StoreSpec{Name: "nodefault", Path: goodStore(t)})
	got := statusOf(t, reg, "nodefault")
	if !got.Available || got.ReadOnly {
		t.Fatalf("store = %+v, want available and writable", got)
	}
	if got.Reason != "" {
		t.Errorf("reason = %q, want empty; a fallback actor is a note, not a fault", got.Reason)
	}
	if !strings.Contains(got.Note, "first listed actor") {
		t.Errorf("note = %q, want it to say which actor writes land under", got.Note)
	}
}
