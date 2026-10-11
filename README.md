# 긍정봇

일상의 고민을 이야기하고 공감과 격려를 받는 웹 AI 챗봇이다. 사용자는 로그인 후 채팅방을 만들고 대화를 이어가며 이전 대화를 다시 확인한다.

현재는 **인증·채팅·AI와 화면이 연결된 4인 개발용 프로젝트**다. 화면에서 회원가입·로그인·로그아웃, 채팅방 생성·목록·이전 대화 조회가 동작한다. 질문을 보내면 SSE로 AI 답변을 순차 표시하고 완료된 대화를 저장한다. 비로그인 요청은 `401`을 반환한다.

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
                     └─ chat: 방 소유권 확인 → ai.stream_reply → 대화 저장
                          └─ SQLite(app/db.py)
```

| 담당 | 소유 파일 | 구현할 작업 |
| --- | --- | --- |
| 1. 화면 | `app/web/` | 회원가입·로그인, 방 목록, 대화 입력·출력, 로딩·오류 안내 |
| 2. 인증 | `app/auth/` | 가입, 비밀번호 해시, 세션 쿠키, 로그아웃, 현재 사용자 |
| 3. 채팅·DB | `app/chat/`, `app/db.py` | 방 생성·목록, 본인 내역 조회, 문맥 구성, AI 호출 연결, Q/A 저장 |
| 4. AI | `app/ai/` | 제공자 API 연동, 공감 프롬프트, 타임아웃·실패 처리, 호출 로그 |

`app/main.py`, `pyproject.toml`, `uv.lock`, `.env.example`은 통합 담당 1명을 정해 변경을 모은다. 상세 연결 규칙과 브랜치 운영은 [협업 계약](docs/CONTRIBUTING.md)에 있다. 팀원 이름과 개인별 실제 작업 요약은 각 담당 PR에서 위 표를 갱신한다.

인증 작업 작성자: **하루이(Git 표시명)**. 회원가입·Argon2id 비밀번호 검증·24시간 DB 세션·로그인·현재 사용자 확인·로그아웃·인증 실패와 저장소 장애 처리를 구현했다. 인증 테스트와 기존 템플릿 회귀 검증, 인증 사용법 문서를 작성했다. 인증 전용 의존성 `argon2-cffi` 및 잠금 파일 변경은 통합 시 함께 반영한다.

채팅·DB 작업 작성자: **Lim Jonghan(Git 표시명)**. 채팅방 생성·목록, 본인 대화 내역 조회, 방 소유권 확인, 최근 Q/A 문맥 구성과 AI 호출 연결, 질문 전송과 성공한 Q/A 저장, AI·DB 실패 처리와 요청·저장 로그를 구현했다. 조회용 인덱스를 추가하고 채팅 테스트와 [채팅 기능명세](docs/chat.md)를 작성했다.

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

응답 형식은 아래와 같다(값은 예시). `created_at`은 소수 초를 포함한 UTC다.

`Room`: `{"id":1,"title":"오늘 이야기","created_at":"2026-10-08T08:31:57.423000Z"}`

`Exchange`: `{"id":1,"room_id":1,"question":"오늘 많이 지쳤어","answer":"많이 힘든 하루였겠어요.","created_at":"2026-10-08T08:32:03.118000Z"}`

오류는 `{"detail":"안내 문구"}`를 사용한다. `401` 인증 실패, `409` 아이디 중복, `500` 인증 저장소/해시 처리 실패, 채팅의 `404` 방 없음/다른 사람 소유와 `500` DB 저장 실패, AI의 `502` 실패·`503` 설정 없음·`504` 타임아웃이 구현되어 있다. 입력 오류 `422`는 `detail` 배열을 사용하므로 화면에서 별도로 안내한다. 인증에서는 원문 `input`/`ctx`를 제외한다. 질문은 공백 제거 후 1~2,000자, 방 제목은 1~100자로 제한한다.

## SSE 채팅

AI 스트림은 OpenAI SDK의 `chat.completions.stream()`과 `content.delta` 이벤트를 사용하고, 최종 응답은 SDK가 누적한다. FastAPI의 `EventSourceResponse`와 `ServerSentEvent`를 사용한다. SSE 직렬화·응답 헤더·keep-alive는 프레임워크가 처리한다. 이벤트 데이터는 Pydantic 모델로 직렬화해 한글을 그대로 전송한다.

`POST /api/rooms/{room_id}/messages/stream`에 `{"question":"오늘 힘들었어"}`를 보낸다. 로그인과 본인 소유의 기존 채팅방이 필요하다. 로그인하지 않으면 `401`을 반환한다. 채팅방은 `POST /api/rooms`로 만든다.

- `delta`: `{"text":"응답 조각"}` — 화면에 이어 붙인다.
- `done`: 저장된 `Exchange` — **DB 커밋 성공 후** 전송한다.
- `error`: `{"detail":"안내 문구","status_code":502}` — 응답/저장 실패이며 `done`은 오지 않는다.

스트림 시작 전 인증·입력·소유권 오류는 HTTP `401`·`422`·`404`다. 시작 후에는 HTTP 상태를 바꿀 수 없으므로 `200`이어도 반드시 마지막 `done` 또는 `error`를 확인한다. 종료 이벤트 없이 연결이 끊기면 완료로 표시하지 않는다. 답변 완료 전 연결 중단은 저장하지 않으며, DB 커밋 후 연결이 끊긴 경우에는 저장됐지만 `done`을 못 받을 수 있다. 자동 재전송은 하지 않는다.

서버는 해당 방의 최근 완료 Q/A 10개와 새 질문, 총 21개 메시지를 AI에 전달하며 가장 오래된 질문도 유지한다. 기준은 `app/ai/service.py`의 `CONTEXT_EXCHANGES`와 여기서 계산한 `MAX_CONTEXT_MESSAGES`다. 스트리밍 도중에는 DB 연결을 유지하지 않는다.

화면은 POST `fetch`로 SSE를 읽어 한 말풍선에 답변 조각을 이어 붙인다. UTF-8 문자와 이벤트가 네트워크 조각 사이에서 나뉘어도 처리한다. 대화 내역 조회 중에는 중복 조회와 방 이동을 막는다. 응답 중에는 중복 전송·방 이동·로그아웃을 막고, 조각을 받을 때마다 40초 수신 대기 제한을 갱신한다. `done` 수신 시 완료로 표시하며, 오류나 연결 중단 시 부분 답변은 미완료로 남기고 안내를 표시한다. HTTP 및 SSE `500`·`503`을 포함한 오류의 `detail` 문자열을 그대로 표시하며 자동 재시도하지 않는다.

`/`, `/chat`, `/guest`는 하나의 `app/web/chat.html`을 사용한다. 메시지 영역만 스크롤되고 입력창은 그 아래에 별도 배치되어 여러 줄 입력과 긴 답변이 겹치지 않는다. 로그인 사용자는 헤더에서 로그아웃할 수 있다. 서버가 로그아웃에 실패하면 안내를 표시하고 현재 화면을 유지한다.

## DB 구조와 확인

| 테이블 | 필드 | 소유 |
| --- | --- | --- |
| `users` | `id`, `username`(고유), `password_hash`, `created_at` | 인증 |
| `sessions` | `token_hash`(PK), `user_id`(FK), `expires_at` | 인증 |
| `rooms` | `id`, `user_id`(FK), `title`, `created_at` | 채팅 |
| `exchanges` | `id`, `room_id`(FK), `question`, `answer`, `created_at` | 채팅 |

`users → rooms → exchanges`로 사용자별 질문·응답·생성 시각을 추적한다. 생성 시각은 UTC다. 한 행에 질문과 답변을 함께 저장한다. 채팅 조회용으로 `rooms(user_id)`, `exchanges(room_id)` 인덱스를 둔다. 별도의 ORM이나 마이그레이션 프레임워크는 사용하지 않는다.

SQLite CLI가 설치되어 있으면 기본 DB를 다음처럼 확인할 수 있다. 회원가입·로그인 시 users/sessions가 저장되고, 질문 전송(SSE)이 정상 완료되면 exchanges에 질문과 답변이 함께 저장된다.

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
- HTTP로 운영하므로 로그인 쿠키에 `Secure`가 붙지 않고 암호화되지 않은 채 전송된다. 도메인과 HTTPS는 적용하지 않았다.
- Uvicorn은 `--proxy-headers --forwarded-allow-ips 127.0.0.1`로 실행해 nginx가 전달한 원래 요청 정보를 사용한다. SSE 응답에는 FastAPI가 `X-Accel-Buffering: no`를 붙이므로 nginx 버퍼링 설정을 따로 두지 않는다.

서버에 최신 `main`을 반영하는 절차는 아래와 같다. `.env.example`에 새 키가 생기면 서버 `.env`에도 직접 추가한다. 서버 로그는 `journalctl -u positive-bot`으로 확인한다.

```sh
cd ~/Codyssey-B7-1
git pull --ff-only origin main
uv sync --locked --no-dev
sudo systemctl restart positive-bot
```


## 제출 전 확인

2026-10-11 기준 Python 3.12에서 **전체 82개 테스트 통과**. 인증·쿠키·세션 유지·사용자 구분, SSE 문맥 21개 전달, 완료 후 저장, AI·DB 오류와 중단 시 미저장을 확인했다. 인증 연결 테스트도 실제 방 생성과 SSE 전송·조회·로그아웃 이후 차단을 검증한다. SSE 파서의 문자/이벤트 분할, 오류, 종료 이벤트 누락 등 Node.js 테스트 **7개가 통과**했다.

브라우저 회귀 검증은 Playwright가 설치된 환경에서 `node tests/test_web_browser.cjs`로 실행한다. 별도 설치된 Playwright를 사용하면 `NODE_PATH`에 해당 `node_modules`를 지정하고, 설치된 Chrome을 쓰려면 `BROWSER_CHANNEL=chrome`을 지정한다. 테스트가 임시 SQLite·Uvicorn·테스트용 AI를 실행해 실제 세션, 순차 표시·저장/재조회, 데스크톱/모바일 배치, 오류 안내·로그아웃을 확인한 후 정리한다. 실제 제공자의 SSE 응답과 원격 배포 반영은 별도로 확인해야 한다.

- [ ] 로그인한 사용자만 질문 가능, 다른 사용자의 방·내역 접근 불가
- [ ] 실제 AI API 호출과 최근 Q/A 10개 + 새 질문(21개 메시지) 문맥 유지
- [ ] 질문·응답·사용자·생성 시각 누적 저장 및 조회
- [ ] 요청 수신 / AI 호출·성공·실패 / DB 저장 성공·실패 로그
- [ ] 빈 입력·길이 초과, AI 실패·타임아웃, DB 실패 처리
- [ ] 외부 서비스 URL과 영구 저장 검증, 실제 API 응답 예시 갱신
- [ ] 기능 브랜치·PR merge 기록, 팀원별 유의미한 커밋 10회 이상
- [ ] 팀원 이름·실제 작업 요약, GitHub 링크·배포 URL 기재

필수 요구사항 전체는 [MISSION.md](MISSION.md)를 따른다. 위 항목은 템플릿 테스트 통과만으로 완료되지 않는다.
