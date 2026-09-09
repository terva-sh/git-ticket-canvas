# Current developer setup: docs/development-vite.md
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

# Run platform unit and import-boundary tests in Node.
web-test *args="":
    npm run test:unit -- "$@"

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
check: web-build web-test fmt-check vet test tickets-check
