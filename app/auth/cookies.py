import os

from fastapi import Request, Response

from app.auth.sessions import SESSION_SECONDS

COOKIE_NAME = "session"


def cookie_options(request: Request) -> dict:
    return {
        "path": "/",
        "httponly": True,
        "samesite": "lax",
        "secure": request.url.scheme == "https" or bool(os.getenv("VERCEL")),
    }


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, **cookie_options(request))
