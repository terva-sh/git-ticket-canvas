package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestRegistry builds a registry over one fresh store per name, starts it,
// and serves it. Each store is independent, which is what most of these tests
// are checking.
func newTestRegistry(t *testing.T, names ...string) *httptest.Server {
	t.Helper()
	reg := NewRegistry(RegistryOptions{})
	for _, name := range names {
		if err := reg.Add(name, New(newTestStore(t), Options{Actor: testActor})); err != nil {
			t.Fatal(err)
		}
	}
	if err := reg.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(reg.Handler())
	s.Client().Timeout = 5 * time.Second
	t.Cleanup(func() { _ = reg.Close(); s.Close() })
	return s
}

// registryWithServers is for tests that need the Server values themselves, to
// read LiveStats or to inspect a store directly.
func registryWithServers(t *testing.T, names ...string) (*httptest.Server, map[string]*Server) {
	t.Helper()
	reg := NewRegistry(RegistryOptions{})
	servers := make(map[string]*Server, len(names))
	for _, name := range names {
		srv := New(newTestStore(t), Options{Actor: testActor})
		if err := reg.Add(name, srv); err != nil {
			t.Fatal(err)
		}
		servers[name] = srv
	}
	if err := reg.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(reg.Handler())
	s.Client().Timeout = 5 * time.Second
	t.Cleanup(func() { _ = reg.Close(); s.Close() })
	return s, servers
}

func TestEachEndpointReachesItsStore(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")

	// Board, schema, tickets, and layout all answer under a store prefix.
	request(t, s, "GET", "/api/stores/alpha/board", "", http.StatusOK)
	request(t, s, "GET", "/api/stores/alpha/schema", "", http.StatusOK)
	created := decodeResponse[ticketResponse](t, request(t, s, "POST", "/api/stores/alpha/tickets",
		`{"title":"In alpha"}`, http.StatusCreated))
	request(t, s, "PUT", "/api/stores/alpha/layout",
		jsonBody(t, map[string]any{"board": "default", "cards": map[string]any{
			created.Ticket.ID: map[string]any{"x": 10, "y": 20},
		}}), http.StatusOK)
	request(t, s, "DELETE", "/api/stores/alpha/tickets/"+created.Ticket.ID+
		"?board=default&ifRevision="+created.Ticket.Revision+"&force=false", "", http.StatusOK)
}

func TestATicketLandsOnlyInTheStoreItWasSentTo(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")
	request(t, s, "POST", "/api/stores/alpha/tickets", `{"title":"Only in alpha"}`, http.StatusCreated)

	alpha := decodeResponse[boardResponse](t, request(t, s, "GET", "/api/stores/alpha/board", "", http.StatusOK))
	if len(alpha.Tickets) != 1 {
		t.Fatalf("alpha has %d tickets, want 1", len(alpha.Tickets))
	}
	beta := decodeResponse[boardResponse](t, request(t, s, "GET", "/api/stores/beta/board", "", http.StatusOK))
	if len(beta.Tickets) != 0 {
		t.Errorf("beta has %d tickets, want 0; the write reached the wrong store", len(beta.Tickets))
	}
	if alpha.StorePath == beta.StorePath {
		t.Errorf("both stores report path %q; they are not separate", alpha.StorePath)
	}
}

func TestEventStreamIsPerStore(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")
	// The stream stays open, so read the headers and stop rather than using the
	// shared request helper, which reads to the end and expects JSON.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", s.URL+"/api/stores/beta/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d, want 200", resp.StatusCode)
	}
	if got := resp.Header.Get("Content-Type"); !strings.HasPrefix(got, "text/event-stream") {
		t.Errorf("Content-Type = %q, want text/event-stream", got)
	}
}

func TestStoresIndexListsEveryStore(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")
	index := decodeResponse[storesResponse](t, request(t, s, "GET", "/api/stores", "", http.StatusOK))
	if len(index.Stores) != 2 {
		t.Fatalf("index lists %d stores, want 2", len(index.Stores))
	}
	// Configured order, not sorted or map order.
	if index.Stores[0].Name != "alpha" || index.Stores[1].Name != "beta" {
		t.Errorf("names = %q, %q; want alpha, beta in configured order",
			index.Stores[0].Name, index.Stores[1].Name)
	}
	for _, row := range index.Stores {
		if row.Path == "" {
			t.Errorf("store %s has no path", row.Name)
		}
	}
}

func TestUnknownStoreIsRejected(t *testing.T) {
	s := newTestRegistry(t, "alpha")
	for _, path := range []string{
		"/api/stores/absent/board",
		"/api/stores/absent/schema",
		"/api/stores/absent/tickets",
	} {
		t.Run(path, func(t *testing.T) {
			method := "GET"
			if strings.HasSuffix(path, "/tickets") {
				method = "POST"
			}
			body := ""
			if method == "POST" {
				body = `{"title":"nowhere"}`
			}
			assertErrorCode(t, request(t, s, method, path, body, http.StatusNotFound), "unknown_store")
		})
	}
}

