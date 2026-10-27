"""File storage. Production: private Supabase Storage buckets, accessed with the signed-in user's OWN token, so Storage's
Row Level Security applies (each user can only touch the folder named after their user id). Tests use an in-memory store."""
from __future__ import annotations

import re
from typing import Protocol

import httpx

from app.core.auth import Identity
from app.core.config import get_settings


class Storage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...
    def read(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...


_KEY = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$")


def _check_key(key: str) -> str:
    if not _KEY.match(key):
        raise ValueError("invalid storage key")
    return key


def guess_mime(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "application/pdf" if data[:4] == b"%PDF" else "application/octet-stream"


class SupabaseStorage:
    """Files live under ``<user id>/<key>``, which is exactly what the Storage policy checks."""

    def __init__(self, bucket: str, token: str, user_id: str):
        s = get_settings()
        self.base = f"{s.supabase_url}/storage/v1/object"
        self.bucket, self.user_id = bucket, user_id
        self.headers = {"Authorization": f"Bearer {token}", "apikey": s.supabase_publishable_key}

    def _path(self, key: str) -> str:
        return f"{self.user_id}/{_check_key(key)}"

    def save(self, key: str, data: bytes) -> None:
        mime = "application/pdf" if self.bucket == "reports" else guess_mime(data)
        r = httpx.post(f"{self.base}/{self.bucket}/{self._path(key)}", content=data, timeout=60,
                       headers={**self.headers, "Content-Type": mime, "x-upsert": "true"})
        r.raise_for_status()

    def read(self, key: str) -> bytes:
        r = httpx.get(f"{self.base}/authenticated/{self.bucket}/{self._path(key)}", headers=self.headers, timeout=60)
        r.raise_for_status()
        return r.content

    def exists(self, key: str) -> bool:
        r = httpx.head(f"{self.base}/authenticated/{self.bucket}/{self._path(key)}", headers=self.headers, timeout=30)
        return r.status_code == 200

    def delete(self, key: str) -> None:
        r = httpx.delete(f"{self.base}/{self.bucket}/{self._path(key)}", headers=self.headers, timeout=30)
        if r.status_code not in (200, 204, 404):
            r.raise_for_status()


class MemoryStorage:
    """Test double with the same interface and the same per-user folder rule."""

    files: dict[str, bytes] = {}

    def __init__(self, bucket: str, user_id: str):
        self.bucket, self.user_id = bucket, user_id

    def _path(self, key: str) -> str:
        return f"{self.bucket}/{self.user_id}/{_check_key(key)}"

    def save(self, key: str, data: bytes) -> None:
        MemoryStorage.files[self._path(key)] = data

    def read(self, key: str) -> bytes:
        return MemoryStorage.files[self._path(key)]

    def exists(self, key: str) -> bool:
        return self._path(key) in MemoryStorage.files

    def delete(self, key: str) -> None:
        MemoryStorage.files.pop(self._path(key), None)


def storage_for(bucket: str, identity: Identity) -> Storage:
    if get_settings().storage_backend == "memory":  # tests only; never set in production
        return MemoryStorage(bucket, identity.id)
    return SupabaseStorage(bucket, identity.token, identity.id)
