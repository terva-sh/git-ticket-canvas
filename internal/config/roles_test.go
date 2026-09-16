package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/terva-sh/git-ticket-canvas/internal/grants"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "canvas.yml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// The shape the design writes out, read back as a grant table.
func TestGrantsAreReadFromTheCanvasConfiguration(t *testing.T) {
	dir := t.TempDir()
	path := writeConfig(t, strings.Join([]string{
		"roles:",
		`  "Brokkr Staff": reader`,
		"stores:",
		"  - name: ledger",
		"    path: " + dir,
		"    roles:",
		`      "Brokkr Ledger Admin": writer`,
		"    honourGroups: [\"Brokkr Staff\"]",
		"  - name: private",
		"    path: " + dir + "/private",
		"",
	}, "\n"))
	cfg, err := ParseFile(path)
	if err != nil {
		t.Fatal(err)
	}
	table, notes, err := cfg.Grants()
	if err != nil {
		t.Fatal(err)
	}

	admin := grants.Principal{Subject: "a", Groups: []string{"Brokkr Ledger Admin"}}
	staff := grants.Principal{Subject: "s", Groups: []string{"Brokkr Staff"}}
	if !grants.Holds(table.Roles(admin, "ledger"), grants.Writer) {
		t.Error("the writer grant was lost")
	}
	if !grants.Holds(table.Roles(staff, "ledger"), grants.Reader) {
		t.Error("the honoured shared group was lost")
	}
	// The second store names no roles, so it is private to everybody including
	// the people who can read the first.
	for _, who := range []grants.Principal{admin, staff} {
		if table.Roles(who, "private") != nil {
			t.Errorf("a store that grants nothing was readable by %v", who.Groups)
		}
	}
	// And that is said once, because an operator who added a repository and
	// cannot see it would otherwise be looking for a bug.
	if !strings.Contains(strings.Join(notes, "\n"), `store "private" grants no role`) {
		t.Errorf("notes = %v, want the private store reported", notes)
	}
}

// A store the operator did not name gets an id derived from a hash of its path.
// A grant could only be written against a value nobody chose and every move
// changes, so naming roles on one is refused rather than silently ignored.
func TestAStoreWithNoNameCannotBeGranted(t *testing.T) {
	dir := t.TempDir()
	cfg := Config{Stores: []Store{{
		Name: "derived-id", Derived: true, Path: dir,
		Roles: map[string]string{"Brokkr Staff": "reader"},
	}}}
	_, _, err := cfg.Grants()
	if err == nil || !strings.Contains(err.Error(), "has no name") {
		t.Errorf("a derived store with roles was accepted: %v", err)
	}
}

// A canvas that grants nothing serves nothing, which is correct and worth
// saying out loud once rather than leaving somebody to find an empty picker.
func TestACanvasThatGrantsNothingSaysSo(t *testing.T) {
	cfg := Config{Stores: []Store{{Name: "ledger", Path: t.TempDir()}}}
	table, notes, err := cfg.Grants()
	if err != nil {
		t.Fatal(err)
	}
	if table.Roles(grants.Principal{Groups: []string{"anything"}}, "ledger") != nil {
		t.Error("an ungranted store was readable")
	}
	if !strings.Contains(strings.Join(notes, "\n"), "serves nothing to anybody") {
		t.Errorf("notes = %v, want it said that nothing is granted", notes)
	}
}

// A role that is not a role is a configuration mistake, and the refusal names
// the store, the group, and the alternatives.
func TestAnUnknownRoleIsRefusedWithItsLocation(t *testing.T) {
	cfg := Config{Stores: []Store{{
		Name: "ledger", Path: t.TempDir(),
		Roles: map[string]string{"Brokkr Staff": "read"},
	}}}
	_, _, err := cfg.Grants()
	if err == nil {
		t.Fatal("an unknown role was accepted")
	}
	for _, want := range []string{"ledger", "Brokkr Staff", "reader, writer, admin"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("%v does not mention %q", err, want)
		}
	}
}

// The configuration file rejects a key it does not know, so `role:` written for
// `roles:` fails at startup rather than serving a canvas that grants nobody
// anything and says nothing about why.
func TestAMisspelledGrantKeyIsRefused(t *testing.T) {
	path := writeConfig(t, strings.Join([]string{
		"stores:",
		"  - name: ledger",
		"    path: " + t.TempDir(),
		"    role:",
		`      "Brokkr Staff": reader`,
		"",
	}, "\n"))
	if _, err := ParseFile(path); err == nil {
		t.Error("a misspelled grant key was accepted, so the store would have been silently private")
	}
}
