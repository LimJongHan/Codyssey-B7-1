from typing import Literal, TypedDict


class Message(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class AIError(Exception):
    """외부 AI 실패를 채팅 계층으로 전달한다. 원본 API 오류/키를 노출하지 않는다."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def generate_reply(messages: list[Message]) -> str:
    """시간순 대화(마지막은 새 질문)를 받아 응답 텍스트만 반환한다."""
    # TODO: 시스템 프롬프트 + messages로 실제 AI API 호출.
    # AI_API_KEY, AI_MODEL, AI_TIMEOUT_SECONDS 환경 변수를 사용한다.
    # ai_call_start / ai_call_success / ai_call_failure 로그를 남긴다.
    # 타임아웃은 AIError(..., 504), 그 외 API 실패는 AIError(..., 502).
    raise AIError("AI 연결 구현 예정입니다.", status_code=503)
