package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io/fs"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Live timings target local Linux/WSL2 stores. Events settle for 100ms, with a
// one-second cap even during continuous writes. Failed reads retry in 250ms.
// The independent safety scan repairs missed notifications every minute.
type liveTiming struct {
	debounce, burst, settle, retry, safety, heartbeat, writeTimeout time.Duration
}

var defaultLiveTiming = liveTiming{
	100 * time.Millisecond, time.Second, 40 * time.Millisecond,
	250 * time.Millisecond, 60 * time.Second, 15 * time.Second, 5 * time.Second,
}

// LiveStats counts actual server work, not HTTP requests. Rebuilds includes
// failed full-build attempts; SafetyScans counts periodic reconciliation runs.
type LiveStats struct {
	Rebuilds, SafetyScans uint64
	Subscribers           int
}

type liveState struct {
	Epoch      string   `json:"epoch"`
	Generation uint64   `json:"generation"`
	Scopes     []string `json:"scopes"`
	Stale      bool     `json:"stale"`
	Degraded   bool     `json:"degraded"`
}

type coordinator struct {
	// buildMu serializes authoritative reads and API-triggered reconciliation.
	// mu protects publication only; slow files never block cached board reads.
	buildMu    sync.Mutex
	mu         sync.Mutex
	s          *Server
	ctx        context.Context
	cancel     context.CancelFunc
	done       chan struct{}
	started    bool
	closed     bool
	timing     liveTiming
	state      liveState
	snap       *snapshot
	stats      LiveStats
	subs       map[chan liveState]struct{}
	wake       chan struct{}
	fault      chan error // also permits deterministic overflow/loss tests
	watcher    *fsnotify.Watcher
	watchOK    bool
	last       [32]byte
	hasLast    bool
	nextExpiry time.Time
}

func newCoordinator() *coordinator {
	var epoch [16]byte
	// crypto/rand.Read fills the buffer or terminates the process on failure.
	_, _ = rand.Read(epoch[:])
	return &coordinator{
		timing: defaultLiveTiming,
		state:  liveState{Epoch: hex.EncodeToString(epoch[:]), Stale: true, Degraded: true},
		subs:   make(map[chan liveState]struct{}), wake: make(chan struct{}, 1), fault: make(chan error, 1),
		done: make(chan struct{}),
	}
}

// Start starts directory watches and builds the initial snapshot. A malformed
// store does not prevent serving: board/schema return 503 until recovery. Call
// Close before HTTP shutdown so open event streams cannot delay shutdown.
// Configure the Server before Start; its options and clock are then immutable.
func (s *Server) Start(ctx context.Context) error {
	c := s.live
	c.buildMu.Lock()
	defer c.buildMu.Unlock()
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return errors.New("canvas live coordinator is closed")
	}
	if c.started {
		c.mu.Unlock()
		return nil
	}
	c.started = true
	c.s = s
	c.ctx, c.cancel = context.WithCancel(ctx)
	c.mu.Unlock()
	c.repairWatches()
	c.reconcileLocked(true, false)
	go c.run()
	return nil
}

// Close releases watchers and subscribers. It is safe to call more than once.
func (s *Server) Close() error {
	c := s.live
	c.mu.Lock()
	if !c.started {
		c.closed = true
		c.mu.Unlock()
		return nil
	}
	c.cancel()
	c.mu.Unlock()
	<-c.done
	return nil
}

func (s *Server) LiveStats() LiveStats {
	c := s.live
	c.mu.Lock()
	defer c.mu.Unlock()
	stats := c.stats
	stats.Subscribers = len(c.subs)
	return stats
}

