import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatStream, responseError, APIError } from '../app/web/js/api.js';

function response(text, split = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += split) controller.enqueue(bytes.slice(index, index + split));
      controller.close();
    },
  }), {headers: {'content-type': 'text/event-stream'}});
}
const done = 'event: done\ndata: {"id":1,"answer":"안녕🌿"}\n\n';

test('한국어 UTF-8와 이벤트가 바이트 단위로 끊겨도 done까지 읽는다', async () => {
  const chunks = [];
  const result = await readChatStream(response(': ping\n\nevent: delta\ndata: {"text":"안녕🌿"}\n\n' + done), text => chunks.push(text));
  assert.deepEqual(chunks, ['안녕🌿']);
  assert.equal(result.answer, '안녕🌿');
});

test('CRLF·CR 줄 경계, 여러 data 행, 여러 이벤트를 처리한다', async () => {
  for (const newline of ['\r\n', '\r']) {
    const chunks = [];
    const wire = ('event: delta\ndata: {\ndata: "text":"안녕🌿"}\n\n' + done).replaceAll('\n', newline);
    await readChatStream(response(wire, 2), text => chunks.push(text));
    assert.deepEqual(chunks, ['안녕🌿']);
  }
});

test('HTTP 500·503 서버 안내를 보존한다', async () => {
  for (const status of [500, 503]) {
    const message = '서버 안내 ' + status;
    await assert.rejects(readChatStream(new Response(JSON.stringify({detail: message}), {status}), () => {}),
      error => error instanceof APIError && error.message === message && error.status === status);
  }
});

test('부분 답변 뒤 error는 완료로 처리하지 않는다', async () => {
  for (const status of [500, 503, 504]) {
    const chunks = [];
    await assert.rejects(readChatStream(response('event: delta\ndata: {"text":"부분"}\n\nevent: error\ndata: ' + JSON.stringify({detail: '저장/AI 실패', status_code: status}) + '\n\n'), text => chunks.push(text)),
      error => error.status === status && error.message === '저장/AI 실패');
    assert.deepEqual(chunks, ['부분']);
  }
});

test('done 없는 종료, 손상된 JSON, JSON 성공 응답을 거부한다', async () => {
  for (const wire of ['event: delta\ndata: {"text":"부분"}\n\n', 'event: done\ndata: {broken}\n\n', 'event: done\ndata: {"answer":"없음"}\n\n']) {
    await assert.rejects(readChatStream(response(wire), () => {}), APIError);
  }
  await assert.rejects(readChatStream(new Response('{}'), () => {}), APIError);
});

test('이벤트 종료 뒤 추가 조각을 기다리지 않고 reader를 취소한다', async () => {
  let cancelled = false;
  const res = new Response(new ReadableStream({
    start(controller) {controller.enqueue(new TextEncoder().encode(done));},
    cancel() {cancelled = true;},
  }), {headers: {'content-type': 'text/event-stream'}});
  assert.equal((await readChatStream(res, () => {})).id, 1);
  assert.equal(cancelled, true);
});

test('서버 오류 HTML과 422 detail 배열은 안전한 안내로 대체한다', async () => {
  const error = await responseError(new Response('<html>private stack</html>', {status:500}));
  assert.ok(!error.message.includes('private'));
  const validation = await responseError(new Response(JSON.stringify({detail:[{input:'secret'}]}), {status:422}));
  assert.equal(validation.message, '입력 형식을 확인해 주세요.');
});
