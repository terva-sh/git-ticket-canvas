package config

import (
	"fmt"
	"sort"

	"github.com/terva-sh/git-ticket-canvas/internal/grants"
)

// Grants builds the grant table a served canvas runs on.
//
// It is a method on the configuration rather than something the grant package
// parses, because the grant package has no business knowing what a store or a
// canvas configuration file is. What crosses the boundary is a list of
// resources, each with the roles some groups hold on it.
//
// A store the operator did not name cannot be granted, and that is reported
// rather than silently dropped. Its id is derived from a hash of its path, so a
// grant could only be written against a value nobody chose and every move
// changes.
func (c Config) Grants() (*grants.Static, []string, error) {
	shared, err := parseRoles("roles", c.Roles)
	if err != nil {
		return nil, nil, err
	}

	var notes []string
	tables := make([]grants.Table, 0, len(c.Stores))
	for _, store := range c.Stores {
		if len(store.Roles) == 0 && len(store.HonourGroups) == 0 {
			continue
		}
		if store.Derived {
			return nil, nil, fmt.Errorf(
				"the store at %s grants roles but has no name, so there is nothing to grant them against; "+
					"give it `name:` in the configuration file", store.Path)
		}
		roles, err := parseRoles("store "+store.Name, store.Roles)
		if err != nil {
			return nil, nil, err
		}
		tables = append(tables, grants.Table{Resource: store.Name, Roles: roles, Honour: store.HonourGroups})
	}

	table, err := grants.NewStatic(shared, tables)
	if err != nil {
		return nil, nil, err
	}
	if len(tables) == 0 {
		notes = append(notes, "no store grants a role to anybody, so this canvas serves nothing to anybody; "+
			"add `roles:` to a store in the configuration file")
	}
	// A store that is served and not granted is the intended default and still
	// worth saying once, because an operator who added a repository and cannot
	// see it is otherwise looking for a bug.
	granted := make(map[string]bool, len(tables))
	for _, t := range tables {
		granted[t.Resource] = true
	}
	var private []string
	for _, store := range c.Stores {
		if !store.Derived && !granted[store.Name] {
			private = append(private, store.Name)
		}
	}
	sort.Strings(private)
	for _, name := range private {
		notes = append(notes, fmt.Sprintf(
			"store %q grants no role, so nobody can read it or see that it exists", name))
	}
	return table, notes, nil
}

func parseRoles(where string, raw map[string]string) (map[string]grants.Role, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	out := make(map[string]grants.Role, len(raw))
	// Sorted, so that a configuration with two bad entries reports the same one
	// every time rather than whichever the map happened to yield first.
	groups := make([]string, 0, len(raw))
	for group := range raw {
		groups = append(groups, group)
	}
	sort.Strings(groups)
	for _, group := range groups {
		role, err := grants.ParseRole(raw[group])
		if err != nil {
			return nil, fmt.Errorf("%s: group %q: %w", where, group, err)
		}
		out[group] = role
	}
	return out, nil
}
