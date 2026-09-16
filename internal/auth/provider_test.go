package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
)

const (
	testClientID = "git-ticket-canvas"
	testBaseURL  = "https://canvas.example.com"
)

func newProvider(t *testing.T, p *idp) (*Provider, *Sessions) {
	t.Helper()
	sessions := NewSessions(time.Hour)
	provider, err := NewProvider(Config{
		Issuer:     p.server.URL,
		ClientID:   testClientID,
		BaseURL:    testBaseURL,
		HTTPClient: p.server.Client(),
	}, sessions)
	if err != nil {
		t.Fatal(err)
	}
	return provider, sessions
}

// login runs the first half of the flow and returns the attempt cookie and the
// state the provider was sent, so a test can come back with them or without.
func login(t *testing.T, provider *Provider, p *idp) (*http.Cookie, string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	provider.Login(recorder, httptest.NewRequest("GET", LoginPath, nil))
	if recorder.Code != http.StatusFound {
		t.Fatalf("login answered %d: %s", recorder.Code, recorder.Body.String())
	}
	to, err := url.Parse(recorder.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	query := to.Query()
	p.nonce = query.Get("nonce")
	if p.nonce == "" || query.Get("state") == "" {
		t.Fatalf("the login sent no nonce or state: %s", to)
	}
	if query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") == "" {
		t.Errorf("the login sent no PKCE challenge: %s", to.RawQuery)
	}
	var attempt *http.Cookie
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == attemptCookie {
			attempt = cookie
		}
	}
	if attempt == nil {
		t.Fatal("the login set no attempt cookie, so the callback has nothing to check a nonce against")
	}
	// The provider now answers with a token for this attempt. A test that wants
	// a bad one replaces it after this returns.
	p.token = p.wellFormed(t)
	return attempt, query.Get("state")
}

// callback finishes the flow. It returns the response so a test can read either
// the session it got or the refusal it wanted.
func callback(t *testing.T, provider *Provider, attempt *http.Cookie, state string) *http.Response {
	t.Helper()
	req := httptest.NewRequest("GET", CallbackPath+"?code=any-code&state="+url.QueryEscape(state), nil)
	if attempt != nil {
		req.AddCookie(attempt)
	}
	recorder := httptest.NewRecorder()
	provider.Callback(recorder, req)
	return recorder.Result()
}

