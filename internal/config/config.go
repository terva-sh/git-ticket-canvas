// Package config builds the list of ticket stores the canvas serves.
//
// A store reaches the list from a configuration file, from the
// GIT_TICKET_CANVAS_STORES environment variable, or from a repeatable --store
// flag. The file is the durable form, the environment variable suits a
// container, and the flag suits one session, so the flag wins over the
// environment variable and the environment variable wins over the file.
//
// Nothing here opens a store. This package produces a validated list of names
// and paths; opening a path, discovering a store above it, and reporting one
// that cannot be read belong to the server.
package config

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// DefaultDepth is how far a walk descends below a root when none is given.
//
// A workspace laid out as forge/org/repo puts a store three levels below its
// root, so four covers that with a level to spare. The limit is not about
// speed: a bounded walk over a workspace holding 22 stores takes about ten
// milliseconds. It decides what gets picked up. Going deeper finds test
// fixtures committed inside repositories, and this repository's own canvas
// baseline fixture is one of them.
const DefaultDepth = 4

// MaxNameLen is the longest store name accepted. A name appears in a URL path,
// so this matches the limit internal/api applies to board names.
const MaxNameLen = 64

// EnvStores is the environment variable holding NAME=PATH entries, joined by
// os.PathListSeparator.
const EnvStores = "GIT_TICKET_CANVAS_STORES"

// DefaultExclude is the set of directories a search skips unless told
// otherwise.
//
// These are build and dependency directories: large, uninteresting, and
// frequently deep. They are the default value of Exclude rather than a separate
// prune list, because skipping node_modules and skipping a path you named are
// the same request and two mechanisms would need two explanations.
//
// Nothing here can hide a store you name yourself. An exclusion governs
// searching, and --store never searches.
var DefaultExclude = []string{"node_modules", "vendor", "target", "dist", "build"}

// Store is one configured ticket store.
//
// Path is absolute and cleaned. Actor and ReadOnly are the per-store overrides
// of the global --actor and --read-only settings; an empty Actor means the
// store resolves its own from its config.yml.
type Store struct {
	Name string `yaml:"name"`
	// Roles maps an identity-provider group to what it may do with this store,
	// and is read only by the served canvas. A store that names none is
	// private: not readable, not listed, and not acknowledged to exist. That is
	// the rule the whole grant model exists to protect, so it is the absence of
	// configuration rather than something an operator has to write.
	Roles map[string]string `yaml:"roles,omitempty"`
	// EnforceActors turns this store's declared actors into an allowlist for the
	// people using a served canvas, narrowing what they may claim to ids the
	// store already names. Off by default, and read only by the served canvas.
	EnforceActors bool `yaml:"enforceActors,omitempty"`
	// HonourGroups names groups from the top-level Roles map whose role applies
	// to this store. The top-level map grants nothing by itself: with a global
	// role map, adding a repository to look at it yourself grants it to
	// everyone whose group is in that map, and this is what keeps the
	// convenience without the failure.
	HonourGroups []string `yaml:"honourGroups,omitempty"`
	// Derived is true when nobody wrote this name and the canvas took it from
	// the path. A written name is kept as the store's id; a derived one is
	// replaced by a hash, because a name taken from a path is not unique and
	// was never chosen.
	Derived  bool   `yaml:"-"`
	Path     string `yaml:"path"`
	Actor    string `yaml:"actor,omitempty"`
	ReadOnly bool   `yaml:"readOnly,omitempty"`
}

// Root is a directory to walk for stores.
//
// Depth of zero means DefaultDepth. Exclude entries are relative to this root,
// unlike the top-level Config.Exclude, which holds absolute paths and
// patterns.
type Root struct {
	Path    string   `yaml:"path"`
	Depth   int      `yaml:"depth,omitempty"`
	Exclude []string `yaml:"exclude,omitempty"`
}

