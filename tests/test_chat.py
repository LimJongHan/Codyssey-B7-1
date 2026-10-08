import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.ai.service import AIError
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


class SendMessageTests(ChatTestCase):
    """AI 연동 전이므로 generate_reply는 테스트 안에서만 대체한다."""

    def setUp(self):
        super().setUp()
        self.room = self.create_room()

    def send(self, question, room_id=None):
        room_id = self.room["id"] if room_id is None else room_id
        return self.client.post(f"/api/rooms/{room_id}/messages", json={"question": question})

    def saved_count(self):
        with connect() as db:
            return db.execute("SELECT count(*) FROM exchanges").fetchone()[0]

    def test_saves_and_returns_exchange(self):
        with patch("app.chat.router.generate_reply", AsyncMock(return_value="많이 힘든 하루였겠어요.")) as reply, \
                self.assertLogs("app.chat.router", "INFO") as logs:
            response = self.send("  오늘 많이 지쳤어  ")

        self.assertEqual(response.status_code, 201)
        exchange = response.json()
        self.assertEqual(set(exchange), {"id", "room_id", "question", "answer", "created_at"})
        self.assertEqual(
            (exchange["room_id"], exchange["question"], exchange["answer"]),
            (self.room["id"], "오늘 많이 지쳤어", "많이 힘든 하루였겠어요."),
        )
        reply.assert_awaited_once_with([{"role": "user", "content": "오늘 많이 지쳤어"}])
        self.assertEqual(self.client.get(f"/api/rooms/{self.room['id']}/messages").json(), [exchange])
        output = "\n".join(logs.output)
        self.assertIn(f"request_received user_id={self.alice.id} room_id={self.room['id']}", output)
        self.assertIn(f"db_save_success user_id={self.alice.id} room_id={self.room['id']} exchange_id={exchange['id']}", output)

    def test_sends_recent_five_exchanges_as_context(self):
        for number in range(1, 7):
            self.add_exchange(self.room["id"], f"질문{number}", f"답변{number}")
        self.add_exchange(self.create_room("다른 방")["id"], "다른 방 질문", "다른 방 답변")

        with patch("app.chat.router.generate_reply", AsyncMock(return_value="답변7")) as reply:
            self.assertEqual(self.send("질문7").status_code, 201)

        expected = []
        for number in range(2, 7):
            expected += [{"role": "user", "content": f"질문{number}"}, {"role": "assistant", "content": f"답변{number}"}]
        expected.append({"role": "user", "content": "질문7"})
        reply.assert_awaited_once_with(expected)

    def test_ai_failure_is_reported_and_not_saved(self):
        for status, detail in ((502, "AI 응답을 받지 못했어요."), (504, "응답이 지연되고 있어요.")):
            with self.subTest(status=status):
                with patch("app.chat.router.generate_reply", AsyncMock(side_effect=AIError(detail, status))), \
                        self.assertLogs("app.chat.router", "WARNING") as logs:
                    response = self.send("응원해줘")
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json(), {"detail": detail})
                self.assertIn(
                    f"chat_ai_failure user_id={self.alice.id} room_id={self.room['id']} status={status}",
                    "\n".join(logs.output),
                )
                self.assertEqual(self.saved_count(), 0)

    def test_db_failure_after_ai_reply(self):
        async def reply_while_db_breaks(messages):
            # AI를 기다리는 동안 DB에 문제가 생긴 상황
            with connect() as db:
                db.execute("DROP TABLE exchanges")
            return "답변"

        with patch("app.chat.router.generate_reply", reply_while_db_breaks), \
                self.assertLogs("app.chat.router", "ERROR") as logs:
            response = self.send("안녕")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {"detail": "대화를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."})
        self.assertIn(f"db_save_failure user_id={self.alice.id} room_id={self.room['id']}", "\n".join(logs.output))

    def test_hides_missing_and_other_users_rooms(self):
        self.login(self.add_user("bob"))
        bobs_room = self.create_room("밥의 방")
        self.login(self.alice)

        for room_id in (bobs_room["id"], 999):
            with self.subTest(room_id=room_id):
                with patch("app.chat.router.generate_reply", AsyncMock(return_value="답변")) as reply:
                    response = self.send("남의 방에 질문", room_id=room_id)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json(), {"detail": "채팅방을 찾을 수 없습니다."})
                reply.assert_not_awaited()
        self.assertEqual(self.saved_count(), 0)

    def test_question_length_limit(self):
        with patch("app.chat.router.generate_reply", AsyncMock(return_value="답변")):
            self.assertEqual(self.send("가" * 2000).status_code, 201)
            self.assertEqual(self.send("가" * 2001).status_code, 422)
