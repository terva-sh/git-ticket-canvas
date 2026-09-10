package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/terva-sh/git-ticket-canvas/internal/layout"
	"github.com/terva-sh/git-ticket/ticket"
)

type nowFunc func() time.Time

// Server serves one ticket store as a canvas.
type Server struct {
	store  *ticket.Store
	layout *layout.Store
	actor  ticket.Actor
	assets fs.FS
	now    nowFunc
	live   *coordinator
	// readOnly refuses every write at the edge. It exists so the canvas can be
	// pointed at a store somebody else is writing without the browser being
	// able to touch it.
	readOnly bool
}

// Options configures a Server.
type Options struct {
	Actor    ticket.Actor
	Assets   fs.FS
	ReadOnly bool
}

// New returns a Server over an open store.
func New(st *ticket.Store, opts Options) *Server {
	return &Server{
		store:    st,
		layout:   layout.New(st.Path()),
		actor:    opts.Actor,
		assets:   opts.Assets,
		now:      st.Now,
		readOnly: opts.ReadOnly,
		live:     newCoordinator(),
	}
}

// Handler returns the router.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/board", s.handleBoard)
	mux.HandleFunc("GET /api/schema", s.handleSchema)
	mux.HandleFunc("GET /api/events", s.handleEvents)
	mux.HandleFunc("POST /api/tickets", s.withStore((*Server).handleCreate))
	mux.HandleFunc("PATCH /api/tickets/{id}", s.withStore((*Server).handlePatch))
	mux.HandleFunc("DELETE /api/tickets/{id}", s.withStore((*Server).handleDelete))
	mux.HandleFunc("PUT /api/layout", s.withStore((*Server).handleLayout))
	if s.assets != nil {
		mux.Handle("/", http.FileServerFS(s.assets))
	}
	return http.NewCrossOriginProtection().Handler(mux)
}

// withStore gives every API request current configuration and one clock value.
// The library retains both on Store, so refreshing only board reads would
// advertise configuration that schema and mutations still reject. Clone the
// server per request; keep the shared layout writer and operator identity.
func (s *Server) withStore(next func(*Server, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-cache")
		if r.Method != http.MethodGet && r.Method != http.MethodHead && s.refuseWrite(w) {
			return
		}
		now := s.now()
		st, err := ticket.OpenWith(s.store.Path(), ticket.OpenOptions{Now: func() time.Time { return now }})
		if err != nil {
			fail(w, err)
			return
		}
		request := *s
		request.store = st
		request.now = func() time.Time { return now }
		// Hold the response until the shared snapshot path has reconciled.
		// Failed batches can also have committed earlier operations, so reconcile
		// after every handler rather than trusting its final HTTP status.
		buffer := &mutationResponse{header: w.Header().Clone()}
		next(&request, buffer, r)
		s.live.reconcile(false, false)
		for key, values := range buffer.header {
			w.Header()[key] = values
		}
		if buffer.code == 0 {
			buffer.code = http.StatusOK
		}
		w.WriteHeader(buffer.code)
		_, _ = w.Write(buffer.body.Bytes())
	}
}

// --- responses ---------------------------------------------------------

