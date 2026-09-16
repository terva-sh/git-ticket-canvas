// Package web holds the built frontend and embeds it into both canvas
// commands.
//
// It lives here rather than beside either command because there are two of
// them, the desk canvas and the served one, and go:embed can only reach files
// at or below its own package directory. Putting the embed in one command's
// package would leave the other unable to see the assets at all.
package web

import (
	"embed"
	"io/fs"
)

// files is the built frontend. The build is committed, so a checkout with only
// Go on PATH produces a working binary.
//
//go:embed all:dist
var files embed.FS

// FS returns the built frontend rooted where index.html is, which is what the
// registry serves at /.
func FS() (fs.FS, error) {
	return fs.Sub(files, "dist")
}
