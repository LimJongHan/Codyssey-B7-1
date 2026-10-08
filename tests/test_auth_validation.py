from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from auth_support import AuthTestCase

from app.main import app


class CredentialValidationTests(AuthTestCase):
    def test_username_and_password_boundaries(self):
        for username, password in (("Ab_", "p" * 8), ("a" * 30, "p" * 128), ("unicode", "비밀번호" * 8)):
            with self.subTest(username=username):
                user = self.signup(username, password)
                self.assertEqual(self.login(username, password).json(), user)
        self.assertEqual(self.count("users"), 3)

    def test_invalid_credentials_never_write_to_database(self):
        bodies = [
            {}, {"username": "alice"}, {"password": "example-password"}, [],
            *({"username": name, "password": "example-password"} for name in (
                "ab", "a" * 31, "foo bar", "한글아이디", "foo-bar", "abc\n", "' OR 1=1 --", " abc", "abc ", None, 123,
            )),
            *({"username": "alice", "password": password} for password in (
                "", "p" * 7, "p" * 129, None, 12345678, [], {},
            )),
        ]
        for path in ("signup", "login"):
            for body in bodies:
                with self.subTest(path=path, body=body):
                    response = self.client.post(f"/api/auth/{path}", json=body)
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertIsInstance(response.json()["detail"], list)
                    self.assertNotIn("set-cookie", response.headers)
        self.assertEqual(self.count("users"), 0)
        self.assertEqual(self.count("sessions"), 0)

    def test_non_json_and_malformed_input_do_not_echo_password(self):
        secret = "private-password-value"
        for path in ("signup", "login"):
            for content_type, content in (
                ("application/x-www-form-urlencoded", f"username=alice&password={secret}"),
                ("text/plain", f'{{"username":"alice","password":"{secret}"}}'),
                ("application/json", f'{{"password":"{secret}"'),
            ):
                response = self.client.post(f"/api/auth/{path}", content=content, headers={"content-type": content_type})
                self.assertEqual(response.status_code, 422)
                self.assertNotIn(secret, response.text)
        self.assertEqual(self.count("users"), 0)

    def test_case_and_password_whitespace_are_preserved(self):
        first = self.signup("Alice", "  secret-password  ")
        second = self.signup("alice", "other-password")
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(self.login("Alice", "  secret-password  ").json(), first)
        failed = self.client.post("/api/auth/login", json={"username": "Alice", "password": "secret-password"})
        self.assertEqual(failed.status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me").json(), first)

    def test_simultaneous_duplicate_signup_preserves_uniqueness(self):
        def register():
            with TestClient(app) as client:
                return client.post("/api/auth/signup", json={"username": "alice", "password": "example-password"}).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: register(), range(2)))
        self.assertEqual(sorted(results), [201, 409])
        self.assertEqual(self.count("users"), 1)
        self.assertEqual(self.count("sessions"), 0)

    def test_extra_identity_fields_cannot_choose_user_id(self):
        response = self.client.post("/api/auth/signup", json={
            "username": "alice", "password": "example-password", "id": 9000, "user_id": 9000,
        })
        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.json()["id"], 9000)
        self.assertEqual(set(response.json()), {"id", "username"})
