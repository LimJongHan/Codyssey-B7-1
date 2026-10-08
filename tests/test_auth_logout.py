from fastapi.testclient import TestClient

from auth_support import AuthTestCase

from app.main import app


class LogoutTests(AuthTestCase):
    def test_logout_revokes_cookie_and_server_session(self):
        self.signup()
        self.login()
        token = self.client.cookies["session"]
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertIn("Max-Age=0", response.headers["set-cookie"])
        self.assertIsNone(self.client.cookies.get("session"))
        self.assertEqual(self.count("sessions"), 0)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers={"cookie": f"session={token}"}).status_code, 401)

    def test_logout_without_session_is_idempotent(self):
        for _ in range(2):
            self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        response = self.client.post("/api/auth/logout", headers={"cookie": "session=" + "x" * 43})
        self.assertEqual(response.status_code, 204)

    def test_other_device_keeps_its_session(self):
        user = self.signup()
        self.login()
        with TestClient(app) as other:
            self.login(client=other)
            self.assertEqual(self.count("sessions"), 2)
            self.client.post("/api/auth/logout")
            self.assertEqual(other.get("/api/auth/me").json(), user)
            self.assertEqual(self.count("sessions"), 1)
