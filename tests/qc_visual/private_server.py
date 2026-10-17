"""(b) THE KIT'S PRIVATE DCRS: starts tests/qc_visual/server.ts (temp embedded PostgreSQL, free port, current worktree's code), with a
random password generated here, per run, in memory - it goes to the server through its environment and nowhere else (no file, no log,
no commit, no print). Used as a context manager:

    with PrivateServer(port=None, build=True) as srv:
        srv.url, srv.email, srv.password
"""
import os
import secrets
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402

SUPER_ADMIN_EMAIL = "admin@gpp.local"


class PrivateServer:
    def __init__(self, port=None, build=True, ready_timeout=240):
        if port and port in common.FORBIDDEN_PORTS:
            raise SystemExit(f"Port {port} is one the kit never uses ({sorted(common.FORBIDDEN_PORTS)}).")
        self.port = port
        self.build = build
        self.ready_timeout = ready_timeout
        # a random password per run; shaped to pass any password rule (length, case, digit, symbol)
        self.password = secrets.token_urlsafe(18) + "aZ9!"
        self.email = SUPER_ADMIN_EMAIL
        self.url = None
        self.proc = None
        self.lines = []

    def __enter__(self):
        env = dict(os.environ)
        env["QCVIS_PASSWORD"] = self.password
        args = ["node", "--no-warnings=ExperimentalWarning", os.path.join(common.HERE, "server.ts")]
        if self.port:
            args += ["--port", str(self.port)]
        if self.build:
            args += ["--build"]
        self.proc = subprocess.Popen(
            args,
            cwd=common.ROOT,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        ready = threading.Event()

        def pump():
            for line in self.proc.stdout:
                line = line.rstrip()
                self.lines.append(line)
                if line.startswith("READY "):
                    self.url = line.split(" ", 1)[1].strip()
                    ready.set()
            ready.set()

        threading.Thread(target=pump, daemon=True).start()
        started = time.time()
        while not ready.wait(1.0):
            if time.time() - started > self.ready_timeout:
                break
        if not self.url:
            tail = "\n".join(self.lines[-15:])
            self.__exit__(None, None, None)
            raise SystemExit("The private DCRS did not come up:\n" + tail)
        common.say(f"[qc-visual] private DCRS up at {self.url} (temporary database, this worktree's code)")
        return self

    def __exit__(self, *exc):
        p = self.proc
        if p and p.poll() is None:
            try:
                p.stdin.write("stop\n")
                p.stdin.flush()
                p.stdin.close()
            except Exception:
                pass
            try:
                p.wait(timeout=90)
            except subprocess.TimeoutExpired:
                p.kill()
        self.proc = None
        common.say("[qc-visual] private DCRS stopped, its database removed")
        return False