// Config is the validated store list and the roots to walk for more.
//
// Roots and Exclude are parsed and validated here and consumed by the walk.
type Config struct {
	Roots   []Root   `yaml:"roots,omitempty"`
	Stores  []Store  `yaml:"stores,omitempty"`
	Exclude []string `yaml:"exclude,omitempty"`
	// Identity is who the served canvas trusts to log in. It belongs to this
	// file, which an operator writes, and never to a store's own config.yml.
	// The desk canvas reads it, says it is ignoring it, and ignores it.
	Identity Identity `yaml:"identity,omitempty"`
	// Roles names what a group may do, in one place, so that a store does not
	// have to repeat it. It grants nothing at all on its own: a store honours a
	// group by name or does not have it.
	Roles map[string]string `yaml:"roles,omitempty"`
	// ExcludeDefaults turns the built-in list off when set to false, which is
	// how Exclude is replaced rather than extended. A nil pointer means unset,
	// and unset means the defaults apply.
	ExcludeDefaults *bool `yaml:"excludeDefaults,omitempty"`
}

// EffectiveExclude is the built-in list, unless it was turned off, followed by
// whatever was configured.
func (c Config) EffectiveExclude() []string {
	var all []string
	if c.ExcludeDefaults == nil || *c.ExcludeDefaults {
		all = append(all, DefaultExclude...)
	}
	return append(all, c.Exclude...)
}

// source names where a store came from, so a validation message can say which
// of three places to go and fix.
type source int

const (
	fromFile source = iota
	fromEnv
	fromFlag
)

func (s source) String() string {
	switch s {
	case fromFlag:
		return "--store flag"
	case fromEnv:
		return EnvStores
	default:
		return "configuration file"
	}
}

// entry is a store with the source that supplied it, kept only until Merge has
// resolved precedence.
type entry struct {
	store Store
	from  source
}

// Load builds the store list from all three sources and validates the result.
//
// file may be empty, meaning no configuration file. env is the raw
// GIT_TICKET_CANVAS_STORES value. flags are the raw --store values in the
// order given. base is the directory relative paths from env and flags resolve
// against, normally the working directory.
func Load(file, env string, flags []string, base string) (Config, error) {
	var cfg Config
	var entries []entry

	if file != "" {
		parsed, err := ParseFile(file)
		if err != nil {
			return Config{}, err
		}
		cfg.Roots, cfg.Exclude = parsed.Roots, parsed.Exclude
		cfg.Identity, cfg.Roles = parsed.Identity, parsed.Roles
		for _, s := range parsed.Stores {
			entries = append(entries, entry{s, fromFile})
		}
	}

	envStores, err := ParseEnv(env, base)
	if err != nil {
		return Config{}, err
	}
	for _, s := range envStores {
		entries = append(entries, entry{s, fromEnv})
	}

	flagStores, err := ParseFlags(flags, base)
	if err != nil {
		return Config{}, err
	}
	for _, s := range flagStores {
		entries = append(entries, entry{s, fromFlag})
	}

	cfg.Stores, err = merge(entries)
	if err != nil {
		return Config{}, err
	}
	if err := cfg.validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// ParseFile reads a configuration file.
//
// A relative path inside the file resolves against the file's own directory,
// not the working directory, so a configuration that is checked in or moved
// keeps working.
func ParseFile(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("configuration file: %w", err)
	}
	var cfg Config
	decoder := yaml.NewDecoder(strings.NewReader(string(data)))
	// Reject a key this package does not know, so that `store:` written for
	// `stores:` fails at startup instead of serving an empty list.
	decoder.KnownFields(true)
	// An empty file decodes to io.EOF. That is a valid empty configuration,
	// not a parse failure.
	if err := decoder.Decode(&cfg); err != nil && !errors.Is(err, io.EOF) {
		return Config{}, fmt.Errorf("configuration file %s: %w", path, err)
	}

	base := filepath.Dir(path)
	for i := range cfg.Stores {
		cfg.Stores[i].Path, err = resolve(cfg.Stores[i].Path, base)
		if err != nil {
			return Config{}, fmt.Errorf("configuration file %s: store %q: %w", path, cfg.Stores[i].Name, err)
		}
	}
	for i := range cfg.Roots {
		cfg.Roots[i].Path, err = resolve(cfg.Roots[i].Path, base)
		if err != nil {
			return Config{}, fmt.Errorf("configuration file %s: root: %w", path, err)
		}
		if cfg.Roots[i].Depth == 0 {
			cfg.Roots[i].Depth = DefaultDepth
		}
	}
	return cfg, nil
}

