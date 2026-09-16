package auth

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// Guard refuses everything behind it that carries no session.
//
// The two answers differ because the two callers do. A browser asking for a
// page is sent to the provider, which is the whole of the login experience. A
// script or a fetch asking for the API is told 401 and where to go, because
// redirecting it produces an HTML login page parsed as JSON and an error
// message about a `<` that explains nothing.
//
// The login routes are the hole in it, and they are the only one.
func (p *Provider) Guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if isAuthPath(req.URL.Path) {
			next.ServeHTTP(w, req)
			return
		}
		identity, ok := p.Identify(req)
		if !ok {
			refuse(w, req)
			return
		}
		next.ServeHTTP(w, req.WithContext(With(req.Context(), identity)))
	})
}

func isAuthPath(path string) bool {
	return path == LoginPath || path == CallbackPath || path == LogoutPath
}

func refuse(w http.ResponseWriter, req *http.Request) {
	if strings.HasPrefix(req.URL.Path, "/api/") {
		w.Header().Set("Cache-Control", "private, no-cache")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		// Hand-written rather than encoded: this runs before anything else and
		// has no store, no snapshot, and nothing that can fail.
		_, _ = w.Write([]byte(`{"code":"not_authenticated",` +
			`"message":"this canvas requires a login","login":"` + LoginPath + `"}` + "\n"))
		return
	}
	to := LoginPath
	if next := req.URL.RequestURI(); req.Method == http.MethodGet && next != "/" {
		to += "?next=" + urlQueryEscape(next)
	}
	http.Redirect(w, req, to, http.StatusFound)
}

func urlQueryEscape(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~', c == '/':
			b.WriteByte(c)
		default:
			const hex = "0123456789ABCDEF"
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0x0f])
		}
	}
	return b.String()
}

// subtleEqual compares two secrets without leaking their length difference
// through timing. Neither comparison here is plausibly attackable that way, and
// it costs nothing to not have to have decided that.
func subtleEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
