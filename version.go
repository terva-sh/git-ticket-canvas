package main

import (
	"encoding/json"
	"fmt"
	"io"
	"runtime/debug"

	"github.com/terva-sh/git-ticket-canvas/internal/buildinfo"
)

// versionInfo is the standalone CLI version response. It is the same value
// GET /api/version serves, so the browser and the terminal agree.
type versionInfo = buildinfo.Info

// parseBuildVersion keeps the CLI's name for buildinfo.Parse.
func parseBuildVersion(info *debug.BuildInfo) versionInfo {
	return buildinfo.Parse(info)
}

func writeVersion(w io.Writer, asJSON bool) error {
	return writeVersionInfo(w, buildinfo.Read(), asJSON)
}

func writeVersionInfo(w io.Writer, v versionInfo, asJSON bool) error {
	if asJSON {
		return json.NewEncoder(w).Encode(v)
	}
	commit := v.Commit
	if len(commit) > 12 {
		commit = commit[:12]
	}
	suffix := ""
	if v.Modified {
		suffix = ", modified"
	}
	_, err := fmt.Fprintf(w, "git-ticket-canvas %s (%s, %s%s)\n", v.Version, commit, v.Go, suffix)
	return err
}
