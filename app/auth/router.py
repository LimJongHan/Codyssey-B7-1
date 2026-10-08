import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth.dependencies import get_current_user
from app.auth.passwords import hash_password
from app.auth.schemas import Credentials, User
from app.db import connect

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=User, status_code=201)
def signup(body: Credentials):
    password_hash = hash_password(body.password)
    try:
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (body.username, password_hash),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as error:
        if error.sqlite_errorname == "SQLITE_CONSTRAINT_UNIQUE":
            raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.") from None
        raise
    return User(id=user_id, username=body.username)


@router.post("/login", response_model=User)
def login(body: Credentials, response: Response):
    # TODO: 비밀번호 검증 후 HttpOnly session 쿠키 발급. 실패는 401.
    raise HTTPException(status_code=501, detail="로그인 구현 예정입니다.")


@router.post("/logout", status_code=204)
def logout(response: Response):
    # TODO: DB 세션 삭제 및 쿠키 제거. 이미 로그아웃 상태여도 204.
    raise HTTPException(status_code=501, detail="로그아웃 구현 예정입니다.")


@router.get("/me", response_model=User)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
