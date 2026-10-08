export class APIError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

export async function responseError(response) {
  const body = await response.json().catch(() => null);
  const fallback = response.status === 401 ? '로그인이 필요합니다.'
    : response.status === 422 ? '입력 형식을 확인해 주세요.'
    : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  return new APIError(typeof body?.detail === 'string' ? body.detail : fallback, response.status);
}

// 네트워크 조각과 SSE 이벤트 경계는 다르다. UTF-8·줄·이벤트를 차례로 누적한다.
export async function readChatStream(response, onDelta, onActivity = () => {}) {
  if (!response.ok) throw await responseError(response);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new APIError('스트리밍 응답을 받지 못했습니다. 대화 내역을 확인해 주세요.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let event = '';
  let data = [];

  function dispatch() {
    const type = event;
    const payload = data.join('\n');
    event = '';
    data = [];
    if (!payload || !['delta', 'done', 'error'].includes(type)) return;
    const value = JSON.parse(payload);
    if (type === 'error') {
      throw new APIError(typeof value.detail === 'string' ? value.detail : '답변을 완성하지 못했습니다.', value.status_code);
    }
    if (type === 'delta') {
      if (typeof value.text !== 'string') throw new Error('Invalid delta');
      onDelta(value.text);
      return;
    }
    if (typeof value.answer !== 'string' || !Number.isInteger(value.id)) throw new Error('Invalid done');
    return value;
  }

  try {
    while (true) {
      const chunk = await reader.read();
      if (!chunk.done) onActivity();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      while (true) {
        const match = /[\r\n]/.exec(buffer);
        if (!match) break;
        const index = match.index;
        if (buffer[index] === '\r' && index === buffer.length - 1 && !chunk.done) break;
        const line = buffer.slice(0, index);
        const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(index + width);
        if (line === '') {
          const complete = dispatch();
          if (complete) return complete; // DB 저장 성공을 뜻하는 done만 완료로 인정한다.
        } else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          if (field === 'data') data.push(value);
        }
      }
      if (chunk.done) throw new APIError('답변 완료를 확인하지 못했습니다. 대화 내역을 확인한 뒤 다시 시도해 주세요.');
    }
  } catch (error) {
    if (error instanceof APIError || error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
    throw new APIError('답변 연결이 끊겼거나 응답 형식이 올바르지 않습니다. 대화 내역을 확인해 주세요.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
