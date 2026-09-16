// Package actors records which authenticated subject writes under which actor
// id, on which store.
//
// A person types whatever actor id they like, so the integrity of a store's
// `updated_by` field cannot come from constraining what they may type. It comes
// from two rules that do not: an id belongs to one subject per store with the
// first claim holding, and every claim and every change to one is recorded.
//
// Together those mean two people cannot both write as `human:drew`, nobody can
// take over an id somebody else has been writing under, and the canvas can
// always answer which subject was writing as a given actor on a given date.
//
// What they do not prevent is somebody claiming the id of a person who has
// never signed in to this canvas, because there is no binding to conflict with.
// An operator who needs more turns on the store's declared actors as an
// allowlist, which narrows the choice to ids the store already names.
//
// This is deliberately not in the per-user state file. A bug in the favorites
// path must not be able to rewrite who wrote what, and the two have different
// owners: a favorite is a preference its owner changes by clicking, and this is
// the record standing behind a store's history.
package actors

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

// FileName is the record's file inside the canvas's own state directory.
const FileName = "actors.json"

const currentVersion = 1

// Binding is one actor id, claimed on one store, by one subject.
type Binding struct {
	Store   string    `json:"store"`
	Actor   string    `json:"actor"`
	Subject string    `json:"subject"`
	Since   time.Time `json:"since"`
}

// Event is one entry in the record of how the bindings got this way.
//
// It is append-only. An administrator who can rewrite the record of their own
// claims has a record in name, and the whole reason this file exists is that a
// store's `updated_by` field has nothing else standing behind it.
type Event struct {
	At      time.Time `json:"at"`
	Store   string    `json:"store"`
	Subject string    `json:"subject"`
	Actor   string    `json:"actor"`
	// Replaced is what this subject was writing under on this store before,
	// empty on a first claim. The old binding is not released: it stays bound
	// to the same subject, so that changing your actor does not hand your
	// previous name to somebody else.
	Replaced string `json:"replaced,omitempty"`
}

// file is the whole record as it is stored.
type file struct {
	Version  int       `json:"version"`
	Bindings []Binding `json:"bindings,omitempty"`
	Events   []Event   `json:"events,omitempty"`
}

// Bindings is the record, held in memory and written through on every change.
type Bindings struct {
	mu   sync.Mutex
	path string
	now  func() time.Time
	// byActor answers who holds an id, and current answers what somebody is
	// writing as. Two maps rather than a scan, because the first is consulted
	// on every claim and the second on every request that shows an actor.
	byActor map[string]Binding
	current map[string]string
	events  []Event
}

// ErrTaken is the refusal that keeps two people from writing under one name.
var ErrTaken = errors.New("that actor id is already bound to somebody else on this store")

// Open reads the record at path, or returns an empty one.
//
// Unlike the favorites file, a record that will not parse is not started over.
// Losing a canvas over a corrupted list of favorites is the wrong trade; losing
// the only account of who wrote what and carrying on as though nobody had ever
// claimed anything is a different kind of wrong, because the next person to
// claim `human:drew` would succeed.
func Open(path string) (*Bindings, error) {
	b := &Bindings{
		path: path, now: time.Now,
		byActor: make(map[string]Binding), current: make(map[string]string),
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return b, nil
		}
		return nil, fmt.Errorf("the actor record at %s could not be read: %w", path, err)
	}
	var loaded file
	if err := json.Unmarshal(data, &loaded); err != nil {
		return nil, fmt.Errorf("the actor record at %s does not parse (%w); "+
			"it is the only account of who wrote under which actor id, so it is not started over", path, err)
	}
	if loaded.Version > currentVersion {
		return nil, fmt.Errorf("the actor record at %s is version %d and this canvas understands %d",
			path, loaded.Version, currentVersion)
	}
	for _, held := range loaded.Bindings {
		b.byActor[key(held.Store, held.Actor)] = held
	}
	// The current actor is the latest claim in the record, which is why the
	// events are replayed rather than a "current" flag being stored: one place
	// holds the truth, and it is the append-only one.
	for _, event := range loaded.Events {
		b.current[key(event.Store, event.Subject)] = event.Actor
	}
	b.events = loaded.Events
	return b, nil
}

// Claim binds an actor id to a subject on a store, first claim holding.
//
// Claiming what you already hold is not a change and not an error, because that
// is what a browser re-sending its own actor on every load is.
func (b *Bindings) Claim(store, actor, subject string) error {
	if store == "" || actor == "" || subject == "" {
		return errors.New("a binding needs a store, an actor id, and a subject")
	}
	b.mu.Lock()
	defer b.mu.Unlock()

	if held, bound := b.byActor[key(store, actor)]; bound {
		if held.Subject != subject {
			return fmt.Errorf("%w: %q has been writing as %s on %s since %s",
				ErrTaken, "somebody else", actor, store, held.Since.UTC().Format(time.RFC3339))
		}
		// Already theirs. Make it their current one again if they had moved
		// away from it, and record that as the change it is.
		if b.current[key(store, subject)] == actor {
			return nil
		}
	}

	replaced := b.current[key(store, subject)]
	now := b.now()
	if _, bound := b.byActor[key(store, actor)]; !bound {
		b.byActor[key(store, actor)] = Binding{Store: store, Actor: actor, Subject: subject, Since: now}
	}
	b.current[key(store, subject)] = actor
	b.events = append(b.events, Event{
		At: now, Store: store, Subject: subject, Actor: actor, Replaced: replaced,
	})
	return b.saveLocked()
}

// Of is what a subject is currently writing as on a store.
func (b *Bindings) Of(store, subject string) (string, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	actor, ok := b.current[key(store, subject)]
	return actor, ok
}

// SubjectOf is who holds an actor id on a store. It is the question the record
// exists to answer: a store shows `human:drew`, and this says whose that was.
func (b *Bindings) SubjectOf(store, actor string) (string, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	held, ok := b.byActor[key(store, actor)]
	return held.Subject, ok
}

// Held is every binding, sorted, for an operator reading the record.
func (b *Bindings) Held() []Binding {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]Binding, 0, len(b.byActor))
	for _, held := range b.byActor {
		out = append(out, held)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Store != out[j].Store {
			return out[i].Store < out[j].Store
		}
		return out[i].Actor < out[j].Actor
	})
	return out
}

// History is every claim and every change, oldest first.
func (b *Bindings) History() []Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]Event(nil), b.events...)
}

func key(store, second string) string { return store + "\x00" + second }

// saveLocked writes the record through a temporary name in the same directory,
// so an interrupted write leaves the previous record rather than half of it.
func (b *Bindings) saveLocked() error {
	if b.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(b.path), 0o700); err != nil {
		return err
	}
	held := make([]Binding, 0, len(b.byActor))
	for _, one := range b.byActor {
		held = append(held, one)
	}
	sort.Slice(held, func(i, j int) bool {
		if held[i].Store != held[j].Store {
			return held[i].Store < held[j].Store
		}
		return held[i].Actor < held[j].Actor
	})
	data, err := json.MarshalIndent(file{Version: currentVersion, Bindings: held, Events: b.events}, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	temp, err := os.CreateTemp(filepath.Dir(b.path), strings.TrimSuffix(FileName, ".json")+"-*.tmp")
	if err != nil {
		return err
	}
	name := temp.Name()
	defer os.Remove(name)
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(name, b.path)
}
