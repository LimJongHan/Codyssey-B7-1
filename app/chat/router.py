import logging
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.chat.schemas import ChatRequest, Exchange, Room, RoomCreate
from app.db import connect

router = APIRouter(prefix="/api/rooms", tags=["chat"])
CurrentUser = Annotated[User, Depends(get_current_user)]
logger = logging.getLogger(__name__)


def _ensure_own_room(db, room_id: int, user_id: int):
    # 방이 없거나 다른 사람의 방이면 같은 404로 응답해 존재 여부를 드러내지 않는다.
    room = db.execute("SELECT 1 FROM rooms WHERE id = ? AND user_id = ?", (room_id, user_id)).fetchone()
    if room is None:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")


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
    with connect() as db:
        rooms = db.execute(
            "SELECT id, title, created_at FROM rooms WHERE user_id = ? ORDER BY id DESC",
            (user.id,),
        ).fetchall()
    return [dict(room) for room in rooms]


@router.get("/{room_id}/messages", response_model=list[Exchange])
def list_messages(room_id: int, user: CurrentUser):
    # 방 소유권 확인 후 과거→최신(id 오름차순)으로 반환한다.
    with connect() as db:
        _ensure_own_room(db, room_id, user.id)
        exchanges = db.execute(
            "SELECT id, room_id, question, answer, created_at FROM exchanges WHERE room_id = ? ORDER BY id",
            (room_id,),
        ).fetchall()
    return [dict(exchange) for exchange in exchanges]


@router.post("/{room_id}/messages", response_model=Exchange, status_code=201)
async def send_message(room_id: int, body: ChatRequest, user: CurrentUser):
    # TODO: 소유권 확인 → 최근 5개 Q/A + 새 질문 → ai.service.generate_reply
    # → 성공한 Q/A를 함께 저장 → Exchange 반환. AI 대기 중 DB 연결은 닫는다.
    raise HTTPException(status_code=501, detail="대화 전송 구현 예정입니다.")
