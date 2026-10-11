import asyncio
import logging
import sqlite3
from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.ai.service import AIError, CONTEXT_EXCHANGES, Message, stream_reply
from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.chat.schemas import ChatDelta, ChatError, ChatRequest, Exchange, Room, RoomCreate
from app.db import connect

router = APIRouter(prefix="/api/rooms", tags=["chat"])
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)


def _ensure_own_room(db, room_id: int, user_id: int):
    # 방이 없거나 다른 사람의 방이면 같은 404로 응답해 존재 여부를 드러내지 않는다.
    room = db.execute("SELECT 1 FROM rooms WHERE id = ? AND user_id = ?", (room_id, user_id)).fetchone()
    if room is None:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")


def _load_context(room_id: int, user_id: int, question: str) -> list[Message]:
    # 최근 완료 Q/A를 시간순으로 펼치고 새 질문을 마지막에 붙인다.
    try:
        with connect() as db:
            _ensure_own_room(db, room_id, user_id)
            recent = db.execute(
                "SELECT question, answer FROM exchanges WHERE room_id = ? ORDER BY id DESC LIMIT ?",
                (room_id, CONTEXT_EXCHANGES),
            ).fetchall()
    except sqlite3.Error:
        logger.exception("db_read_failure user_id=%s room_id=%s", user_id, room_id)
        raise HTTPException(status_code=500, detail="대화 내역을 불러오지 못했습니다.") from None
    messages: list[Message] = []
    for exchange in reversed(recent):
        messages.append({"role": "user", "content": exchange["question"]})
        messages.append({"role": "assistant", "content": exchange["answer"]})
    messages.append({"role": "user", "content": question})
    return messages


def _save_exchange(room_id: int, question: str, answer: str, user_id: int) -> dict:
    try:
        with connect() as db:
            exchange = db.execute(
                "INSERT INTO exchanges (room_id, question, answer) VALUES (?, ?, ?)"
                " RETURNING id, room_id, question, answer, created_at",
                (room_id, question, answer),
            ).fetchone()
    except sqlite3.Error:
        logger.exception("db_save_failure user_id=%s room_id=%s", user_id, room_id)
        raise HTTPException(status_code=500, detail="대화를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
    logger.info("db_save_success user_id=%s room_id=%s exchange_id=%s", user_id, room_id, exchange["id"])
    return dict(exchange)


def _load_messages(room_id: int, body: ChatRequest, user: CurrentUser) -> list[Message]:
    # Depends로 실행해 SSE 헤더를 보내기 전에 인증·소유권·조회 오류를 처리한다.
    logger.info("request_received user_id=%s room_id=%s", user.id, room_id)
    return _load_context(room_id, user.id, body.question)


@router.post("", response_model=Room, status_code=201)
def create_room(body: RoomCreate, user: CurrentUser):
    # 소유자는 인증된 user.id로만 정한다. 요청 본문에서 user_id를 받지 않는다.
    try:
        with connect() as db:
            room = db.execute(
                "INSERT INTO rooms (user_id, title) VALUES (?, ?) RETURNING id, title, created_at",
                (user.id, body.title),
            ).fetchone()
    except sqlite3.Error:
        logger.exception("db_save_failure user_id=%s", user.id)
        raise HTTPException(status_code=500, detail="채팅방을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    logger.info("db_save_success user_id=%s room_id=%s", user.id, room["id"])
    return dict(room)


@router.get("", response_model=list[Room])
def list_rooms(user: CurrentUser):
    # 로그인한 사용자의 방만 최신순으로 반환한다. created_at은 같은 값이 있을 수 있어 id로 정렬한다.
    try:
        with connect() as db:
            rooms = db.execute(
                "SELECT id, title, created_at FROM rooms WHERE user_id = ? ORDER BY id DESC",
                (user.id,),
            ).fetchall()
    except sqlite3.Error:
        logger.exception("db_read_failure user_id=%s", user.id)
        raise HTTPException(status_code=500, detail="대화 내역을 불러오지 못했습니다.") from None
    return [dict(room) for room in rooms]


@router.get("/{room_id}/messages", response_model=list[Exchange])
def list_messages(room_id: int, user: CurrentUser):
    # 방 소유권 확인 후 과거→최신(id 오름차순)으로 반환한다.
    try:
        with connect() as db:
            _ensure_own_room(db, room_id, user.id)
            exchanges = db.execute(
                "SELECT id, room_id, question, answer, created_at FROM exchanges WHERE room_id = ? ORDER BY id",
                (room_id,),
            ).fetchall()
    except sqlite3.Error:
        logger.exception("db_read_failure user_id=%s", user.id)
        raise HTTPException(status_code=500, detail="대화 내역을 불러오지 못했습니다.") from None
    return [dict(exchange) for exchange in exchanges]


@router.post("/{room_id}/messages/stream", response_class=EventSourceResponse)
async def send_message_stream(
    room_id: int,
    body: ChatRequest,
    user: CurrentUser,
    request: Request,
    messages: Annotated[list[Message], Depends(_load_messages)],
) -> AsyncIterator[ServerSentEvent]:
    parts = []
    try:
        async with aclosing(stream_reply(messages)) as stream:
            async for text in stream:
                if await request.is_disconnected():
                    return
                parts.append(text)
                yield ServerSentEvent(event="delta", data=ChatDelta(text=text))
        if await request.is_disconnected():
            return
        saved = await asyncio.to_thread(_save_exchange, room_id, body.question, "".join(parts).strip(), user.id)
        yield ServerSentEvent(event="done", data=Exchange(**saved))
    except AIError as error:
        logger.warning("chat_ai_failure user_id=%s room_id=%s status=%s", user.id, room_id, error.status_code)
        yield ServerSentEvent(event="error", data=ChatError(detail=str(error), status_code=error.status_code))
    except HTTPException as error:
        yield ServerSentEvent(event="error", data=ChatError(detail=error.detail, status_code=error.status_code))
