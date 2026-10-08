import logging

from argon2.exceptions import HashingError
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

logger = logging.getLogger(__name__)


class AuthRoute(APIRoute):
    """인증 응답 캐시와 입력 검증 오류의 비밀번호 반사를 방지한다."""

    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                response = await original(request)
            except RequestValidationError as error:
                # detail 배열과 loc/type/msg는 유지하되 원문 input/ctx는 반사하지 않는다.
                details = [
                    {key: item[key] for key in ("type", "loc", "msg") if key in item}
                    for item in error.errors()
                ]
                response = JSONResponse(status_code=422, content={"detail": details})
            except HTTPException as error:
                response = JSONResponse(
                    status_code=error.status_code, content={"detail": error.detail}, headers=error.headers,
                )
            except HashingError:
                logger.error("auth_password_hash_failure")
                response = JSONResponse(status_code=500, content={"detail": "인증 정보를 처리하지 못했습니다."})
            response.headers["Cache-Control"] = "no-store"
            return response

        return handler
