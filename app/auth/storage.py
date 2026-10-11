"""기존 DB 연결의 인증 오류를 공개 가능한 HTTP 오류로 변환한다."""

import logging
import sqlite3
from contextlib import contextmanager

from fastapi import HTTPException

from app.db import connect as db_connect

logger = logging.getLogger(__name__)


@contextmanager
def connect():
    try:
        with db_connect() as db:
            yield db
    except (sqlite3.Error, OSError) as error:
        # SQL/예외 본문에는 개인정보가 포함될 수 있어 종류만 기록한다.
        logger.error("auth_storage_failure error_type=%s", type(error).__name__)
        raise HTTPException(status_code=500, detail="인증 정보를 처리하지 못했습니다.") from None