func TestOneStoreKeepsTheFlatRoutes(t *testing.T) {
	s := newTestRegistry(t, "only")
	// This is what `git-ticket-canvas --store .` serves today.
	request(t, s, "GET", "/api/board", "", http.StatusOK)
	request(t, s, "GET", "/api/schema", "", http.StatusOK)
	request(t, s, "POST", "/api/tickets", `{"title":"Through the flat route"}`, http.StatusCreated)

	// The same store also answers under its name.
	named := decodeResponse[boardResponse](t, request(t, s, "GET", "/api/stores/only/board", "", http.StatusOK))
	if len(named.Tickets) != 1 {
		t.Errorf("the named route shows %d tickets, want the 1 written through the flat route", len(named.Tickets))
	}
}

func TestSeveralStoresHaveNoFlatRoutes(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")
	// A flat route with two stores would have to guess which one it meant, and
	// guessing wrong writes a ticket into the wrong repository.
	for _, path := range []string{"/api/board", "/api/schema"} {
		req, err := http.NewRequest("GET", s.URL+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := s.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			t.Errorf("%s answered 200; the flat routes must be absent with more than one store", path)
		}
	}
}

func TestVersionIsServedWithSeveralStores(t *testing.T) {
	s := newTestRegistry(t, "alpha", "beta")
	// Version is the executable's identity, not a store's, so it answers
	// whatever the store list looks like.
	request(t, s, "GET", "/api/version", "", http.StatusOK)
}

func TestWritingOneStoreLeavesAnotherUntouched(t *testing.T) {
	s, servers := registryWithServers(t, "alpha", "beta")

	// Take beta's validator and how much work its coordinator has done.
	req, err := http.NewRequest("GET", s.URL+"/api/stores/beta/board", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	etag := resp.Header.Get("ETag")
	if etag == "" {
		t.Fatal("beta served no ETag")
	}
	before := servers["beta"].LiveStats().Rebuilds

	request(t, s, "POST", "/api/stores/alpha/tickets", `{"title":"Written to alpha"}`, http.StatusCreated)

	// Beta's board is byte-identical, so its cached copy is still valid.
	conditional, err := http.NewRequest("GET", s.URL+"/api/stores/beta/board", nil)
	if err != nil {
		t.Fatal(err)
	}
	conditional.Header.Set("If-None-Match", etag)
	got, err := s.Client().Do(conditional)
	if err != nil {
		t.Fatal(err)
	}
	got.Body.Close()
	if got.StatusCode != http.StatusNotModified {
		t.Errorf("beta answered %d, want 304; a write to alpha changed beta's ETag", got.StatusCode)
	}
	if after := servers["beta"].LiveStats().Rebuilds; after != before {
		t.Errorf("beta rebuilt %d times, was %d; a write to alpha woke beta's coordinator", after, before)
	}
}

func TestDuplicateStoreNameIsRefused(t *testing.T) {
	reg := NewRegistry(RegistryOptions{})
	if err := reg.Add("same", New(newTestStore(t), Options{Actor: testActor})); err != nil {
		t.Fatal(err)
	}
	err := reg.Add("same", New(newTestStore(t), Options{Actor: testActor}))
	if err == nil {
		t.Fatal("want an error for a duplicate store name")
	}
	if !strings.Contains(err.Error(), "same") {
		t.Errorf("error %q does not name the store", err)
	}
}

func TestRegistryReportsItsStores(t *testing.T) {
	reg := NewRegistry(RegistryOptions{})
	for _, name := range []string{"one", "two"} {
		if err := reg.Add(name, New(newTestStore(t), Options{Actor: testActor})); err != nil {
			t.Fatal(err)
		}
	}
	if reg.Len() != 2 {
		t.Errorf("Len = %d, want 2", reg.Len())
	}
	names := reg.Names()
	if len(names) != 2 || names[0] != "one" || names[1] != "two" {
		t.Errorf("Names = %v, want [one two]", names)
	}
	if _, ok := reg.Lookup("one"); !ok {
		t.Error("Lookup(one) found nothing")
	}
	if _, ok := reg.Lookup("absent"); ok {
		t.Error("Lookup(absent) found something")
	}
	// Names returns a copy; changing it must not change the registry.
	names[0] = "mutated"
	if reg.Names()[0] != "one" {
		t.Error("Names returned the registry's own slice")
	}
}

func TestReadOnlyCanDifferPerStore(t *testing.T) {
	// A canvas over several repositories is the case where one of them belongs
	// to somebody else, so read-only has to be settable for one store without
	// protecting all of them.
	reg := NewRegistry(RegistryOptions{})
	if err := reg.Add("writable", New(newTestStore(t), Options{Actor: testActor})); err != nil {
		t.Fatal(err)
	}
	if err := reg.Add("protected", New(newTestStore(t), Options{Actor: testActor, ReadOnly: true})); err != nil {
		t.Fatal(err)
	}
	if err := reg.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	s := httptest.NewServer(reg.Handler())
	s.Client().Timeout = 5 * time.Second
	t.Cleanup(func() { _ = reg.Close(); s.Close() })

	request(t, s, "POST", "/api/stores/writable/tickets", `{"title":"Allowed"}`, http.StatusCreated)
	assertErrorCode(t, request(t, s, "POST", "/api/stores/protected/tickets",
		`{"title":"Refused"}`, http.StatusForbidden), "read_only")

	index := decodeResponse[storesResponse](t, request(t, s, "GET", "/api/stores", "", http.StatusOK))
	for _, row := range index.Stores {
		want := row.Name == "protected"
		if row.ReadOnly != want {
			t.Errorf("store %s reports readOnly=%v, want %v", row.Name, row.ReadOnly, want)
		}
	}
}
