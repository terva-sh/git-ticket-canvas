#!/bin/sh
# Install a verified release binary without Go, Node, Python, or sudo.
set -u

REPO=terva-sh/git-ticket-canvas
PREFIX=""
TAG=""
WORK=""
PENDING=""

fail() {
    printf 'install.sh: %s\n' "$*" >&2
    exit 1
}

usage() {
    printf '%s\n' \
        'Usage: sh install.sh [--prefix DIR] [--version TAG]' \
        '' \
        'Install the latest stable GitHub release of terva-sh/git-ticket-canvas.' \
        '--prefix DIR   Put the binary directly in DIR, not DIR/bin.' \
        '               Default: first writable ~/.local/bin, then ~/bin.' \
        '--version TAG  Install an exact release tag instead of latest stable.' \
        '-h, --help     Show this help without downloading anything.' \
        '' \
        'Requires curl, tar, and sha256sum or shasum. Never invokes sudo.'
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix | --version)
            flag=$1
            [ "$#" -ge 2 ] || fail "$flag needs a value"
            case "$2" in '' | --*) fail "$flag needs a value" ;; esac
            if [ "$flag" = --prefix ]; then PREFIX=$2; else TAG=$2; fi
            shift 2
            ;;
        -h | --help) usage; exit 0 ;;
        *) fail "unknown argument $1; use --help" ;;
    esac
done

case "$(uname -s)" in
    Linux) OS=linux ;;
    Darwin) OS=darwin ;;
    *) fail "unsupported platform; releases support Linux and macOS" ;;
esac
case "$(uname -m)" in
    x86_64 | amd64) ARCH=amd64 ;;
    aarch64 | arm64) ARCH=arm64 ;;
    *) fail "unsupported architecture; releases support amd64 and arm64" ;;
esac

for tool in curl tar awk sed mktemp mkdir cp chmod mv rm; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool is required"
done
if command -v sha256sum >/dev/null 2>&1; then
    SHA=sha256sum
elif command -v shasum >/dev/null 2>&1; then
    SHA=shasum
else
    fail "neither sha256sum nor shasum is available; refusing an unverified install"
fi

cleanup() {
    [ -z "$PENDING" ] || rm -f "$PENDING"
    [ -z "$WORK" ] || rm -rf "$WORK"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
WORK=$(mktemp -d) || fail "mktemp failed"

if [ -z "$TAG" ]; then
    curl -fsSL -o "$WORK/release.json" "https://api.github.com/repos/$REPO/releases/latest" ||
        fail "could not fetch the latest stable release"
    TAG=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$WORK/release.json")
fi
# Release tags become URL and filename components. Reject empty or unsafe values.
case "$TAG" in
    '' | [!a-zA-Z0-9]* | *[!a-zA-Z0-9._-]*) fail "invalid release tag; use an exact tag such as v1.2.3" ;;
esac
VERSION=${TAG#v}
[ -n "$VERSION" ] || fail "invalid release tag $TAG"
ASSET="git-ticket-canvas_${VERSION}_${OS}_${ARCH}.tar.gz"
BASE="https://github.com/$REPO/releases/download/$TAG"

printf 'downloading %s (%s)\n' "$ASSET" "$TAG"
curl -fsSL -o "$WORK/$ASSET" "$BASE/$ASSET" || fail "downloading $ASSET failed; the release asset may be unavailable"
curl -fsSL -o "$WORK/checksums.txt" "$BASE/checksums.txt" || fail "downloading checksums.txt failed"

# Match the filename literally, never as a regex or suffix. Require one entry
# with exactly 64 hex digits. Other release assets do not affect verification.
EXPECTED=$(awk -v asset="$ASSET" '
    $NF == asset || $NF == "*" asset {
        count++
        if (NF != 2 || length($1) != 64 || $1 ~ /[^0-9a-fA-F]/) bad = 1
        hash = tolower($1)
    }
    END {
        if (count != 1 || bad) exit 1
        print hash
    }
' "$WORK/checksums.txt") || fail "missing, malformed, or duplicate checksum entry for $ASSET"
if [ "$SHA" = sha256sum ]; then
    ACTUAL=$(sha256sum < "$WORK/$ASSET") || fail "could not calculate sha256 for $ASSET"
else
    ACTUAL=$(shasum -a 256 < "$WORK/$ASSET") || fail "could not calculate sha256 for $ASSET"
fi
ACTUAL=${ACTUAL%% *}
[ "$ACTUAL" = "$EXPECTED" ] || fail "sha256 verification failed for $ASSET; refusing to install it"
printf 'sha256 verified against checksums.txt\n'

# Extract only the root binary, not unrelated paths from the release archive.
# Accept tar archives made with either a bare filename or a ./ prefix.
tar -tzf "$WORK/$ASSET" > "$WORK/members" || fail "could not list $ASSET"
MEMBER=$(awk '
    $0 == "git-ticket-canvas" || $0 == "./git-ticket-canvas" { count++; member = $0 }
    END { if (count != 1) exit 1; print member }
' "$WORK/members") || fail "the archive must contain exactly one root git-ticket-canvas binary"
mkdir "$WORK/extract" || fail "cannot create extraction directory"
tar -xzf "$WORK/$ASSET" -C "$WORK/extract" "$MEMBER" || fail "unpacking $ASSET failed"
BINARY="$WORK/extract/git-ticket-canvas"
if [ ! -f "$BINARY" ] || [ -L "$BINARY" ]; then
    fail "the archive did not contain a regular git-ticket-canvas binary"
fi

if [ -n "$PREFIX" ]; then
    case "$PREFIX" in /*) DEST=$PREFIX ;; *) DEST="$(pwd)/$PREFIX" ;; esac
    mkdir -p "$DEST" 2>/dev/null || fail "cannot create $DEST"
    [ -w "$DEST" ] || fail "$DEST is not writable; pick another --prefix"
else
    [ -n "${HOME:-}" ] || fail "HOME is unset; pass --prefix DIR"
    DEST=""
    for d in "$HOME/.local/bin" "$HOME/bin"; do
        if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then
            DEST=$d
            break
        fi
    done
    [ -n "$DEST" ] || fail "neither ~/.local/bin nor ~/bin is writable; pass --prefix DIR"
fi
DEST=$(CDPATH='' cd -P "$DEST" && pwd) || fail "cannot resolve the install directory"
[ ! -d "$DEST/git-ticket-canvas" ] || fail "$DEST/git-ticket-canvas is a directory"

# Stage on the destination filesystem so mv is an atomic rename, even when
# TMPDIR is on another mount. Failures before the rename preserve the old file.
PENDING=$(mktemp "$DEST/.git-ticket-canvas.new.XXXXXX") || fail "cannot stage the binary in $DEST"
cp "$BINARY" "$PENDING" || fail "copying the binary failed"
chmod 0755 "$PENDING" || fail "setting executable permissions failed"
mv -f "$PENDING" "$DEST/git-ticket-canvas" || fail "installing into $DEST failed"
PENDING=""
printf 'installed %s/git-ticket-canvas (%s)\n' "$DEST" "$TAG"

case ":${PATH:-}:" in
    *":$DEST:"*) ;;
    *) printf 'warning: %s is not on PATH; add it to run git ticket-canvas\n' "$DEST" >&2 ;;
esac
FIRST=$(command -v git-ticket-canvas || true)
if [ -n "$FIRST" ] && [ "$FIRST" != "$DEST/git-ticket-canvas" ]; then
    printf 'warning: %s comes first on PATH; git ticket-canvas still resolves there\n' "$FIRST" >&2
fi
