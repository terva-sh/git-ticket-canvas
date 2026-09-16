package auth

import (
	"bytes"
	"log"
	"net/http"
	"strings"
	"testing"
)

// captured takes the log for one test and gives it back afterwards.
func captured(t *testing.T) *bytes.Buffer {
	t.Helper()
	var held bytes.Buffer
	flags, writer := log.Flags(), log.Writer()
	log.SetOutput(&held)
	log.SetFlags(0)
	t.Cleanup(func() { log.SetOutput(writer); log.SetFlags(flags) })
	return &held
}

// The only record this canvas keeps of who has been reading a store. Without it
// the identity provider's event log is the entire audit trail, which puts it in
// a different system from the thing being read.
func TestASuccessfulLoginIsLogged(t *testing.T) {
	p := newIDP(t)
	provider, _ := newProvider(t, p)
	held := captured(t)

	attempt, state := login(t, provider, p)
	if response := callback(t, provider, attempt, state); response.StatusCode != http.StatusFound {
		t.Fatalf("callback answered %d", response.StatusCode)
	}

	line := held.String()
	for _, want := range []string{"login", "01HQ8-stable-subject", "Drew Short", "Brokkr Staff", "Brokkr Ledger Admin"} {
		if !strings.Contains(line, want) {
			t.Errorf("the login log says %q, which does not name %q", strings.TrimSpace(line), want)
		}
	}
}

// A login that arrives with no groups is the most common misconfiguration
// there is, and it must be visible in the log rather than inferred from an
// empty canvas.
func TestALoginWithNoGroupsSaysSo(t *testing.T) {
	identity := Identity{Subject: "01HQ8-stable-subject", Name: "Drew Short"}
	if got := identity.Describe(); !strings.Contains(got, "no groups") {
		t.Errorf("Describe() = %q, want it to say that no groups arrived", got)
	}
}

// A log line names a person and what they arrived holding. Anything that could
// be replayed does not belong in one.
func TestTheLogCarriesNothingReplayable(t *testing.T) {
	p := newIDP(t)
	provider, _ := newProvider(t, p)
	held := captured(t)

	attempt, state := login(t, provider, p)
	response := callback(t, provider, attempt, state)
	var session *http.Cookie
	for _, cookie := range response.Cookies() {
		if cookie.Name == SessionCookie {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("no session was created, so this proves nothing")
	}

	line := held.String()
	for what, secret := range map[string]string{
		"the session id":         session.Value,
		"the id token":           p.token,
		"the authorization code": "any-code",
		"the client secret":      "test-client-secret",
	} {
		if secret != "" && strings.Contains(line, secret) {
			t.Errorf("the log carries %s", what)
		}
	}
	// An email is not replayable but it is also not needed to identify somebody
	// whose subject and name are already on the line.
	if strings.Contains(line, "drew@example.com") {
		t.Error("the log carries an email address it does not need")
	}
}

// docs/serving-a-canvas.md has told operators since before anything wrote it
// that a refused login says on the server's log which check failed.
func TestARefusedLoginSaysWhichCheckFailed(t *testing.T) {
	p := newIDP(t)
	provider, _ := newProvider(t, p)
	held := captured(t)

	// No attempt cookie: this browser started no login.
	if response := callback(t, provider, nil, "some-state"); response.StatusCode != http.StatusForbidden {
		t.Fatalf("callback answered %d, want a refusal", response.StatusCode)
	}
	line := held.String()
	if !strings.Contains(line, "refuse") || !strings.Contains(line, "started no login") {
		t.Errorf("the refusal log says %q", strings.TrimSpace(line))
	}
}
