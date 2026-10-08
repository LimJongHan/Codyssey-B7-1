from fastapi import HTTPException, Request

from app.auth.cookies import COOKIE_NAME
from app.auth.schemas import User
from app.auth.sessions import get_session_user


def get_current_user(request: Request) -> User:
    """세션이 유효한 경우에만 DB에 연결된 공개 사용자 정보를 반환한다."""
    user = get_session_user(request.cookies.get(COOKIE_NAME))
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user
