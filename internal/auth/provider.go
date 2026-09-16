package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// SigningAlgorithms is what an ID token may be signed with.
//
// It is a fixed list rather than whatever discovery advertises, and that is the
// single most important line in this package. Authentik and Keycloak can both
// advertise HS256 beside RS256, and a token naming an HMAC algorithm verified
// against a keyset of public keys is the classic key-confusion shape: the
// "secret" is a value the attacker already has, because it is public. `none` is
// the same failure with the pretence removed. Neither appears here, so neither
// can be selected by a token, by discovery, or by configuration.
var SigningAlgorithms = []string{
	oidc.RS256, oidc.RS384, oidc.RS512,
	oidc.ES256, oidc.ES384, oidc.ES512,
	oidc.PS256, oidc.PS384, oidc.PS512,
}

// DefaultGroupsClaim is the claim groups are read from when nothing names one.
const DefaultGroupsClaim = "groups"

// attemptTTL is how long a login has to come back from the provider.
//
// Long enough to type a password and answer a second factor, short enough that
// an attempt left open in a tab is not a credential lying around.
const attemptTTL = 15 * time.Minute

const (
	// SessionCookie holds an opaque session id and nothing else.
	SessionCookie = "canvas_session"
	// attemptCookie binds a callback to the browser that started the login.
	// Without it the nonce could only be checked against something the server
	// guessed, which is not a check.
	attemptCookie = "canvas_login"
)

// Config is what the relying party needs. It comes from the operator, never
// from a repository.
type Config struct {
	// Issuer is the provider's issuer URL. It must be https: discovery over a
	// plaintext scheme is unauthenticated, so whoever can rewrite it points the
	// key fetch at their own keys and signs any identity they like.
	Issuer string
	// ClientID and ClientSecret are this canvas's registration. A public client
	// leaves the secret empty and relies on PKCE, which is sent either way.
	ClientID     string
	ClientSecret string
	// BaseURL is the public URL the canvas is reached at, which the redirect
	// URI is built from. It is configured rather than taken from the request's
	// Host header, because a header is chosen by whoever sent the request.
	BaseURL string
	// Scopes are requested beyond openid, profile and email. A provider that
	// puts group membership behind its own scope is named here.
	Scopes []string
	// GroupsClaim is the ID token claim holding group names. Empty takes
	// DefaultGroupsClaim.
	GroupsClaim string
	// HTTPClient fetches discovery, keys, and tokens. A nil value takes the
	// default client.
	HTTPClient *http.Client
}

// Validate refuses a configuration that cannot be used safely.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Issuer) == "" || strings.TrimSpace(c.ClientID) == "" {
		return errors.New("an issuer and a client id are required")
	}
	issuer, err := url.Parse(c.Issuer)
	if err != nil || issuer.Scheme == "" || issuer.Host == "" {
		return fmt.Errorf("the issuer %q is not an absolute URL", c.Issuer)
	}
	if issuer.Scheme != "https" {
		return fmt.Errorf("the issuer %q is not https: discovery over a plaintext scheme is unauthenticated, "+
			"so whoever can rewrite it chooses the keys every token is verified against", c.Issuer)
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return fmt.Errorf("the canvas base URL %q is not an absolute URL; "+
			"it is what the provider redirects back to and cannot be guessed from a request", c.BaseURL)
	}
	if base.Scheme != "https" && !loopbackHost(base.Host) {
		return fmt.Errorf("the canvas base URL %q is not https: a session cookie sent over a plaintext "+
			"connection is a session anybody on the path can take. http is permitted only on loopback, "+
			"for a canvas you are testing on your own machine", c.BaseURL)
	}
	return nil
}

// RedirectURL is where the provider sends the browser back to.
func (c Config) RedirectURL() string {
	return strings.TrimSuffix(c.BaseURL, "/") + CallbackPath
}

// Route paths. They are constants because the redirect URI registered with the
// provider has to match one of them exactly, and a caller mounting them
// somewhere else would break a registration nobody can see from here.
const (
	LoginPath    = "/auth/login"
	CallbackPath = "/auth/callback"
	LogoutPath   = "/auth/logout"
)

