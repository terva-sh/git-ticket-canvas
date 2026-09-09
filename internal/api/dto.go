package api

import (
	"time"

	"github.com/terva-sh/git-ticket/ticket"
)

// The wire shapes below are deliberately flat and JSON-native. The library's
// types are the source of truth and this is a projection of them, so nothing
// here computes anything a client could not have asked the store for; it only
// renames Go idioms (pointers, Timestamp) into shapes a browser reads without
// a helper.

type Ref struct {
	Ref  string  `json:"ref"`
	Path *string `json:"path,omitempty"`
}

type Claim struct {
	Actor     string `json:"actor"`
	Branch    string `json:"branch,omitempty"`
	Worktree  string `json:"worktree,omitempty"`
	Commit    string `json:"commit,omitempty"`
	Session   string `json:"session,omitempty"`
	ClaimedAt string `json:"claimedAt,omitempty"`
	ExpiresAt string `json:"expiresAt,omitempty"`
	Expired   bool   `json:"expired"`
}

type ChecklistItem struct {
	// Index counts from one, matching the library's checklist mutations. A
	// client sends it straight back, so it must not be re-derived from array
	// position on the way out.
	Index   int    `json:"index"`
	Checked bool   `json:"checked"`
	Text    string `json:"text"`
}

type Entry struct {
	Index int    `json:"index"`
	Actor string `json:"actor,omitempty"`
	At    string `json:"at,omitempty"`
	Text  string `json:"text"`
}

type Body struct {
	Description        string          `json:"description"`
	ImplementationPlan string          `json:"plan"`
	Summary            string          `json:"summary"`
	AcceptanceCriteria []ChecklistItem `json:"acceptanceCriteria"`
	DefinitionOfDone   []ChecklistItem `json:"definitionOfDone"`
	Notes              []Entry         `json:"notes"`
	Comments           []Entry         `json:"comments"`
}

type Readiness struct {
	Ready            bool     `json:"ready"`
	Blocked          bool     `json:"blocked"`
	Reason           string   `json:"reason,omitempty"`
	Blocking         []string `json:"blocking,omitempty"`
	Missing          []string `json:"missing,omitempty"`
	BlockingChildren []string `json:"blockingChildren,omitempty"`
}

type Ticket struct {
	ID           string    `json:"id"`
	Short        string    `json:"short"`
	Title        string    `json:"title"`
	Type         string    `json:"type"`
	Status       string    `json:"status"`
	StatusReason string    `json:"statusReason,omitempty"`
	Priority     string    `json:"priority"`
	DueOn        string    `json:"dueOn,omitempty"`
	Labels       []string  `json:"labels"`
	Assignees    []string  `json:"assignees"`
	Milestone    string    `json:"milestone,omitempty"`
	Parent       string    `json:"parent,omitempty"`
	Origin       string    `json:"origin,omitempty"`
	Dependencies []string  `json:"dependencies"`
	BlocksOn     string    `json:"blocksOn"`
	References   []Ref     `json:"references"`
	Claim        *Claim    `json:"claim,omitempty"`
	Archived     bool      `json:"archived"`
	CreatedAt    string    `json:"createdAt"`
	UpdatedAt    string    `json:"updatedAt"`
	CreatedBy    string    `json:"createdBy,omitempty"`
	UpdatedBy    string    `json:"updatedBy,omitempty"`
	Revision     string    `json:"revision"`
	Body         Body      `json:"body"`
	Readiness    Readiness `json:"readiness"`
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func actorName(a *ticket.Actor) string {
	if a == nil {
		return ""
	}
	if a.Name != "" {
		return a.Name
	}
	return a.ID
}

func checklist(text string) []ChecklistItem {
	items := ticket.Checklist(text)
	out := make([]ChecklistItem, 0, len(items))
	for i, it := range items {
		out = append(out, ChecklistItem{Index: i + 1, Checked: it.Checked, Text: it.Text})
	}
	return out
}

func entries(text string) []Entry {
	src := ticket.Entries(text)
	out := make([]Entry, 0, len(src))
	for _, e := range src {
		out = append(out, Entry{Index: e.Index, Actor: e.Actor, At: e.At, Text: e.Text})
	}
	return out
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// toDTO projects one parsed ticket. now is the instant claim expiry is judged
// against, passed in rather than read here so a whole board answers with one
// clock.
func toDTO(t *ticket.Ticket, short string, r ticket.Readiness, now time.Time) Ticket {
	d := Ticket{
		ID:           t.ID,
		Short:        short,
		Title:        t.Title,
		Type:         t.Type,
		Status:       t.Status,
		StatusReason: deref(t.StatusReason),
		Priority:     t.Priority,
		DueOn:        deref(t.DueOn),
		Labels:       nonNil(t.Labels),
		Assignees:    nonNil(t.Assignees),
		Milestone:    deref(t.Milestone),
		Parent:       deref(t.Parent),
		Origin:       deref(t.Origin),
		Dependencies: nonNil(t.Dependencies),
		BlocksOn:     t.BlocksOn,
		References:   []Ref{},
		Archived:     t.Archived(),
		CreatedAt:    t.CreatedAt.String(),
		UpdatedAt:    t.UpdatedAt.String(),
		CreatedBy:    actorName(t.CreatedBy),
		UpdatedBy:    actorName(t.UpdatedBy),
		Revision:     t.Revision,
		Body: Body{
			Description:        t.Body.Description,
			ImplementationPlan: t.Body.ImplementationPlan,
			Summary:            t.Body.Summary,
			AcceptanceCriteria: checklist(t.Body.AcceptanceCriteria),
			DefinitionOfDone:   checklist(t.Body.DefinitionOfDone),
			Notes:              entries(t.Body.Notes),
			Comments:           entries(t.Body.Comments),
		},
		Readiness: Readiness{
			Ready:            r.Ready,
			Blocked:          r.Blocked,
			Reason:           r.Reason,
			Blocking:         r.Blocking,
			Missing:          r.Missing,
			BlockingChildren: r.BlockingChildren,
		},
	}
	for _, ref := range t.References {
		d.References = append(d.References, Ref{Ref: ref.Ref, Path: ref.Path})
	}
	if c := t.Claim; c != nil {
		d.Claim = &Claim{
			Actor:    c.Actor,
			Branch:   deref(c.Branch),
			Worktree: deref(c.Worktree),
			Commit:   deref(c.Commit),
			Session:  deref(c.Session),
			Expired:  c.Expired(now),
		}
		if c.ClaimedAt != nil {
			d.Claim.ClaimedAt = c.ClaimedAt.String()
		}
		if c.ExpiresAt != nil {
			d.Claim.ExpiresAt = c.ExpiresAt.String()
		}
	}
	return d
}
