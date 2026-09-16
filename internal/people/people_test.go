package people

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func openIn(t *testing.T) (*Directory, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), FileName)
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
	d.now = func() time.Time { at = at.Add(time.Hour); return at }
	return d, path
}

// The first login fixes when somebody arrived; every one after moves only when
// they were last here. Otherwise "how long has this account existed" and "is
// this account still in use" collapse into one unanswerable field.
func TestFirstSeenIsFixedAndLastSeenMoves(t *testing.T) {
	d, _ := openIn(t)
	for i := 0; i < 3; i++ {
		if err := d.Seen(Person{Subject: "sub-a", Name: "Drew Short"}); err != nil {
			t.Fatal(err)
		}
	}
	all := d.All()
	if len(all) != 1 {
		t.Fatalf("three logins produced %d people", len(all))
	}
	if !all[0].FirstSeen.Before(all[0].LastSeen) {
		t.Errorf("first and last seen are %v and %v", all[0].FirstSeen, all[0].LastSeen)
	}
	if all[0].FirstSeen.Hour() != 10 {
		t.Errorf("first seen moved to %v", all[0].FirstSeen)
	}
}

// Name, email and groups are what the provider last said, so a rename or a
// group change is reflected rather than accumulated.
func TestTheRecordHoldsWhatTheProviderLastSaid(t *testing.T) {
	d, _ := openIn(t)
	if err := d.Seen(Person{Subject: "sub-a", Name: "Drew", Groups: []string{"Staff"}}); err != nil {
		t.Fatal(err)
	}
	if err := d.Seen(Person{Subject: "sub-a", Name: "Drew Short", Groups: []string{"Staff", "Ledger Admin"}}); err != nil {
		t.Fatal(err)
	}
	got := d.All()[0]
	if got.Name != "Drew Short" || strings.Join(got.Groups, ",") != "Staff,Ledger Admin" {
		t.Errorf("record = %+v", got)
	}
}

// Everything keys on the subject, so two people whose display names match are
// two people, and one person who renames is one person.
func TestPeopleAreKeyedOnSubject(t *testing.T) {
	d, _ := openIn(t)
	for _, p := range []Person{
		{Subject: "sub-a", Name: "Drew Short"},
		{Subject: "sub-b", Name: "Drew Short"},
	} {
		if err := d.Seen(p); err != nil {
			t.Fatal(err)
		}
	}
	if got := len(d.All()); got != 2 {
		t.Errorf("two subjects sharing a name produced %d people", got)
	}
}

// Most recently seen first, which is the order somebody reading the list wants.
func TestTheListLeadsWithWhoWasHereLast(t *testing.T) {
	d, _ := openIn(t)
	for _, subject := range []string{"sub-a", "sub-b", "sub-c"} {
		if err := d.Seen(Person{Subject: subject}); err != nil {
			t.Fatal(err)
		}
	}
	all := d.All()
	if all[0].Subject != "sub-c" || all[2].Subject != "sub-a" {
		t.Errorf("order = %v", []string{all[0].Subject, all[1].Subject, all[2].Subject})
	}
}

func TestTheRecordSurvivesARestart(t *testing.T) {
	d, path := openIn(t)
	if err := d.Seen(Person{Subject: "sub-a", Name: "Drew Short", Email: "drew@example.com"}); err != nil {
		t.Fatal(err)
	}
	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	all := again.All()
	if len(all) != 1 || all[0].Email != "drew@example.com" {
		t.Errorf("after a restart the record holds %+v", all)
	}
}

// Silently forgetting who has been here is the one behaviour an account of
// people must not have. This is the actor record's rule, not the favorites'.
func TestACorruptedRecordIsNotStartedOver(t *testing.T) {
	path := filepath.Join(t.TempDir(), FileName)
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil {
		t.Error("a corrupted people record was replaced with an empty one")
	}
	if err := os.WriteFile(path, []byte(`{"version":99}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil {
		t.Error("a record from a newer canvas was accepted and would have been overwritten")
	}
}

// Names and email addresses live here, which is more than the opaque subjects
// the rest of the state directory holds.
func TestTheRecordKeepsItsFileMode(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("file modes are not enforced on Windows")
	}
	d, path := openIn(t)
	if err := d.Seen(Person{Subject: "sub-a"}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Errorf("people record mode = %v, want 0600", perm)
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

func TestAPersonWithNoSubjectIsRefused(t *testing.T) {
	d, _ := openIn(t)
	if err := d.Seen(Person{Name: "Nobody"}); err == nil {
		t.Error("a person with no subject was recorded")
	}
}
