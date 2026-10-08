import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.db import connect
from app.main import app


class ChatTestCase(unittest.TestCase):
    """임시 DB와 테스트 사용자로 채팅 API를 검증한다. 인증 우회는 테스트 안에서만 쓴다."""

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
        self.alice = self.add_user("alice")
        self.login(self.alice)

    def add_user(self, username):
        with connect() as db:
            user_id = db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id",
                (username, "test-only-hash"),
            ).fetchone()[0]
        return User(id=user_id, username=username)

    def login(self, user):
        app.dependency_overrides[get_current_user] = lambda: user


class CreateRoomTests(ChatTestCase):
    def test_saves_room_for_current_user(self):
        with self.assertLogs("app.chat.router", "INFO") as logs:
            response = self.client.post("/api/rooms", json={"title": "  오늘 이야기  "})
        self.assertEqual(response.status_code, 201)
        room = response.json()
        self.assertEqual(set(room), {"id", "title", "created_at"})
        self.assertEqual(room["title"], "오늘 이야기")
        self.assertTrue(room["created_at"].endswith("Z"))
        with connect() as db:
            saved = db.execute("SELECT user_id, title FROM rooms WHERE id = ?", (room["id"],)).fetchone()
        self.assertEqual(tuple(saved), (self.alice.id, "오늘 이야기"))
        self.assertIn(f"db_save_success user_id={self.alice.id} room_id={room['id']}", "\n".join(logs.output))

    def test_uses_default_title(self):
        response = self.client.post("/api/rooms", json={})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], "새 대화")

    def test_title_length_limit(self):
        self.assertEqual(self.client.post("/api/rooms", json={"title": "가" * 100}).status_code, 201)
        self.assertEqual(self.client.post("/api/rooms", json={"title": "가" * 101}).status_code, 422)

    def test_reports_db_failure(self):
        # 세션은 유효하지만 users에 없는 사용자 → FK 위반으로 저장 실패
        self.login(User(id=999, username="ghost"))
        with self.assertLogs("app.chat.router", "ERROR") as logs:
            response = self.client.post("/api/rooms", json={"title": "대화"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "채팅방을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."})
        self.assertIn("db_save_failure user_id=999", "\n".join(logs.output))
        with connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM rooms").fetchone()[0], 0)