// The whole point: a login yields a subject, an email, a name, and groups, and
// nothing keys on anything but the subject.
func TestALoginYieldsAnIdentity(t *testing.T) {
	p := newIDP(t)
	provider, sessions := newProvider(t, p)
	attempt, state := login(t, provider, p)
	response := callback(t, provider, attempt, state)
	if response.StatusCode != http.StatusFound {
		t.Fatalf("callback answered %d, want a redirect into the canvas", response.StatusCode)
	}

	var session *http.Cookie
	for _, cookie := range response.Cookies() {
		if cookie.Name == SessionCookie {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("the callback set no session cookie")
	}
	identity, ok := sessions.Lookup(session.Value)
	if !ok {
		t.Fatal("the session cookie names no session")
	}
	if identity.Subject != "01HQ8-stable-subject" {
		t.Errorf("subject = %q", identity.Subject)
	}
	if identity.Email != "drew@example.com" || identity.Name != "Drew Short" {
		t.Errorf("identity = %+v", identity)
	}
	if strings.Join(identity.Groups, ",") != "Brokkr Staff,Brokkr Ledger Admin" {
		t.Errorf("groups = %v", identity.Groups)
	}
	if got := identity.Actor("drew"); got != "human:drew" {
		t.Errorf("offered actor = %q, want human:drew", got)
	}
}

// Nothing about the person is in the cookie, so there is no signing key to
// protect and nothing in it to tamper with. An id that is not in the session
// map is not a session, whatever it was made of.
func TestTheCookieCarriesNothingAboutThePerson(t *testing.T) {
	p := newIDP(t)
	provider, sessions := newProvider(t, p)
	attempt, state := login(t, provider, p)
	response := callback(t, provider, attempt, state)

	var session *http.Cookie
	for _, cookie := range response.Cookies() {
		if cookie.Name == SessionCookie {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("no session cookie")
	}
	for _, secret := range []string{"01HQ8-stable-subject", "drew", "example.com", "Brokkr", "Drew"} {
		if strings.Contains(session.Value, secret) {
			t.Errorf("the session cookie carries %q: %s", secret, session.Value)
		}
	}
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Path != "/" {
		t.Errorf("session cookie = %+v, want HttpOnly, SameSite=Lax, Path=/", session)
	}
	// The base URL is https here, so the cookie has to say Secure. A session
	// sent over a plaintext connection is a session anybody on the path takes.
	if !session.Secure {
		t.Error("the session cookie is not Secure under an https canvas")
	}
	// Made up ids are not sessions.
	if _, ok := sessions.Lookup(session.Value + "x"); ok {
		t.Error("a session id nobody issued resolved to a session")
	}
	if _, ok := sessions.Lookup("01HQ8-stable-subject"); ok {
		t.Error("a subject used as a session id resolved to a session")
	}
}

// The three ways to be handed a token that verifies and is not true.
//
// Each of these is a token the fake provider is willing to mint and a real one
// might be talked into minting. None of them may produce a session.
func TestATokenThatShouldNotVerifyDoesNot(t *testing.T) {
	for _, c := range []struct {
		name string
		mint func(t *testing.T, p *idp) string
	}{
		{
			// The header claims the token is unsigned, and a verifier that
			// believes the header accepts anything at all.
			name: "the none algorithm",
			mint: func(_ *testing.T, p *idp) string { return p.unsigned(p.claims(nil)) },
		},
		{
			// Algorithm confusion: an HMAC algorithm against a keyset of public
			// keys, where the "secret" is a value the attacker already has.
			// The provider's own metadata advertises HS256, which is exactly
			// why the algorithms are pinned here rather than read from it.
			name: "an HMAC algorithm against a public keyset",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.HS256, p.publicModulus(), p.kid, p.claims(nil))
			},
		},
		{
			// A correctly signed token from a key the published keyset does not
			// contain. Getting the kid handling wrong here means trying every
			// key, or trusting the header's own account of which key to use.
			name: "a key the keyset does not publish",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.other, "some-other-key", p.claims(nil))
			},
		},
		{
			// The same unpublished key, wearing the published key's id. A
			// verifier that selects a key by kid and then does not check the
			// signature against it accepts this.
			name: "an unpublished key wearing the published key id",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.other, p.kid, p.claims(nil))
			},
		},
		{
			// Correctly signed, for somebody else's client. An audience check
			// is what stops a token minted for another application here.
			name: "a token for another audience",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.key, p.kid, p.claims(map[string]any{"aud": "some-other-client"}))
			},
		},
		{
			// Correctly signed and expired.
			name: "an expired token",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.key, p.kid, p.claims(map[string]any{
					"exp": time.Now().Add(-time.Minute).Unix(),
				}))
			},
		},
		{
			// Correctly signed, minted for a different login. The library
			// cannot catch this one: only the caller knows which attempt this
			// browser started.
			name: "a nonce from another attempt",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.key, p.kid, p.claims(map[string]any{
					"nonce": "a-nonce-from-somebody-elses-login",
				}))
			},
		},
		{
			// No nonce at all, which is what a replayed token from a flow that
			// never sent one looks like.
			name: "no nonce",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.key, p.kid, p.claims(map[string]any{"nonce": ""}))
			},
		},
		{
			// Verified, and for nobody. An empty subject as a map key is one
			// shared account for every provider that omits it.
			name: "no subject",
			mint: func(t *testing.T, p *idp) string {
				return p.sign(t, jose.RS256, p.key, p.kid, p.claims(map[string]any{"sub": ""}))
			},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			p := newIDP(t)
			provider, sessions := newProvider(t, p)
			attempt, state := login(t, provider, p)
			p.token = c.mint(t, p)

			response := callback(t, provider, attempt, state)
			if response.StatusCode == http.StatusFound {
				t.Fatalf("%s produced a session", c.name)
			}
			if sessions.Count() != 0 {
				t.Errorf("%s left %d sessions behind", c.name, sessions.Count())
			}
			for _, cookie := range response.Cookies() {
				if cookie.Name == SessionCookie && cookie.Value != "" {
					t.Errorf("%s set a session cookie", c.name)
				}
			}
		})
	}
}

// The callback has to be the browser that started the login, and has to echo
// the state that browser was given.
func TestACallbackMustBelongToAnAttempt(t *testing.T) {
	for _, c := range []struct {
		name    string
		attempt func(real *http.Cookie) *http.Cookie
		state   func(real string) string
	}{
		{"no attempt cookie", func(*http.Cookie) *http.Cookie { return nil }, func(s string) string { return s }},
		{
			"an attempt cookie nobody issued",
			func(real *http.Cookie) *http.Cookie {
				return &http.Cookie{Name: attemptCookie, Value: real.Value + "x"}
			},
			func(s string) string { return s },
		},
		{"the wrong state", func(c *http.Cookie) *http.Cookie { return c }, func(string) string { return "not-the-state" }},
		{"no state", func(c *http.Cookie) *http.Cookie { return c }, func(string) string { return "" }},
	} {
		t.Run(c.name, func(t *testing.T) {
			p := newIDP(t)
			provider, sessions := newProvider(t, p)
			attempt, state := login(t, provider, p)

			response := callback(t, provider, c.attempt(attempt), c.state(state))
			if response.StatusCode == http.StatusFound || sessions.Count() != 0 {
				t.Fatalf("%s produced a session (%d)", c.name, response.StatusCode)
			}
		})
	}
}

