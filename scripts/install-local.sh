#!/usr/bin/env bash
# Match ../git-ticket's local destination policy without changing PATH.
set -uo pipefail

if [ "$#" -gt 1 ]; then
    printf 'usage: install-local.sh [DIR]\n' >&2
    exit 1
fi
dest="${1:-}"
if [ -n "$dest" ]; then
    mkdir -p "$dest" 2>/dev/null || { printf 'install: cannot create %s\n' "$dest" >&2; exit 1; }
    [ -w "$dest" ] || { printf 'install: %s is not writable\n' "$dest" >&2; exit 1; }
else
    for d in "$HOME/.local/bin" "$HOME/bin"; do
        if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then
            dest="$d"
            break
        fi
    done
    if [ -z "$dest" ]; then
        printf 'install: neither ~/.local/bin nor ~/bin is writable.\n' >&2
        printf 'Make one writable, or name a directory: just install DIR. No sudo is used.\n' >&2
        exit 1
    fi
fi
if [ -d "$dest/git-ticket-canvas" ]; then
    printf 'install: %s/git-ticket-canvas is a directory\n' "$dest" >&2
    exit 1
fi

work="$(mktemp -d)" || exit 1
pending=""
cleanup() {
    [ -z "$pending" ] || rm -f -- "$pending"
    rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

buildflags=()
if [ "$(git rev-parse --git-dir 2>/dev/null)" != "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
    buildflags+=(-buildvcs=false)
fi
go build "${buildflags[@]}" -o "$work/git-ticket-canvas" . || exit 1

# Unique destination-local staging avoids ETXTBSY and concurrent staging collisions.
pending="$(mktemp "$dest/.git-ticket-canvas.new.XXXXXX")" || exit 1
cp "$work/git-ticket-canvas" "$pending" || exit 1
chmod 0755 "$pending" || exit 1
mv -f -- "$pending" "$dest/git-ticket-canvas" || exit 1
pending=""
printf 'installed %s/git-ticket-canvas\n' "$dest"

case ":$PATH:" in
    *":$dest:"*) ;;
    *) printf 'warning: %s is not on PATH, so git ticket-canvas will not resolve there\n' "$dest" >&2 ;;
esac
first="$(command -v git-ticket-canvas || true)"
if [ -n "$first" ] && [ "$first" != "$dest/git-ticket-canvas" ]; then
    printf 'warning: %s comes first on PATH, so git ticket-canvas still means that one\n' "$first" >&2
    printf 'Remove it yourself, or install there instead: just install "%s"\n' "$(dirname "$first")" >&2
fi
if [ "${#buildflags[@]}" -gt 0 ]; then
    printf 'note: linked worktree, built with -buildvcs=false\n' >&2
fi
