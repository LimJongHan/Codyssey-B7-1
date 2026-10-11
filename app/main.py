import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.db import init_db

logging.basicConfig(level=logging.INFO)
WEB_DIR = Path(__file__).resolve().parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="긍정봇", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(chat_router)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


# 웹 페이지
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
