import logging
import math
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal, TypedDict

from openai import (
    APIError, APITimeoutError, AsyncOpenAI,
    ContentFilterFinishReasonError, LengthFinishReasonError,
)
from openai.types.chat import ChatCompletion

logger = logging.getLogger(__name__)
CONTEXT_EXCHANGES = 10
MAX_CONTEXT_MESSAGES = CONTEXT_EXCHANGES * 2 + 1  # 완료 Q/A 10개와 새 질문, 시스템 프롬프트 별도
SYSTEM_PROMPT = (
    "너는 사용자의 이야기에 공감하고 격려하는 긍정봇이다. "
    "한국어 존댓말로 사용자가 말한 상황과 감정을 구체적으로 짚고 짧게 답한다. "
    "과장된 칭찬이나 상투적인 말을 반복하지 않고, 요청하지 않은 조언을 길게 하지 않는다. "
    "감정에는 공감하되 사실을 지어내거나 위험한 행동을 긍정하지 않는다."
)


class Message(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class AIError(Exception):
    """외부 AI 실패를 채팅 계층으로 전달한다. 원본 API 오류/키를 노출하지 않는다."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@asynccontextmanager
async def _ai_client() -> AsyncIterator[AsyncOpenAI]:
    api_key = os.getenv("AI_API_KEY", "").strip()
    try:
        timeout = float(os.getenv("AI_TIMEOUT_SECONDS", "30"))
        if not api_key or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError
    except ValueError:
        logger.error("ai_call_failure reason=configuration")
        raise AIError("AI 서비스 설정을 확인해 주세요.", 503) from None

    logger.info("ai_call_start")
    try:
        async with AsyncOpenAI(
            api_key=api_key,
            base_url="https://copa.codyssey.kr/v1",
            timeout=timeout,
            max_retries=0,
        ) as client:
            yield client
    except APITimeoutError:
        logger.warning("ai_call_failure reason=timeout")
        raise AIError("응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.", 504) from None
    except (LengthFinishReasonError, ContentFilterFinishReasonError):
        logger.warning("ai_call_failure reason=incomplete_response")
        raise AIError("답변을 완성하지 못했어요. 다시 시도해 주세요.") from None
    except APIError as error:
        logger.warning("ai_call_failure reason=%s", type(error).__name__)
        raise AIError("지금은 답변을 받을 수 없어요. 잠시 후 다시 시도해 주세요.") from None
    else:
        logger.info("ai_call_success")


def _answer(response: ChatCompletion) -> str:
    choice = response.choices[0] if response.choices else None
    answer = (choice.message.content or "").strip() if choice else ""
    if not choice or choice.finish_reason != "stop" or not answer:
        logger.warning("ai_call_failure reason=invalid_response")
        raise AIError("답변을 완성하지 못했어요. 다시 시도해 주세요.")
    return answer


async def stream_reply(messages: list[Message]) -> AsyncIterator[str]:
    """SDK의 텍스트 이벤트를 전달하고, 종료 시 완성된 답변인지 확인한다."""
    async with _ai_client() as client:
        async with client.chat.completions.stream(
            model=os.getenv("AI_MODEL", "").strip() or "gpt-5-mini",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages[-MAX_CONTEXT_MESSAGES:]],
        ) as stream:
            async for event in stream:
                if event.type == "content.delta":
                    yield event.delta
            _answer(await stream.get_final_completion())
