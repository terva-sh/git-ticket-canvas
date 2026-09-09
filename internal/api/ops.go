package api

import (
	"fmt"
	"time"

	"github.com/terva-sh/git-ticket/ticket"
)

// Op is one edit named on the wire. It is a tagged union flattened into a
// struct, because the library's Mutation set is closed and small, and a client
// that can only name an operation this file knows cannot ask for a change the
// format does not define.
//
// Full-file replacement is not offered here for the same reason the library
// does not offer it: a canvas that PUT a whole ticket would silently drop the
// frontmatter keys a newer reader wrote, and the format's forward compatibility
// rests on never doing that.
type Op struct {
	Op string `json:"op"`

	Title     string  `json:"title,omitempty"`
	Type      string  `json:"type,omitempty"`
	Status    string  `json:"status,omitempty"`
	Reason    string  `json:"reason,omitempty"`
	Priority  string  `json:"priority,omitempty"`
	Parent    *string `json:"parent,omitempty"`
	Origin    *string `json:"origin,omitempty"`
	Milestone *string `json:"milestone,omitempty"`
	DueOn     *string `json:"dueOn,omitempty"`
	BlocksOn  string  `json:"blocksOn,omitempty"`

	Label string `json:"label,omitempty"`
	Actor string `json:"actor,omitempty"`
	ID    string `json:"id,omitempty"`

	Ref  string  `json:"ref,omitempty"`
	Path *string `json:"path,omitempty"`

	Text    string `json:"text,omitempty"`
	Section string `json:"section,omitempty"`
	Index   int    `json:"index,omitempty"`
	Checked bool   `json:"checked,omitempty"`

	Branch    string `json:"branch,omitempty"`
	Worktree  string `json:"worktree,omitempty"`
	Commit    string `json:"commit,omitempty"`
	Session   string `json:"session,omitempty"`
	ExpiresIn string `json:"expiresIn,omitempty"`
	Force     bool   `json:"force,omitempty"`
}

func section(s string) (ticket.ChecklistSection, error) {
	switch s {
	case "ac", "acceptanceCriteria", string(ticket.AcceptanceCriteria):
		return ticket.AcceptanceCriteria, nil
	case "dod", "definitionOfDone", string(ticket.DefinitionOfDone):
		return ticket.DefinitionOfDone, nil
	}
	return "", fmt.Errorf("unknown checklist section %q", s)
}

// mutation turns one wire op into the library's typed mutation.
func (o Op) mutation() (ticket.Mutation, error) {
	switch o.Op {
	case "setTitle":
		return ticket.SetTitle{Title: o.Title}, nil
	case "setType":
		return ticket.SetType{Type: o.Type}, nil
	case "setStatus":
		return ticket.SetStatus{Status: o.Status, Reason: o.Reason}, nil
	case "setPriority":
		return ticket.SetPriority{Priority: o.Priority}, nil
	case "setParent":
		return ticket.SetParent{Parent: o.Parent}, nil
	case "setOrigin":
		return ticket.SetOrigin{Origin: o.Origin}, nil
	case "setMilestone":
		return ticket.SetMilestone{Milestone: o.Milestone}, nil
	case "setDueOn":
		return ticket.SetDueOn{DueOn: o.DueOn}, nil
	case "setBlocksOn":
		return ticket.SetBlocksOn{BlocksOn: o.BlocksOn}, nil

	case "addLabel":
		return ticket.AddLabel{Label: o.Label}, nil
	case "removeLabel":
		return ticket.RemoveLabel{Label: o.Label}, nil
	case "assign":
		return ticket.Assign{Actor: o.Actor}, nil
	case "unassign":
		return ticket.Unassign{Actor: o.Actor}, nil

	case "addDependency":
		return ticket.AddDependency{ID: o.ID}, nil
	case "removeDependency":
		return ticket.RemoveDependency{ID: o.ID}, nil
	case "addReference":
		return ticket.AddReference{Ref: o.Ref, Path: o.Path}, nil
	case "removeReference":
		return ticket.RemoveReference{Ref: o.Ref}, nil

	case "setDescription":
		return ticket.SetDescription{Text: o.Text}, nil
	case "setPlan":
		return ticket.SetImplementationPlan{Text: o.Text}, nil
	case "setSummary":
		return ticket.SetSummary{Text: o.Text}, nil

	case "addChecklistItem":
		s, err := section(o.Section)
		if err != nil {
			return nil, err
		}
		return ticket.AddChecklistItem{Section: s, Text: o.Text}, nil
	case "setChecklistItem":
		s, err := section(o.Section)
		if err != nil {
			return nil, err
		}
		return ticket.SetChecklistItem{Section: s, Index: o.Index, Checked: o.Checked}, nil
	case "removeChecklistItem":
		s, err := section(o.Section)
		if err != nil {
			return nil, err
		}
		return ticket.RemoveChecklistItem{Section: s, Index: o.Index}, nil

	case "appendNote":
		return ticket.AppendNote{Text: o.Text}, nil
	case "appendComment":
		return ticket.AppendComment{Text: o.Text}, nil

	case "claim":
		m := ticket.ClaimTicket{
			Branch:   o.Branch,
			Worktree: o.Worktree,
			Commit:   o.Commit,
			Session:  o.Session,
			Force:    o.Force,
		}
		if o.ExpiresIn != "" {
			d, err := time.ParseDuration(o.ExpiresIn)
			if err != nil {
				return nil, fmt.Errorf("expiresIn: %w", err)
			}
			m.ExpiresIn = d
		}
		return m, nil
	case "release":
		return ticket.ReleaseClaim{}, nil

	case "archive":
		return ticket.ArchiveTicket{Reason: o.Reason}, nil
	case "unarchive":
		return ticket.UnarchiveTicket{}, nil
	}
	return nil, fmt.Errorf("unknown op %q", o.Op)
}
