# 4인 개발 연결 규칙

## 공통 출발점

최신 `main`에서 기능별 작업 브랜치를 만든다. 담당 폴더 안에서 작업하고, 다른 담당자의 공개 함수·API 형식을 바꿀 때는 먼저 합의한다. 폴더 분리는 충돌을 줄여주지만 공통 파일 동시 수정까지 방지하지는 않는다.

각자 개발 후 `main`으로 PR을 보내 통합한다. 전체 폴더 덮어쓰기를 피한다. 일반 merge를 사용해 개인 커밋을 보존하고, 과제의 **팀원별 유의미한 커밋 10회 이상**을 실제 기능·검증·문서 작업으로 남긴다. 횟수만 맞추는 빈 커밋은 만들지 않는다.

공통 의존성 추가는 통합 담당자가 `uv add 패키지`로 반영한다. `uv.lock`을 손으로 합치지 않는다. 각 담당자는 `tests/test_auth.py`, `test_chat.py`, `test_ai.py`처럼 자기 영역 테스트 파일을 별도로 추가한다. `test_template.py`는 화면·상태 확인·공개 API와 입력 검증을 확인한다.

## 인증 → 채팅

- 공개 함수: `app.auth.dependencies.get_current_user(request) -> User`.
- 채팅 라우터는 `Depends(get_current_user)`로 인증 결과를 받는다. 임시 고정 사용자나 요청 본문의 `user_id`를 신뢰하지 않는다.
- `User`는 `id`, `username`만 공개한다. 비밀번호나 세션 값은 응답/로그에 넣지 않는다.
- 인증 담당은 비밀번호 전용 해시 라이브러리를 사용한다. 세션은 임의 토큰의 해시와 만료 시각을 DB에 저장한다.
- 쿠키 이름은 `session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, HTTPS 배포에서는 `Secure`로 한다. 변경 요청은 JSON을 사용하며 CORS를 무조건 허용하지 않는다.
- 가입과 로그인을 분리한다. 로그아웃은 서버 세션과 쿠키를 모두 제거한다.

## 채팅 → AI

응답은 `app.ai.service.stream_reply(messages)`의 async iterator를 사용한다. AI 담당은 DB·사용자·방을 직접 조회하지 않는다. HTTP용 AI 단독 엔드포인트도 추가하지 않는다.

입력 예시:

```python
[
    {"role": "user", "content": "면접 때문에 긴장돼"},
    {"role": "assistant", "content": "중요한 일이라 긴장될 수 있어요."},
    {"role": "user", "content": "응원해줘"},
]
```

채팅 담당은 본인 방인지 확인하고 최근 **완료된 10개 Q/A**를 가져와 시간순으로 위 형식에 펼친 뒤 새 질문을 마지막에 추가한다. SSE 모두 같은 문맥 조회·저장 함수를 사용한다. AI 함수는 새 질문 포함 최대 **21개 메시지**를 유지하고 시스템 프롬프트를 별도로 붙여 실제 제공자 API를 호출한다. 기준은 `app/ai/service.py`의 `CONTEXT_EXCHANGES = 10`과 여기서 계산한 `MAX_CONTEXT_MESSAGES`다. 공감과 격려를 하되 사용자의 사실 주장을 무조건 사실로 확정하거나 위험한 행동을 부추기지 않도록 프롬프트를 작성한다.

실패는 `AIError(사용자용 안내, status_code=502, 503 또는 504)`로 전달한다. 원본 제공자 오류 본문·API 키를 사용자에게 전달하지 않는다. 자동 재시도는 하지 않는다. 채팅 라우터가 `AIError`를 `error` 이벤트로 변환한다.

SSE 경로 `POST /api/rooms/{room_id}/messages/stream`은 `app/chat/router.py`에 구현되어 있다. 응답 조각을 `delta` 이벤트로 보내고 정상 완료된 질문과 답변을 한 행으로 저장한 후, `done` 이벤트에 `Exchange`를 반환한다. 실패 시 `error` 이벤트를 보내며 미완성 대화는 저장하지 않는다. AI 대기 중 SQLite 연결/쓰기 트랜잭션을 유지하지 않는다. 실패한 요청은 대화 내역에 넣지 않고 서버 로그에 원인을 남긴다. SQL은 반드시 바인딩 파라미터를 사용한다.

## 로그와 화면

- 채팅: `request_received`, `db_save_success`, `db_save_failure`와 user_id/room_id.
- AI: `ai_call_start`, `ai_call_success`, `ai_call_failure`. 제한 시간은 환경 변수로 읽는다.
- DB 조회·저장 실패는 서버에 기록하고 사용자에게 일반적인 실패 안내와 `500`을 반환한다. SSE 시작 후 저장 실패는 `error` 이벤트로 전달한다.
- 화면은 같은 출처의 `/api/...`에 JSON을 보낸다. 채팅은 POST `fetch`로 `/api/rooms/{room_id}/messages/stream`을 호출해 `delta`를 이어 붙이고 `done`으로 저장 완료를 확인한다. 종료 이벤트 없는 중단은 미완료로 표시한다.
- `401`이면 로그인 안내, `422`이면 입력 안내를 보여준다. HTTP/SSE `500`·`503` 등 서버의 `detail` 문자열을 표시하고, HTML 오류 본문이나 검증 원문은 노출하지 않는다.
- 사용자 질문과 AI 응답은 `textContent`로 표시한다. 응답을 그대로 `innerHTML`에 넣지 않는다.
- 응답 대기 중 중복 전송·방 이동·로그아웃을 막는다. 로그아웃은 실제 서버 세션 삭제 성공 후 로그인 화면으로 이동하며 실패하면 서버 안내를 표시한다. 화면용 임시 데이터는 `tests/` 안에서만 사용한다.

## 개별 개발과 합치기

인증이 완성되기 전 채팅 테스트는 FastAPI의 `app.dependency_overrides[get_current_user]`로 테스트 사용자만 주입한다. AI가 완성되기 전 채팅 테스트는 `unittest.mock`으로 함수 응답을 대체한다. 이 우회는 테스트 안에서만 사용하고 종료 시 반드시 해제한다.

각 PR에서 담당 기능 테스트와 공통 테스트를 실행한다. 통합 후 실제 가입 → 로그인 → 방 생성 → 질문/답변 → 이전 대화 조회 → 다른 사용자 접근 차단 → 로그아웃을 확인한다. 실제 AI 실패·타임아웃 및 서버 재시작 뒤 대화 유지도 확인한다.

현재 배포는 AWS EC2 디스크의 SQLite를 사용하며 구성과 업데이트 절차는 README를 따른다. 로컬 SQLite 검증만으로 배포 저장 요건을 완료 처리하지 않는다.
