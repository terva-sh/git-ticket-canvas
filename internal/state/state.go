// Package state holds what the canvas remembers between runs: which stores
// matter to the people using it, and which one each of them had open last.
//
// This is state rather than configuration. The configuration file is written by
// hand, and a tool that rewrites it loses the comments and the ordering
// somebody put there, so nothing here ever touches one. It lives outside every
// repository, because a favorite is a fact about the person rather than about
// the project, and writing one into .tickets would put one person's preferences
// into everybody's clone.
//
// Everything is filed under a user key. A canvas on a desk has one person at
// it and files everything under LocalUser, so today's behaviour is the
// one-person case of the general one rather than a second code path. A canvas
// serving several people files each person's preferences under Subject of
// their identity provider's subject, and one person's favorites are then
// invisible to everybody else.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

// FileName is the state file inside the canvas's own state directory.
const FileName = "state.json"

// LocalUser is the key everything is filed under when nobody has
// authenticated, which is every run of the desk canvas.
const LocalUser = "local"

// Subject returns the key an authenticated person's state is filed under.
//
// The prefix is not decoration. A subject is an arbitrary string the identity
// provider chose, so nothing stops one issuing "local", and an unprefixed key
// would quietly hand that person the desk canvas's favorites. Callers key on
// the subject rather than on an email or a username because both are mutable
// in every provider, and a rename would otherwise strand somebody's state or
// hand it to whoever holds the address next.
func Subject(subject string) string { return "sub:" + subject }

// State is the whole file.
//
// Nothing about permissions belongs in it. A bug in the favorites path must
// not be able to corrupt a grant, and the two have different owners: what is
// here is a preference the person changes by clicking, while a grant is a
// security record the operator owns. TestTheFileHoldsNoPermissionData is what
// keeps that true as fields are added.
type State struct {
	// Version is the file format. It is written so that a later format can be
	// recognized rather than guessed at.
	Version int `json:"version"`
	// Users maps a user key to what that person's canvas remembers. The keys
	// are LocalUser and the results of Subject; nothing else writes one.
	Users map[string]UserState `json:"users,omitempty"`
}

// UserState is what one person's canvas remembers.
//
// Both fields hold resolved absolute store paths, never ids. An id is derived
// from a path relative to a root, so changing --root renames every store at
// once, and a favorite keyed by id would be lost by a flag that was meant to
// change nothing about which stores exist.
type UserState struct {
	// Favorites are store paths, sorted, so the file does not churn.
	Favorites []string `json:"favorites,omitempty"`
	// LastStore is the store path most recently looked at.
	LastStore string `json:"lastStore,omitempty"`
}

// currentVersion is 2: the same file with everything moved under a user key.
//
// Version 1 was one person's favorites and last store at the top level, which
// is what a canvas with one person at it needs and what a canvas serving two
// gets wrong, because the file has no way to say whose they are. Open reads
// one and rewrites it.
const currentVersion = 2

// stored is the file as it is read: the current shape, plus the version 1
// fields that became one person's entry.
type stored struct {
	State
	Favorites []string `json:"favorites,omitempty"`
	LastStore string   `json:"lastStore,omitempty"`
}

// Dir is where the canvas keeps what it remembers between runs: the favorites
// and last-store state, the actor bindings, and the people record.
//
// The resolution is terva's, in packages/envcompat/envcompat.go, because these
// are the same kind of thing on the same machines and two tools inventing two
// conventions is how a person ends up looking in the wrong place.
func Dir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		// Only fatal where nothing else answers. Windows and XDG both have a
		// variable that does not need a home directory at all.
		home = ""
	}
	if dir := dirFor(runtime.GOOS, os.Getenv("XDG_STATE_HOME"), os.Getenv("LOCALAPPDATA"), home); dir != "" {
		return dir, nil
	}
	if err != nil {
		return "", fmt.Errorf("finding the state directory: %w", err)
	}
	return "", errors.New("finding the state directory: no home directory and no state variable is set")
}

// dirFor is the resolution itself, with the platform passed in.
//
// It is an argument rather than runtime.GOOS so that all four branches are
// testable on one machine. The alternative is three of them being untested
// everywhere, which for a path is how a release ships writing to somewhere
// nobody looks.
func dirFor(goos, xdgState, localAppData, home string) string {
	switch goos {
	case "darwin":
		if home != "" {
			return filepath.Join(home, "Library", "Application Support", Product)
		}
	case "windows":
		if localAppData != "" {
			return filepath.Join(localAppData, Product)
		}
	}
	if filepath.IsAbs(xdgState) {
		return filepath.Join(xdgState, Product)
	}
	if home != "" {
		return filepath.Join(home, ".local", "state", Product)
	}
	return ""
}

// LegacyDir is where every platform used to look, and where a canvas that ran
// before this resolution existed left its files.
//
// Nothing here moves them. actors.json is the one file in this directory that
// cannot be reconstructed, and relocating somebody's record of who wrote what
// without being asked is how a record is lost.
func LegacyDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "state", Product), nil
}

// Product names this tool's directory on every platform.
const Product = "git-ticket-canvas"

// Store reads and writes one state file.
//
// It is safe for concurrent use, because the registry writes the last store
// used from whichever request happened to switch stores, and in a canvas
// serving several people those requests are several people's.
type Store struct {
	mu    sync.Mutex
	path  string
	state State
}

