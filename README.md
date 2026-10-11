# 긍정봇

일상의 고민을 이야기하고 공감과 격려를 받는 웹 AI 챗봇이다. 사용자는 로그인 후 채팅방을 만들고 대화를 이어가며 이전 대화를 다시 확인한다.

- 서비스 주소: **http://13.125.113.66**
- GitHub: https://github.com/LimJongHan/Codyssey-B7-1

## 프로젝트 개요

| 항목 | 내용 |
| --- | --- |
| 문제 정의 | 하루의 지친 마음이나 사소한 고민은 주변에 털어놓기 어렵고, 털어놓아도 그때뿐이라 이전에 어떤 이야기를 했는지 이어가기 어렵다. |
| 타겟 사용자 | 가볍게 감정을 정리하고 공감·격려를 받고 싶은 사람. 같은 고민을 여러 날에 걸쳐 이어서 이야기하고 싶은 사람. |
| 해결 방식 | 로그인한 사용자가 주제별 채팅방에서 AI 긍정봇과 대화한다. 서버가 같은 방의 최근 대화를 문맥으로 함께 보내 이어지는 답을 받고, 질문·답변을 사용자별로 저장해 다시 볼 수 있다. |

**핵심 시나리오**

1. 회원가입 후 로그인한다. 비로그인 사용자는 화면을 둘러볼 수만 있고 질문은 보낼 수 없다.
2. "새로운 대화"에서 첫 질문을 보내면 질문 앞부분을 제목으로 채팅방이 만들어진다.
3. AI 답변이 SSE로 조각조각 표시되고, 답변이 완료되면 질문과 함께 저장된다.
4. 같은 방에서 이어 질문하면 이전 대화를 기억한 답을 받는다. 예: "내 이름이 뭐라고 했지?" → "민수님이라고 하셨어요."
5. 다음에 접속해 사이드바에서 방을 고르면 이전 대화를 다시 볼 수 있다. 다른 사용자의 방은 볼 수 없다.
6. AI가 실패하거나 응답이 늦으면 오류 안내가 표시되고 미완성 대화는 저장되지 않는다.

현재 회원가입·로그인·로그아웃, 채팅방 생성·목록·이전 대화 조회, SSE 답변 표시와 저장이 화면에서 동작하며 AWS EC2에 배포되어 있다. 비로그인 API 요청은 `401`을 반환한다.

인증 내부의 비밀번호 해시·검증은 `argon2-cffi`의 Argon2id로 구현되어 있다. AI 호출에는 OpenAI SDK, SSE 응답에는 FastAPI 0.135 이상을 사용한다.

DB 세션은 24시간 유효하며 임의 토큰의 해시만 저장한다. 로그인 쿠키는 HttpOnly/SameSite=Lax이며 HTTPS에서는 Secure를 적용한다. 재로그인은 현재 브라우저의 이전 세션을 교체한다.

인증 DB 장애는 일반 안내와 `500`으로 응답하며 실패한 저장·삭제를 성공으로 처리하지 않는다. 인증 응답은 `Cache-Control: no-store`를 사용한다. 입력 오류는 `422`의 `detail` 배열을 유지하면서 원문 입력값을 제외해 비밀번호 반사를 막는다.

## 실행

