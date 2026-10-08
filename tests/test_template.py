import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.db import connect, init_db
from app.main import app


class TemplateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.environment = patch.dict(os.environ, {
            "DATABASE_PATH": str(Path(self.directory.name) / "test.db"), "VERCEL": "",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.addCleanup(app.dependency_overrides.clear)
        self.client = self.enterContext(TestClient(app))

    def test_web_and_health(self):
        self.assertEqual(self.client.get("/api/health").json(), {"status": "ok"})
        self.assertIn("긍정봇", self.client.get("/").text)
        self.assertEqual(self.client.get("/static/app.js").status_code, 200)
        self.assertEqual(self.client.get("/static/style.css").status_code, 200)
        self.assertEqual(self.client.get("/openapi.json").status_code, 200)

    def test_private_endpoints_require_login(self):
        for method, path, body in [
            ("GET", "/api/auth/me", None),
            ("GET", "/api/rooms", None),
            ("POST", "/api/rooms", {"title": "대화"}),
            ("GET", "/api/rooms/1/messages", None),
            ("POST", "/api/rooms/1/messages", {"question": "안녕"}),
        ]:
            with self.subTest(path=path, method=method):
                self.assertEqual(self.client.request(method, path, json=body).status_code, 401)

    def test_only_public_api_skips_login(self):
        # 새 API가 인증 없이 성공하는 가짜 응답이 되지 않도록 공개 API만 명시적으로 허용한다.
        public = {"/api/health", "/api/auth/signup", "/api/auth/login", "/api/auth/logout"}
        for path, operations in app.openapi()["paths"].items():
            if not path.startswith("/api/") or path in public:
                continue
            for method in operations:
                with self.subTest(path=path, method=method):
                    url = path.replace("{room_id}", "1")
                    self.assertEqual(self.client.request(method, url, json={}).status_code, 401)

    def test_input_validation_and_unimplemented_state(self):
        app.dependency_overrides[get_current_user] = lambda: User(id=1, username="test")
        for question in ("", "  ", "a" * 2001):
            self.assertEqual(self.client.post("/api/rooms/1/messages", json={"question": question}).status_code, 422)
        self.assertEqual(self.client.post("/api/rooms", json={"title": " "}).status_code, 422)
        self.assertEqual(self.client.post("/api/auth/signup", json={"username": "demo", "password": "12345678"}).status_code, 201)

    def test_database_persists_and_enforces_foreign_keys(self):
        with connect() as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertEqual(tables, {"users", "sessions", "rooms", "exchanges"})
            db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ("test", "test-only-hash"))
        init_db()
        with connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM users").fetchone()[0], 1)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO rooms (user_id, title) VALUES (?, ?)", (999, "invalid"))

    def test_vercel_does_not_use_local_sqlite(self):
        with patch.dict(os.environ, {"VERCEL": "1"}):
            with TestClient(app) as client:
                self.assertEqual(client.get("/api/health").status_code, 200)
            with self.assertRaises(RuntimeError):
                with connect():
                    pass
