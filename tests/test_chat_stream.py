import asyncio
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.ai.service import AIError
from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.chat.router import send_message_stream
from app.chat.schemas import ChatRequest
from app.db import connect
from app.main import app


class ChatStreamTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(patch.dict(os.environ, {
            "DATABASE_PATH": str(Path(directory) / "test.db"), "VERCEL": "",
        }))
        self.client = self.enterContext(TestClient(app))
        app.dependency_overrides[get_current_user] = lambda: User(id=1, username="owner")
        self.addCleanup(app.dependency_overrides.clear)
        with connect() as db:
            db.execute("INSERT INTO users (id, username, password_hash) VALUES (1, 'owner', 'test')")
            db.execute("INSERT INTO users (id, username, password_hash) VALUES (2, 'other', 'test')")
            db.execute("INSERT INTO rooms (id, user_id, title) VALUES (1, 1, 'my room')")
            db.execute("INSERT INTO rooms (id, user_id, title) VALUES (2, 2, 'other room')")

    def send(self, room=1, question="오늘 힘들었어"):
        return self.client.post(f"/api/rooms/{room}/messages/stream", json={"question": question})

    def events(self, response):
        return [(block.splitlines()[0].removeprefix("event: "),
                 json.loads(block.splitlines()[1].removeprefix("data: ")))
                for block in response.text.strip().split("\n\n")]

    def count(self):
        with connect() as db:
            return db.execute("SELECT count(*) FROM exchanges").fetchone()[0]

    def test_stream_saves_answer_before_done(self):
        async def stream(messages):
            self.assertEqual(messages, [{"role": "user", "content": "오늘 힘들었어"}])
            self.assertEqual(self.count(), 0)
            yield '힘든 하루였군요.\n'
            yield '"수고하셨어요."'
        with patch("app.chat.router.stream_reply", stream):
            response = self.send()
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        events = self.events(response)
        self.assertEqual([event for event, _ in events], ["delta", "delta", "done"])
        with connect() as db:
            row = db.execute("SELECT * FROM exchanges").fetchone()
        self.assertEqual(row["room_id"], 1)
        self.assertEqual(row["answer"], ''.join(data["text"] for event, data in events if event == "delta"))
        self.assertEqual(events[-1][1]["id"], row["id"])
        self.assertEqual(events[-1][1]["question"], row["question"])

    def test_auth_owner_and_input_checked_before_ai(self):
        with patch("app.chat.router.stream_reply") as ai:
            self.assertEqual(self.send(room=2).status_code, 404)
            self.assertEqual(self.send(room=999).status_code, 404)
            self.assertEqual(self.send(question=" ").status_code, 422)
            self.assertEqual(self.send(question="a" * 2001).status_code, 422)
            app.dependency_overrides.clear()
            self.assertEqual(self.send().status_code, 401)
            ai.assert_not_called()
        self.assertEqual(self.count(), 0)

    def test_context_is_ordered_and_room_scoped(self):
        with connect() as db:
            for i in range(12):
                db.execute("INSERT INTO exchanges (room_id, question, answer) VALUES (1, ?, ?)",
                           (f"q{i}", f"a{i}"))
            db.execute("INSERT INTO exchanges (room_id, question, answer) VALUES (2, 'private', 'private')")
        async def stream(messages):
            self.assertEqual(messages[0], {"role": "user", "content": "q2"})
            self.assertEqual(messages[-2], {"role": "assistant", "content": "a11"})
            self.assertEqual(len(messages), 21)  # AI 함수에서 새 질문 포함 최신 20개로 제한
            self.assertNotIn("private", str(messages))
            yield "답변"
        with patch("app.chat.router.stream_reply", stream):
            self.assertEqual(self.events(self.send())[-1][0], "done")

    def test_ai_failure_sends_error_without_saving(self):
        for code in (502, 504):
            async def stream(messages):
                yield "부분 응답"
                raise AIError("응답 실패", code)
            with self.subTest(code=code), patch("app.chat.router.stream_reply", stream):
                events = self.events(self.send())
                self.assertEqual([event for event, _ in events], ["delta", "error"])
                self.assertEqual(events[-1][1]["status_code"], code)
                self.assertEqual(self.count(), 0)

    def test_db_failure_sends_error_without_done(self):
        async def stream(messages):
            yield "답변"
            yield " 완료"
        with patch("app.chat.router.stream_reply", stream):
            # 저장 시점에만 실패하도록 두 번째 연결을 대체한다.
            with patch("app.chat.router.connect", side_effect=[connect(), sqlite3.OperationalError("private")]):
                response = self.send()
        events = self.events(response)
        self.assertEqual(events[-1][0], "error")
        self.assertEqual(events[-1][1]["status_code"], 500)
        self.assertNotIn("private", response.text)
        self.assertEqual(self.count(), 0)

    def test_disconnection_closes_ai_without_saving(self):
        closed = []
        async def stream(messages):
            try:
                yield "첫 조각"
                yield "다음 조각"
            finally:
                closed.append(True)

        async def consume():
            request = AsyncMock()
            request.is_disconnected.side_effect = [False, True]
            response = send_message_stream(1, ChatRequest(question="안녕"),
                                           User(id=1, username="owner"), request)
            chunks = [chunk async for chunk in response.body_iterator]
            self.assertEqual(len(chunks), 1)
            self.assertIn("event: delta", chunks[0])

        with patch("app.chat.router.stream_reply", stream):
            asyncio.run(consume())
        self.assertEqual(closed, [True])
        self.assertEqual(self.count(), 0)

    def test_cancellation_closes_ai_without_saving(self):
        closed = []
        async def stream(messages):
            try:
                yield "첫 조각"
                raise asyncio.CancelledError
            finally:
                closed.append(True)

        async def consume():
            request = AsyncMock()
            request.is_disconnected.return_value = False
            response = send_message_stream(1, ChatRequest(question="안녕"),
                                           User(id=1, username="owner"), request)
            with self.assertRaises(asyncio.CancelledError):
                _ = [chunk async for chunk in response.body_iterator]

        with patch("app.chat.router.stream_reply", stream):
            asyncio.run(consume())
        self.assertEqual(closed, [True])
        self.assertEqual(self.count(), 0)
