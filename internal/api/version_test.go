package api

import (
	"encoding/json"
	"net/http/httptest"
	"runtime"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
)

func readVersion(t *testing.T, s *Server) (buildinfo.Info, *httptest.ResponseRecorder) {
	t.Helper()
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/version", nil))
	if w.Code != 200 {
		t.Fatalf("GET /api/version = %d: %s", w.Code, w.Body.String())
	}
	var got buildinfo.Info
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode version: %v\n%s", err, w.Body.String())
	}
	return got, w
}

func TestVersionEndpointMatchesCLISemantics(t *testing.T) {
	t.Parallel()
	for name, want := range map[string]buildinfo.Info{
		"released": {SchemaVersion: 1, Kind: "version", Version: "v1.2.3", Commit: "0123456789abcdef", Go: "go1.25.0"},
		"modified": {SchemaVersion: 1, Kind: "version", Version: "v1.2.3", Commit: "0123456789abcdef", Go: "go1.25.0", Modified: true},
		"devel":    buildinfo.Parse(nil),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			s := New(newTestStore(t), Options{Actor: testActor, Version: want})
			startAPI(t, s)
			got, w := readVersion(t, s)
			if got != want {
				t.Fatalf("version = %+v, want %+v", got, want)
			}
			if cc := w.Header().Get("Cache-Control"); cc != "private, no-cache" {
				t.Fatalf("Cache-Control = %q", cc)
			}
			// The envelope is the CLI's --version --json envelope, key for key.
			var keys map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &keys); err != nil {
				t.Fatal(err)
			}
			for _, key := range []string{"schemaVersion", "kind", "version", "commit", "go", "modified"} {
				if _, ok := keys[key]; !ok {
					t.Fatalf("envelope lacks %q: %s", key, w.Body.String())
				}
			}
			if len(keys) != 6 {
				t.Fatalf("envelope carries extra fields: %s", w.Body.String())
			}
		})
	}
}

func TestVersionEndpointFallsBackWhenUnset(t *testing.T) {
	t.Parallel()
	s := New(newTestStore(t), Options{Actor: testActor})
	startAPI(t, s)
	got, _ := readVersion(t, s)
	want := buildinfo.Info{SchemaVersion: 1, Kind: "version", Version: "devel", Commit: "unknown", Go: runtime.Version()}
	if got != want {
		t.Fatalf("unset version = %+v, want %+v", got, want)
	}
}

func TestVersionEndpointIgnoresSnapshotState(t *testing.T) {
	t.Parallel()
	want := buildinfo.Info{SchemaVersion: 1, Kind: "version", Version: "v9.9.9", Commit: "feedface", Go: "go1.25.0"}
	// Never started: no snapshot exists and /api/board answers 503.
	s := New(newTestStore(t), Options{Actor: testActor, ReadOnly: true, Version: want})
	if w := boardRead(s.Handler(), "/api/board"); w.Code != 503 {
		t.Fatalf("board on unstarted server = %d, want 503", w.Code)
	}
	if got, _ := readVersion(t, s); got != want {
		t.Fatalf("version on unstarted server = %+v, want %+v", got, want)
	}
}
