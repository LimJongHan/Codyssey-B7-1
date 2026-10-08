from auth_support import AuthTestCase

from app.db import connect


class CurrentUserTests(AuthTestCase):
    def test_me_returns_only_the_authenticated_user(self):
        user = self.signup()
        self.login()
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), user)
        self.assertEqual(set(response.json()), {"id", "username"})

    def test_missing_and_forged_cookies_are_rejected(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        for token in ("unknown", "x" * 43, "x" * 1000):
            response = self.client.get("/api/auth/me", headers={"cookie": "session=" + token})
            self.assertEqual(response.status_code, 401)

    def test_expired_session_and_deleted_user_are_rejected(self):
        self.signup()
        self.login()
        with connect() as db:
            db.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z'")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.login()
        with connect() as db:
            db.execute("DELETE FROM users")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
