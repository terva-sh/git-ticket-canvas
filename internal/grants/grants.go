// Package grants answers which roles an identity holds on a named resource.
//
// It is the layer above a relying party. Authenticating proves who somebody
// is; it says nothing about whether the operator meant to give them this
// repository, and keeping the two apart is what lets one design serve a canvas
// with no authentication at all and a canvas serving a company.
//
// Nothing here knows what a canvas is. A resource is a name, an identity is a
// subject with some groups, and the answer is a set of roles. That is on
// purpose: the reusable part of this is the shape, and it is built inside one
// tool until a second one asks for it.
package grants

import (
	"fmt"
	"sort"
	"strings"
)

// Role is what somebody may do with one resource.
//
// Writer is in the vocabulary from the first version and is not switched on by
// any caller yet. The reason is attribution rather than effort: the canvas
// writes ticket changes and never commits them, so several people writing
// concurrently produce a tree where the next commit sweeps up several people's
// edits under one name. Having the role named now means the configuration
// somebody writes today does not have to be migrated when that is settled.
type Role string

const (
	// Reader may read a resource.
	Reader Role = "reader"
	// Writer may change one. Not yet granted by anything.
	Writer Role = "writer"
	// Admin may grant and revoke. It carries no implicit read: an
	// administrator who wants to read a store grants it to themselves, and
	// that self-grant leaves a record where implicit access would leave none.
	Admin Role = "admin"
)

// Roles is every role this package defines, in the order they are listed.
var Roles = []Role{Reader, Writer, Admin}

// ParseRole refuses anything that is not a role, naming what is.
func ParseRole(text string) (Role, error) {
	for _, role := range Roles {
		if string(role) == text {
			return role, nil
		}
	}
	names := make([]string, len(Roles))
	for i, role := range Roles {
		names[i] = string(role)
	}
	return "", fmt.Errorf("%q is not a role; the roles are %s", text, strings.Join(names, ", "))
}

// Principal is who is asking.
//
// Subject is the identity provider's stable id, and everything keys on it.
// Email and any username are mutable in every provider, so keying on either
// means a rename strands somebody's access or, worse, a recycled address
// inherits it. Email is carried because granting to a person who has never
// logged in has nothing else to match on, and it is never the key.
type Principal struct {
	Subject string
	Email   string
	Groups  []string
}

// Grants answers what a principal holds on a resource.
//
// An empty result is the whole of the model's central rule: a resource nobody
// granted gives nothing. Not a default role, not read access, not an entry in
// a list. An implementation that answers with a fallback for an unknown
// resource is not an implementation of this interface.
type Grants interface {
	Roles(p Principal, resource string) []Role
}

// Everything grants every role on every resource to everybody.
//
// It is the canvas on somebody's desk: one person, their own repositories, no
// identity provider and nothing to check. It exists so that the desk canvas is
// the null case of one model rather than a second code path, and so that a
// handler asking "may this caller read this store" has an answer either way.
type Everything struct{}

func (Everything) Roles(Principal, string) []Role { return Roles }

// Nothing grants nothing to anybody. It is what a served canvas falls back to
// when its configuration named no grants at all, so that the failure is an
// empty canvas rather than an open one.
type Nothing struct{}

func (Nothing) Roles(Principal, string) []Role { return nil }

// Static is a grant table an operator wrote, which nothing at runtime changes.
//
// Every entry is scoped to one resource. There is no map from group to role
// that applies everywhere, and that absence is the point: with a global map,
// adding a repository to the configuration so you can look at it yourself
// grants it to everyone whose group is in that map. Nobody would choose that,
// and everybody would ship it, because the global map is the shape that reads
// naturally.
//
// Shared is the convenience that shape wants to be, kept harmless. It names
// roles by group in one place, and it grants nothing at all until a resource
// says it honours that group.
type Static struct {
	// byResource maps a resource to the roles each group holds on it.
	byResource map[string]map[string]Role
	// shared is the named convenience map. Nothing is granted from it except
	// where a resource asked for it, at which point the entry is copied into
	// byResource and shared is no longer consulted.
	shared map[string]Role
}

// Table is one resource's grants as an operator wrote them.
type Table struct {
	// Resource is the name grants are looked up by.
	Resource string
	// Roles maps an identity-provider group to the role it holds here.
	Roles map[string]Role
	// Honour names groups from the shared map whose role applies here. A name
	// the shared map does not carry is an error rather than a quiet nothing: a
	// typo that silently grants nobody anything is the failure this model is
	// least able to notice.
	Honour []string
}

// NewStatic builds a table, refusing a configuration that cannot mean what it
// says.
func NewStatic(shared map[string]Role, tables []Table) (*Static, error) {
	s := &Static{byResource: make(map[string]map[string]Role, len(tables)), shared: shared}
	for _, table := range tables {
		if _, twice := s.byResource[table.Resource]; twice {
			return nil, fmt.Errorf("resource %q is granted twice", table.Resource)
		}
		roles := make(map[string]Role, len(table.Roles)+len(table.Honour))
		for group, role := range table.Roles {
			if strings.TrimSpace(group) == "" {
				return nil, fmt.Errorf("resource %q grants a role to an empty group", table.Resource)
			}
			roles[group] = role
		}
		for _, group := range table.Honour {
			role, named := shared[group]
			if !named {
				return nil, fmt.Errorf(
					"resource %q honours the group %q, which no shared role names; "+
						"a group that is honoured but not named grants nobody anything, "+
						"which is the one mistake this model cannot report at runtime",
					table.Resource, group)
			}
			if _, already := table.Roles[group]; already {
				// The resource's own entry wins and the shared one is
				// redundant. Saying so beats silently picking one.
				return nil, fmt.Errorf(
					"resource %q both grants %q a role and honours it from the shared roles; keep one",
					table.Resource, group)
			}
			roles[group] = role
		}
		s.byResource[table.Resource] = roles
	}
	return s, nil
}

// Roles is what a principal holds on one resource.
//
// A resource with no table answers with nothing, which is what makes a store
// nobody granted invisible rather than public.
func (s *Static) Roles(p Principal, resource string) []Role {
	held, granted := s.byResource[resource]
	if !granted {
		return nil
	}
	seen := make(map[Role]bool, len(held))
	for _, group := range p.Groups {
		if role, ok := held[group]; ok {
			seen[role] = true
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]Role, 0, len(seen))
	for _, role := range Roles {
		if seen[role] {
			out = append(out, role)
		}
	}
	return out
}

// Resources is every resource the table names, sorted. It is for reporting a
// configuration back to the operator who wrote it, not for answering a request.
func (s *Static) Resources() []string {
	names := make([]string, 0, len(s.byResource))
	for name := range s.byResource {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Holds reports whether a set of roles carries one.
func Holds(held []Role, want Role) bool {
	for _, role := range held {
		if role == want {
			return true
		}
	}
	return false
}

// CanRead reports whether a set of roles lets somebody read.
//
// A writer reads, because a role that can change a thing it cannot see is not a
// role. An administrator does not: the capability is the same either way, since
// an administrator can grant themselves whatever they like, but a self-grant is
// an action that leaves a record while implicit access leaves none.
func CanRead(held []Role) bool {
	return Holds(held, Reader) || Holds(held, Writer)
}