// ParseEnv reads NAME=PATH entries joined by os.PathListSeparator.
//
// The separator is ':' on Linux and ';' on Windows, so a Windows drive letter
// in a path does not collide with it. Each entry splits on its first '=' only,
// for the same reason.
func ParseEnv(value, base string) ([]Store, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	var stores []Store
	for _, part := range strings.Split(value, string(os.PathListSeparator)) {
		if strings.TrimSpace(part) == "" {
			continue
		}
		store, err := parseEntry(part, base)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", EnvStores, err)
		}
		stores = append(stores, store)
	}
	return stores, nil
}

// ParseFlags reads repeated --store values.
//
// Each value is either PATH, which takes its name from the directory's base
// name, or NAME=PATH. The bare form is what keeps `git-ticket-canvas --store .`
// working as it does today.
func ParseFlags(values []string, base string) ([]Store, error) {
	var stores []Store
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		store, err := parseEntry(value, base)
		if err != nil {
			return nil, fmt.Errorf("--store: %w", err)
		}
		stores = append(stores, store)
	}
	return stores, nil
}

// parseEntry reads one PATH or NAME=PATH value.
//
// The two forms are told apart by whether the text before the first '=' is a
// usable name. A path may legally hold an '=', and "/srv/odd=dir" is one path
// rather than a store named "/srv/odd", because "/srv/odd" is not a name this
// package would accept.
func parseEntry(value, base string) (Store, error) {
	name, path := "", value
	if key, rest, found := strings.Cut(value, "="); found && ValidName(key) == nil {
		name, path = key, rest
	}
	if strings.TrimSpace(path) == "" {
		return Store{}, fmt.Errorf("%q has no path", value)
	}
	resolved, err := resolve(path, base)
	if err != nil {
		return Store{}, fmt.Errorf("%q: %w", value, err)
	}
	if name == "" {
		return Store{Name: DeriveName(resolved), Derived: true, Path: resolved}, nil
	}
	return Store{Name: name, Path: resolved}, nil
}

// DeriveName takes a store name from a path's base name, replacing every
// character a name may not hold. A path that yields nothing usable, such as the
// filesystem root, becomes "store".
func DeriveName(path string) string {
	base := filepath.Base(filepath.Clean(path))
	var b strings.Builder
	for _, r := range base {
		if validNameRune(r) {
			b.WriteRune(r)
			continue
		}
		b.WriteRune('-')
	}
	name := strings.Trim(b.String(), "-")
	if name == "" {
		return "store"
	}
	if len(name) > MaxNameLen {
		name = name[:MaxNameLen]
	}
	return name
}

// afterTilde reports whether path starts with a home-directory tilde, and
// returns what follows it.
//
// A forward slash counts on every platform, not only where it is the separator.
// A configuration file is written by a person and copied between machines, and
// "~/notes" is the only spelling that means the same thing on all of them. When
// Windows accepted only a backslash after the tilde, the portable spelling fell
// through to the relative branch and was joined against the base, so the store
// pointed somewhere that did not exist. It also stopped matching the same
// directory found by discovery, because deduplication compares resolved paths,
// so one store arrived twice under two ids.
func afterTilde(path string) (string, bool) {
	if path == "~" {
		return "", true
	}
	if rest, ok := strings.CutPrefix(path, "~/"); ok {
		return filepath.FromSlash(rest), true
	}
	if filepath.Separator != '/' {
		if rest, ok := strings.CutPrefix(path, "~"+string(filepath.Separator)); ok {
			return rest, true
		}
	}
	return "", false
}

