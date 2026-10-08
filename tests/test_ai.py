import json
import os
import unittest
from unittest.mock import patch

import httpx2
from openai import AsyncOpenAI

from app.ai.service import AIError, SYSTEM_PROMPT, generate_reply


class AITests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {
            "AI_API_KEY": "test-secret", "AI_MODEL": "gpt-6-luna", "AI_TIMEOUT_SECONDS": "30",
        }))
        self.messages = [
            {"role": "user", "content": "내일 면접이야"},
            {"role": "assistant", "content": "긴장되시겠어요."},
            {"role": "user", "content": "내가 내일 뭐 한다고 했지?"},
        ]
        self.calls = []

    def mock_api(self, handler):
        def create_client(**kwargs):
            self.assertEqual(kwargs["max_retries"], 0)
            self.assertEqual(kwargs["timeout"], 30)
            return AsyncOpenAI(
                **kwargs, base_url="https://api.openai.com/v1",
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
            )
        self.enterContext(patch("app.ai.service.AsyncOpenAI", side_effect=create_client))

    def response(self, text="내일 면접이 있다고 말씀하셨어요.", status="completed"):
        return httpx2.Response(200, json={
            "id": "resp_test", "object": "response", "created_at": 0,
            "model": "gpt-6-luna", "status": status,
            "output": [{"type": "message", "id": "msg_test", "role": "assistant",
                        "status": "completed", "content": [
                            {"type": "output_text", "text": text, "annotations": []},
                        ]}],
        })

    async def test_reply_preserves_context_and_logs_success(self):
        def handler(request):
            self.calls.append(request)
            self.assertEqual(request.url.path, "/v1/responses")
            body = json.loads(request.content)
            self.assertEqual(body["input"], self.messages)
            self.assertEqual(body["instructions"], SYSTEM_PROMPT)
            self.assertEqual(body["model"], "gpt-6-luna")
            self.assertFalse(body["store"])
            return self.response()
        self.mock_api(handler)
        with self.assertLogs("app.ai.service", level="INFO") as logs:
            answer = await generate_reply(self.messages)
        self.assertIn("면접", answer)
        self.assertEqual(len(self.calls), 1)
        self.assertIn("ai_call_start", str(logs.output))
        self.assertIn("ai_call_success", str(logs.output))
        self.assertNotIn("test-secret", str(logs.output))

    async def test_api_failures_are_safe_and_not_retried(self):
        for failure, expected in [("timeout", 504), ("connection", 502), (401, 502), (429, 502), (500, 502)]:
            with self.subTest(failure=failure):
                self.calls = []
                def handler(request):
                    self.calls.append(request)
                    if failure == "timeout":
                        raise httpx2.ReadTimeout("test-secret", request=request)
                    if failure == "connection":
                        raise httpx2.ConnectError("test-secret", request=request)
                    return httpx2.Response(failure, json={"error": {"message": "test-secret"}})
                self.mock_api(handler)
                with self.assertLogs("app.ai.service", level="WARNING") as logs:
                    with self.assertRaises(AIError) as error:
                        await generate_reply(self.messages)
                self.assertEqual(error.exception.status_code, expected)
                self.assertEqual(len(self.calls), 1)
                self.assertNotIn("test-secret", str(error.exception) + str(logs.output))

    async def test_empty_or_incomplete_reply_is_rejected(self):
        for text, status in [("  ", "completed"), ("잘린 답변", "incomplete")]:
            with self.subTest(status=status):
                self.mock_api(lambda request: self.response(text, status))
                with self.assertRaises(AIError) as error:
                    await generate_reply(self.messages)
                self.assertEqual(error.exception.status_code, 502)

    async def test_invalid_configuration_does_not_call_api(self):
        for settings in [{"AI_API_KEY": ""}, {"AI_TIMEOUT_SECONDS": "bad"},
                         {"AI_TIMEOUT_SECONDS": "0"}, {"AI_TIMEOUT_SECONDS": "nan"}]:
            with self.subTest(settings=settings), patch.dict(os.environ, settings):
                with patch("app.ai.service.AsyncOpenAI") as client:
                    with self.assertRaises(AIError) as error:
                        await generate_reply(self.messages)
                    self.assertEqual(error.exception.status_code, 503)
                    client.assert_not_called()
