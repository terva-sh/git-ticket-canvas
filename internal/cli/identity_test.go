package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/config"
	"github.com/terva-sh/git-ticket-canvas/internal/discover"
)

// A ticket store is a git repository, so its bytes are whatever the last person
// who could land a commit wrote. They decide nothing about who the canvas
// trusts to log in.
//
// The canvas is more exposed to this than most tools, because the multi-store
// design deliberately lets a store declare further stores in that same file. So
// the store here declares both: a child, which is honoured, and an identity
// provider and a grant table, which are not. The child arriving is what makes
// the test mean something, because it proves the file was read.
func TestIdentityIsNeverReadFromAStoresOwnConfiguration(t *testing.T) {
	parent := storeIn(t)
	child := filepath.Join(parent, "inner")
	if err := os.MkdirAll(child, 0o755); err != nil {
		t.Fatal(err)
	}
	initStore(t, child)

	hostile := "\n" + strings.Join([]string{
		"identity:",
		"  issuer: https://attacker.example.com",
		"  clientId: attacker",
		"  baseUrl: https://attacker.example.com",
		"roles:",
		`  "Everyone": writer`,
		"canvas:",
		"  children:",
		"    - path: inner",
		"      name: inner",
		"",
	}, "\n")
	appendToStoreConfig(t, parent, hostile)

	// The file is read, and the part of it that is the canvas's business is
	// honoured.
	declared := discover.Declared(parent)
	if len(declared.Stores) != 1 || declared.Stores[0].Name != "inner" {
		t.Fatalf("the declared child was not found: %+v (%v)", declared.Stores, declared.Warnings)
	}

	// And none of the rest of it reached the configuration.
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load("", "", []string{parent}, cwd)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Identity.Configured() {
		t.Errorf("a store's own configuration named an identity provider: %+v", cfg.Identity)
	}
	if len(cfg.Roles) != 0 {
		t.Errorf("a store's own configuration granted roles: %+v", cfg.Roles)
	}
	table, _, err := cfg.Grants()
	if err != nil {
		t.Fatal(err)
	}
	if got := table.Resources(); len(got) != 0 {
		t.Errorf("a store's own configuration produced grants: %v", got)
	}

	// The end of it: a served canvas pointed at that store still refuses to
	// start, because nothing the store said counts as a provider.
	err = Run(Served, []string{"git-ticket-canvas-server", "-store", parent})
	if err == nil || !strings.Contains(err.Error(), "identity provider") {
		t.Errorf("the served canvas started from a store's own identity block: %v", err)
	}
}

// The desk canvas shares the configuration file and ignores the provider in it,
// rather than failing or quietly honouring it.
func TestTheDeskCanvasIgnoresAConfiguredProvider(t *testing.T) {
	dir := t.TempDir()
	store := storeIn(t)
	configFile := filepath.Join(dir, "canvas.yml")
	body := strings.Join([]string{
		"identity:",
		"  issuer: https://id.example.com",
		"  clientId: canvas",
		"  baseUrl: https://canvas.example.com",
		"stores:",
		"  - name: only",
		"    path: " + store,
		"    roles:",
		`      "Brokkr Staff": reader`,
		"",
	}, "\n")
	if err := os.WriteFile(configFile, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(configFile, "", nil, cwd)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Identity.Configured() {
		t.Fatal("the canvas's own configuration file did not carry the provider")
	}
	if err := cfg.Identity.Validate(); err != nil {
		t.Fatalf("a complete provider was refused: %v", err)
	}

	// The desk canvas builds no sign-on from it and no grant table, so its
	// registry sees the nil Access that means one person and every store.
	wrap, gate, bound, _, err := signOn(Desk, cfg, filepath.Join(dir, "actors.json"), filepath.Join(dir, "people.json"))
	if err != nil {
		t.Fatal(err)
	}
	if bound != nil {
		t.Error("the desk canvas opened an actor record; it resolves one when a store opens")
	}
	if gate != nil {
		t.Error("the desk canvas built a grant table from a shared configuration file")
	}
	if wrap == nil {
		t.Error("the desk canvas has no handler wrapper at all")
	}
}

// A served canvas with a complete provider builds its sign-on without contacting
// the issuer, so a provider that is restarting does not stop the canvas coming
// up.
func TestAServedCanvasBuildsSignOnWithoutContactingTheIssuer(t *testing.T) {
	cfg := config.Config{
		Identity: config.Identity{
			Issuer:   "https://id.example.invalid",
			ClientID: "canvas",
			BaseURL:  "https://canvas.example.invalid",
		},
		Stores: []config.Store{{
			Name: "ledger", Path: t.TempDir(),
			Roles: map[string]string{"Brokkr Staff": "reader"},
		}},
	}
	dir := t.TempDir()
	wrap, gate, bound, _, err := signOn(Served, cfg, filepath.Join(dir, "actors.json"), filepath.Join(dir, "people.json"))
	if err != nil {
		t.Fatalf("the sign-on could not be built against an unreachable issuer: %v", err)
	}
	if gate == nil || wrap == nil || bound == nil {
		t.Fatal("a served canvas built no gate")
	}
}

func appendToStoreConfig(t *testing.T, store, text string) {
	t.Helper()
	path := filepath.Join(store, discover.StoreDir, "config.yml")
	existing, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(existing, []byte(text)...), 0o600); err != nil {
		t.Fatal(err)
	}
}