// Provider is the relying party: it turns a browser with no credential into a
// session.
type Provider struct {
	cfg      Config
	sessions *Sessions

	// mu guards the discovered provider and the open login attempts.
	mu       sync.Mutex
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config
	attempts map[string]attempt

	now func() time.Time
}

type attempt struct {
	state    string
	nonce    string
	verifier string
	returnTo string
	expires  time.Time
}

// RedirectURL is where the provider sends a browser back to. It is reported at
// startup because it has to match what was registered with the provider, and a
// mismatch is otherwise found by somebody who has already typed their password.
func (p *Provider) RedirectURL() string { return p.cfg.RedirectURL() }

// NewProvider builds a relying party. It does not contact the issuer.
//
// Discovery is deferred to the first login on purpose. A canvas that will not
// start because an identity provider was restarting at that moment is a worse
// tool than one that starts, serves its refusals, and reports the provider as
// unreachable when somebody tries to log in.
func NewProvider(cfg Config, sessions *Sessions) (*Provider, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if sessions == nil {
		return nil, errors.New("a relying party needs somewhere to put a session")
	}
	return &Provider{cfg: cfg, sessions: sessions, attempts: make(map[string]attempt), now: time.Now}, nil
}

// discover fetches the provider's metadata and keys once, and keeps them.
//
// A failure is not cached, so a provider that was down when somebody first
// tried to log in is tried again by the next person rather than staying broken
// until a restart.
func (p *Provider) discover(ctx context.Context) (*oidc.IDTokenVerifier, *oauth2.Config, error) {
	p.mu.Lock()
	verifier, oauthCfg := p.verifier, p.oauth
	p.mu.Unlock()
	if verifier != nil {
		return verifier, oauthCfg, nil
	}

	if p.cfg.HTTPClient != nil {
		ctx = oidc.ClientContext(ctx, p.cfg.HTTPClient)
	}
	provider, err := oidc.NewProvider(ctx, p.cfg.Issuer)
	if err != nil {
		return nil, nil, fmt.Errorf("the identity provider at %s could not be read: %w", p.cfg.Issuer, err)
	}
	verifier = provider.Verifier(&oidc.Config{
		ClientID: p.cfg.ClientID,
		// Pinned, not read from the metadata above. See SigningAlgorithms.
		SupportedSigningAlgs: SigningAlgorithms,
	})
	oauthCfg = &oauth2.Config{
		ClientID:     p.cfg.ClientID,
		ClientSecret: p.cfg.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  p.cfg.RedirectURL(),
		Scopes:       scopes(p.cfg.Scopes),
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if p.verifier == nil {
		p.verifier, p.oauth = verifier, oauthCfg
	}
	return p.verifier, p.oauth, nil
}

func scopes(extra []string) []string {
	want := []string{oidc.ScopeOpenID, "profile", "email"}
	for _, scope := range extra {
		if scope == "" {
			continue
		}
		known := false
		for _, have := range want {
			known = known || have == scope
		}
		if !known {
			want = append(want, scope)
		}
	}
	return want
}

// Routes registers the three endpoints a relying party needs.
func (p *Provider) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET "+LoginPath, p.Login)
	mux.HandleFunc("GET "+CallbackPath, p.Callback)
	mux.HandleFunc(LogoutPath, p.Logout)
}

