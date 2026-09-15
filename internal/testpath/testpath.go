// Package testpath builds absolute paths for tests that need to name one.
//
// A test that writes "/ws/org" and compares it against a value path/filepath
// produced passes on Linux and fails on Windows, where filepath.IsAbs("/ws/org")
// is false and the path is treated as relative. Fifteen tests failed that way
// once, all of them reporting a product defect that was not there. Naming the
// path through Abs keeps the test readable and keeps the assertion about the
// behavior under test rather than about the platform running it.
package testpath

import (
	"os"
	"path/filepath"
	"runtime"
)

// Abs turns a slash-separated absolute path into one that is absolute here.
//
// On a platform whose separator is already "/" the path is returned unchanged.
// On Windows it gains the volume the test process is running on, so the result
// satisfies filepath.IsAbs and survives filepath.Clean.
func Abs(slash string) string {
	if filepath.Separator == '/' {
		return slash
	}
	return filepath.Join(volume(), filepath.FromSlash(slash))
}

// Join is Abs followed by the elements, for a path built from parts.
func Join(slash string, elem ...string) string {
	return filepath.Join(append([]string{Abs(slash)}, elem...)...)
}

// volume is the drive the test is running on, so a runner that is not on C:
// still gets a real absolute path.
func volume() string {
	if wd, err := os.Getwd(); err == nil {
		if v := filepath.VolumeName(wd); v != "" {
			return v + string(filepath.Separator)
		}
	}
	return `C:\`
}

// HomeEnv is the variable os.UserHomeDir reads on this platform.
//
// A test that points the home directory at a temporary one has to set the
// variable this platform actually reads. Setting HOME on Windows changes
// nothing, so tilde expansion there quietly used the real account's home.
func HomeEnv() string {
	switch runtime.GOOS {
	case "windows":
		return "USERPROFILE"
	case "plan9":
		return "home"
	default:
		return "HOME"
	}
}
