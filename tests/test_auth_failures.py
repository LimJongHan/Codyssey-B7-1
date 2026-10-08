import os
import sqlite3
from unittest.mock import patch

from argon2.exceptions import HashingError

from auth_support import AuthTestCase

from app.db import connect


class AuthFailureTests(AuthTestCase):
    def test_db_connection_failure_is_sanitized_on_all_auth_paths(self):
        self.signup()
        self.login()
        token = self.client.cookies["session"]
        for method, path, body in (
            ("POST", "/api/auth/signup", {"username": "other", "password": "example-password"}),
            ("POST", "/api/auth/login", {"username": "alice", "password": "example-password"}),
            ("GET", "/api/auth/me", None),
            ("POST", "/api/auth/logout", None),
            ("GET", "/api/rooms", None),
        ):
            with self.subTest(path=path), self.assertLogs("app.auth.storage", level="ERROR") as logs:
                with patch("app.auth.storage.db_connect", side_effect=sqlite3.OperationalError("private-db-data")):
                    response = self.client.request(method, path, json=body)
            self.assertEqual(response.status_code, 500)
            self.assertEqual(response.json(), {"detail": "인증 정보를 처리하지 못했습니다."})
            self.assertNotIn("set-cookie", response.headers)
            for secret in ("private-db-data", "example-password", token):
                self.assertNotIn(secret, response.text + " ".join(logs.output))

    def test_failed_session_insert_rolls_back_rotation(self):
        self.signup()
        self.login()
        token = self.client.cookies["session"]
        with connect() as db:
            db.execute("CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'private-insert-error'); END")
        response = self.client.post("/api/auth/login", json={"username": "alice", "password": "example-password"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("set-cookie", response.headers)
        self.assertNotIn("private-insert-error", response.text)
        self.assertEqual(self.client.cookies["session"], token)
        self.assertEqual(self.count("sessions"), 1)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_failed_signup_is_not_reported_as_duplicate(self):
        with connect() as db:
            db.execute("CREATE TRIGGER fail_signup BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'private-write-error'); END")
        response = self.client.post("/api/auth/signup", json={"username": "alice", "password": "example-password"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.count("users"), 0)

    def test_failed_logout_keeps_session_and_cookie(self):
        self.signup()
        self.login()
        token = self.client.cookies["session"]
        with connect() as db:
            db.execute("CREATE TRIGGER fail_logout BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'private-delete-error'); END")
        response = self.client.post("/api/auth/logout")
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("set-cookie", response.headers)
        self.assertEqual(self.client.cookies["session"], token)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_hash_failure_does_not_create_user(self):
        with patch("app.auth.router.hash_password", side_effect=HashingError("private-hash-error")):
            response = self.client.post("/api/auth/signup", json={"username": "alice", "password": "example-password"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private-hash-error", response.text)
        self.assertEqual(self.count("users"), 0)

    def test_validation_does_not_echo_credentials(self):
        for path in ("signup", "login"):
            response = self.client.post(f"/api/auth/{path}", json={"username": "alice", "password": "short"})
            self.assertEqual(response.status_code, 422)
            self.assertIsInstance(response.json()["detail"], list)
            self.assertNotIn('"short"', response.text)
            self.assertTrue(all("input" not in error for error in response.json()["detail"]))
            self.assertEqual(response.headers["cache-control"], "no-store")

    def test_deployment_storage_guard_stays_in_place(self):
        with patch.dict(os.environ, {"VERCEL": "1"}):
            response = self.client.post("/api/auth/login", json={"username": "alice", "password": "example-password"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("set-cookie", response.headers)

    def test_auth_success_logs_do_not_contain_secrets(self):
        with self.assertLogs("app.auth.router", level="INFO") as logs:
            self.signup()
            self.login()
            token = self.client.cookies["session"]
            self.client.post("/api/auth/logout")
        text = " ".join(logs.output)
        for expected in ("auth_signup_success", "auth_login_success", "auth_logout_success"):
            self.assertIn(expected, text)
        for secret in ("example-password", token, "$argon2id$"):
            self.assertNotIn(secret, text)