func (c *coordinator) hint() {
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

func (c *coordinator) reconcile(force, safety bool) {
	c.buildMu.Lock()
	defer c.buildMu.Unlock()
	c.mu.Lock()
	active := c.started && !c.closed
	c.mu.Unlock()
	if active && c.ctx.Err() == nil {
		c.repairWatches()
		c.reconcileLocked(force, safety)
	}
}

// repairWatches scans directories, not individual files. Watching the parent
// also detects removal/replacement of the store itself. Add watches before
// reading: files created inside a just-created directory are covered by that
// same reconciliation even if their creation notification was missed.
func (c *coordinator) repairWatches() {
	if c.watcher == nil {
		w, err := fsnotify.NewWatcher()
		if err != nil {
			c.watchOK = false
			return
		}
		c.watcher = w
	}
	wanted := map[string]bool{filepath.Dir(c.s.store.Path()): true}
	err := filepath.WalkDir(c.s.store.Path(), func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if path != c.s.store.Path() && !c.relevantDirectory(path) {
				return filepath.SkipDir
			}
			wanted[path] = true
		}
		return nil
	})
	ok := err == nil
	have := make(map[string]bool)
	for _, path := range c.watcher.WatchList() {
		have[path] = true
		if !wanted[path] {
			_ = c.watcher.Remove(path)
		}
	}
	for path := range wanted {
		if !have[path] {
			if err := c.watcher.Add(path); err != nil {
				ok = false
			}
		}
	}
	c.watchOK = ok
}

func (c *coordinator) relevantDirectory(path string) bool {
	for _, dir := range c.s.ticketDirs() {
		if path == dir {
			return true
		}
	}
	return path == c.s.layout.Dir()
}

func (c *coordinator) relevantEvent(e fsnotify.Event) bool {
	path := filepath.Clean(e.Name)
	if path == c.s.store.Path() || c.relevantDirectory(path) {
		return true
	}
	return c.s.authoritativeFile(path)
}

func (c *coordinator) run() {
	defer close(c.done)
	defer func() {
		c.buildMu.Lock()
		if c.watcher != nil {
			_ = c.watcher.Close()
		}
		c.mu.Lock()
		c.closed = true
		for ch := range c.subs {
			close(ch)
			delete(c.subs, ch)
		}
		c.mu.Unlock()
		c.buildMu.Unlock()
	}()
	safety := time.NewTicker(c.timing.safety)
	defer safety.Stop()
	// A small scheduler tick handles retries and expiry without a goroutine or
	// timer per ticket. The clock itself is captured once by each full build.
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	var first, due time.Time
	schedule := func() {
		now := time.Now()
		if first.IsZero() {
			first = now
		}
		due = now.Add(c.timing.debounce)
		if max := first.Add(c.timing.burst); due.After(max) {
			due = max
		}
	}
	for {
		c.buildMu.Lock()
		var events <-chan fsnotify.Event
		var errs <-chan error
		if c.watcher != nil {
			events, errs = c.watcher.Events, c.watcher.Errors
		}
		c.buildMu.Unlock()
		select {
		case <-c.ctx.Done():
			return
		case <-c.wake:
			schedule()
		case e, ok := <-events:
			if !ok {
				c.watcherFailed()
				schedule()
			} else if c.relevantEvent(e) {
				schedule()
			}
		case _, ok := <-errs:
			_ = ok
			c.watcherFailed()
			schedule()
		case <-c.fault:
			c.watcherFailed()
			schedule()
		case <-safety.C:
			c.reconcile(true, true)
			first, due = time.Time{}, time.Time{}
		case now := <-tick.C:
			c.mu.Lock()
			stale, degraded, expiry := c.state.Stale, c.state.Degraded, c.nextExpiry
			c.mu.Unlock()
			if !due.IsZero() && !now.Before(due) {
				c.reconcile(false, false)
				first, due = time.Time{}, time.Time{}
			} else if !expiry.IsZero() && !now.Before(expiry) {
				c.reconcile(true, false)
			} else if (stale || degraded) && due.IsZero() {
				first, due = now, now.Add(c.timing.retry)
			}
		}
	}
}

func (c *coordinator) watcherFailed() {
	c.buildMu.Lock()
	defer c.buildMu.Unlock()
	if c.watcher != nil {
		_ = c.watcher.Close()
		c.watcher = nil
	}
	c.watchOK = false
	c.hasLast = false // overflow is not a reliable content hint
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.state.Degraded {
		c.state.Degraded = true
		c.publishLocked(nil)
	}
}

func (c *coordinator) publishLocked(scopes []string) {
	c.state.Generation++
	c.state.Scopes = append([]string{}, scopes...)
	for ch := range c.subs {
		state := c.state
		select {
		case ch <- state:
		default:
			// A superseded queue entry may have named another layout. Broad
			// scopes make every subscriber revalidate after any queue overrun.
			select {
			case <-ch:
			default:
			}
			state.Scopes = []string{"tickets", "config", "boards"}
			ch <- state
		}
	}
}
