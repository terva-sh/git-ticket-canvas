# Developer setup and examples: docs/development.md
set positional-arguments

# List available recipes.
default:
    @just --list

# Build ./tkcanvas with the embedded frontend.
build:
    go build -o tkcanvas .

# Install tkcanvas to GOBIN, or Go's default GOPATH/bin.
install:
    go install .

# Rebuild and run; forward arguments unchanged to tkcanvas.
run *args="": build
    exec ./tkcanvas "$@"

# Run all Go tests with the race detector and coverage; accepts Go test flags.
test *args="":
    go test -race -cover "$@" ./...

# Format Go source files in place.
fmt:
    go fmt ./...

# Refuse unformatted Go files without changing them.
fmt-check:
    @files="$(gofmt -l .)" || exit 1; if [ -n "$files" ]; then printf 'Run just fmt for:\n%s\n' "$files"; exit 1; fi

# Run Go static analysis.
vet:
    go vet ./...

# Check frontend JavaScript syntax without a frontend build step.
js-check:
    node --check web/app.js

# Validate the ticket store and detect pending repairs without writing.
tickets-check:
    git ticket check --fix --dry-run --strict

# Install locked browser-test dependencies and Chromium (host libraries may need OS setup).
browser-setup:
    npm ci
    npx playwright install chromium

# Test the unconverted frontend against isolated Go servers; accepts Playwright flags.
browser-test *args="":
    npm run test:browser -- "$@"

# Run formatting, static analysis, syntax, tests, and ticket validation.
check: fmt-check vet js-check test tickets-check
