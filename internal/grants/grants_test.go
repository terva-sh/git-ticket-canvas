package grants

import (
	"strings"
	"testing"
)

func roles(held []Role) string {
	out := make([]string, len(held))
	for i, role := range held {
		out[i] = string(role)
	}
	return strings.Join(out, ",")
}

// The rule the rest of the model exists to protect: a resource nobody granted
// gives nothing at all.
//
// Not a default role, not read access, not an entry in a list. The failure it
// prevents is concrete: with a map from group to role that applies everywhere,
// adding a repository to the configuration so you can look at it yourself
// grants it to everyone whose group is in that map.
func TestAnUngrantedResourceGivesNothing(t *testing.T) {
	table, err := NewStatic(
		map[string]Role{"Everybody": Reader},
		[]Table{{Resource: "ledger", Roles: map[string]Role{"Ledger Readers": Reader}}},
	)
	if err != nil {
		t.Fatal(err)
	}
	staff := Principal{Subject: "s1", Groups: []string{"Everybody", "Ledger Readers"}}

	if got := roles(table.Roles(staff, "ledger")); got != "reader" {
		t.Errorf("roles on the granted resource = %q, want reader", got)
	}
	// Named in the shared map, member of that group, and the resource never
	// honoured it. This is the assertion the whole design turns on.
	if got := table.Roles(staff, "a-store-added-yesterday"); got != nil {
		t.Errorf("an ungranted resource answered %v, want nothing", got)
	}
	if CanRead(table.Roles(staff, "a-store-added-yesterday")) {
		t.Error("an ungranted resource can be read")
	}
	// A group nobody granted on a resource that is granted to somebody else.
	stranger := Principal{Subject: "s2", Groups: []string{"Everybody"}}
	if got := table.Roles(stranger, "ledger"); got != nil {
		t.Errorf("a stranger holds %v on a granted resource", got)
	}
}

// The shared map is the convenience the natural-but-wrong shape wanted to be,
// and it grants nothing until a resource asks for it by name.
func TestTheSharedMapGrantsNothingUntilAResourceHonoursIt(t *testing.T) {
	table, err := NewStatic(
		map[string]Role{"Brokkr Staff": Reader},
		[]Table{
			{Resource: "ledger", Honour: []string{"Brokkr Staff"}},
			{Resource: "private", Roles: map[string]Role{"Founders": Writer}},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	staff := Principal{Subject: "s1", Groups: []string{"Brokkr Staff"}}
	if !CanRead(table.Roles(staff, "ledger")) {
		t.Error("a resource that honours a shared group did not grant it")
	}
	if table.Roles(staff, "private") != nil {
		t.Error("a resource that honours nothing was granted from the shared map")
	}
}

// A group honoured but never named grants nobody anything, and nothing at
// runtime can tell that apart from a deliberately private store. So it is
// refused where it can still be reported: at startup, naming both.
func TestAConfigurationThatCannotMeanWhatItSaysIsRefused(t *testing.T) {
	for _, c := range []struct {
		name   string
		shared map[string]Role
		tables []Table
		want   string
	}{
		{
			name:   "honours a group no shared role names",
			shared: map[string]Role{"Brokkr Staff": Reader},
			tables: []Table{{Resource: "ledger", Honour: []string{"Brokkr Staf"}}},
			want:   "which no shared role names",
		},
		{
			name:   "grants and honours the same group",
			shared: map[string]Role{"Brokkr Staff": Reader},
			tables: []Table{{Resource: "ledger",
				Roles:  map[string]Role{"Brokkr Staff": Writer},
				Honour: []string{"Brokkr Staff"}}},
			want: "keep one",
		},
		{
			name:   "grants a role to nobody",
			tables: []Table{{Resource: "ledger", Roles: map[string]Role{"  ": Reader}}},
			want:   "empty group",
		},
		{
			name: "grants the same resource twice",
			tables: []Table{
				{Resource: "ledger", Roles: map[string]Role{"A": Reader}},
				{Resource: "ledger", Roles: map[string]Role{"B": Reader}},
			},
			want: "granted twice",
		},
	} {
		_, err := NewStatic(c.shared, c.tables)
		if err == nil {
			t.Errorf("%s was accepted", c.name)
			continue
		}
		if !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, want it to mention %q", c.name, err, c.want)
		}
	}
}

// A writer reads, because a role that can change what it cannot see is not a
// role. An administrator does not: the capability is the same either way, and
// the difference is that a self-grant leaves a record.
func TestWhoCanRead(t *testing.T) {
	for _, c := range []struct {
		held []Role
		want bool
	}{
		{nil, false},
		{[]Role{Reader}, true},
		{[]Role{Writer}, true},
		{[]Role{Admin}, false},
		{[]Role{Admin, Reader}, true},
	} {
		if got := CanRead(c.held); got != c.want {
			t.Errorf("CanRead(%v) = %v, want %v", c.held, got, c.want)
		}
	}
}

// The desk canvas is the null case of one model rather than a second code
// path, and the empty implementation is what a served canvas with a broken
// configuration must never accidentally become.
func TestTheTwoDegenerateImplementations(t *testing.T) {
	anybody := Principal{}
	if !CanRead((Everything{}).Roles(anybody, "anything")) {
		t.Error("the desk canvas cannot read its own store")
	}
	if (Nothing{}).Roles(anybody, "anything") != nil {
		t.Error("the empty implementation granted something")
	}
}

// A role is a fixed vocabulary, so a typo in a configuration file is a refusal
// that names the alternatives rather than a store nobody can read.
func TestParseRole(t *testing.T) {
	for _, name := range []string{"reader", "writer", "admin"} {
		if _, err := ParseRole(name); err != nil {
			t.Errorf("ParseRole(%q): %v", name, err)
		}
	}
	_, err := ParseRole("read")
	if err == nil {
		t.Fatal("ParseRole accepted a role that does not exist")
	}
	if !strings.Contains(err.Error(), "reader, writer, admin") {
		t.Errorf("the refusal reads %q, want it to list the roles", err)
	}
}
