// Package people records who has signed in.
//
// Before this existed, somebody who logged in and read a board left no trace at
// all: they appeared in actors.json only if they happened to choose an actor,
// and in the state file only if they marked a favorite, and both of those store
// an opaque subject and nothing else. The login log line is the rest of the
// record, and a log is not something you can ask questions of.
//
// This is deliberately a user directory, which docs/serving-a-canvas.md said the
// canvas did not have. Granting to a person rather than to a group needs one,
// and building it as a side effect of logging in is how it stays true without
// anybody maintaining it.
package people

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// FileName is the record, beside the actor bindings and the favorites.
const FileName = "people.json"

const currentVersion = 1

// Person is one account, as of the last time it signed in.
type Person struct {
	// Subject is the identity provider's stable id, and the key. Everything
	// else on this record is what that subject last presented and may change
	// between logins without being a different person.
	Subject string `json:"subject"`
	Name    string `json:"name,omitempty"`
	Email   string `json:"email,omitempty"`
	// Groups is what the token carried at the most recent login.
	//
	// This is the field that earns the record its keep. "They signed in on
	// Tuesday carrying these three groups, none of which granted anything"
	// diagnoses the case no per-caller view can reach: a store invisible to
	// everybody because every grant on it is misspelled.
	Groups    []string  `json:"groups,omitempty"`
	FirstSeen time.Time `json:"firstSeen"`
	LastSeen  time.Time `json:"lastSeen"`
}

type stored struct {
	Version int      `json:"version"`
	People  []Person `json:"people"`
}

// Directory is every person this canvas has seen.
type Directory struct {
	mu   sync.Mutex
	path string
	by   map[string]Person
	now  func() time.Time
}

// Open reads the record, or starts an empty one.
//
// A file that will not parse is an error rather than a fresh start, as the
// actor record is and unlike the favorites file. Silently forgetting who has
// been here is the one behaviour an account of people must not have, and this
// is what per-person grants will later be written against.
func Open(path string) (*Directory, error) {
	d := &Directory{path: path, by: map[string]Person{}, now: time.Now}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return d, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading the people record: %w", err)
	}
	var held stored
	if err := json.Unmarshal(data, &held); err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	if held.Version > currentVersion {
		return nil, fmt.Errorf(
			"%s was written by a newer canvas (version %d); this one understands %d, "+
				"and writing over it would drop what it holds", path, held.Version, currentVersion)
	}
	for _, person := range held.People {
		if person.Subject != "" {
			d.by[person.Subject] = person
		}
	}
	return d, nil
}

// Seen records a login. The first one sets FirstSeen and every one after moves
// LastSeen and replaces what the provider last said about them.
func (d *Directory) Seen(p Person) error {
	if strings.TrimSpace(p.Subject) == "" {
		return errors.New("a person with no subject cannot be recorded")
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	at := d.now().UTC()
	p.FirstSeen, p.LastSeen = at, at
	if had, known := d.by[p.Subject]; known {
		p.FirstSeen = had.FirstSeen
	}
	d.by[p.Subject] = p
	return d.save()
}

// All is everybody, most recently seen first.
func (d *Directory) All() []Person {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.list()
}

func (d *Directory) list() []Person {
	out := make([]Person, 0, len(d.by))
	for _, person := range d.by {
		out = append(out, person)
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].LastSeen.Equal(out[j].LastSeen) {
			return out[i].LastSeen.After(out[j].LastSeen)
		}
		return out[i].Subject < out[j].Subject
	})
	return out
}

// save writes the whole record through a temp file and a rename, so a crash
// leaves either the old record or the new one and never half of either.
func (d *Directory) save() error {
	if d.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(d.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(stored{Version: currentVersion, People: d.list()}, "", "  ")
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(d.path), filepath.Base(d.path)+".*.tmp")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(append(data, '\n')); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(name, d.path)
}
