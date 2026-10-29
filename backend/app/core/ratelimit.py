"""Request limits, so one person (or a script) cannot flood the API.

Every request is counted per signed-in session (the bearer token) and, more loosely, per network address. Heavy actions
(creating projects, PDFs, uploads, CSV imports) have their own, tighter limits. Over a limit the API answers 429 with a
plain message and a Retry-After header. Counts live in memory: right for one API server (Render's free plan); with several
servers each one counts on its own.
"""
from __future__ import annotations

import hashlib
import re
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock

from fastapi import Request
from fastapi.responses import JSONResponse

WINDOW = 60.0  # seconds

# (method, path pattern, requests per minute per session). The first match wins; everything else uses GENERAL.
HEAVY = [
    ("POST", re.compile(r"^/api/projects$"), 20),
    ("POST", re.compile(r"^/api/projects/[^/]+/report$"), 10),
    ("POST", re.compile(r"^/api/projects/[^/]+/floorplans$"), 10),
    ("POST", re.compile(r"^/api/floorplans/[^/]+/(analyze|detect-rooms)$"), 20),
    ("POST", re.compile(r"^/api/(admin/)?prices/import$"), 5),
    ("POST", re.compile(r"^/api/demo/seed$"), 5),
]
GENERAL = 120  # per session per minute
PER_ADDRESS = 600  # per network address per minute (several people can share one address, e.g. an office or mobile network)
EXEMPT = re.compile(r"^/api/health")
MESSAGE = "Too many requests. Please wait a minute and try again."


@dataclass
class _Counter:
    hits: dict[str, deque] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    def take(self, key: str, limit: int, now: float) -> float | None:
        """Count one request. Returns None if allowed, else the seconds until the oldest counted request expires."""
        with self.lock:
            q = self.hits.setdefault(key, deque())
            while q and now - q[0] >= WINDOW:
                q.popleft()
            if len(q) >= limit:
                return WINDOW - (now - q[0])
            q.append(now)
            if len(self.hits) > 50_000:  # forget idle keys so memory stays small
                for k in [k for k, v in self.hits.items() if not v or now - v[-1] >= WINDOW]:
                    del self.hits[k]
            return None


def client_address(request: Request) -> str:
    # Behind Render's proxy the visitor's address is the first entry of X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def install_rate_limits(app, enabled: bool = True) -> None:
    counter = _Counter()

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        path, method = request.url.path, request.method
        if not enabled or method == "OPTIONS" or EXEMPT.match(path) or not path.startswith("/api"):
            return await call_next(request)
        now = time.monotonic()
        auth = request.headers.get("authorization", "")
        who = "t:" + hashlib.sha256(auth.encode()).hexdigest()[:24] if auth else "ip:" + client_address(request)
        checks = [(f"addr:{client_address(request)}", PER_ADDRESS), (f"all:{who}", GENERAL)]
        for m, pattern, limit in HEAVY:
            if method == m and pattern.match(path):
                checks.append((f"{pattern.pattern}:{who}", limit))
                break
        for key, limit in checks:
            wait = counter.take(key, limit, now)
            if wait is not None:
                return JSONResponse({"detail": MESSAGE}, status_code=429, headers={"Retry-After": str(max(1, int(wait) + 1))})
        return await call_next(request)