// An attempt is spent when it is used. A code replayed against the same attempt
// is a code somebody else is holding.
func TestAnAttemptIsUsedOnce(t *testing.T) {
	p := newIDP(t)
	provider, sessions := newProvider(t, p)
	attempt, state := login(t, provider, p)
	if response := callback(t, provider, attempt, state); response.StatusCode != http.StatusFound {
		t.Fatalf("the first callback answered %d", response.StatusCode)
	}
	if response := callback(t, provider, attempt, state); response.StatusCode == http.StatusFound {
		t.Fatal("the same attempt was accepted twice")
	}
	if sessions.Count() != 1 {
		t.Errorf("sessions = %d, want the one real login", sessions.Count())
	}
}

// Discovery over a plaintext scheme is unauthenticated, so whoever can rewrite
// it chooses the keys every token is verified against. There is no opt-out at
// all, so there is nothing to name unsafely.
func TestAPlaintextIssuerIsRefused(t *testing.T) {
	for _, c := range []struct{ issuer, base, want string }{
		{"http://id.example.com", testBaseURL, "https"},
		{"id.example.com", testBaseURL, "absolute"},
		{"", testBaseURL, "required"},
		{"https://id.example.com", "http://canvas.example.com", "https"},
		{"https://id.example.com", "", "absolute"},
	} {
		err := Config{Issuer: c.issuer, ClientID: testClientID, BaseURL: c.base}.Validate()
		if err == nil {
			t.Errorf("issuer %q with base %q was accepted", c.issuer, c.base)
			continue
		}
		if !strings.Contains(err.Error(), c.want) {
			t.Errorf("issuer %q: %v, want it to mention %q", c.issuer, err, c.want)
		}
	}
	// http is permitted on loopback, for a canvas being tested on one machine.
	if err := (Config{Issuer: "https://id.example.com", ClientID: testClientID,
		BaseURL: "http://127.0.0.1:7777"}).Validate(); err != nil {
		t.Errorf("a loopback canvas over http was refused: %v", err)
	}
}

// The pinned list is asymmetric schemes only. It is asserted directly as well
// as through a token, because a change that widened it would otherwise only be
// caught if somebody had already thought of the attack it enables.
func TestOnlyAsymmetricAlgorithmsArePinned(t *testing.T) {
	for _, alg := range SigningAlgorithms {
		if strings.HasPrefix(alg, "HS") || alg == "none" || alg == "" {
			t.Errorf("the pinned algorithms include %q, which is verified with a key the provider published", alg)
		}
	}
	if len(SigningAlgorithms) == 0 {
		t.Error("no algorithms are pinned, so every token is refused")
	}
}

// A login endpoint that redirects wherever it is told is an open redirect, and
// an open redirect on the endpoint people are taught to trust is the one that
// works.
func TestALoginReturnsOnlyIntoThisCanvas(t *testing.T) {
	for _, c := range []struct{ next, want string }{
		{"", "/"},
		{"/board?store=ledger", "/board?store=ledger"},
		{"//evil.example.com/", "/"},
		{"https://evil.example.com/", "/"},
		{"http:/evil.example.com", "/"},
		{"evil.example.com", "/"},
	} {
		if got := localReturn(c.next); got != c.want {
			t.Errorf("localReturn(%q) = %q, want %q", c.next, got, c.want)
		}
	}
}

// Groups arrive spelled differently by every provider, and a group that cannot
// be read must grant nothing rather than something unintended.
func TestGroupsAreReadFromWhateverTheProviderSent(t *testing.T) {
	for _, c := range []struct {
		name  string
		value any
		want  string
	}{
		{"a list", []any{"one", "two"}, "one,two"},
		{"a single string", "only", "only"},
		{"an empty string", "", ""},
		{"a list with rubbish in it", []any{"one", 2, nil, "three"}, "one,three"},
		{"a number", 7.0, ""},
		{"absent", nil, ""},
	} {
		if got := strings.Join(groupsFrom(c.value), ","); got != c.want {
			t.Errorf("%s: groups = %q, want %q", c.name, got, c.want)
		}
	}
}

// A logout ends the session rather than only dropping the cookie, so a session
// id copied out of a browser before the click stops working after it.
func TestLogoutEndsTheSession(t *testing.T) {
	p := newIDP(t)
	provider, sessions := newProvider(t, p)
	attempt, state := login(t, provider, p)
	response := callback(t, provider, attempt, state)
	var session *http.Cookie
	for _, cookie := range response.Cookies() {
		if cookie.Name == SessionCookie {
			session = cookie
		}
	}
	if session == nil {
		t.Fatal("no session cookie")
	}

	req := httptest.NewRequest("GET", LogoutPath, nil)
	req.AddCookie(session)
	provider.Logout(httptest.NewRecorder(), req)
	if _, ok := sessions.Lookup(session.Value); ok {
		t.Error("the session survived a logout")
	}
	if sessions.Count() != 0 {
		t.Errorf("sessions = %d after a logout", sessions.Count())
	}
}
