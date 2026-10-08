"""DB에 원문 대신 해시를 저장하는 고정 수명 세션."""

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

from app.auth.schemas import User
from app.db import connect

SESSION_SECONDS = 24 * 60 * 60


def utcnow() -> datetime:
    return datetime.now(UTC)


def _token_hash(token: str | None) -> str | None:
    if token is None or re.fullmatch(r"[A-Za-z0-9_-]{43}", token) is None:
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def create_session(user_id: int, previous_token: str | None = None) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (utcnow() + timedelta(seconds=SESSION_SECONDS)).isoformat()
    with connect() as db:
        # 기존 세션 삭제와 신규 저장은 같은 트랜잭션으로 처리한다.
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(previous_token),))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (_token_hash(token), user_id, expires_at),
        )
    return token


def get_session_user(token: str | None) -> User | None:
    token_hash = _token_hash(token)
    if token_hash is None:
        return None
    with connect() as db:
        row = db.execute(
            "SELECT users.id, users.username, sessions.expires_at "
            "FROM sessions JOIN users ON users.id = sessions.user_id "
            "WHERE sessions.token_hash = ?",
            (token_hash,),
        ).fetchone()
    if row is None:
        return None
    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
    except (TypeError, ValueError):
        return None
    if expires_at.tzinfo is None or expires_at <= utcnow():
        return None
    return User(id=row["id"], username=row["username"])


def revoke_session(token: str | None) -> None:
    token_hash = _token_hash(token)
    if token_hash is not None:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
