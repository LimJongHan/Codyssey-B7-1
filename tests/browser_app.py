"""브라우저 회귀 검증 전용 앱. 외부 AI를 호출하지 않고 조각 사이를 지연한다."""

import asyncio

from app.chat import router
from app.main import app


async def test_stream(messages):
    yield "오늘도 수고했어요. 🌱 "
    await asyncio.sleep(0.8)
    yield "천천히 이야기해 주세요.\n" * 30


router.stream_reply = test_stream