// Open reads the state at path, or returns an empty one.
//
// A missing file is somebody's first run and reads as empty. A malformed file
// is a warning and also reads as empty: losing a canvas over a corrupted list
// of favorites is the wrong trade, and the next write repairs it.
//
// A version 1 file is read and rewritten in the current format straight away,
// rather than at the next write. The upgrade is what decides whose the
// favorites were, and leaving the file in the old shape until somebody happens
// to click something means a canvas that read it, served it, and crashed has
// answered that question differently from one that did not.
func Open(path string) (*Store, string) {
	s := &Store{path: path, state: State{Version: currentVersion}}
	data, err := os.ReadFile(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return s, fmt.Sprintf("the canvas state at %s could not be read (%v); starting empty", path, err)
		}
		return s, ""
	}
	var loaded stored
	if err := json.Unmarshal(data, &loaded); err != nil {
		return s, fmt.Sprintf("the canvas state at %s does not parse (%v); starting empty", path, err)
	}

	upgrading := loaded.Version < currentVersion
	s.state = loaded.State
	if upgrading && (len(loaded.Favorites) > 0 || loaded.LastStore != "") {
		// A version 1 file was written by a canvas on somebody's desk, so the
		// person it belonged to is the person the desk canvas is still serving.
		if s.state.Users == nil {
			s.state.Users = make(map[string]UserState, 1)
		}
		s.state.Users[LocalUser] = UserState{Favorites: loaded.Favorites, LastStore: loaded.LastStore}
	}
	s.state.Version = currentVersion
	if !upgrading {
		return s, ""
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.saveLocked(); err != nil {
		// The state was read and is being served; only the rewrite failed. Say
		// so and carry on, because refusing to run over a file that was read
		// perfectly well would be the wrong trade.
		return s, fmt.Sprintf("the canvas state at %s was read but could not be rewritten in the current format (%v)", path, err)
	}
	return s, ""
}

// Snapshot returns a copy of what one person's canvas remembers.
func (s *Store) Snapshot(user string) UserState {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.state.Users[user]
	out.Favorites = append([]string(nil), out.Favorites...)
	return out
}

// Favorite reports whether a path is one of this person's favorites.
func (s *Store) Favorite(user, path string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return indexOf(s.state.Users[user].Favorites, path) >= 0
}

// SetFavorite marks or unmarks a path for one person and saves.
func (s *Store) SetFavorite(user, path string, favorite bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	held := s.state.Users[user]
	at := indexOf(held.Favorites, path)
	switch {
	case favorite && at < 0:
		held.Favorites = append(held.Favorites, path)
		sort.Strings(held.Favorites)
	case !favorite && at >= 0:
		held.Favorites = append(held.Favorites[:at], held.Favorites[at+1:]...)
	default:
		return nil
	}
	s.setLocked(user, held)
	return s.saveLocked()
}

// SetLastStore records the store one person most recently looked at, saving
// only when it changed. That makes it one write per switch rather than one per
// request.
func (s *Store) SetLastStore(user, path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	held := s.state.Users[user]
	if held.LastStore == path {
		return nil
	}
	held.LastStore = path
	s.setLocked(user, held)
	return s.saveLocked()
}

// Warm is the paths worth opening at startup for one person: the store last
// used first, because it is the one most likely to be wanted, then the
// favorites.
func (s *Store) Warm(user string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	held := s.state.Users[user]
	var warm []string
	if held.LastStore != "" {
		warm = append(warm, held.LastStore)
	}
	for _, path := range held.Favorites {
		if path != held.LastStore {
			warm = append(warm, path)
		}
	}
	return warm
}

// setLocked files one person's state, dropping the entry when it is empty so
// that a user who unmarked their last favorite does not leave a key behind. A
// canvas that serves people also records who has used it, and an entry that
// says nothing is not worth keeping that record for.
func (s *Store) setLocked(user string, held UserState) {
	if len(held.Favorites) == 0 && held.LastStore == "" {
		delete(s.state.Users, user)
		return
	}
	if s.state.Users == nil {
		s.state.Users = make(map[string]UserState, 1)
	}
	s.state.Users[user] = held
}

func indexOf(paths []string, path string) int {
	for i, have := range paths {
		if have == path {
			return i
		}
	}
	return -1
}

// saveLocked writes the file through a temporary name in the same directory.
//
// An interrupted write then leaves the previous state rather than half of the
// next one, which matters because this file is written while somebody is
// clicking around and is read at every startup.
func (s *Store) saveLocked() error {
	if s.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	temp, err := os.CreateTemp(filepath.Dir(s.path), strings.TrimSuffix(FileName, ".json")+"-*.tmp")
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
	return os.Rename(name, s.path)
}

// InUse is the directory this canvas will actually keep things in, and a note
// where that is not the conventional one for the platform.
//
// A canvas that ran before the per-platform resolution existed left files in
// ~/.local/state on macOS and Windows too. Those are found and kept using
// rather than moved: actors.json is the one file here that cannot be
// reconstructed, and relocating somebody's record of who wrote what without
// being asked is how a record is lost. The note is so that the choice is
// visible rather than mysterious.
func InUse() (dir, note string, err error) {
	conventional, err := Dir()
	if err != nil {
		return "", "", err
	}
	if _, statErr := os.Stat(conventional); statErr == nil {
		return conventional, "", nil
	}
	legacy, legacyErr := LegacyDir()
	if legacyErr != nil || legacy == conventional {
		return conventional, "", nil
	}
	if _, statErr := os.Stat(legacy); statErr != nil {
		return conventional, "", nil
	}
	return legacy, fmt.Sprintf(
		"keeping state in %s, where an earlier canvas left it; %s is the conventional place on this platform, "+
			"and nothing moves files between them on its own", legacy, conventional), nil
}
