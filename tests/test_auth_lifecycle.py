import json
import os
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie
from unittest.mock import patch

from fastapi import Request, Response
from fastapi.testclient import TestClient

from auth_support import AuthTestCase

from app.auth.cookies import set_session_cookie
from app.db import connect
from app.main import app


class AuthLifecycleTests(AuthTestCase):
    def test_https_cookie_is_secure_and_deleted_on_same_path(self):
        user = self.signup()
        with TestClient(app, base_url="https://testserver") as browser:
            response = self.login(client=browser)
            cookie = SimpleCookie(response.headers["set-cookie"])["session"]
            self.assertTrue(cookie["secure"])
            self.assertTrue(cookie["httponly"])
            self.assertEqual(cookie["samesite"], "lax")
            self.assertEqual(cookie["path"], "/")
            self.assertEqual(cookie["max-age"], "86400")
            self.assertEqual(browser.get("/api/auth/me").json(), user)
            # CookieJar도 HTTPS 쿠키를 평문 HTTP 요청에 보내지 않는다.
            self.assertEqual(browser.get("http://testserver/api/auth/me").status_code, 401)
            response = browser.post("/api/auth/logout")
            deleted = SimpleCookie(response.headers["set-cookie"])["session"]
            self.assertEqual(deleted["path"], cookie["path"])
            self.assertTrue(deleted["secure"])
            self.assertEqual(deleted["max-age"], "0")
            self.assertIsNone(browser.cookies.get("session"))

    def test_deployment_cookie_requires_https_even_behind_proxy(self):
        request = Request({"type": "http", "scheme": "http", "server": ("example.test", 80), "path": "/", "headers": []})
        response = Response()
        with patch.dict(os.environ, {"VERCEL": "1"}):
            set_session_cookie(response, request, "test-token")
        self.assertTrue(SimpleCookie(response.headers["set-cookie"])["session"]["secure"])

    def test_absolute_lifetime_does_not_extend_on_access(self):
        self.signup()
        start = datetime.now(UTC)
        with patch("app.auth.sessions.utcnow", return_value=start):
            self.login()
        token = self.client.cookies["session"]
        with connect() as db:
            before = db.execute("SELECT expires_at FROM sessions").fetchone()[0]
        for delta, expected in ((timedelta(hours=12), 200), (timedelta(hours=24, microseconds=-1), 200), (timedelta(hours=24), 401)):
            with patch("app.auth.sessions.utcnow", return_value=start + delta):
                response = self.client.get("/api/auth/me", headers={"cookie": f"session={token}"})
            self.assertEqual(response.status_code, expected)
            self.assertNotIn("set-cookie", response.headers)
        with connect() as db:
            after = db.execute("SELECT expires_at FROM sessions").fetchone()[0]
        self.assertEqual(before, after)

    def test_new_process_accepts_persisted_session(self):
        user = self.signup()
        self.login()
        process = subprocess.run(
            [sys.executable, "-c", """
import json
import os
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    response = client.get('/api/auth/me', headers={'cookie': 'session=' + os.environ['AUTH_TEST_SESSION']})
    print(json.dumps({'status': response.status_code, 'user': response.json()}))
"""],
            env={**os.environ, "AUTH_TEST_SESSION": self.client.cookies["session"]},
            text=True, capture_output=True, check=True, timeout=15,
        )
        self.assertEqual(json.loads(process.stdout), {"status": 200, "user": user})

    def test_same_browser_account_switch_replaces_only_current_session(self):
        alice = self.signup()
        bob = self.signup("bob", "bob-password")
        self.login()
        first = self.client.cookies["session"]
        with TestClient(app) as other:
            self.login(client=other)
            self.login("bob", "bob-password")
            self.assertEqual(self.client.get("/api/auth/me").json(), bob)
            self.assertEqual(other.get("/api/auth/me").json(), alice)
            self.assertEqual(self.client.get("/api/auth/me", headers={"cookie": f"session={first}"}).status_code, 401)
            self.assertEqual(self.count("sessions"), 2)

    def test_auth_responses_are_not_cacheable(self):
        signup = self.client.post("/api/auth/signup", json={"username": "alice", "password": "example-password"})
        login = self.login()
        me = self.client.get("/api/auth/me")
        logout = self.client.post("/api/auth/logout")
        unauthorized = self.client.get("/api/auth/me")
        for response in (signup, login, me, logout, unauthorized):
            self.assertEqual(response.headers["cache-control"], "no-store")
