# Current developer setup: docs/development-preact.md
set positional-arguments

# List available recipes.
default:
    @just --list

# Rebuild frontend assets, then build ./tkcanvas. Raw go build uses committed dist.
build: web-build
    go build -o tkcanvas .

# Rebuild frontend assets, then install to GOBIN or GOPATH/bin.
install: web-build
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

# Validate the ticket store and detect pending repairs without writing.
tickets-check:
    git ticket check --fix --dry-run --strict

# Install locked browser-test dependencies and Chromium (host libraries may need OS setup).
browser-setup:
    npm ci
    npx playwright install chromium

# Rebuild assets and test the bundled frontend against isolated Go servers.
browser-test *args="":
    npm run test:browser -- "$@"

# Install the locked frontend dependencies.
web-setup:
    npm ci

# Typecheck TypeScript and compile web/dist; commit the generated assets.
web-build:
    npm run build

# Run platform, component, and import-boundary tests.
web-test *args="":
    npm run test:unit -- "$@"

# Test the dist verifier's rejection and cleanup paths.
tooling-test:
    node --test tests/tooling/*.test.mjs

# Locked isolated rebuild versus HEAD and working dist; never overwrite web/dist.
dist-verify:
    node scripts/verify-dist.mjs

# Test existing embedded assets without npm's rebuild prehook.
browser-test-embedded *args="":
    npm exec -- playwright test "$@"

# Build/install clean HEAD with only Go on PATH. Requires Python 3.12+ and Git.
go-only-check:
    python3 scripts/verify-go-only.py

# Release gate: verify before any command can overwrite committed assets.
parity-check:
    just dist-verify
    just web-setup
    just web-typecheck
    just web-test
    just tooling-test
    just fmt-check
    just vet
    just test
    just tickets-check
    just browser-test-embedded
    just go-only-check

# Check strict TypeScript without emitting assets.
web-typecheck:
    npm run typecheck

# Start Vite on loopback; /api proxies to TKCANVAS_API_URL or localhost:7777.
web-dev *args="":
    npm run dev -- "$@"

# Start the Go API for Vite, using committed assets; accepts application flags.
api-dev *args="":
    go build -o tkcanvas .
    exec ./tkcanvas "$@"

# Rebuild assets before validating Go, frontend syntax, and the ticket store.
check: web-build web-test tooling-test fmt-check vet test tickets-check
