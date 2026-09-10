package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxSubscribers = 128

// subscribe installs a bounded queue and its initial state under the same lock
// as publication. No event history or client cursor is needed: every connection
// starts by invalidating against the current epoch and generation.
func (c *coordinator) subscribe() (chan liveState, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.started || c.closed || len(c.subs) >= maxSubscribers {
		return nil, false
	}
	ch := make(chan liveState, 1)
	state := c.state
	state.Scopes = []string{"tickets", "config", "boards"}
	ch <- state
	c.subs[ch] = struct{}{}
	return ch, true
}

func (c *coordinator) unsubscribe(ch chan liveState) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.subs, ch)
}

func sameOrigin(r *http.Request) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	origins := r.Header.Values("Origin")
	if len(origins) == 0 {
		return true
	} // CLI clients and same-origin browsers
	if len(origins) != 1 {
		return false
	}
	origin, err := url.Parse(origins[0])
	if err != nil || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || origin.Path != "" {
		return false
	}
	// Host is the client-visible authority even behind a proxy. Do not trust
	// forwarded headers from arbitrary clients. TLS may terminate at a proxy.
	return (origin.Scheme == "http" || origin.Scheme == "https") && strings.EqualFold(origin.Host, r.Host)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !sameOrigin(r) {
		writeJSON(w, http.StatusForbidden, errBody{Code: "cross_origin", Message: "cross-origin event streams are not allowed"})
		return
	}
	if _, ok := w.(http.Flusher); !ok {
		unavailable(w)
		return
	}
	control := http.NewResponseController(w)
	if err := control.SetWriteDeadline(time.Now().Add(s.live.timing.writeTimeout)); err != nil {
		unavailable(w)
		return
	}
	defer control.SetWriteDeadline(time.Time{})
	ch, ok := s.live.subscribe()
	if !ok {
		unavailable(w)
		return
	}
	defer s.live.unsubscribe(ch)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	write := func(data string) bool {
		if err := control.SetWriteDeadline(time.Now().Add(s.live.timing.writeTimeout)); err != nil {
			return false
		}
		if _, err := fmt.Fprint(w, data); err != nil {
			return false
		}
		return control.Flush() == nil
	}
	heartbeat := time.NewTicker(s.live.timing.heartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case state, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(state)
			if !write("data: " + string(data) + "\n\n") {
				return
			}
		case <-heartbeat.C:
			if !write(": heartbeat\n\n") {
				return
			}
		}
	}
}