type errBody struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Ticket  string            `json:"ticket,omitempty"`
	Field   string            `json:"field,omitempty"`
	Details map[string]string `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// fail maps a library error onto HTTP.
//
// The codes are the stable part of the library's contract, so the mapping
// lives here once rather than in every handler, and a code this file does not
// know becomes 400 rather than 500: an unrecognised coded error is still the
// caller being told no, not the server breaking.
func fail(w http.ResponseWriter, err error) {
	var te *ticket.Error
	if !errors.As(err, &te) {
		writeJSON(w, http.StatusInternalServerError, errBody{Code: "internal", Message: err.Error()})
		return
	}
	status := http.StatusBadRequest
	switch te.Code {
	case ticket.CodeTicketNotFound, ticket.CodeStoreNotFound:
		status = http.StatusNotFound
	case ticket.CodeStaleRevision, ticket.CodeClaimConflict, ticket.CodeTicketReferenced, ticket.CodeTicketTouched:
		status = http.StatusConflict
	case ticket.CodeInvalidTransition, ticket.CodeInvalidField, ticket.CodeValidationFailed,
		ticket.CodeDependencyCycle, ticket.CodeDependencyMissing, ticket.CodeUnknownSeries:
		status = http.StatusUnprocessableEntity
	case ticket.CodeAmbiguousID:
		status = http.StatusMultipleChoices
	case ticket.CodeLockTimeout:
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, errBody{
		Code:    te.Code,
		Message: te.Message,
		Ticket:  te.Ticket,
		Field:   te.Field,
		Details: te.Details,
	})
}

func (s *Server) refuseWrite(w http.ResponseWriter) bool {
	if !s.readOnly {
		return false
	}
	writeJSON(w, http.StatusForbidden, errBody{
		Code:    "read_only",
		Message: "this canvas was started with --read-only",
	})
	return true
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 4<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("request body: %w", err)
	}
	return nil
}

// --- board -------------------------------------------------------------

type boardResponse struct {
	Board     *layout.Board `json:"layout"`
	Boards    []string      `json:"boards"`
	Tickets   []Ticket      `json:"tickets"`
	Config    schemaBody    `json:"config"`
	StorePath string        `json:"storePath"`
	ReadOnly  bool          `json:"readOnly"`
}

func (s *Server) handleBoard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	name := r.URL.Query().Get("board")
	if name == "" {
		name = layout.DefaultBoard
	}
	if !validBoardName(name) {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "invalid_board", Message: "invalid board name"})
		return
	}
	c := s.live
	c.mu.Lock()
	s.liveHeaders(w)
	if c.snap == nil {
		c.mu.Unlock()
		unavailable(w)
		return
	}
	rep, err := c.snap.representation(name)
	c.mu.Unlock()
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("ETag", rep.etag)
	if matchesIfNoneMatch(r.Header.Values("If-None-Match"), rep.etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(rep.data)
	}
}

// liveHeaders is called with coordinator.mu held so generation and body agree.
func (s *Server) liveHeaders(w http.ResponseWriter) {
	c := s.live
	w.Header().Set("X-Canvas-Epoch", c.state.Epoch)
	w.Header().Set("X-Canvas-Generation", strconv.FormatUint(c.state.Generation, 10))
	w.Header().Set("X-Canvas-Stale", strconv.FormatBool(c.state.Stale))
	w.Header().Set("X-Canvas-Degraded", strconv.FormatBool(c.state.Degraded))
	w.Header().Set("X-Canvas-Rebuilds", strconv.FormatUint(c.stats.Rebuilds, 10))
	w.Header().Set("X-Canvas-Safety-Scans", strconv.FormatUint(c.stats.SafetyScans, 10))
}

func unavailable(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "1")
	writeJSON(w, http.StatusServiceUnavailable, errBody{Code: "snapshot_unavailable", Message: "no validated store snapshot is available; retry shortly"})
}

type mutationResponse struct {
	header http.Header
	code   int
	body   bytes.Buffer
}

func (w *mutationResponse) Header() http.Header { return w.header }
func (w *mutationResponse) WriteHeader(code int) {
	if w.code == 0 {
		w.code = code
	}
}
func (w *mutationResponse) Write(data []byte) (int, error) {
	if w.code == 0 {
		w.code = http.StatusOK
	}
	return w.body.Write(data)
}

// matchesIfNoneMatch uses weak comparison for GET/HEAD. Parse the complete
// list before accepting a match: malformed conditions fall back to a full read.
// Commas inside opaque tags are legal and must not split the list.
func matchesIfNoneMatch(values []string, etag string) bool {
	value := strings.Trim(strings.Join(values, ","), " \t")
	if value == "*" {
		return true
	}
	matched := false
	for value != "" {
		value = strings.TrimLeft(value, " \t,")
		if value == "" {
			break
		}
		value = strings.TrimPrefix(value, "W/")
		if len(value) == 0 || value[0] != '"' {
			return false
		}
		i := 1
		for i < len(value) && value[i] != '"' {
			// etagc = %x21 / %x23-7E / obs-text (RFC 9110).
			if value[i] < 0x21 || value[i] == 0x7f {
				return false
			}
			i++
		}
		if i == len(value) {
			return false
		}
		matched = matched || value[:i+1] == etag
		value = strings.TrimLeft(value[i+1:], " \t")
		if value != "" && value[0] != ',' {
			return false
		}
	}
	return matched
}

// --- schema ------------------------------------------------------------

type schemaBody struct {
	Statuses    []string            `json:"statuses"`
	Open        []string            `json:"openStatuses"`
	Terminal    []string            `json:"terminalStatuses"`
	Types       []string            `json:"types"`
	Priorities  []string            `json:"priorities"`
	BlocksOn    []string            `json:"blocksOn"`
	Labels      []string            `json:"labels"`
	Milestones  []string            `json:"milestones"`
	Series      []string            `json:"series"`
	Actors      []ticket.Actor      `json:"actors"`
	Actor       ticket.Actor        `json:"actor"`
	Transitions map[string][]string `json:"transitions"`
	// ReasonRequired is the set of transitions the format refuses without a
	// reason, sent so the client can require the field before it asks rather
	// than surfacing a 422 the person then has to interpret.
	ReasonRequired map[string][]string `json:"reasonRequired"`
}

func (s *Server) schema() schemaBody {
	return s.schemaFor(s.store.Config())
}

func (s *Server) schemaFor(cfg ticket.Config) schemaBody {
	transitions := map[string][]string{}
	required := map[string][]string{}
	for _, from := range ticket.Statuses {
		to := ticket.PermittedTransitions(from)
		transitions[from] = to
		var need []string
		for _, t := range to {
			if ticket.ReasonRequired(from, t) {
				need = append(need, t)
			}
		}
		if len(need) > 0 {
			required[from] = need
		}
	}
	return schemaBody{
		Statuses:       ticket.Statuses,
		Open:           ticket.OpenStatuses,
		Terminal:       ticket.TerminalStatuses,
		Types:          ticket.Types,
		Priorities:     ticket.Priorities,
		BlocksOn:       ticket.BlocksOnValues,
		Labels:         nonNil(cfg.Labels),
		Milestones:     nonNil(cfg.Milestones),
		Series:         cfg.EffectiveSeries(),
		Actors:         cfg.Actors,
		Actor:          s.actor,
		Transitions:    transitions,
		ReasonRequired: required,
	}
}

func (s *Server) handleSchema(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-cache")
	c := s.live
	c.mu.Lock()
	s.liveHeaders(w)
	if c.snap == nil {
		c.mu.Unlock()
		unavailable(w)
		return
	}
	config := c.snap.base.Config
	c.mu.Unlock()
	writeJSON(w, http.StatusOK, config)
}

// --- create ------------------------------------------------------------

type createRequest struct {
	Title              string   `json:"title"`
	Series             string   `json:"series,omitempty"`
	From               string   `json:"from,omitempty"`
	Type               string   `json:"type,omitempty"`
	Priority           string   `json:"priority,omitempty"`
	Labels             []string `json:"labels,omitempty"`
	Assignees          []string `json:"assignees,omitempty"`
	Milestone          *string  `json:"milestone,omitempty"`
	Parent             *string  `json:"parent,omitempty"`
	Dependencies       []string `json:"dependencies,omitempty"`
	BlocksOn           string   `json:"blocksOn,omitempty"`
	DueOn              *string  `json:"dueOn,omitempty"`
	Description        string   `json:"description,omitempty"`
	ImplementationPlan string   `json:"plan,omitempty"`
	AcceptanceCriteria []string `json:"acceptanceCriteria,omitempty"`
	DefinitionOfDone   []string `json:"definitionOfDone,omitempty"`
	Template           string   `json:"template,omitempty"`

	// Board and Card place the new ticket on the canvas in the same call that
	// files it. Creating a card and then discovering it has no position is the
	// one race a canvas cannot tolerate: the card would land at the origin,
	// under whatever is already there.
	Board string       `json:"board,omitempty"`
	Card  *layout.Card `json:"card,omitempty"`
}

type ticketResponse struct {
	Ticket Ticket        `json:"ticket"`
	Layout *layout.Board `json:"layout,omitempty"`
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	if s.refuseWrite(w) {
		return
	}
	var req createRequest
	if err := decode(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "bad_request", Message: err.Error()})
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errBody{
			Code: ticket.CodeInvalidField, Field: "title", Message: "a ticket needs a title",
		})
		return
	}
	res, err := s.store.Create(r.Context(), ticket.CreateOptions{
		Title:              req.Title,
		Series:             req.Series,
		From:               req.From,
		Type:               req.Type,
		Priority:           req.Priority,
		Labels:             req.Labels,
		Assignees:          req.Assignees,
		Milestone:          req.Milestone,
		Parent:             req.Parent,
		Dependencies:       req.Dependencies,
		BlocksOn:           req.BlocksOn,
		DueOn:              req.DueOn,
		Description:        req.Description,
		ImplementationPlan: req.ImplementationPlan,
		AcceptanceCriteria: req.AcceptanceCriteria,
		DefinitionOfDone:   req.DefinitionOfDone,
		Template:           req.Template,
		Actor:              s.actor,
	})
	if err != nil {
		fail(w, err)
		return
	}

	resp := ticketResponse{Ticket: s.one(r.Context(), res.Ticket)}
	if req.Card != nil {
		board := req.Board
		if board == "" {
			board = layout.DefaultBoard
		}
		b, err := s.layout.Update(board, map[string]*layout.Card{res.Ticket.ID: req.Card})
		if err != nil {
			// The ticket exists; only its placement failed. Saying so beats
			// pretending the create failed, which would invite a retry that
			// files a second ticket.
			writeJSON(w, http.StatusMultiStatus, struct {
				ticketResponse
				LayoutError string `json:"layoutError"`
			}{ticketResponse{Ticket: resp.Ticket}, err.Error()})
			return
		}
		resp.Layout = b
	}
	writeJSON(w, http.StatusCreated, resp)
}

// --- patch -------------------------------------------------------------

type patchRequest struct {
	IfRevision string `json:"ifRevision,omitempty"`
	Ops        []Op   `json:"ops"`
}

func (s *Server) handlePatch(w http.ResponseWriter, r *http.Request) {
	if s.refuseWrite(w) {
		return
	}
	var req patchRequest
	if err := decode(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "bad_request", Message: err.Error()})
		return
	}
	if len(req.Ops) == 0 {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "bad_request", Message: "no ops"})
		return
	}
	ref := r.PathValue("id")
	ctx := r.Context()

	// The precondition applies to the first op only, and each op afterwards
	// carries the revision the one before it produced. Sending the client's
	// revision to every op would refuse the second one every time, since the
	// first has already moved it; dropping the precondition after the first
	// would let a batch stomp a concurrent write halfway through. Chaining is
	// the only reading where "these edits apply to the ticket I was looking
	// at" stays true for the whole batch.
	rev := req.IfRevision
	var last *ticket.Ticket
	for i, op := range req.Ops {
		m, err := op.mutation()
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errBody{
				Code:    "bad_request",
				Message: fmt.Sprintf("ops[%d]: %v", i, err),
			})
			return
		}
		res, err := s.store.Apply(ctx, ref, m, ticket.ApplyOptions{
			IfRevision: rev,
			Actor:      s.actor,
		})
		if err != nil {
			fail(w, err)
			return
		}
		last = res.Ticket
		rev = res.Ticket.Revision
		// A status change moves the file, so later ops in the same batch
		// address the ticket by ID rather than by whatever the client sent.
		ref = res.Ticket.ID
	}
	writeJSON(w, http.StatusOK, ticketResponse{Ticket: s.one(ctx, last)})
}

// --- delete ------------------------------------------------------------

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if s.refuseWrite(w) {
		return
	}
	q := r.URL.Query()
	res, err := s.store.Remove(r.Context(), r.PathValue("id"), ticket.RemoveOptions{
		IfRevision: q.Get("ifRevision"),
		Force:      q.Get("force") == "true",
	})
	if err != nil {
		fail(w, err)
		return
	}
	// The card outlives nothing: a removed ticket leaves no placement behind.
	// Boards other than the named one keep their entry until they are next
	// written, which is harmless because a card with no ticket does not render.
	board := q.Get("board")
	if board == "" {
		board = layout.DefaultBoard
	}
	id := r.PathValue("id")
	if res.Ticket != nil {
		id = res.Ticket.ID
	}
	if _, err := s.layout.Update(board, map[string]*layout.Card{id: nil}); err != nil {
		writeJSON(w, http.StatusMultiStatus, map[string]any{"removed": id, "layoutError": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"removed":  id,
		"dangling": res.Dangling,
	})
}

// --- layout ------------------------------------------------------------

type layoutRequest struct {
	Board string                  `json:"board"`
	Cards map[string]*layout.Card `json:"cards"`
}

func (s *Server) handleLayout(w http.ResponseWriter, r *http.Request) {
	if s.refuseWrite(w) {
		return
	}
	var req layoutRequest
	if err := decode(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "bad_request", Message: err.Error()})
		return
	}
	if req.Board == "" {
		req.Board = layout.DefaultBoard
	}
	b, err := s.layout.Update(req.Board, req.Cards)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{Code: "invalid_board", Message: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// --- helpers -----------------------------------------------------------

// one projects a single ticket, recomputing readiness because a mutation may
// have changed what the rest of the store is waiting on, and recomputing the
// abbreviation because a create can lengthen everybody's: two tickets minted
// in the same millisecond share their first ten characters, and a card still
// showing yesterday's short ID would tell the reader to type something that
// now comes back ambiguous.
func (s *Server) one(ctx context.Context, t *ticket.Ticket) Ticket {
	var r ticket.Readiness
	if all, err := s.store.Readiness(ctx); err == nil {
		r = all[t.ID]
	}
	short := t.ID
	if all, err := s.store.List(ctx, ticket.Filter{All: true}); err == nil {
		ids := make([]string, 0, len(all))
		for _, x := range all {
			ids = append(ids, x.ID)
		}
		if s := ticket.ShortestUniqueAcrossSeries(ids)[t.ID]; s != "" {
			short = s
		}
	}
	return toDTO(t, short, r, s.now())
}
