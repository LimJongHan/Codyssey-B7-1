from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.auth.schemas import User
from app.chat.schemas import ChatRequest, Exchange, Room, RoomCreate

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
