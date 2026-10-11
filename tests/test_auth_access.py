from unittest.mock import patch

from fastapi.testclient import TestClient

from auth_support import AuthTestCase

from app.db import connect
from app.main import app


class ProtectedEndpointTests(AuthTestCase):
    def assert_room_access(self, status, headers=None):
        for method, path, body in (
            ("GET", "/api/rooms", None),
            ("POST", "/api/rooms", {"title": "내 이야기", "user_id": 9000}),
            ("GET", "/api/rooms/1/messages", None),
            ("POST", "/api/rooms/1/messages/stream", {"question": "안녕"}),
        ):
            with self.subTest(method=method, path=path, expected=status):
                response = self.client.request(method, path, json=body, headers=headers)
                self.assertEqual(response.status_code, status, response.text)

    def test_real_session_passes_authentication_for_existing_chat_routes(self):
        self.assertFalse(app.dependency_overrides)
        self.assert_room_access(401)
        self.signup()
        self.login()
        self.assertEqual(self.client.get("/api/rooms").json(), [])
        response = self.client.post("/api/rooms", json={"title": "내 이야기", "user_id": 9000})
        self.assertEqual(response.status_code, 201)
        room = response.json()
        path = f"/api/rooms/{room['id']}/messages"
        self.assertEqual(self.client.get(path).json(), [])
        async def stream(messages):
            yield "힘내세요."
        with patch("app.chat.router.stream_reply", stream):
            response = self.client.post(path + "/stream", json={"question": "다시 안녕"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("event: done", response.text)
        self.assertEqual(len(self.client.get(path).json()), 1)
        with connect() as db:
            self.assertEqual(db.execute("SELECT user_id FROM rooms WHERE id=?", (room["id"],)).fetchone()[0],
                             self.client.get("/api/auth/me").json()["id"])
        self.client.post("/api/auth/logout")
        self.assert_room_access(401)
        self.assertFalse(app.dependency_overrides)

    def test_invalid_and_expired_sessions_are_blocked_before_chat(self):
        self.assert_room_access(401, {"cookie": "session=" + "x" * 43, "x-user-id": "1"})
        self.signup()
        self.login()
        with connect() as db:
            db.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z'")
        self.assert_room_access(401)

    def test_two_users_cannot_change_identity_with_client_input(self):
        alice = self.signup()
        bob = self.signup("bob", "bob-password")
        self.login()
        with TestClient(app) as other:
            self.login("bob", "bob-password", client=other)
            alice_response = self.client.get(f"/api/auth/me?user_id={bob['id']}", headers={"x-user-id": str(bob["id"])})
            self.assertEqual(alice_response.json(), alice)
            self.assertEqual(other.get("/api/auth/me").json(), bob)
            other.post("/api/auth/logout")
            self.assertEqual(other.get("/api/auth/me").status_code, 401)
            self.assertEqual(self.client.get("/api/auth/me").json(), alice)

    def test_signup_while_logged_in_does_not_switch_account(self):
        alice = self.signup()
        self.login()
        token = self.client.cookies["session"]
        self.signup("bob", "bob-password")
        self.assertEqual(self.client.cookies["session"], token)
        self.assertEqual(self.client.get("/api/auth/me").json(), alice)
        self.assertEqual(self.count("sessions"), 1)

    def test_user_deletion_invalidates_all_their_sessions(self):
        alice = self.signup()
        self.login()
        with TestClient(app) as other:
            self.login(client=other)
            with connect() as db:
                db.execute("DELETE FROM users WHERE id = ?", (alice["id"],))
            self.assertEqual(other.get("/api/auth/me").status_code, 401)
            self.assert_room_access(401)
            self.assertEqual(self.count("sessions"), 0)