// resolve expands a leading ~ and makes the path absolute against base.
func resolve(path, base string) (string, error) {
	if strings.TrimSpace(path) == "" {
		return "", errors.New("empty path")
	}
	if rest, ok := afterTilde(path); ok {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("expanding %q: %w", path, err)
		}
		path = filepath.Join(home, rest)
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(base, path)
	}
	return filepath.Clean(path), nil
}

// merge resolves precedence by name. A higher-ranked source replaces a store of
// the same name from a lower-ranked one and leaves every other store alone.
//
// Whole-list replacement was the alternative. It would mean that adding one
// store for one session discards the configuration file, and adding one store
// for one session is the common case.
func merge(entries []entry) ([]Store, error) {
	byName := make(map[string]entry, len(entries))
	order := make([]string, 0, len(entries))
	for _, e := range entries {
		existing, seen := byName[e.store.Name]
		if seen {
			if existing.from == e.from {
				return nil, fmt.Errorf("%s: two stores named %q", e.from, e.store.Name)
			}
			if existing.from > e.from {
				continue
			}
		} else {
			order = append(order, e.store.Name)
		}
		byName[e.store.Name] = e
	}
	stores := make([]Store, 0, len(order))
	for _, name := range order {
		stores = append(stores, byName[name].store)
	}
	return stores, nil
}

// validate rejects a list that cannot be served.
func (c Config) validate() error {
	byPath := make(map[string]string, len(c.Stores))
	for _, s := range c.Stores {
		if err := ValidName(s.Name); err != nil {
			return err
		}
		if other, clash := byPath[s.Path]; clash {
			return fmt.Errorf("stores %q and %q are both %s; one path cannot have two names", other, s.Name, s.Path)
		}
		byPath[s.Path] = s.Name
	}
	for i, r := range c.Roots {
		if r.Path == "" {
			return fmt.Errorf("root %d has no path", i+1)
		}
		if r.Depth < 0 {
			return fmt.Errorf("root %s: depth %d is negative", r.Path, r.Depth)
		}
	}
	return nil
}

// ValidName reports whether a name can be a store id.
//
// The character set matches what internal/api accepts for a board name,
// because both appear in a URL path and the two have to agree. It is
// duplicated rather than shared: exporting it from internal/api would make
// this package depend on the package that depends on it.
func ValidName(name string) error {
	if name == "" {
		return errors.New("a store name cannot be empty")
	}
	if len(name) > MaxNameLen {
		return fmt.Errorf("store name %q is %d characters; the limit is %d", name, len(name), MaxNameLen)
	}
	for _, r := range name {
		if !validNameRune(r) {
			return fmt.Errorf("store name %q holds %q; use letters, digits, - and _", name, r)
		}
	}
	return nil
}

func validNameRune(r rune) bool {
	switch {
	case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		return true
	case r == '-', r == '_':
		return true
	}
	return false
}

// Names returns the configured store names in order, for a log line or an
// error that has to list them.
func (c Config) Names() []string {
	names := make([]string, 0, len(c.Stores))
	for _, s := range c.Stores {
		names = append(names, s.Name)
	}
	return names
}

// Lookup finds a store by name.
func (c Config) Lookup(name string) (Store, bool) {
	for _, s := range c.Stores {
		if s.Name == name {
			return s, true
		}
	}
	return Store{}, false
}

// SortedNames returns the store names in lexical order, for output that has to
// be stable regardless of how the sources were ordered.
func (c Config) SortedNames() []string {
	names := c.Names()
	sort.Strings(names)
	return names
}

// AddRoots appends roots from repeated --root values, resolved against base.
//
// A root named on the command line carries the depth the command line asked
// for. A root from the configuration file keeps whatever depth that file gave
// it, which is why this appends rather than replacing.
func (c *Config) AddRoots(paths []string, depth int, base string) error {
	if depth <= 0 {
		depth = DefaultDepth
	}
	for _, path := range paths {
		if strings.TrimSpace(path) == "" {
			continue
		}
		resolved, err := resolve(path, base)
		if err != nil {
			return fmt.Errorf("--root: %q: %w", path, err)
		}
		c.Roots = append(c.Roots, Root{Path: resolved, Depth: depth})
	}
	return nil
}
