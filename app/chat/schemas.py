from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class RoomCreate(BaseModel):
    title: Title = "새 대화"


class Room(BaseModel):
    id: int
    title: str
    created_at: datetime


class ChatRequest(BaseModel):
    question: Question


class Exchange(BaseModel):
    id: int
    room_id: int
    question: str
    answer: str
    created_at: datetime