// Login starts an authorization-code flow.
func (p *Provider) Login(w http.ResponseWriter, req *http.Request) {
	_, oauthCfg, err := p.discover(req.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	state, nonce, verifier, err := three()
	if err != nil {
		http.Error(w, "this login could not be started", http.StatusInternalServerError)
		return
	}
	id, err := opaqueID()
	if err != nil {
		http.Error(w, "this login could not be started", http.StatusInternalServerError)
		return
	}

	p.mu.Lock()
	p.expireAttemptsLocked()
	p.attempts[id] = attempt{
		state: state, nonce: nonce, verifier: verifier,
		returnTo: localReturn(req.URL.Query().Get("next")),
		expires:  p.now().Add(attemptTTL),
	}
	p.mu.Unlock()

	p.setCookie(w, attemptCookie, id, int(attemptTTL.Seconds()))
	http.Redirect(w, req, oauthCfg.AuthCodeURL(state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	), http.StatusFound)
}

// Callback finishes the flow and files a session.
//
// Every refusal here answers with the same message. Which of the checks failed
// is in the server's log and not in the browser's, because the browser may be
// holding somebody else's stolen code and telling it which guard it tripped is
// telling it what to fix.
func (p *Provider) Callback(w http.ResponseWriter, req *http.Request) {
	verifier, oauthCfg, err := p.discover(req.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	identity, returnTo, err := p.finish(req, verifier, oauthCfg)
	if err != nil {
		p.clearCookie(w, attemptCookie)
		http.Error(w, "this login could not be completed; start again at "+LoginPath, http.StatusForbidden)
		return
	}
	id, err := p.sessions.Create(identity)
	if err != nil {
		http.Error(w, "this login could not be completed", http.StatusInternalServerError)
		return
	}
	p.clearCookie(w, attemptCookie)
	p.setCookie(w, SessionCookie, id, 0)
	http.Redirect(w, req, returnTo, http.StatusFound)
}

// finish is every check the callback makes, separated so that the handler has
// one refusal and this has one reason per failure.
func (p *Provider) finish(req *http.Request, verifier *oidc.IDTokenVerifier, oauthCfg *oauth2.Config) (Identity, string, error) {
	cookie, err := req.Cookie(attemptCookie)
	if err != nil {
		return Identity{}, "", errors.New("this browser started no login")
	}
	p.mu.Lock()
	started, known := p.attempts[cookie.Value]
	delete(p.attempts, cookie.Value)
	p.mu.Unlock()
	if !known {
		return Identity{}, "", errors.New("no login attempt matches this browser")
	}
	if !started.expires.After(p.now()) {
		return Identity{}, "", errors.New("this login attempt expired")
	}
	// Compared against the attempt this browser started, not against anything
	// the request also carries. A state echoed back is only a check if the
	// thing it is checked against was never sent to the provider.
	if subtleEqual(req.URL.Query().Get("state"), started.state) == false {
		return Identity{}, "", errors.New("the state does not match the attempt")
	}
	if errText := req.URL.Query().Get("error"); errText != "" {
		return Identity{}, "", fmt.Errorf("the provider refused: %s", errText)
	}
	code := req.URL.Query().Get("code")
	if code == "" {
		return Identity{}, "", errors.New("the callback carried no code")
	}

	ctx := req.Context()
	if p.cfg.HTTPClient != nil {
		ctx = context.WithValue(ctx, oauth2.HTTPClient, p.cfg.HTTPClient)
	}
	token, err := oauthCfg.Exchange(ctx, code, oauth2.VerifierOption(started.verifier))
	if err != nil {
		return Identity{}, "", fmt.Errorf("the code could not be exchanged: %w", err)
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok || raw == "" {
		return Identity{}, "", errors.New("the token response carried no id token")
	}
	// Signature, issuer, audience and expiry, against the pinned algorithms.
	idToken, err := verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, "", fmt.Errorf("the id token did not verify: %w", err)
	}
	// The library cannot do this one: only the caller knows which login attempt
	// this browser started. Without it a token minted for a different login,
	// replayed here, verifies perfectly.
	if subtleEqual(idToken.Nonce, started.nonce) == false {
		return Identity{}, "", errors.New("the nonce does not match the attempt")
	}

	identity, err := p.identityFrom(idToken)
	if err != nil {
		return Identity{}, "", err
	}
	return identity, started.returnTo, nil
}

// claims is what is read out of a verified ID token. Groups is left raw
// because providers disagree about whether it is a list or a single string.
type claims struct {
	Subject           string          `json:"sub"`
	Email             string          `json:"email"`
	Name              string          `json:"name"`
	PreferredUsername string          `json:"preferred_username"`
	Groups            json.RawMessage `json:"-"`
}

func (p *Provider) identityFrom(token *oidc.IDToken) (Identity, error) {
	var parsed claims
	if err := token.Claims(&parsed); err != nil {
		return Identity{}, fmt.Errorf("the id token's claims could not be read: %w", err)
	}
	// Taken from the token rather than from the parsed struct, because a
	// provider that omits `sub` produces a verified token for nobody, and an
	// empty subject as a map key is one shared account for every such provider.
	if token.Subject == "" {
		return Identity{}, errors.New("the id token carries no subject")
	}
	var everything map[string]any
	if err := token.Claims(&everything); err != nil {
		return Identity{}, fmt.Errorf("the id token's claims could not be read: %w", err)
	}
	return Identity{
		Subject:           token.Subject,
		Email:             parsed.Email,
		Name:              nameOrUsername(parsed),
		Groups:            groupsFrom(everything[p.groupsClaim()]),
		PreferredUsername: parsed.PreferredUsername,
	}, nil
}

func (p *Provider) groupsClaim() string {
	if p.cfg.GroupsClaim != "" {
		return p.cfg.GroupsClaim
	}
	return DefaultGroupsClaim
}

func nameOrUsername(c claims) string {
	if c.Name != "" {
		return c.Name
	}
	return c.PreferredUsername
}

// groupsFrom reads a claim that every provider spells differently.
//
// A list of strings is the common case. A single string is what a provider that
// has exactly one group to report sometimes sends, and reading it as no groups
// would silently drop somebody's only access. Anything else is no groups, which
// is the safe direction: a group that cannot be read grants nothing rather than
// granting something unintended.
func groupsFrom(value any) []string {
	switch held := value.(type) {
	case string:
		if held == "" {
			return nil
		}
		return []string{held}
	case []any:
		var groups []string
		for _, entry := range held {
			if name, ok := entry.(string); ok && name != "" {
				groups = append(groups, name)
			}
		}
		return groups
	default:
		return nil
	}
}

// Logout ends the session this browser holds.
func (p *Provider) Logout(w http.ResponseWriter, req *http.Request) {
	if cookie, err := req.Cookie(SessionCookie); err == nil {
		p.sessions.Destroy(cookie.Value)
	}
	p.clearCookie(w, SessionCookie)
	http.Redirect(w, req, "/", http.StatusFound)
}

// Identify answers who is making a request, from the session it carries.
func (p *Provider) Identify(req *http.Request) (Identity, bool) {
	cookie, err := req.Cookie(SessionCookie)
	if err != nil {
		return Identity{}, false
	}
	return p.sessions.Lookup(cookie.Value)
}

// setCookie writes one of this package's two cookies.
//
// HttpOnly, because no script has any use for either value. SameSite=Lax,
// because the callback is a top-level navigation from the provider and Strict
// would drop the cookie exactly then. Secure follows the canvas's own base URL,
// which Validate has already restricted to https or loopback.
func (p *Provider) setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   strings.HasPrefix(p.cfg.BaseURL, "https://"),
		SameSite: http.SameSiteLaxMode,
	})
}