Python 3.12와 [uv](https://docs.astral.sh/uv/getting-started/installation/)를 사용한다.

```sh
uv sync --locked
cp .env.example .env
uv run --env-file .env uvicorn app.main:app --reload
```

- 화면: http://127.0.0.1:8000
- API 명세 및 입력 테스트: http://127.0.0.1:8000/docs
- 상태 확인: `GET /api/health` → `{"status":"ok"}` (서버 기동만 확인)
- 검증: `uv run python -m unittest discover -s tests -v`
- SSE 파서 검증(Node.js 22 이상): `node --test tests/test_web_stream.mjs`

서버 시작 시 `.data/positive-bot.db`가 생성된다. 초기화를 별도로 실행하려면 `uv run --env-file .env python -m app.db`를 사용한다. 재실행은 기존 데이터를 지우지 않는다. 테이블 정의를 변경해도 기존 테이블이 자동 변경되지는 않는다.

| 환경 변수 | 용도 | 현재 사용 여부 |
| --- | --- | --- |
| `DATABASE_PATH` | 로컬 SQLite 파일 경로 | 사용, 기본 `.data/positive-bot.db` |
| `AI_API_KEY` | AI 제공자 비밀 키 | 사용 |
| `AI_MODEL` | AI 모델 이름, 비어 있으면 `gpt-5-mini` | 사용 |
| `AI_TIMEOUT_SECONDS` | AI 요청 제한 시간, 기본 30초 | 사용 |

`AI_API_KEY`에 Codyssey 발급 API 키를 설정한다. 호출 주소는 `https://copa.codyssey.kr/v1/chat/completions`이며, `AI_MODEL=gpt-5-mini`를 사용한다. [Codyssey API 문서](https://usr.codyssey.kr/public-api-console)를 기준으로 연결한다. AI 함수는 최근 완료 Q/A 10개와 새 질문, 최대 21개 메시지를 순서대로 보낸다(시스템 프롬프트 별도). 공감 프롬프트·자동 재시도 없는 타임아웃·호출 성공/실패 로그를 적용한다. 자동 테스트는 외부 API를 대체하므로 비용이 발생하지 않는다.

`.env`와 DB 파일은 Git에서 제외한다. 인증은 기존 `DATABASE_PATH`를 사용하며 별도 비밀 키나 추가 환경 변수가 필요하지 않다. 세션 수명은 24시간이다. 이후 인증 설정을 추가한다면 통합 담당과 `.env.example`에 반영한다.

## 구조와 담당

```text
브라우저(app/web) → FastAPI(app/main.py)
                     ├─ auth: 로그인 및 사용자 확인
                     └─ chat: 방 소유권 확인 → ai.stream_reply / generate_reply → 대화 저장
                          └─ SQLite(app/db.py)
```

| 담당 | 소유 파일 | 역할 |
| --- | --- | --- |
| 1. 화면 | `app/web/` | 회원가입·로그인, 방 목록, 대화 입력·출력, 로딩·오류 안내 |
| 2. 인증 | `app/auth/` | 가입, 비밀번호 해시, 세션 쿠키, 로그아웃, 현재 사용자 |
| 3. 채팅·DB | `app/chat/`, `app/db.py` | 방 생성·목록, 본인 내역 조회, 문맥 구성, AI 호출 연결, Q/A 저장 |
| 4. AI | `app/ai/` | 제공자 API 연동, 공감 프롬프트, 타임아웃·실패 처리, 호출 로그 |

`app/main.py`, `pyproject.toml`, `uv.lock`, `.env.example`은 공통 파일이라 통합 담당(Lim Jonghan)이 PR에서 관련 담당과 함께 확인한다. 통합 담당은 PR merge, 통합 후 동작 점검·수정, 서버 배포를 맡는다. 상세 연결 규칙과 브랜치 운영은 [협업 계약](docs/CONTRIBUTING.md)에 있다.

### 팀원별 작업 요약

이름은 Git 커밋 표시명이며, 괄호는 GitHub 계정이다. 커밋 수는 2026-10-11 `main` 기준 merge 커밋을 제외한 수다.

| 팀원 | 담당 | 커밋 | 실제 작업 요약 |
| --- | --- | --- | --- |
| **Hyejun An** (jagaldol) | AI | 18 | 초기 FastAPI 팀 템플릿과 과제 명세를 구성했다. OpenAI SDK로 Codyssey API를 연동하고 공감 프롬프트, 타임아웃·실패 처리, 호출 성공/실패 로그를 구현했다. SSE 스트리밍 답변과 완료 후 저장(`/messages/stream`), 한글 SSE 직렬화를 구현하고 AI 테스트와 연동 문서를 작성했다. (PR #2) |
| **하루이** (develsvai) | 인증 | 14 | 회원가입, Argon2id 비밀번호 해시, 토큰 해시만 저장하는 24시간 DB 세션, 로그인·현재 사용자 확인·로그아웃을 구현했다. 저장소 장애 처리와 인증 정보 노출 방지, 입력 경계·동시 가입·쿠키·세션 수명 테스트와 [인증 기능명세](docs/auth.md)를 작성했다. 이후 JSON·SSE 문맥 조회 통합(Q/A 10개, 21개 메시지), 화면 SSE 표시·로그아웃, 브라우저 회귀 테스트를 추가했다. (PR #1) |
| **Lim Jonghan** (LimJongHan) | 채팅·DB, 통합 | 16 | 채팅방 생성·목록, 방 소유권 확인(`404`), 본인 대화 내역 조회, 최근 Q/A 문맥 구성과 JSON 질문 전송·저장, 요청·저장·AI 실패 로그, 조회용 인덱스를 구현했다. 통합 담당으로 각 PR을 merge하고 통합 후 전체 흐름을 점검해 가짜 엔드포인트 제거, 화면의 방 목록·이전 대화 연결, 가입한 계정으로 로그인되지 않던 폼 수정, XSS 수정, 게스트 입력 차단을 했다. AWS EC2 배포를 구성하고 [채팅 기능명세](docs/chat.md), 배포·협업 문서를 작성했다. (PR #4, #6, #7) |
| **jeonghyeon** (newcode99) | 화면 | 11 | 디자인 시스템 토큰, 해피 마스코트 SVG, 로그인/회원가입 페이지와 메인 채팅 페이지, 사이드바·입력 도크·상태 처리·입력 검증을 구현했다. Flask 시안을 FastAPI 정적 화면(`app/web/`)으로 옮겨 인증·채팅 API와 연결했다. (PR #3, #5) |

## API 계약

인증 정책과 담당 연결·완료 기준은 [인증 기능명세](docs/auth.md)를, 채팅 정책·오류 문구·로그·대화 로그 확인 방법은 [채팅 기능명세](docs/chat.md)를 참고한다.

아래 API는 모두 구현되어 있다. 사용자 ID는 실제 DB에 따라 달라진다. 요청·응답 스키마는 `/docs`에서 확인한다. 인증은 동일 출처의 `session` 쿠키를 사용한다. 실제 실행 명령은 [인증 사용 예시](docs/auth.md#실제-api-사용-예시)와 [채팅 사용 예시](docs/chat.md#실제-api-사용-예시)에 있다.

| 메서드·경로 | JSON 입력 | 성공 응답 |
| --- | --- | --- |
| `POST /api/auth/signup` | `{"username":"demo","password":"example-password"}` | `201 {"id":1,"username":"demo"}` |
| `POST /api/auth/login` | 위와 동일 | `200 {"id":1,"username":"demo"}` + 쿠키 |
| `POST /api/auth/logout` | 없음 | `204`, 쿠키 제거 |
| `GET /api/auth/me` | 없음 | `200 {"id":1,"username":"demo"}` |
| `POST /api/rooms` | `{"title":"오늘 이야기"}` | `201 Room` |
| `GET /api/rooms` | 없음 | `200 [Room]`, 최신순 |
| `GET /api/rooms/{room_id}/messages` | 없음 | `200 [Exchange]`, 과거→최신 |
| `POST /api/rooms/{room_id}/messages/stream` | `{"question":"오늘 많이 지쳤어"}` | `200 text/event-stream` |
| `POST /api/rooms/{room_id}/messages` | `{"question":"오늘 많이 지쳤어"}` | `201 Exchange` |

아래는 2026-10-08 EC2 서버에서 실제 AI(`gpt-5-mini`)로 받은 응답이다(검증용 임시 DB 사용). `created_at`은 소수 초를 포함한 UTC다. 두 번째 질문에서 같은 방의 이전 대화를 문맥으로 사용한 것을 확인할 수 있다.

```text
POST /api/rooms  {"title":"검증 대화"}
→ 201 {"id":1,"title":"검증 대화","created_at":"2026-10-08T10:20:27.821000Z"}

POST /api/rooms/1/messages  {"question":"내 이름은 민수야. 오늘 면접 때문에 긴장돼."}
→ 201 {"id":1,"room_id":1,"question":"내 이름은 민수야. 오늘 면접 때문에 긴장돼.",
       "answer":"민수님, 오늘 면접이라 긴장되시는군요. 중요한 자리라 떨리고 걱정되실 것 같아요. 준비하신 만큼 차분히 하시면 잘하실 거예요. 심호흡 한 번 하고 가볍게 포인트만 떠올려 보세요. 잘 되길 응원하겠습니다.",
       "created_at":"2026-10-08T10:20:35.059000Z"}

POST /api/rooms/1/messages  {"question":"내 이름이 뭐라고 했지? 한 문장으로 답해줘."}
→ 201 {"id":2,"room_id":1,"question":"내 이름이 뭐라고 했지? 한 문장으로 답해줘.",
       "answer":"민수님이라고 하셨어요.","created_at":"2026-10-08T10:20:39.239000Z"}

GET /api/rooms/1/messages (다른 사용자 세션)
→ 404 {"detail":"채팅방을 찾을 수 없습니다."}
```

오류는 `{"detail":"안내 문구"}`를 사용한다. `401` 인증 실패, `409` 아이디 중복, `500` 인증 저장소/해시 처리 실패, 채팅의 `404` 방 없음/다른 사람 소유와 `500` DB 저장 실패, AI의 `502` 실패·`503` 설정 없음·`504` 타임아웃이 구현되어 있다. 입력 오류 `422`는 `detail` 배열을 사용하므로 화면에서 별도로 안내한다. 인증에서는 원문 `input`/`ctx`를 제외한다. 질문은 공백 제거 후 1~2,000자, 방 제목은 1~100자로 제한한다.

## SSE 채팅

AI 스트림은 OpenAI SDK의 `chat.completions.stream()`과 `content.delta` 이벤트를 사용하고, 최종 응답은 SDK가 누적한다. FastAPI의 `EventSourceResponse`와 `ServerSentEvent`를 사용한다. SSE 직렬화·응답 헤더·keep-alive는 프레임워크가 처리한다. 이벤트 데이터는 Pydantic 모델로 직렬화해 한글을 그대로 전송한다.

`POST /api/rooms/{room_id}/messages/stream`에 `{"question":"오늘 힘들었어"}`를 보낸다. 로그인과 본인 소유의 기존 채팅방이 필요하다. 로그인하지 않으면 `401`을 반환한다. 채팅방은 `POST /api/rooms`로 만든다.

- `delta`: `{"text":"응답 조각"}` — 화면에 이어 붙인다.
- `done`: 저장된 `Exchange` — **DB 커밋 성공 후** 전송한다.
- `error`: `{"detail":"안내 문구","status_code":502}` — 응답/저장 실패이며 `done`은 오지 않는다.

스트림 시작 전 인증·입력·소유권 오류는 HTTP `401`·`422`·`404`다. 시작 후에는 HTTP 상태를 바꿀 수 없으므로 `200`이어도 반드시 마지막 `done` 또는 `error`를 확인한다. 종료 이벤트 없이 연결이 끊기면 완료로 표시하지 않는다. 답변 완료 전 연결 중단은 저장하지 않으며, DB 커밋 후 연결이 끊긴 경우에는 저장됐지만 `done`을 못 받을 수 있다. 자동 재전송은 하지 않는다.

JSON·SSE 전송은 같은 문맥 조회·저장 함수를 사용한다. 서버는 해당 방의 최근 완료 Q/A 10개와 새 질문, 총 21개 메시지를 AI에 전달하며 가장 오래된 질문도 유지한다. 기준은 `app/ai/service.py`의 `CONTEXT_EXCHANGES`와 여기서 계산한 `MAX_CONTEXT_MESSAGES`다. 스트리밍 도중에는 DB 연결을 유지하지 않는다.

화면은 POST `fetch`로 SSE를 읽어 한 말풍선에 답변 조각을 이어 붙인다. UTF-8 문자와 이벤트가 네트워크 조각 사이에서 나뉘어도 처리한다. 응답 중에는 중복 전송·방 이동·로그아웃을 막고, 조각을 받을 때마다 40초 수신 대기 제한을 갱신한다. `done` 수신 시 완료로 표시하며, 오류나 연결 중단 시 부분 답변은 미완료로 남기고 안내를 표시한다. HTTP 및 SSE `500`·`503`을 포함한 오류의 `detail` 문자열을 그대로 표시하며 자동 재시도하지 않는다.

`/`, `/chat`, `/guest`는 하나의 `app/web/chat.html`을 사용한다. 메시지 영역만 스크롤되고 입력창은 그 아래에 별도 배치되어 여러 줄 입력과 긴 답변이 겹치지 않는다. 로그인 사용자는 헤더에서 로그아웃할 수 있다. 서버가 로그아웃에 실패하면 안내를 표시하고 현재 화면을 유지한다. 비로그인 사용자는 화면을 둘러볼 수만 있다. 입력창과 전송 버튼이 비활성화되고 "로그인 후 대화할 수 있어요." 안내와 로그인 배너가 표시된다.

## DB 구조와 확인

| 테이블 | 필드 | 소유 |
| --- | --- | --- |
| `users` | `id`, `username`(고유), `password_hash`, `created_at` | 인증 |
| `sessions` | `token_hash`(PK), `user_id`(FK), `expires_at` | 인증 |
| `rooms` | `id`, `user_id`(FK), `title`, `created_at` | 채팅 |
| `exchanges` | `id`, `room_id`(FK), `question`, `answer`, `created_at` | 채팅 |

`users → rooms → exchanges`로 사용자별 질문·응답·생성 시각을 추적한다. 생성 시각은 UTC다. 한 행에 질문과 답변을 함께 저장한다. 채팅 조회용으로 `rooms(user_id)`, `exchanges(room_id)` 인덱스를 둔다. 별도의 ORM이나 마이그레이션 프레임워크는 사용하지 않는다.

SQLite CLI가 설치되어 있으면 기본 DB를 다음처럼 확인할 수 있다. 회원가입·로그인 시 users/sessions가 저장되고, 질문 전송(JSON·SSE)이 정상 완료되면 exchanges에 질문과 답변이 함께 저장된다.

```sh
sqlite3 .data/positive-bot.db '.tables'
sqlite3 -header -column .data/positive-bot.db 'SELECT id, username, created_at FROM users;'
sqlite3 -header -column .data/positive-bot.db 'SELECT user_id, expires_at FROM sessions;'
sqlite3 -header -column .data/positive-bot.db 'SELECT r.user_id, e.* FROM exchanges e JOIN rooms r ON r.id = e.room_id ORDER BY e.id DESC LIMIT 10;'
```

특정 사용자의 전체 대화 로그, 사용자별 방·대화 수 확인 SQL은 [채팅 기능명세의 대화 로그 확인](docs/chat.md#대화-로그-확인)에 있다.

## 배포 (AWS EC2)

서비스 주소: **http://13.125.113.66**

AWS EC2(Ubuntu, 서울 리전) 한 대에서 실행한다. nginx가 80번 포트로 요청을 받아 `127.0.0.1:8000`의 Uvicorn으로 전달한다. Uvicorn은 systemd 서비스 `positive-bot`으로 실행되어 서버 재부팅 후에도 자동으로 시작된다. 별도 프론트 빌드나 서비스 분리는 없다.

```text
브라우저 → nginx(:80) → Uvicorn app.main:app (127.0.0.1:8000, systemd) → SQLite(.data/positive-bot.db)
```

- DB는 서버 디스크의 SQLite 파일(`DATABASE_PATH`, 기본 `.data/positive-bot.db`)이다. 서비스 재시작과 재배포 후에도 데이터가 유지된다.
- 환경 변수는 서버의 `.env`(권한 600)에 둔다. 키 목록은 `.env.example`과 같으며 `AI_API_KEY` 값은 저장소나 문서에 남기지 않는다.
- 서버에는 `VERCEL`을 설정하지 않는다. 설정하면 `app/db.py`가 DB 접근을 막는다.
- HTTP로 운영하므로 로그인 쿠키에 `Secure`가 붙지 않고 암호화되지 않은 채 전송된다. 도메인과 HTTPS는 적용하지 않았다.
- Uvicorn은 `--proxy-headers --forwarded-allow-ips 127.0.0.1`로 실행해 nginx가 전달한 원래 요청 정보를 사용한다. SSE 응답에는 FastAPI가 `X-Accel-Buffering: no`를 붙이므로 nginx 버퍼링 설정을 따로 두지 않는다.

서버에 최신 `main`을 반영하는 절차는 아래와 같다. `.env.example`에 새 키가 생기면 서버 `.env`에도 직접 추가한다. 서버 로그는 `journalctl -u positive-bot`으로 확인한다.

```sh
cd ~/Codyssey-B7-1
git pull --ff-only origin main
uv sync --locked --no-dev
sudo systemctl restart positive-bot
```

`pyproject.toml`의 `[tool.vercel]`과 `.vercelignore`는 이전 Vercel 배포 준비의 흔적이며 현재 배포에는 사용하지 않는다.

## 민감정보 관리

| 대상 | 관리 방식 |
| --- | --- |
| AI API 키 | 서버 `.env`의 `AI_API_KEY`에만 둔다(권한 600). AI 호출은 서버에서만 하며 화면 코드와 API 응답에 키를 포함하지 않는다. |
| `.env`·DB 파일 | `.gitignore`로 제외한다(`.env`, `.env.*`, `.data/`, `*.db`). 저장소에는 키 이름만 적은 `.env.example`을 둔다. |
| 비밀번호 | Argon2id 해시만 저장한다. 원문과 해시는 응답·로그에 넣지 않고, 입력 오류 응답에서도 원문 입력값을 제외한다. |
| 세션 | 임의 토큰의 SHA-256 해시만 DB에 저장한다. 쿠키는 `HttpOnly`, `SameSite=Lax`다. 현재 HTTP 배포라 `Secure`는 적용되지 않는다. |
| 로그 | 사용자·방·대화 ID와 이벤트 이름만 남긴다. 질문·답변 원문, 비밀번호, 토큰, 제공자 오류 원문은 남기지 않는다. |

저장소 전체와 Git 이력에 실제 키가 없는 것을 2026-10-08에 확인했다.

## 협업 방식

`main`과 짧은 작업 브랜치(`유형/범위-설명`, 예: `feat/chat`, `fix/web-guest-auth`)로 운영한다. 커밋은 `유형(범위): 요약` 형식이고, 모든 변경은 PR과 일반 merge로 `main`에 합쳐 개인 커밋을 보존한다. 자세한 규칙은 [협업 계약의 브랜치·커밋·PR 전략](docs/CONTRIBUTING.md#브랜치커밋pr-전략)에 있다.

## 제출 전 확인

2026-10-08 기준 Python 3.12에서 **전체 85개 테스트 통과**. 인증·쿠키·세션 유지·사용자 구분, JSON/SSE 문맥 21개 전달, 완료 후 저장, AI·DB 오류와 중단 시 미저장을 확인했다. 인증 연결 테스트도 실제 방 생성과 JSON/SSE 전송·조회·로그아웃 이후 차단을 검증한다. SSE 파서의 문자/이벤트 분할, 오류, 종료 이벤트 누락 등 Node.js 테스트 **7개가 통과**했다.

브라우저 회귀 검증은 Playwright가 설치된 환경에서 `node tests/test_web_browser.cjs`로 실행한다. 별도 설치된 Playwright를 사용하면 `NODE_PATH`에 해당 `node_modules`를 지정하고, 설치된 Chrome을 쓰려면 `BROWSER_CHANNEL=chrome`을 지정한다. 테스트가 임시 SQLite·Uvicorn·테스트용 AI를 실행해 실제 세션, 순차 표시·저장/재조회, 데스크톱/모바일 배치, 오류 안내·로그아웃을 확인한 후 정리한다. 실제 제공자의 SSE 응답과 원격 배포 반영은 별도로 확인해야 한다.

2026-10-08 EC2 서버에서 배포 코드와 같은 버전을 검증용 임시 DB로 실행해 가입 → 로그인 → 방 생성 → 실제 AI 답변 저장 → 문맥 유지 → 이전 대화 조회 → 다른 사용자 차단(`404`) → 로그아웃 후 차단(`401`)을 확인했다. 공개 주소에서는 비로그인 보호 API의 `401`, 화면 페이지 `200`, 서비스 재시작 후 DB 유지를 확인했다.

- [x] 로그인한 사용자만 질문 가능, 다른 사용자의 방·내역 접근 불가 — 비로그인 `401`, 다른 사용자 방 `404`, 화면은 비로그인 입력 비활성
- [x] 실제 AI API 호출과 최근 Q/A 10개 + 새 질문(21개 메시지) 문맥 유지 — 위 실제 응답 예시
- [x] 질문·응답·사용자·생성 시각 누적 저장 및 조회 — `GET /api/rooms/{id}/messages`, [대화 로그 확인 SQL](docs/chat.md#대화-로그-확인)
- [x] 요청 수신 / AI 호출·성공·실패 / DB 저장 성공·실패 로그 — `request_received`, `ai_call_*`, `db_save_*` ([채팅 기능명세의 서버 로그](docs/chat.md#서버-로그))
- [x] 빈 입력·길이 초과, AI 실패·타임아웃, DB 실패 처리 — `422`, `502`·`503`·`504`, `500`과 미저장 테스트
- [x] 외부 서비스 URL과 영구 저장 검증, 실제 API 응답 예시 갱신 — http://13.125.113.66, EC2 디스크 SQLite
- [x] 기능 브랜치·PR merge 기록, 팀원별 유의미한 커밋 10회 이상 — PR #1~#6 일반 merge, 팀원별 커밋 11~18회
- [x] 팀원 이름·실제 작업 요약, GitHub 링크·배포 URL 기재 — [팀원별 작업 요약](#팀원별-작업-요약), 문서 상단

필수 요구사항 전체는 [MISSION.md](MISSION.md)를 따른다. 위 항목은 템플릿 테스트 통과만으로 완료되지 않는다.
