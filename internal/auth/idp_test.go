package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	jose "github.com/go-jose/go-jose/v4"
)

// idp is an identity provider that does what it is told, including things a
// real one should never do.
//
// A fake is the only way to test these refusals. The failures this package
// exists to prevent all look like a provider behaving badly or an attacker
// impersonating one, and neither can be arranged against a provider that works.
type idp struct {
	server *httptest.Server
	key    *rsa.PrivateKey
	kid    string
	// other is a key the published keyset does not contain.
	other *rsa.PrivateKey

	// token is what the token endpoint answers with. A test sets it to
	// something the provider should refuse. It is a value rather than a
	// callback because minting one needs *testing.T, and calling t.Fatal from
	// the server's goroutine ends that goroutine rather than the test.
	token string
	// nonce is what the last login redirect asked for, so a test can mint a
	// token that matches it, or deliberately one that does not.
	nonce string
}

func newIDP(t *testing.T) *idp {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	p := &idp{key: key, other: other, kid: "canvas-test-key"}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"issuer":                 p.server.URL,
			"authorization_endpoint": p.server.URL + "/authorize",
			"token_endpoint":         p.server.URL + "/token",
			"jwks_uri":               p.server.URL + "/keys",
			// Advertised and never honoured. A real provider can offer this, and
			// a relying party that reads its algorithms from here rather than
			// pinning them accepts a token signed with a key it published.
			"id_token_signing_alg_values_supported": []string{"RS256", "HS256", "none"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{
			Key: key.Public(), KeyID: p.kid, Algorithm: string(jose.RS256), Use: "sig",
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"access_token": "not-used-by-this-canvas",
			"token_type":   "Bearer",
			"expires_in":   300,
			"id_token":     p.token,
		})
	})
	p.server = httptest.NewTLSServer(mux)
	t.Cleanup(p.server.Close)
	return p
}

// wellFormed is the token a provider behaving correctly would mint for the
// login that has just been started.
func (p *idp) wellFormed(t *testing.T) string {
	t.Helper()
	return p.sign(t, jose.RS256, p.key, p.kid, p.claims(nil))
}

// publicModulus is the attacker's "secret" in an algorithm-confusion attack: a
// value the provider published, used as an HMAC key against a verifier that
// believed the token's own account of how it was signed.
func (p *idp) publicModulus() []byte { return p.key.PublicKey.N.Bytes() }

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

// claims is a well-formed identity, with overrides applied last so a test can
// break exactly one thing.
func (p *idp) claims(override map[string]any) map[string]any {
	now := time.Now()
	out := map[string]any{
		"iss":                p.server.URL,
		"aud":                testClientID,
		"sub":                "01HQ8-stable-subject",
		"email":              "drew@example.com",
		"name":               "Drew Short",
		"preferred_username": "drew",
		"groups":             []string{"Brokkr Staff", "Brokkr Ledger Admin"},
		"nonce":              p.nonce,
		"iat":                now.Unix(),
		"exp":                now.Add(time.Hour).Unix(),
	}
	for key, value := range override {
		out[key] = value
	}
	return out
}

func (p *idp) sign(t *testing.T, alg jose.SignatureAlgorithm, key any, kid string, claims map[string]any) string {
	t.Helper()
	options := (&jose.SignerOptions{}).WithType("JWT")
	if kid != "" {
		options = options.WithHeader("kid", kid)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: alg, Key: key}, options)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	object, err := signer.Sign(payload)
	if err != nil {
		t.Fatal(err)
	}
	compact, err := object.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	return compact
}

// unsigned builds an `alg: none` token by hand, because no signing library will
// produce one and that is the point of the attack: the token is three fields
// and a trailing dot, and a verifier that trusts the header's own claim about
// how it was signed accepts it.
func (p *idp) unsigned(claims map[string]any) string {
	encode := func(value any) string {
		raw, _ := json.Marshal(value)
		return base64.RawURLEncoding.EncodeToString(raw)
	}
	return encode(map[string]any{"alg": "none", "typ": "JWT"}) + "." + encode(claims) + "."
}
