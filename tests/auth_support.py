import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.db import connect
from app.main import app


class AuthTestCase(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(patch.dict(os.environ, {
            "DATABASE_PATH": str(Path(directory) / "auth.db"),
        }))
        self.addCleanup(app.dependency_overrides.clear)
        self.client = self.enterContext(TestClient(app))

    def signup(self, username="alice", password="example-password"):
        response = self.client.post("/api/auth/signup", json={
            "username": username, "password": password,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def count(self, table):
        assert table in {"users", "sessions"}
        with connect() as db:
            return db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def login(self, username="alice", password="example-password", client=None):
        client = client if client is not None else self.client
        response = client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response
