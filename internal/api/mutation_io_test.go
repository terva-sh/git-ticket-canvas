package api

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Gates make the network wait deterministic without using the user's store.
type ioGate struct {
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func newIOGate() *ioGate { return &ioGate{entered: make(chan struct{}), release: make(chan struct{})} }
func (g *ioGate) wait()  { g.once.Do(func() { close(g.entered) }); <-g.release }

type gatedBody struct {
	io.Reader
	gate *ioGate
}

func (b *gatedBody) Read(p []byte) (int, error) { b.gate.wait(); return b.Reader.Read(p) }
func (b *gatedBody) Close() error               { return nil }

type gatedResponse struct {
	*httptest.ResponseRecorder
	gate    *ioGate
	headers bool
}

func (w *gatedResponse) WriteHeader(code int) {
	if w.headers {
		w.gate.wait()
	}
	w.ResponseRecorder.WriteHeader(code)
}
func (w *gatedResponse) Write(p []byte) (int, error) {
	if !w.headers {
		w.gate.wait()
	}
	return w.ResponseRecorder.Write(p)
}

func awaitIO(t *testing.T, done <-chan struct{}, message string) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal(message)
	}
}

func assertOtherBoardWrite(t *testing.T, handler http.Handler) {
	t.Helper()
	done := make(chan struct{})
	response := httptest.NewRecorder()
	go func() {
		handler.ServeHTTP(response, httptest.NewRequest("PUT", "/api/layout", strings.NewReader(`{"board":"other","cards":{}}`)))
		close(done)
	}()
	awaitIO(t, done, "another board's mutation blocked on network I/O")
	if response.Code != http.StatusOK {
		t.Fatalf("other board write: %d %s", response.Code, response.Body.String())
	}
}

func TestStalledMutationBodyDoesNotBlockOtherWrites(t *testing.T) {
	for _, tc := range []struct{ method, path, body string }{
		{"POST", "/api/tickets", `{"title":"Stalled create"}`},
		{"PATCH", "/api/tickets/TKT-01M24411DDC98WXKT2MY2FMHQN", `{"ops":[{"op":"set","field":"title","value":"Stalled patch"}]}`},
		{"PUT", "/api/layout", `{"board":"default","cards":{}}`},
	} {
		t.Run(tc.method, func(t *testing.T) {
			handler := startAPI(t, New(newTestStore(t), Options{Actor: testActor}))
			gate := newIOGate()
			firstDone := make(chan struct{})
			defer func() { close(gate.release); awaitIO(t, firstDone, "stalled request did not finish after release") }()
			r := httptest.NewRequest(tc.method, tc.path, nil)
			r.Body = &gatedBody{Reader: strings.NewReader(tc.body), gate: gate}
			go func() { handler.ServeHTTP(httptest.NewRecorder(), r); close(firstDone) }()
			awaitIO(t, gate.entered, "request never reached body read")
			assertOtherBoardWrite(t, handler)
		})
	}
}

func TestStalledMutationResponseDoesNotBlockOtherWrites(t *testing.T) {
	for _, headers := range []bool{true, false} {
		name := "body"
		if headers {
			name = "headers"
		}
		t.Run(name, func(t *testing.T) {
			handler := startAPI(t, New(newTestStore(t), Options{Actor: testActor}))
			gate := newIOGate()
			firstDone := make(chan struct{})
			defer func() { close(gate.release); awaitIO(t, firstDone, "stalled response did not finish after release") }()
			response := &gatedResponse{ResponseRecorder: httptest.NewRecorder(), gate: gate, headers: headers}
			go func() {
				handler.ServeHTTP(response, httptest.NewRequest("PUT", "/api/layout", strings.NewReader(`{"board":"default","cards":{}}`)))
				close(firstDone)
			}()
			awaitIO(t, gate.entered, "request never reached response write")
			assertOtherBoardWrite(t, handler)
		})
	}
}

func TestMutationBodyLimitBeforeLock(t *testing.T) {
	handler := startAPI(t, New(newTestStore(t), Options{Actor: testActor}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("PUT", "/api/layout", strings.NewReader(strings.Repeat(" ", 4<<20)+`{}`)))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "bad_request") {
		t.Fatalf("oversized body: %d %s", response.Code, response.Body.String())
	}
	assertOtherBoardWrite(t, handler)
}

func TestReadOnlyMutationDoesNotReadBody(t *testing.T) {
	handler := startAPI(t, New(newTestStore(t), Options{Actor: testActor, ReadOnly: true}))
	gate := newIOGate()
	done := make(chan struct{})
	defer func() { close(gate.release); awaitIO(t, done, "read-only request did not finish") }()
	r := httptest.NewRequest("PUT", "/api/layout", nil)
	r.Body = &gatedBody{Reader: strings.NewReader(`{}`), gate: gate}
	response := httptest.NewRecorder()
	go func() { handler.ServeHTTP(response, r); close(done) }()
	awaitIO(t, done, "read-only refusal waited for request body")
	select {
	case <-gate.entered:
		t.Fatal("read-only request read the body")
	default:
	}
	if response.Code != http.StatusForbidden {
		t.Fatalf("read-only status: %d", response.Code)
	}
}
