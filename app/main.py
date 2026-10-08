import logging
import os
import random
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
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
def index():
    return FileResponse(WEB_DIR / "index.html")


@app.get("/chat", include_in_schema=False)
def chat_page():
    return FileResponse(WEB_DIR / "chat.html")


@app.get("/guest", include_in_schema=False)
def guest_page():
    return FileResponse(WEB_DIR / "chat.html")


@app.get("/auth", include_in_schema=False)
def auth_page():
    return FileResponse(WEB_DIR / "auth.html")


# ── 원본 프론트엔드 API 엔드포인트 호환 ──
@app.post("/api/chat")
async def api_chat(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}
    msg = data.get("message", "")
    replies = [
        f"\"{msg}\"라고 말씀해 주셨군요! 항상 당신의 곁에서 응원하고 있어요 ☀️",
        "오늘 하루도 정말 고생 많으셨어요. 당신은 그 자체로 빛나는 소중한 존재예요 ✨",
        "지친 마음에 따뜻한 위로가 닿기를 바라요. 무엇이든 편하게 이야기해 주세요 💛",
        "실수해도 괜찮아요. 지금 이 순간에도 충분히 잘하고 계세요 🌿",
        "오늘 수고한 당신에게 박수를 보냅니다! 내일은 오늘보다 더 환한 날이 될 거예요 👏"
    ]
    return {"reply": random.choice(replies), "status": "ok"}


@app.post("/api/login")
async def api_login_compat(request: Request):
    return {"status": "ok", "redirect": "/chat"}


@app.post("/api/register")
async def api_register_compat(request: Request):
    return {"status": "ok", "redirect": "/chat"}


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
