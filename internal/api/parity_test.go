package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/actors"
	"github.com/terva-sh/git-ticket/ticket"
)

// The canvas ships as two commands over one registry. Which routes exist is
// decided by whether RegistryOptions.Access is nil: a desk canvas has no
// sign-on and no actor to bind, so those handlers are never registered.
//
// Nothing failed when that set drifted. A handler added inside the Access
// branch is unreachable on a desk canvas, one added outside it is reachable on
// both, and either can be right — what must not happen is it being decided by
// where the cursor was. This asserts the reachable set against the manifest the
// chrome test reads, so both halves of the difference live in one file.

// parityManifest is docs/canvas-parity.json. Only the routes half is read here.
type parityManifest struct {
	Routes []struct {
		Route   string `json:"route"`
		Axis    string `json:"axis"`
		Present string `json:"present"`
		Reason  string `json:"reason"`
	} `json:"routes"`
}

func readParityManifest(t *testing.T) parityManifest {
	t.Helper()
	// Two directories up from internal/api.
	path := filepath.Join("..", "..", "docs", "canvas-parity.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading the parity manifest: %v", err)
	}
	var manifest parityManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("parsing %s: %v", path, err)
	}
	return manifest
}

// probe is one request the two canvases are both asked to answer. Method and
// target together, because GET and PUT on the same path are separately
// registered and a canvas can serve one without the other.
type probe struct{ method, target string }

func (p probe) String() string { return p.method + " " + p.target }

// pattern is how the route is written where it is registered and in the
// manifest, with the concrete store this test uses put back as the wildcard.
// The manifest is documentation, so it must not carry a test's fixture name.
func (p probe) pattern() string {
	return strings.Replace(p.String(), "/stores/a/", "/stores/{store}/", 1)
}

// probes covers every route Registry.Handler registers, conditional or not.
//
// Listed rather than enumerated from the mux, because Go's ServeMux does not
// report its patterns. That makes this list something to maintain, so the test
// below fails when a route exists that nobody listed here: an unmaintained list
// would quietly stop covering the thing it exists to cover.
var probes = []probe{
	{"GET", "/api/stores"},
	{"GET", "/api/favorites"},
	{"PUT", "/api/favorites"},
	{"POST", "/api/stores/rescan"},
	{"GET", "/api/stores/a/actor"},
	{"PUT", "/api/stores/a/actor"},
	{"GET", "/api/actor"},
	{"PUT", "/api/actor"},
	{"GET", "/api/session"},
	{"GET", "/api/people"},
	{"GET", "/api/version"},
	{"GET", "/api/stores/a/board"},
	{"GET", "/api/stores/a/schema"},
	{"POST", "/api/stores/a/tickets"},
	{"PUT", "/api/stores/a/layout"},
}