func (p *Provider) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true,
		Secure:   strings.HasPrefix(p.cfg.BaseURL, "https://"),
		SameSite: http.SameSiteLaxMode,
	})
}

func (p *Provider) expireAttemptsLocked() {
	now := p.now()
	for id, held := range p.attempts {
		if !held.expires.After(now) {
			delete(p.attempts, id)
		}
	}
}

// three returns the state, the nonce, and the PKCE verifier for one attempt.
//
// Three separate values rather than one reused three times: they are checked by
// three different parties, and a value that plays two roles fails both at once
// when it leaks.
func three() (string, string, string, error) {
	var out [3]string
	for i := range out {
		value, err := opaqueID()
		if err != nil {
			return "", "", "", err
		}
		out[i] = value
	}
	return out[0], out[1], out[2], nil
}

// localReturn keeps a redirect inside this canvas.
//
// Anything that is not a plain absolute path is replaced by the root. A login
// endpoint that redirects wherever it is told is an open redirect, and an open
// redirect on the endpoint people are taught to trust is the one that works.
func localReturn(next string) string {
	if next == "" || !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		return "/"
	}
	parsed, err := url.Parse(next)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" {
		return "/"
	}
	return parsed.RequestURI()
}

func loopbackHost(host string) bool {
	name := host
	if at := strings.LastIndex(host, ":"); at > strings.LastIndex(host, "]") {
		name = host[:at]
	}
	name = strings.Trim(name, "[]")
	return name == "localhost" || name == "127.0.0.1" || name == "::1"
}
