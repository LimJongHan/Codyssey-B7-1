import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.ai.service import AIError
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.db import init_db

logging.basicConfig(level=logging.INFO)
WEB_DIR = Path(__file__).resolve().parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("VERCEL"):
        init_db()
    yield


app = FastAPI(title="긍정봇", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(chat_router)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


@app.exception_handler(AIError)
async def ai_error_handler(request, error: AIError):
    return JSONResponse(status_code=error.status_code, content={"detail": str(error)})


# ── 웹 프론트엔드 페이지 서빙 (원본 디자인 100% 매핑) ──
@app.get("/", include_in_schema=False)
@app.get("/chat", include_in_schema=False)
@app.get("/guest", include_in_schema=False)
def chat_page():
    return FileResponse(WEB_DIR / "chat.html")


@app.get("/auth", include_in_schema=False)
def auth_page():
    return FileResponse(WEB_DIR / "auth.html")


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
