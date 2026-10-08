from auth_support import AuthTestCase

from app.auth.sessions import get_session_user
from app.db import connect


class LoginTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.signup()

    def test_login_issues_cookie_and_public_user(self):
        response = self.login()
        self.assertEqual(response.json(), self.user)
        cookie = response.headers["set-cookie"]
        for expected in ("HttpOnly", "SameSite=lax", "Path=/", "Max-Age=86400"):
            self.assertIn(expected, cookie)
        self.assertNotIn("Secure", cookie)
        self.assertEqual(get_session_user(self.client.cookies["session"]).model_dump(), self.user)

    def test_unknown_user_and_wrong_password_have_same_response(self):
        results = []
        for username, password in (("alice", "wrong-password"), ("missing", "example-password")):
            response = self.client.post("/api/auth/login", json={"username": username, "password": password})
            self.assertEqual(response.status_code, 401)
            self.assertNotIn("set-cookie", response.headers)
            results.append(response.json())
        self.assertEqual(results[0], results[1])
        self.assertEqual(self.count("sessions"), 0)

    def test_relogin_replaces_current_session(self):
        self.login()
        first = self.client.cookies["session"]
        self.login()
        second = self.client.cookies["session"]
        self.assertNotEqual(first, second)
        self.assertIsNone(get_session_user(first))
        self.assertEqual(self.count("sessions"), 1)

    def test_corrupt_password_hash_rejects_login(self):
        with connect() as db:
            db.execute("UPDATE users SET password_hash = ?", ("invalid",))
        response = self.client.post("/api/auth/login", json={"username": "alice", "password": "example-password"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.count("sessions"), 0)
