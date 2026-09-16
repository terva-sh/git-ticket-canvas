package actors

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func openIn(t *testing.T) (*Bindings, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), FileName)
	b, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
	b.now = func() time.Time { at = at.Add(time.Minute); return at }
	return b, path
}

// First claim holds. Two people cannot both write as human:drew, and nobody can
// take over an id another has been writing under.
func TestAnActorIDBelongsToOneSubject(t *testing.T) {
	b, _ := openIn(t)
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	err := b.Claim("ledger", "human:drew", "subject-b")
	if err == nil {
		t.Fatal("a second person claimed an id somebody was already writing under")
	}
	if !strings.Contains(err.Error(), "human:drew") {
		t.Errorf("the refusal does not name the id: %v", err)
	}
	if who, _ := b.SubjectOf("ledger", "human:drew"); who != "subject-a" {
		t.Errorf("the id moved to %q", who)
	}
	// Claiming what you already hold is what a browser re-sending its own actor
	// on every load is, and it is neither a change nor an error.
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	if got := len(b.History()); got != 1 {
		t.Errorf("history has %d entries, want the one real claim", got)
	}
}

// The binding is per store, because the same person reasonably writes as
// different actors in different repositories.
func TestABindingIsPerStore(t *testing.T) {
	b, _ := openIn(t)
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	// Somebody else may hold the same id somewhere else.
	if err := b.Claim("website", "human:drew", "subject-b"); err != nil {
		t.Fatalf("an id taken on one store was refused on another: %v", err)
	}
	// And one person may write as different names in two places.
	if err := b.Claim("website", "human:d.short", "subject-a"); err != nil {
		t.Fatal(err)
	}
	if got, _ := b.Of("ledger", "subject-a"); got != "human:drew" {
		t.Errorf("on ledger subject-a writes as %q", got)
	}
	if got, _ := b.Of("website", "subject-a"); got != "human:d.short" {
		t.Errorf("on website subject-a writes as %q", got)
	}
}

// Changing your actor does not release the old one. Otherwise the name your
// history is under could be claimed by somebody else, who would then inherit
// the look of it.
func TestChangingAnActorDoesNotReleaseTheOldOne(t *testing.T) {
	b, _ := openIn(t)
	for _, id := range []string{"human:drew", "human:drew-2"} {
		if err := b.Claim("ledger", id, "subject-a"); err != nil {
			t.Fatal(err)
		}
	}
	if got, _ := b.Of("ledger", "subject-a"); got != "human:drew-2" {
		t.Errorf("the current actor is %q, want the newer one", got)
	}
	if err := b.Claim("ledger", "human:drew", "subject-b"); err == nil {
		t.Fatal("somebody else took over an id after its holder moved away from it")
	}
	// The holder may go back to it, and that is a change like any other.
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	if got, _ := b.Of("ledger", "subject-a"); got != "human:drew" {
		t.Errorf("the current actor is %q after moving back", got)
	}
}

// The record is what makes a store's updated_by field mean anything: it answers
// which subject was writing as a given actor, and when that changed.
func TestEveryClaimAndChangeIsRecorded(t *testing.T) {
	b, path := openIn(t)
	for _, c := range []struct{ store, actor, subject string }{
		{"ledger", "human:drew", "subject-a"},
		{"ledger", "human:robin", "subject-b"},
		{"ledger", "human:drew-2", "subject-a"},
	} {
		if err := b.Claim(c.store, c.actor, c.subject); err != nil {
			t.Fatal(err)
		}
	}

	history := b.History()
	if len(history) != 3 {
		t.Fatalf("history has %d entries, want three", len(history))
	}
	// The change says what it replaced, so reading a store's history backwards
	// does not need the whole file replayed to know when a name changed hands.
	if history[2].Replaced != "human:drew" || history[2].Actor != "human:drew-2" {
		t.Errorf("the change reads %+v", history[2])
	}
	if history[0].Replaced != "" {
		t.Errorf("a first claim says it replaced %q", history[0].Replaced)
	}
	for i, event := range history {
		if event.At.IsZero() || event.Subject == "" {
			t.Errorf("entry %d is incomplete: %+v", i, event)
		}
	}

	// And it survives a restart, which is the only thing that makes it a record
	// rather than a session's memory.
	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(again.History()) != 3 {
		t.Errorf("the record did not survive a restart: %+v", again.History())
	}
	if who, _ := again.SubjectOf("ledger", "human:drew"); who != "subject-a" {
		t.Errorf("after a restart human:drew belongs to %q", who)
	}
	if got, _ := again.Of("ledger", "subject-a"); got != "human:drew-2" {
		t.Errorf("after a restart subject-a writes as %q", got)
	}
}

// Nothing here knows about grants, which is what makes the binding survive one
// being revoked: there is no path by which revoking access could release a name.
func TestABindingSurvivesEverythingThatIsNotAClaim(t *testing.T) {
	b, path := openIn(t)
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	// Whatever a revocation does, it does not touch this file: reopening it is
	// the strongest thing a revocation could manage, and the binding is still
	// there afterwards.
	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := again.Claim("ledger", "human:drew", "subject-b"); err == nil {
		t.Fatal("re-granting somebody else freed the revoked person's actor id")
	}
	if who, _ := again.SubjectOf("ledger", "human:drew"); who != "subject-a" {
		t.Errorf("human:drew belongs to %q", who)
	}
}

// A record that will not parse stops the canvas rather than starting over.
//
// This is the opposite of the favorites file, and deliberately: losing a canvas
// over a corrupted list of favorites is the wrong trade, and carrying on as
// though nobody had ever claimed an actor id would let the next person claim
// somebody else's name.
func TestACorruptedRecordIsNotStartedOver(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil {
		t.Error("a corrupted actor record was silently replaced with an empty one")
	}

	// A record from a later version is refused for the same reason: what it
	// holds cannot be read, and writing over it would drop it.
	if err := os.WriteFile(path, []byte(`{"version":99}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil {
		t.Error("a record from a newer canvas was accepted and would have been overwritten")
	}
}

func TestTheRecordKeepsItsFileMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("file modes are not enforced on Windows")
	}
	b, path := openIn(t)
	if err := b.Claim("ledger", "human:drew", "subject-a"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("actor record mode = %v, want 0600", perm)
	}
	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("a temporary file was left behind: %s", e.Name())
		}
	}
}

func TestAnIncompleteClaimIsRefused(t *testing.T) {
	b, _ := openIn(t)
	for _, c := range [][3]string{{"", "a", "s"}, {"store", "", "s"}, {"store", "a", ""}} {
		if err := b.Claim(c[0], c[1], c[2]); err == nil {
			t.Errorf("Claim(%q, %q, %q) was accepted", c[0], c[1], c[2])
		}
	}
}
