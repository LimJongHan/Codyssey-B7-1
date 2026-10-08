import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from auth_support import AuthTestCase

from app.auth.sessions import create_session, get_session_user, revoke_session
from app.db import connect


class SessionTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.signup()

    def test_stores_hash_and_resolves_user(self):
        token = create_session(self.user["id"])
        with connect() as db:
            row = db.execute("SELECT * FROM sessions").fetchone()
        self.assertNotEqual(token, row["token_hash"])
        self.assertEqual(row["token_hash"], hashlib.sha256(token.encode()).hexdigest())
        self.assertEqual(get_session_user(token).model_dump(), self.user)

    def test_expiration_boundary(self):
        start = datetime(2026, 10, 8, tzinfo=UTC)
        with patch("app.auth.sessions.utcnow", return_value=start):
            token = create_session(self.user["id"])
        with patch("app.auth.sessions.utcnow", return_value=start + timedelta(hours=24, microseconds=-1)):
            self.assertIsNotNone(get_session_user(token))
        with patch("app.auth.sessions.utcnow", return_value=start + timedelta(hours=24)):
            self.assertIsNone(get_session_user(token))

    def test_rotation_and_revocation(self):
        first = create_session(self.user["id"])
        other_device = create_session(self.user["id"])
        replacement = create_session(self.user["id"], first)
        self.assertNotEqual(first, replacement)
        self.assertIsNone(get_session_user(first))
        revoke_session(replacement)
        revoke_session(replacement)
        self.assertIsNone(get_session_user(replacement))
        self.assertIsNotNone(get_session_user(other_device))

    def test_invalid_token_and_deleted_user(self):
        for token in (None, "", "x" * 43, "' OR 1=1 --", "한" * 43, "x" * 1000):
            self.assertIsNone(get_session_user(token))
        token = create_session(self.user["id"])
        with connect() as db:
            db.execute("DELETE FROM users WHERE id = ?", (self.user["id"],))
        self.assertIsNone(get_session_user(token))
        self.assertEqual(self.count("sessions"), 0)

    def test_corrupt_or_naive_expiration_is_rejected(self):
        token = create_session(self.user["id"])
        for value in ("invalid-date", "2999-01-01T00:00:00"):
            with connect() as db:
                db.execute("UPDATE sessions SET expires_at = ?", (value,))
            self.assertIsNone(get_session_user(token))
