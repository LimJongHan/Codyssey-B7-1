from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth.dependencies import get_current_user
from app.auth.schemas import Credentials, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=User, status_code=201)
def signup(body: Credentials):
    # TODO: 비밀번호 해시 저장. 중복 username은 409. 가입 후 별도 로그인.
    raise HTTPException(status_code=501, detail="회원가입 구현 예정입니다.")


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
