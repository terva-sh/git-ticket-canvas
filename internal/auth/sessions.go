package auth

import (
	"crypto/rand"
	"encoding/base64"
	"sync"
	"time"
)

// Sessions holds logins server-side against an opaque random id.
//
// Nothing about the person is in the cookie, so there is no signing key to
// protect, no claim to tamper with, and nothing to forge: an id that is not in
// this map is not a session, whatever it was made of. The cost is that
// sessions do not survive a restart, which for one process is a cheap
// re-login rather than a design problem. That is said here so a restart
// evicting everybody is read as the design rather than as a bug.
type Sessions struct {
	mu       sync.Mutex
	ttl      time.Duration
	now      func() time.Time
	sessions map[string]session
}

type session struct {
	identity Identity
	expires  time.Time
}

// DefaultSessionTTL is how long a login lasts without being used.
//
// A working day plus the evening, so that somebody who logs in at nine is not
// logged out over lunch and is logged out by the morning.
const DefaultSessionTTL = 12 * time.Hour

// NewSessions returns an empty store. A zero ttl takes DefaultSessionTTL.
func NewSessions(ttl time.Duration) *Sessions {
	if ttl <= 0 {
		ttl = DefaultSessionTTL
	}
	return &Sessions{ttl: ttl, now: time.Now, sessions: make(map[string]session)}
}

// Create files an identity under a fresh opaque id.
func (s *Sessions) Create(identity Identity) (string, error) {
	id, err := opaqueID()
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	s.sessions[id] = session{identity: identity, expires: s.now().Add(s.ttl)}
	return id, nil
}

// Lookup answers who a session id belongs to, and extends it.
//
// The extension is what makes the lifetime an idle timeout rather than a hard
// one: somebody reading a board all afternoon is not logged out mid-scroll, and
// somebody who walked away is.
func (s *Sessions) Lookup(id string) (Identity, bool) {
	if id == "" {
		return Identity{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	held, ok := s.sessions[id]
	if !ok {
		return Identity{}, false
	}
	now := s.now()
	if !held.expires.After(now) {
		delete(s.sessions, id)
		return Identity{}, false
	}
	held.expires = now.Add(s.ttl)
	s.sessions[id] = held
	return held.identity, true
}

// Destroy ends one session. It is not an error to destroy one that is already
// gone, because that is what a second click on a logout link is.
func (s *Sessions) Destroy(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, id)
}

// Count is how many sessions are held, for a test and for a log line. It
// expires first, so it never reports sessions that no longer exist.
func (s *Sessions) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.expireLocked()
	return len(s.sessions)
}

// expireLocked drops what has timed out.
//
// It runs when sessions are created rather than on a timer, because a canvas
// nobody is logging in to is a canvas whose session map is not growing.
func (s *Sessions) expireLocked() {
	now := s.now()
	for id, held := range s.sessions {
		if !held.expires.After(now) {
			delete(s.sessions, id)
		}
	}
}

// opaqueID returns 256 bits of randomness, URL-safe.
//
// It is an index into a map and carries no meaning, which is the property the
// whole session design rests on. crypto/rand.Read does not fail on any
// supported platform in current Go, and the error is returned rather than
// ignored because the one thing worse than a failed login is a predictable
// session id.
func opaqueID() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}
