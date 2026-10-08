from fastapi import HTTPException, Request

from app.auth.schemas import User


def get_current_user(request: Request) -> User:
    """TODO: session 쿠키의 해시로 DB 세션과 만료를 검사하고 User를 반환한다."""
    raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
