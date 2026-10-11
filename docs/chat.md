# 채팅 기능명세

채팅방 생성·목록·대화 내역 조회와 SSE 메시지 전송이 구현되어 있다. 화면은 SSE 전송(`/messages/stream`)으로 응답 조각을 순차 표시하며, 저장 완료 후 이전 대화를 다시 불러올 수 있다. 이 문서는 현재 코드의 채팅 정책, 실행 예시, DB 확인 방법과 팀 연결 방법을 설명한다.

## 범위와 연결

채팅 담당은 방 생성·목록, 본인 내역 조회, 문맥 구성, AI 호출 연결, Q/A 저장을 구현한다. 소유 파일은 `app/chat/`, `app/db.py`다.
인증은 기존 `CurrentUser = Annotated[User, Depends(get_current_user)]`로 받는다. 방 소유자와 조회 조건에는 인증된 `user.id`만 사용하고 요청 본문의 `user_id`는 무시한다.
AI는 `stream_reply(messages)`로 호출한다. 채팅은 소유권 확인·문맥 조회·저장을, AI는 시스템 프롬프트와 제공자 호출을 맡는다.
`AIError`는 `app/main.py`의 공통 예외 처리기가 `{"detail":"안내 문구"}` HTTP 응답으로 바꾼다.

## 채팅 정책

- 소유권은 `rooms.id`와 `rooms.user_id`를 함께 조건으로 확인한다. 없는 방과 다른 사람의 방은 같은 `404 {"detail":"채팅방을 찾을 수 없습니다."}`로 응답해 다른 사람 방의 존재 여부를 드러내지 않는다.
- 방 목록은 최신순(`id` 내림차순), 대화 내역은 과거→최신(`id` 오름차순)이다. `created_at`은 밀리초 단위라 같은 값이 생길 수 있어 정렬 기준으로 쓰지 않는다.
- 방 제목은 공백 제거 후 1~100자이며 생략하면 `새 대화`다. 질문은 공백 제거 후 1~2,000자다. 공백을 제거한 값을 저장한다.
- 문맥은 같은 방의 최근 완료 **Q/A 10개**를 시간순으로 펼치고 새 질문을 마지막에 붙인다. 다른 방의 대화가 섞이지 않도록 조회하고 다른 방의 대화는 섞지 않는다. AI는 시스템 프롬프트를 제외한 최대 **21개 메시지**를 유지하므로 가장 오래된 질문도 전달된다.
- AI 응답이 성공한 뒤에만 질문과 답변을 한 행으로 저장한다. 소유권 오류, AI 실패·타임아웃 요청은 대화 내역에 남기지 않는다.
- `created_at`은 저장 시각, 즉 답변을 받은 뒤의 UTC 시각이다.
- SSE는 공통 동기 의존성 `_load_messages`에서 인증·소유권·문맥 조회를 마친다. SSE 헤더를 보내기 전에 조회 오류를 처리한다. 저장은 공통 `_save_exchange`를 `asyncio.to_thread`로 실행하고, AI를 기다리는 동안 DB 연결을 열어두지 않는다. 나머지 채팅 API는 동기 함수라 FastAPI 스레드풀에서 실행된다.
- SQL은 바인딩 파라미터만 사용한다. 별도 ORM이나 저장소 계층은 추가하지 않는다.

## API 계약

모든 채팅 API는 로그인이 필요하며 세션이 없으면 `401 {"detail":"로그인이 필요합니다."}`다.

