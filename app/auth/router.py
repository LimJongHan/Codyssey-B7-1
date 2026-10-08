import logging
import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.auth.cookies import COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.auth.dependencies import get_current_user
from app.auth.passwords import hash_password, verify_password
from app.auth.routes import AuthRoute
from app.auth.schemas import Credentials, User
from app.auth.sessions import create_session, revoke_session
from app.auth.storage import connect

router = APIRouter(prefix="/api/auth", tags=["auth"], route_class=AuthRoute)
logger = logging.getLogger(__name__)
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


@router.post("/signup", response_model=User, status_code=201)
def signup(body: Credentials):
    password_hash = hash_password(body.password)
    with connect() as db:
        try:
            cursor = db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (body.username, password_hash),
            )
            user_id = cursor.lastrowid
        except sqlite3.IntegrityError as error:
            if error.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
                raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.") from None
            raise
    logger.info("auth_signup_success user_id=%s", user_id)
    return User(id=user_id, username=body.username)


@router.post("/login", response_model=User)
def login(body: Credentials, request: Request, response: Response):
    with connect() as db:
        row = db.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (body.username,),
        ).fetchone()
    # 없는 아이디도 해시 검증을 거쳐 즉시 실패하는 경로를 피한다.
    valid = verify_password(body.password, row["password_hash"] if row else _DUMMY_PASSWORD_HASH)
    if row is None or not valid:
        logger.info("auth_login_failure")
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    token = create_session(row["id"], request.cookies.get(COOKIE_NAME))
    set_session_cookie(response, request, token)
    logger.info("auth_login_success user_id=%s", row["id"])
    return User(id=row["id"], username=row["username"])


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    revoke_session(request.cookies.get(COOKIE_NAME))
    clear_session_cookie(response, request)
    logger.info("auth_logout_success")


@router.get("/me", response_model=User)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
