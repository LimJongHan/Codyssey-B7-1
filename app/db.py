"""로컬 SQLite 연결과 최초 테이블 생성. 스키마 변경 시 기존 DB는 별도 갱신한다."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


@contextmanager
def connect():
    path = Path(os.getenv("DATABASE_PATH", ".data/positive-bot.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db():
    with connect() as connection:
        for module in ("auth", "chat"):
            connection.executescript((BASE_DIR / module / "schema.sql").read_text())


if __name__ == "__main__":
    init_db()
    print("SQLite 테이블 초기화 완료")
