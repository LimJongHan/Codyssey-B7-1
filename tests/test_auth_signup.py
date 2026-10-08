from auth_support import AuthTestCase

from app.auth.passwords import verify_password
from app.db import connect


class SignupTests(AuthTestCase):
    def test_signup_stores_hash_without_logging_in(self):
        user = self.signup()
        self.assertEqual(set(user), {"id", "username"})
        self.assertEqual(user["username"], "alice")
        with connect() as db:
            saved = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        self.assertTrue(verify_password("example-password", saved["password_hash"]))
        self.assertTrue(saved["created_at"].endswith("Z"))
        self.assertIsNone(self.client.cookies.get("session"))
        self.assertEqual(self.count("sessions"), 0)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_duplicate_does_not_overwrite_user(self):
        original = self.signup()
        response = self.client.post("/api/auth/signup", json={
            "username": "alice", "password": "different-password",
        })
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.count("users"), 1)
        with connect() as db:
            saved = db.execute("SELECT * FROM users").fetchone()
        self.assertEqual(saved["id"], original["id"])
        self.assertTrue(verify_password("example-password", saved["password_hash"]))

    def test_invalid_input_does_not_create_a_user(self):
        response = self.client.post("/api/auth/signup", json={"username": "a", "password": "short"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.count("users"), 0)
