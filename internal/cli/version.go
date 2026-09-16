package cli

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

func writeVersion(w io.Writer, kind Kind, asJSON bool) error {
	return writeVersionInfo(w, kind, buildinfo.Read(), asJSON)
}

// writeVersionInfo names the command that printed it. The JSON is the same
// value from either binary, because it is the build's identity rather than the
// executable's, and GET /api/version answers with it too.
func writeVersionInfo(w io.Writer, kind Kind, v versionInfo, asJSON bool) error {
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
	_, err := fmt.Fprintf(w, "%s %s (%s, %s%s)\n", kind, v.Version, commit, v.Go, suffix)
	return err
}
