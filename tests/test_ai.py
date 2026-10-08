import json
import os
import unittest
from unittest.mock import patch

import httpx2
from openai import AsyncOpenAI

from app.ai.service import AIError, SYSTEM_PROMPT, generate_reply, stream_reply


class AITests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {
            "AI_API_KEY": "test-secret", "AI_MODEL": "gpt-5-mini", "AI_TIMEOUT_SECONDS": "30",
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
                **kwargs,
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
            )
        self.enterContext(patch("app.ai.service.AsyncOpenAI", side_effect=create_client))

    def response(self, text="내일 면접이 있다고 말씀하셨어요.", status="stop"):
        return httpx2.Response(200, json={
            "id": "chatcmpl_test", "object": "chat.completion", "created": 0,
            "model": "gpt-5-mini",
            "choices": [{"index": 0, "finish_reason": status,
                         "message": {"role": "assistant", "content": text}}],
        })

    async def test_reply_preserves_context_and_logs_success(self):
        def handler(request):
            self.calls.append(request)
            self.assertEqual(str(request.url), "https://copa.codyssey.kr/v1/chat/completions")
            body = json.loads(request.content)
            self.assertEqual(body["messages"], [
                {"role": "system", "content": SYSTEM_PROMPT}, *self.messages,
            ])
            self.assertEqual(body["model"], "gpt-5-mini")
            return self.response()
        self.mock_api(handler)
        with self.assertLogs("app.ai.service", level="INFO") as logs:
            answer = await generate_reply(self.messages)
        self.assertIn("면접", answer)
        self.assertEqual(len(self.calls), 1)
        self.assertIn("ai_call_start", str(logs.output))
        self.assertIn("ai_call_success", str(logs.output))
        self.assertNotIn("test-secret", str(logs.output))

    async def test_context_keeps_latest_twenty_messages(self):
        for count in (19, 20, 21, 41):
            with self.subTest(count=count):
                messages = [
                    {"role": "user" if i % 2 == 0 else "assistant", "content": str(i)}
                    for i in range(count)
                ]
                original = [message.copy() for message in messages]

                def handler(request):
                    sent = json.loads(request.content)["messages"]
                    self.assertEqual(sent[0], {"role": "system", "content": SYSTEM_PROMPT})
                    self.assertEqual(sent[1:], original[-20:])
                    self.assertEqual(sent[-1], original[-1])
                    return self.response()

                self.mock_api(handler)
                await generate_reply(messages)
                self.assertEqual(messages, original)

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
        for text, status in [("  ", "stop"), ("잘린 답변", "length")]:
            with self.subTest(status=status):
                self.mock_api(lambda request: self.response(text, status))
                with self.assertRaises(AIError) as error:
                    await generate_reply(self.messages)
                self.assertEqual(error.exception.status_code, 502)

    async def test_missing_choices_or_content_is_rejected(self):
        responses = [
            {"choices": []},
            {"choices": [{"finish_reason": "stop", "message": {"role": "assistant", "content": None}}]},
        ]
        for body in responses:
            with self.subTest(body=body):
                self.mock_api(lambda request: httpx2.Response(200, json=body))
                with self.assertRaises(AIError) as error:
                    await generate_reply(self.messages)
                self.assertEqual(error.exception.status_code, 502)

    async def test_blank_model_uses_codyssey_default(self):
        def handler(request):
            self.assertEqual(json.loads(request.content)["model"], "gpt-5-mini")
            return self.response()
        self.mock_api(handler)
        with patch.dict(os.environ, {"AI_MODEL": ""}):
            self.assertIn("면접", await generate_reply(self.messages))

    async def test_invalid_configuration_does_not_call_api(self):
        for settings in [{"AI_API_KEY": ""}, {"AI_TIMEOUT_SECONDS": "bad"},
                         {"AI_TIMEOUT_SECONDS": "0"}, {"AI_TIMEOUT_SECONDS": "nan"}]:
            with self.subTest(settings=settings), patch.dict(os.environ, settings):
                with patch("app.ai.service.AsyncOpenAI") as client:
                    with self.assertRaises(AIError) as error:
                        await generate_reply(self.messages)
                    self.assertEqual(error.exception.status_code, 503)
                    client.assert_not_called()

    async def test_stream_delivers_chunks_and_preserves_context(self):
        messages = [{"role": "user", "content": str(i)} for i in range(25)]
        def handler(request):
            body = json.loads(request.content)
            self.assertTrue(body["stream"])
            self.assertEqual(body["messages"][1:], messages[-20:])
            events = [
                {"choices": [{"index": 0, "delta": {"role": "assistant", "content": "힘내"}, "finish_reason": None}]},
                {"choices": [{"index": 0, "delta": {"role": "assistant", "content": "세요!"}, "finish_reason": None}]},
                {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
            ]
            data = "".join("data: " + json.dumps({"id": "chatcmpl_test", "object": "chat.completion.chunk", "created": 0, "model": "gpt-5-mini", **event}) + "\n\n" for event in events)
            return httpx2.Response(200, text=data + "data: [DONE]\n\n",
                                  headers={"content-type": "text/event-stream"})
        self.mock_api(handler)
        self.assertEqual([text async for text in stream_reply(messages)], ["힘내", "세요!"])

    async def test_stream_requires_complete_nonempty_response(self):
        for content, reason in [("부분 답변", None), ("부분 답변", "length"), ("", "stop")]:
            with self.subTest(reason=reason):
                event = {"choices": [{"index": 0, "delta": {"role": "assistant", "content": content}, "finish_reason": reason}]}
                self.mock_api(lambda request: httpx2.Response(
                    200, text="data: " + json.dumps({"id": "chatcmpl_test", "object": "chat.completion.chunk", "created": 0, "model": "gpt-5-mini", **event}) + "\n\ndata: [DONE]\n\n",
                    headers={"content-type": "text/event-stream"},
                ))
                with self.assertRaises(AIError):
                    _ = [text async for text in stream_reply(self.messages)]

    async def test_stream_timeout_is_reported(self):
        def handler(request):
            raise httpx2.ReadTimeout("secret", request=request)
        self.mock_api(handler)
        with self.assertRaises(AIError) as error:
            _ = [text async for text in stream_reply(self.messages)]
        self.assertEqual(error.exception.status_code, 504)
