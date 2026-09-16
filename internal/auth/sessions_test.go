package auth

import (
	"strings"
	"testing"
	"time"
)

func TestASessionIsAnOpaqueIndexIntoAMap(t *testing.T) {
	sessions := NewSessions(time.Hour)
	id, err := sessions.Create(Identity{Subject: "drew", Email: "drew@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	// 256 bits, URL-safe, and carrying nothing.
	if len(id) < 40 || strings.ContainsAny(id, "+/= ") {
		t.Errorf("session id = %q, want an opaque URL-safe value", id)
	}
	if strings.Contains(id, "drew") {
		t.Errorf("session id = %q, which carries the person it belongs to", id)
	}
	held, ok := sessions.Lookup(id)
	if !ok || held.Subject != "drew" {
		t.Errorf("lookup = %+v, %v", held, ok)
	}

	// Two logins by the same person are two sessions, so logging out of one
	// browser does not log the other one out.
	second, err := sessions.Create(Identity{Subject: "drew"})
	if err != nil {
		t.Fatal(err)
	}
	if second == id {
		t.Error("two logins were given the same session id")
	}
	sessions.Destroy(id)
	if _, ok := sessions.Lookup(id); ok {
		t.Error("a destroyed session still resolves")
	}
	if _, ok := sessions.Lookup(second); !ok {
		t.Error("destroying one session ended another")
	}
	// Destroying what is already gone is what a second click on a logout link
	// is, and it is not an error.
	sessions.Destroy(id)
}

// The lifetime is an idle timeout rather than a hard one: somebody reading a
// board all afternoon is not logged out mid-scroll, and somebody who walked
// away is.
func TestASessionExpiresWhenItIsLeftAlone(t *testing.T) {
	sessions := NewSessions(time.Hour)
	now := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
	sessions.now = func() time.Time { return now }

	id, err := sessions.Create(Identity{Subject: "drew"})
	if err != nil {
		t.Fatal(err)
	}

	now = now.Add(50 * time.Minute)
	if _, ok := sessions.Lookup(id); !ok {
		t.Fatal("a session expired while it was being used")
	}
	// That lookup extended it, so fifty minutes later it is still alive.
	now = now.Add(50 * time.Minute)
	if _, ok := sessions.Lookup(id); !ok {
		t.Fatal("using a session did not extend it")
	}
	// Left alone past the timeout, it is gone.
	now = now.Add(61 * time.Minute)
	if _, ok := sessions.Lookup(id); ok {
		t.Fatal("a session outlived its idle timeout")
	}
	if sessions.Count() != 0 {
		t.Errorf("sessions = %d, want the expired one dropped", sessions.Count())
	}
}

// An expired session is dropped rather than kept as a growing record of
// everybody who has ever logged in.
func TestExpiredSessionsAreSweptWhenNewOnesArrive(t *testing.T) {
	sessions := NewSessions(time.Minute)
	now := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
	sessions.now = func() time.Time { return now }
	for i := 0; i < 5; i++ {
		if _, err := sessions.Create(Identity{Subject: "somebody"}); err != nil {
			t.Fatal(err)
		}
	}
	if sessions.Count() != 5 {
		t.Fatalf("sessions = %d, want five", sessions.Count())
	}
	now = now.Add(2 * time.Minute)
	if _, err := sessions.Create(Identity{Subject: "the next person"}); err != nil {
		t.Fatal(err)
	}
	if got := sessions.Count(); got != 1 {
		t.Errorf("sessions = %d, want only the new one", got)
	}
}

func TestAnEmptySessionIDIsNotASession(t *testing.T) {
	sessions := NewSessions(0)
	if _, ok := sessions.Lookup(""); ok {
		t.Error("an empty session id resolved to a session")
	}
}

// The actor offered on a first login is a suggestion, in the order the design
// names, and the `human:` prefix is the convention a store's own actors use.
func TestTheOfferedActorFollowsThePrefillOrder(t *testing.T) {
	for _, c := range []struct {
		name      string
		identity  Identity
		preferred string
		want      string
	}{
		{"preferred username wins", Identity{Email: "d@example.com", Name: "Drew"}, "drew", "human:drew"},
		{"then the local part of the email", Identity{Email: "d.short@example.com", Name: "Drew"}, "", "human:d.short"},
		{"then the name", Identity{Name: "Drew Short"}, "", "human:Drew Short"},
		{"and nothing when there is nothing", Identity{}, "", ""},
	} {
		if got := c.identity.Actor(c.preferred); got != c.want {
			t.Errorf("%s: actor = %q, want %q", c.name, got, c.want)
		}
	}
}
