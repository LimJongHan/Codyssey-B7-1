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
            "DATABASE_PATH": str(Path(self.directory.name) / "test.db"),
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

    def create_room(self, title="대화"):
        return self.client.post("/api/rooms", json={"title": title}).json()

    def add_exchange(self, room_id, question, answer):
        with connect() as db:
            db.execute(
                "INSERT INTO exchanges (room_id, question, answer) VALUES (?, ?, ?)",
                (room_id, question, answer),
            )


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


class ListRoomsTests(ChatTestCase):
    def test_empty_when_no_rooms(self):
        response = self.client.get("/api/rooms")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_lists_only_own_rooms_newest_first(self):
        first = self.create_room("첫째")
        second = self.create_room("둘째")
        bob = self.add_user("bob")
        self.login(bob)
        bobs = self.create_room("밥의 방")

        self.assertEqual(self.client.get("/api/rooms").json(), [bobs])
        self.login(self.alice)
        self.assertEqual(self.client.get("/api/rooms").json(), [second, first])


class ListMessagesTests(ChatTestCase):
    def test_empty_room(self):
        room = self.create_room()
        response = self.client.get(f"/api/rooms/{room['id']}/messages")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_lists_room_exchanges_oldest_first(self):
        room = self.create_room()
        other_room = self.create_room("다른 방")
        self.add_exchange(room["id"], "첫 질문", "첫 답변")
        self.add_exchange(other_room["id"], "다른 방 질문", "다른 방 답변")
        self.add_exchange(room["id"], "둘째 질문", "둘째 답변")

        exchanges = self.client.get(f"/api/rooms/{room['id']}/messages").json()
        self.assertEqual([e["question"] for e in exchanges], ["첫 질문", "둘째 질문"])
        self.assertEqual(set(exchanges[0]), {"id", "room_id", "question", "answer", "created_at"})
        self.assertEqual((exchanges[0]["room_id"], exchanges[0]["answer"]), (room["id"], "첫 답변"))
        self.assertLess(exchanges[0]["id"], exchanges[1]["id"])

    def test_hides_missing_and_other_users_rooms(self):
        self.login(self.add_user("bob"))
        bobs_room = self.create_room("밥의 방")
        self.add_exchange(bobs_room["id"], "밥의 고민", "밥에게 한 답변")
        self.login(self.alice)

        for room_id in (bobs_room["id"], 999):
            with self.subTest(room_id=room_id):
                response = self.client.get(f"/api/rooms/{room_id}/messages")
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json(), {"detail": "채팅방을 찾을 수 없습니다."})
