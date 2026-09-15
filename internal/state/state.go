// Package state holds what the canvas remembers between runs: which stores
// matter to the person using it, and which one they had open last.
//
// This is state rather than configuration. The configuration file is written by
// hand, and a tool that rewrites it loses the comments and the ordering
// somebody put there, so nothing here ever touches one. It lives outside every
// repository, because a favorite is a fact about the person rather than about
// the project, and writing one into .tickets would put one person's preferences
// into everybody's clone.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// FileName is the state file inside the canvas's own state directory.
const FileName = "state.json"

// State is what one person's canvas remembers.
//
// Both fields hold resolved absolute store paths, never ids. An id is derived
// from a path relative to a root, so changing --root renames every store at
// once, and a favorite keyed by id would be lost by a flag that was meant to
// change nothing about which stores exist.
type State struct {
	// Version is the file format. It is written so that a later format can be
	// recognized rather than guessed at.
	Version int `json:"version"`
	// Favorites are store paths, sorted, so the file does not churn.
	Favorites []string `json:"favorites,omitempty"`
	// LastStore is the store path most recently looked at.
	LastStore string `json:"lastStore,omitempty"`
}

const currentVersion = 1

// Dir is where the state file lives.
//
// XDG_STATE_HOME when it is set to an absolute path, and ~/.local/state
// otherwise, which is what the specification says and what every other tool on
// the machine does.
func Dir() (string, error) {
	if dir := os.Getenv("XDG_STATE_HOME"); filepath.IsAbs(dir) {
		return filepath.Join(dir, "git-ticket-canvas"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("finding the state directory: %w", err)
	}
	return filepath.Join(home, ".local", "state", "git-ticket-canvas"), nil
}

// Store reads and writes one state file.
//
// It is safe for concurrent use, because the registry writes the last store
// used from whichever request happened to switch stores.
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
func Open(path string) (*Store, string) {
	s := &Store{path: path, state: State{Version: currentVersion}}
	data, err := os.ReadFile(path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return s, fmt.Sprintf("the canvas state at %s could not be read (%v); starting empty", path, err)
		}
		return s, ""
	}
	var loaded State
	if err := json.Unmarshal(data, &loaded); err != nil {
		return s, fmt.Sprintf("the canvas state at %s does not parse (%v); starting empty", path, err)
	}
	loaded.Version = currentVersion
	s.state = loaded
	return s, ""
}

// Snapshot returns a copy of the state.
func (s *Store) Snapshot() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.state
	out.Favorites = append([]string(nil), s.state.Favorites...)
	return out
}

// Favorite reports whether a path is a favorite.
func (s *Store) Favorite(path string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.indexOf(path) >= 0
}

// SetFavorite marks or unmarks a path and saves.
func (s *Store) SetFavorite(path string, favorite bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	at := s.indexOf(path)
	switch {
	case favorite && at < 0:
		s.state.Favorites = append(s.state.Favorites, path)
		sort.Strings(s.state.Favorites)
	case !favorite && at >= 0:
		s.state.Favorites = append(s.state.Favorites[:at], s.state.Favorites[at+1:]...)
	default:
		return nil
	}
	return s.saveLocked()
}

// SetLastStore records the store most recently looked at, saving only when it
// changed. That makes it one write per switch rather than one per request.
func (s *Store) SetLastStore(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.LastStore == path {
		return nil
	}
	s.state.LastStore = path
	return s.saveLocked()
}

// Warm is the paths worth opening at startup: the store last used first,
// because it is the one most likely to be wanted, then the favorites.
func (s *Store) Warm() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var warm []string
	if s.state.LastStore != "" {
		warm = append(warm, s.state.LastStore)
	}
	for _, path := range s.state.Favorites {
		if path != s.state.LastStore {
			warm = append(warm, path)
		}
	}
	return warm
}

func (s *Store) indexOf(path string) int {
	for i, have := range s.state.Favorites {
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