// reachable reports whether a handler answered at all.
//
// 404 is the signal for "no such route", and it is the only one: a registered
// handler that refuses answers 401, 403, 405 or 409, and every one of those
// means the route is there. Refusal is an access question, which the access
// tests already cover; this is only about what exists.
func reachable(t *testing.T, server *httptest.Server, p probe) bool {
	t.Helper()
	req, err := http.NewRequest(p.method, server.URL+p.target, strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	resp, err := server.Client().Do(req)
	if err != nil {
		t.Fatalf("%s: %v", p, err)
	}
	defer func() { _ = resp.Body.Close() }()
	return resp.StatusCode != http.StatusNotFound
}

// canvasOfKind builds a registry at one point on the sign-on axis. A desk
// canvas is exactly a nil Access, which is what internal/cli.signOn returns for
// it; a served canvas has one, and is given every grant so that a refusal never
// stands in for an absence.
//
// readOnly is the other axis. It is taken here so the test below can show that
// it produces no route differences, which is the claim the manifest makes when
// it files every route under sign-on.
func canvasOfKind(t *testing.T, served, readOnly bool) *httptest.Server {
	t.Helper()
	remembered, _ := stateIn(t)
	opts := RegistryOptions{State: remembered}
	if served {
		opts.Access = &fakeAccess{
			caller: caller("subject-a", "human:tester"),
			holds:  map[string]bool{"a": true},
			admin:  true,
		}
		bound, err := actors.Open(filepath.Join(t.TempDir(), actors.FileName))
		if err != nil {
			t.Fatal(err)
		}
		opts.Actors = bound
	}
	// Registered here rather than through lazyRegistry, because read-only is a
	// property of the store rather than of the registry and lazyRegistry does
	// not set it.
	r := NewRegistry(opts)
	t.Cleanup(func() { _ = r.Close() })
	dir := t.TempDir()
	if _, err := ticket.Init(dir, ticket.InitOptions{Actor: testActor}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(StoreSpec{Name: "a", Path: dir, ReadOnly: readOnly}); err != nil {
		t.Fatal(err)
	}
	if err := r.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(r.Handler())
	t.Cleanup(server.Close)
	return server
}

func TestEveryRouteDifferenceBetweenTheTwoCanvasesIsDeclared(t *testing.T) {
	manifest := readParityManifest(t)
	declared := map[string]string{}
	for _, entry := range manifest.Routes {
		declared[entry.Route] = entry.Present
	}

	desk := canvasOfKind(t, false, false)
	served := canvasOfKind(t, true, false)

	var undeclared, stale []string
	seen := map[string]bool{}
	for _, p := range probes {
		onDesk, onServed := reachable(t, desk, p), reachable(t, served, p)
		if onDesk == onServed {
			continue
		}
		present := "served"
		if onDesk {
			present = "desk"
		}
		seen[p.pattern()] = true
		if declared[p.pattern()] != present {
			undeclared = append(undeclared, p.pattern()+" is reachable only on the "+present+" canvas")
		}
	}
	for route, present := range declared {
		if !seen[route] {
			stale = append(stale, "the manifest says "+route+" is "+present+"-only and it is not")
		}
	}
	sort.Strings(undeclared)
	sort.Strings(stale)

	for _, line := range undeclared {
		t.Errorf("%s, and the manifest does not say so.\n"+
			"If that is deliberate, add it to docs/canvas-parity.json with the reason it is one.\n"+
			"If it is not, the other canvas is missing a handler somebody added against this one.", line)
	}
	for _, line := range stale {
		t.Errorf("%s.\nIf the canvases were brought into line, delete the entry.", line)
	}
}

// The probe list is the coverage, so it has to stay honest on its own. A route
// registered unconditionally is invisible to the test above -- it is reachable
// on both canvases, so it never becomes a difference -- and would also be
// invisible if it were missing from the list entirely. This asserts the list
// against the source that registers them.
func TestTheProbeListCoversEveryRegisteredRoute(t *testing.T) {
	raw, err := os.ReadFile("registry.go")
	if err != nil {
		t.Fatal(err)
	}
	listed := map[string]bool{}
	for _, p := range probes {
		listed[p.pattern()] = true
	}
	for _, line := range strings.Split(string(raw), "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, `mux.HandleFunc("`) {
			continue
		}
		pattern := trimmed[len(`mux.HandleFunc("`):]
		pattern = pattern[:strings.Index(pattern, `"`)]
		// Prefix mounts rather than routes: they exist to catch what the
		// specific patterns did not, so there is nothing to probe.
		if pattern == "/api/" || pattern == "/api/stores/{store}/" {
			continue
		}
		if !listed[pattern] {
			t.Errorf("registry.go registers %q and the probe list does not cover it.\n"+
				"Add it to probes in parity_test.go, so a difference in its reachability is visible.", pattern)
		}
	}
}

// Every route the manifest declares is filed under the sign-on axis, which is a
// claim that read-only changes nothing about what exists. It should not:
// read-only refuses at the handler with 403, and a refusal means the route is
// there. Asserted rather than assumed, because the manifest would otherwise be
// resting on a reading of the source that nothing rechecks.
func TestReadOnlyChangesNoRouteReachability(t *testing.T) {
	for _, served := range []bool{false, true} {
		kind := "desk"
		if served {
			kind = "served"
		}
		writable := canvasOfKind(t, served, false)
		readOnly := canvasOfKind(t, served, true)
		for _, p := range probes {
			if got, want := reachable(t, readOnly, p), reachable(t, writable, p); got != want {
				t.Errorf("on the %s canvas %s is reachable=%v when writable and %v when read-only.\n"+
					"Read-only is meant to refuse at the handler, not to unregister anything, and every route\n"+
					"in docs/canvas-parity.json is filed under the sign-on axis on that basis.\n"+
					"Either restore the registration or give the manifest a read-only route axis.",
					kind, p, want, got)
			}
		}
	}
}

// The routes half of the manifest has the same axis-typo hazard the chrome half
// does, and Go reads its own copy, so it checks its own.
func TestEveryDeclaredRouteAxisIsOneTheManifestDefines(t *testing.T) {
	path := filepath.Join("..", "..", "docs", "canvas-parity.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var full struct {
		Axes map[string]struct {
			Sides []string `json:"sides"`
		} `json:"axes"`
	}
	if err := json.Unmarshal(raw, &full); err != nil {
		t.Fatal(err)
	}
	for _, entry := range readParityManifest(t).Routes {
		axis, defined := full.Axes[entry.Axis]
		if !defined {
			t.Errorf("%s is filed under %q, which is not an axis this manifest defines", entry.Route, entry.Axis)
			continue
		}
		if !slices.Contains(axis.Sides, entry.Present) {
			t.Errorf("%s is declared present on %q, which is not a side of the %s axis",
				entry.Route, entry.Present, entry.Axis)
		}
	}
}
