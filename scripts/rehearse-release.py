"""Exercise a clean tagged build in a disposable clone. Never push or tag the source checkout."""
from pathlib import Path
import subprocess
import tempfile


def main():
    source = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    with tempfile.TemporaryDirectory(prefix="canvas-release-rehearsal-") as temp:
        clone = Path(temp) / "source"
        subprocess.run(["git", "clone", "--local", "--no-hardlinks", "--quiet", source, str(clone)], check=True)
        def run(*args):
            subprocess.run(args, cwd=clone, check=True, timeout=300)
        # GoReleaser needs a recognizable remote, but no operation contacts it.
        run("git", "remote", "set-url", "origin", "https://github.com/terva-sh/git-ticket-canvas.git")
        tag = "v0.0.0-rehearsal"
        run("git", "-c", "user.name=Release rehearsal", "-c", "user.email=rehearsal@example.invalid",
            "tag", "-a", tag, "-m", "Disposable local release verification")
        run("goreleaser", "release", "--clean", "--skip=publish", "--parallelism=2")
        run("python3", "scripts/verify-release.py", "--tag", tag)
        print("Clean tagged rehearsal passed. Temporary tag, archives and clone are removed; nothing published.")


if __name__ == "__main__":
    main()
