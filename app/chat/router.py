import logging
import sqlite3
from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.ai.service import AIError, Message, stream_reply
from app.db import connect
from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.chat.schemas import ChatRequest, Exchange, Room, RoomCreate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rooms", tags=["chat"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("", response_model=Room, status_code=201)
def create_room(body: RoomCreate, user: CurrentUser):
    # TODO: user.id로 소유자를 저장한다. 요청 본문에서 user_id를 받지 않는다.
    raise HTTPException(status_code=501, detail="채팅방 생성 구현 예정입니다.")


@router.get("", response_model=list[Room])
def list_rooms(user: CurrentUser):
    # TODO: 로그인한 사용자의 방만 최신순으로 반환한다.
    raise HTTPException(status_code=501, detail="채팅방 목록 구현 예정입니다.")


@router.get("/{room_id}/messages", response_model=list[Exchange])
def list_messages(room_id: int, user: CurrentUser):
    # TODO: 방 소유권 확인 후 id 오름차순으로 조회. 없거나 다른 사람의 방이면 404.
    raise HTTPException(status_code=501, detail="대화 내역 조회 구현 예정입니다.")


@router.post("/{room_id}/messages", response_model=Exchange, status_code=201)
async def send_message(room_id: int, body: ChatRequest, user: CurrentUser):
    # TODO: 소유권 확인 → 최근 5개 Q/A + 새 질문 → ai.service.generate_reply
    # → 성공한 Q/A를 함께 저장 → Exchange 반환. AI 대기 중 DB 연결은 닫는다.
    raise HTTPException(status_code=501, detail="대화 전송 구현 예정입니다.")


def _load_messages(room_id: int, body: ChatRequest, user: CurrentUser) -> list[Message]:
    logger.info("request_received user_id=%s room_id=%s", user.id, room_id)
    try:
        with connect() as db:
            room = db.execute(
                "SELECT id FROM rooms WHERE id = ? AND user_id = ?", (room_id, user.id),
            ).fetchone()
            if room is None:
                raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")
            rows = db.execute(
                "SELECT question, answer FROM exchanges WHERE room_id = ? ORDER BY id DESC LIMIT 10",
                (room_id,),
            ).fetchall()
    except sqlite3.Error:
        logger.error("db_read_failure user_id=%s room_id=%s", user.id, room_id)
        raise HTTPException(status_code=500, detail="대화 내역을 불러오지 못했습니다.") from None

    messages = []
    for row in reversed(rows):
        messages.extend([
            {"role": "user", "content": row["question"]},
            {"role": "assistant", "content": row["answer"]},
        ])
    messages.append({"role": "user", "content": body.question})

    return messages


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
                yield ServerSentEvent(event="delta", data={"text": text})
        if await request.is_disconnected():
            return
        with connect() as db:
            cursor = db.execute(
                "INSERT INTO exchanges (room_id, question, answer) VALUES (?, ?, ?)",
                (room_id, body.question, "".join(parts).strip()),
            )
            row = db.execute("SELECT * FROM exchanges WHERE id = ?", (cursor.lastrowid,)).fetchone()
            exchange = Exchange(**dict(row))
        logger.info("db_save_success user_id=%s room_id=%s exchange_id=%s", user.id, room_id, exchange.id)
        yield ServerSentEvent(event="done", data=exchange)
    except AIError as error:
        yield ServerSentEvent(event="error", data={"detail": str(error), "status_code": error.status_code})
    except sqlite3.Error:
        logger.error("db_save_failure user_id=%s room_id=%s", user.id, room_id)
        yield ServerSentEvent(event="error", data={"detail": "대화를 저장하지 못했습니다.", "status_code": 500})