| API | 입력 | 정상 동작 | 오류 |
| --- | --- | --- | --- |
| `POST /api/rooms` | `{"title":"오늘 이야기"}` | 로그인 사용자 소유로 저장, `201 Room` | 입력 `422`, 저장 실패 `500` |
| `GET /api/rooms` | 없음 | 본인 방만 `200 [Room]`, 최신순 | 방이 없으면 `200 []`, 조회 실패 `500` |
| `GET /api/rooms/{room_id}/messages` | 없음 | `200 [Exchange]`, 과거→최신 | 방 없음·다른 사람 방 `404`, 조회 실패 `500` |
| `POST /api/rooms/{room_id}/messages/stream` | `{"question":"오늘 많이 지쳤어"}` | `200 text/event-stream` | [README의 SSE 채팅](../README.md#sse-채팅) 참고 |

`Room`과 `Exchange`의 응답 형식은 아래와 같다(값은 예시). `created_at`은 소수 초를 포함한 UTC다.

```json
{"id":1,"title":"오늘 이야기","created_at":"2026-10-08T08:31:57.423000Z"}
{"id":1,"room_id":1,"question":"오늘 많이 지쳤어","answer":"많이 힘든 하루였겠어요.","created_at":"2026-10-08T08:32:03.118000Z"}
```

오류 문구는 아래와 같다. AI 오류 문구와 상태는 `app/ai/service.py`가 정하고 채팅은 그대로 전달한다.

| 상황 | 응답 |
| --- | --- |
| 방 없음·다른 사람 방 | `404 {"detail":"채팅방을 찾을 수 없습니다."}` |
| 방 저장 실패 | `500 {"detail":"채팅방을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}` |
| 방 목록·내역·문맥 조회 실패 | `500 {"detail":"대화 내역을 불러오지 못했습니다."}` |
| 대화 저장 실패 | `500 {"detail":"대화를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."}` |
| AI 설정 없음 | `503 {"detail":"AI 서비스 설정을 확인해 주세요."}` |
| AI 타임아웃 | `504 {"detail":"응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요."}` |
| AI 호출 실패·불완전한 답변 | `502 {"detail":"지금은 답변을 받을 수 없어요. 잠시 후 다시 시도해 주세요."}` 또는 `502 {"detail":"답변을 완성하지 못했어요. 다시 시도해 주세요."}` |

입력 오류 `422`는 FastAPI 기본 `detail` 배열이다. DB 조회·저장 오류는 내부 원인을 노출하지 않는 `detail` 문자열로 반환한다. SSE 시작 후 오류는 HTTP 상태를 변경할 수 없으므로 `error` 이벤트의 `status_code`와 `detail`로 전달한다.

## 화면 동작

- `/`, `/chat`, `/guest`는 공통 `chat.html`을 사용한다. 첫 질문 시 방을 만들고 POST `fetch`로 SSE를 요청한다.
- `delta`는 같은 말풍선에 이어 붙이고 `done`의 저장된 답변·시각으로 완료한다. `error` 또는 종료 이벤트 없는 연결 중단은 부분 답변을 미완료로 표시한다. 자동 재전송하지 않는다.
- HTTP/SSE `500`·`503` 등은 서버의 안전한 `detail` 문구를 표시한다. `401`은 로그인 안내, `422`는 입력 안내다.
- 응답 중 중복 전송·방 이동·로그아웃을 막는다. 로그아웃 성공 시 로그인 화면으로 이동하며 실패하면 현재 화면을 유지하고 안내한다.
- 메시지 피드와 입력창은 세로로 나뉘며 메시지 영역만 스크롤한다. 여러 줄 입력으로 입력창 높이가 바뀌어도 메시지를 덮지 않는다.

## 실제 API 사용 예시

서버를 실행하고 [인증 사용 예시](auth.md#실제-api-사용-예시)대로 가입·로그인해 쿠키 파일을 만든 상태에서 확인한다.

```sh
# 방 생성: 201 Room. 본문에 user_id를 넣어도 무시하고 로그인 사용자 소유로 저장한다.
curl -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"title":"오늘 이야기"}'

# 방 목록: 200 [Room], 최신순
curl -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/rooms

# 질문 전송: delta → DB 저장 → done 순서로 수신한다.
# 키가 없으면 error 이벤트(status_code=503)를 보내며 저장하지 않는다.
curl -N -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/rooms/1/messages/stream \
  -H 'Content-Type: application/json' \
  -d '{"question":"오늘 많이 지쳤어"}'

# 대화 내역: 200 [Exchange], 과거→최신
curl -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/rooms/1/messages
```

다른 사용자로 로그인한 쿠키로 같은 방의 내역 조회나 질문 전송을 요청하면 `404 {"detail":"채팅방을 찾을 수 없습니다."}`다. 로그아웃한 쿠키로 요청하면 `401`이다.

## 서버 로그

질문·답변 원문은 로그에 남기지 않고 사용자·방·대화 ID만 기록한다.

| 이벤트 | 위치 | 기록 값 |
| --- | --- | --- |
| `request_received` | 질문 전송 시작(SSE) | `user_id`, `room_id` |
| `db_save_success` | 방 생성, 대화 저장 성공 | `user_id`, `room_id`, 대화 저장 시 `exchange_id` |
| `db_save_failure` | 방 생성, 대화 저장 실패 | `user_id`, `room_id`. 상세 원인(traceback)을 서버 로그에만 남긴다 |
| `chat_ai_failure` | SSE 전송의 AI 실패 | `user_id`, `room_id`, `status` |
| `db_read_failure` | SSE 문맥 조회 실패 | `user_id`, `room_id` |

AI 호출 자체의 `ai_call_start`·`ai_call_success`·`ai_call_failure`는 `app.ai.service`가 남긴다. 이 로그에는 사용자·방 정보가 없어서 채팅의 `chat_ai_failure`로 어느 요청이 실패했는지 추적한다. 실제 서버에서 AI 키 없이 질문을 보냈을 때의 로그는 아래와 같다.

```text
INFO:app.chat.router:request_received user_id=1 room_id=1
ERROR:app.ai.service:ai_call_failure reason=configuration
WARNING:app.chat.router:chat_ai_failure user_id=1 room_id=1 status=503
```

## DB 구조

| 테이블 | 필드 | 제약·의미 |
| --- | --- | --- |
| `rooms` | `id INTEGER` | 기본키 |
| `rooms` | `user_id INTEGER` | NOT NULL, `users.id` 외래키, 사용자 삭제 시 CASCADE |
| `rooms` | `title TEXT` | NOT NULL |
| `rooms` | `created_at TEXT` | NOT NULL, UTC 생성 시각 기본값 |
| `exchanges` | `id INTEGER` | 기본키, 대화 순서 기준 |
| `exchanges` | `room_id INTEGER` | NOT NULL, `rooms.id` 외래키, 방 삭제 시 CASCADE |
| `exchanges` | `question TEXT` | NOT NULL, 공백 제거된 질문 |
| `exchanges` | `answer TEXT` | NOT NULL, AI 답변 |
| `exchanges` | `created_at TEXT` | NOT NULL, UTC 저장 시각 기본값 |

`users → rooms → exchanges`로 사용자별 질문·답변·생성 시각을 추적한다. 질문과 답변을 한 행에 저장하므로 답변 없는 질문이 남지 않는다. `exchanges`에는 `user_id`를 따로 두지 않고 `rooms`를 조인해 사용자를 찾는다.

조회 성능을 위해 `idx_rooms_user ON rooms(user_id)`, `idx_exchanges_room ON exchanges(room_id)` 인덱스를 둔다. 방 목록, 대화 내역, 최근 Q/A 조회가 테이블 전체 대신 인덱스를 사용한다. `init_db()`는 서버 시작마다 `CREATE ... IF NOT EXISTS`를 실행하므로 인덱스가 없던 기존 로컬 DB에도 자동으로 추가된다. 기존 데이터는 지우지 않는다.

## 대화 로그 확인

사용자 기준 조회는 API와 SQL 두 가지로 확인한다. API는 로그인한 본인의 방 목록(`GET /api/rooms`)과 방별 내역(`GET /api/rooms/{room_id}/messages`)이다. 운영자 확인은 SQLite CLI로 기본 DB를 조회한다.

```sh
# 특정 사용자의 전체 대화 로그
sqlite3 -header -column .data/positive-bot.db "SELECT u.username, r.title, e.question, e.answer, e.created_at FROM exchanges e JOIN rooms r ON r.id = e.room_id JOIN users u ON u.id = r.user_id WHERE u.username = 'demo' ORDER BY e.id;"

# 사용자별 방·대화 수
sqlite3 -header -column .data/positive-bot.db 'SELECT u.username, COUNT(DISTINCT r.id) AS rooms, COUNT(e.id) AS exchanges FROM users u LEFT JOIN rooms r ON r.user_id = u.id LEFT JOIN exchanges e ON e.room_id = r.id GROUP BY u.id ORDER BY u.id;'

# 채팅 인덱스 확인
sqlite3 .data/positive-bot.db "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%';"
```

최근 대화 10개 조회는 README의 DB 확인 예시를 사용한다. 비밀번호 해시나 세션 토큰 해시는 대화 로그 확인에 필요하지 않다.

## 완료 기준

1. 로그인한 사용자만 방 생성·목록·내역 조회·질문 전송을 할 수 있고 요청 본문의 `user_id`로 소유자를 바꿀 수 없다.
2. 다른 사용자의 방은 내역 조회와 질문 전송 모두 `404`이며 AI를 호출하지 않는다.
3. 방 목록은 최신순, 대화 내역은 과거→최신이다.
4. 같은 방의 최근 Q/A와 새 질문이 시간순으로 AI에 전달되고 다른 방 대화는 섞이지 않는다.
5. AI 응답이 성공한 경우에만 Q/A를 한 행으로 저장하고, AI 실패·타임아웃은 저장 없이 상태와 안내를 전달한다.
6. DB 저장 실패는 `error` 이벤트의 `status_code=500`과 일반 안내를 반환하고 상세 원인은 서버 로그에만 남긴다.
7. 요청 수신, DB 저장 성공·실패, AI 실패 로그에 `user_id`와 `room_id`가 남는다.
8. `uv run python -m unittest discover -s tests -v`와 `git diff --check`로 확인한다.

## 검증 결과

2026-10-11, Python 3.12에서 채팅 테스트 **17개**를 포함한 전체 **76개**가 통과했다. 테스트는 임시 SQLite DB를 사용하며 AI 호출은 테스트 안에서만 대체한다.

| 파일 | 검증 내용 |
| --- | --- |
| `tests/test_chat.py` (9개) | 방 생성·기본 제목·제목 길이·저장 실패, 본인 방만 최신순 목록, 내역 순서·방 범위·타인 방 `404` |
| `tests/test_chat_stream.py` (8개) | SSE `done` 전 저장, 인증·소유권·입력 확인 후 AI 호출, 문맥 순서·방 범위, AI·DB 실패 시 `error`, 시작 전 DB 조회 오류 JSON, 연결 중단·취소 시 미저장 |
| `tests/test_web_stream.mjs` (7개) | UTF-8·줄바꿈·이벤트 분할, 서버 오류 문구, 부분 응답 오류, 종료 이벤트 누락, 잘못된 응답, 완료 시 연결 정리 |
| `tests/test_web_browser.cjs` | 실제 세션과 테스트용 AI로 SSE 순차 표시·저장/재조회, 중복 전송 차단, 데스크톱/모바일 입력창 배치, HTTP/SSE `500`·`503` 및 중단 안내, 로그아웃 성공·실패 |

인증 연결 테스트는 실제 방 생성·SSE 전송·조회·로그아웃 후 `401`을 검증한다. Node.js 파서 테스트와 Playwright 브라우저 검증도 통과했다. 실제 제공자 호출과 원격 서버 배포 확인은 이 회귀 검증에 포함하지 않는다.

채팅 테스트만 실행하려면 `uv run python -m unittest discover -s tests -p 'test_chat*.py' -v`를 사용한다.

## 배포 시 확인

- 실제 제공자의 SSE 조각이 프록시를 거쳐 순차 도착하고, 완료된 답변이 재접속 뒤 조회되는지 확인한다.
- DB 커밋 후 연결이 끊기면 저장됐지만 `done`을 받지 못할 수 있다. 화면 안내대로 내역을 확인한 뒤 입력창에서 질문을 다시 보낸다.
- 배포: AWS EC2 서버의 로컬 SQLite 파일(`DATABASE_PATH`)을 사용한다. 서버 구성과 업데이트 절차는 [README의 배포](../README.md#배포-aws-ec2) 절에 있다.
