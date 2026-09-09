"""Build and install a clean HEAD archive with only Go on PATH."""
import io
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


def main():
    go = shutil.which("go")
    if not go:
        raise RuntimeError("Go must be installed")
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    archive = subprocess.check_output(["git", "archive", "--format=tar", "HEAD"])
    with tempfile.TemporaryDirectory(prefix="tkcanvas-go-only-") as temporary:
        root = Path(temporary)
        source, tools, binaries = (root / name for name in ("source", "tools", "bin"))
        for path in (source, tools, binaries):
            path.mkdir()
        with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
            bundle.extractall(source, filter="data")
        (tools / "go").symlink_to(Path(go).resolve())
        env = dict(os.environ, PATH=str(tools), CGO_ENABLED="0", GOTOOLCHAIN="local",
                   GOWORK="off", GOFLAGS="", GOBIN=str(binaries))
        for name in ("node", "npm", "npx"):
            if shutil.which(name, path=env["PATH"]):
                raise RuntimeError(f"{name} must not be on the build PATH")
        for args in (["build", "-o", str(binaries / "built"), "."], ["install", "."]):
            subprocess.run([str(tools / "go"), *args], cwd=source, env=env, check=True, timeout=120)
        for name in ("built", "tkcanvas"):
            if not (binaries / name).is_file():
                raise RuntimeError(f"missing binary: {name}")
        print(f"Go-only build and install passed for clean HEAD {revision}; Node/npm absent from PATH.")


if __name__ == "__main__":
    main()
