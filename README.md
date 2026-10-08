# 긍정봇

일상의 고민을 이야기하고 공감과 격려를 받는 웹 AI 챗봇이다. 사용자는 로그인 후 채팅방을 만들고 대화를 이어가며 이전 대화를 다시 확인한다.

현재는 **인증·채팅·AI가 구현된 4인 개발용 프로젝트**다. 회원가입·로그인·현재 사용자 조회·로그아웃과 보호 API 인증 검사가 동작한다. 채팅방 생성·목록·대화 내역 조회, JSON·SSE 질문 전송과 완료된 대화 저장, Codyssey API를 통한 AI 응답이 구현되어 있다. 화면 연결은 아직 미구현이다. 비로그인 요청은 `401`을 반환한다.

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

서버 시작 시 `.data/positive-bot.db`가 생성된다. 초기화를 별도로 실행하려면 `uv run --env-file .env python -m app.db`를 사용한다. 재실행은 기존 데이터를 지우지 않는다. 테이블 정의를 변경해도 기존 테이블이 자동 변경되지는 않는다.

| 환경 변수 | 용도 | 현재 사용 여부 |
| --- | --- | --- |
| `DATABASE_PATH` | 로컬 SQLite 파일 경로 | 사용, 기본 `.data/positive-bot.db` |
| `AI_API_KEY` | AI 제공자 비밀 키 | 사용 |
| `AI_MODEL` | AI 모델 이름, 비어 있으면 `gpt-5-mini` | 사용 |
| `AI_TIMEOUT_SECONDS` | AI 요청 제한 시간, 기본 30초 | 사용 |

`AI_API_KEY`에 Codyssey 발급 API 키를 설정한다. 호출 주소는 `https://copa.codyssey.kr/v1/chat/completions`이며, `AI_MODEL=gpt-5-mini`를 사용한다. [Codyssey API 문서](https://usr.codyssey.kr/public-api-console)를 기준으로 연결한다. AI 함수는 새 질문을 포함한 최신 메시지 최대 20개를 순서대로 보내며(시스템 프롬프트 별도), 공감 프롬프트·자동 재시도 없는 타임아웃·호출 성공/실패 로그를 적용한다. 자동 테스트는 외부 API를 대체하므로 비용이 발생하지 않는다. 2026-10-08 기준 자동 테스트 68개 통과 및 `gpt-5-mini` 실제 응답 수신을 확인했다.

`.env`와 DB 파일은 Git에서 제외한다. 인증은 기존 `DATABASE_PATH`를 사용하며 별도 비밀 키나 추가 환경 변수가 필요하지 않다. 세션 수명은 24시간이다. 이후 인증 설정을 추가한다면 통합 담당과 `.env.example`에 반영한다.

## 구조와 담당

```text
브라우저(app/web) → FastAPI(app/main.py)
                     ├─ auth: 로그인 및 사용자 확인
                     └─ chat: 방 소유권 확인 → ai.generate_reply → 대화 저장
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

채팅·DB 작업 작성자: **Lim Jonghan(Git 표시명)**. 채팅방 생성·목록, 본인 대화 내역 조회, 방 소유권 확인, 최근 Q/A 문맥 구성과 AI 호출 연결, JSON 질문 전송과 성공한 Q/A 저장, AI·DB 실패 처리와 요청·저장 로그를 구현했다. 조회용 인덱스를 추가하고 채팅 테스트와 [채팅 기능명세](docs/chat.md)를 작성했다.

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

서버는 해당 방의 최근 10개 Q/A를 읽고 새 질문을 붙인다. AI 함수가 시스템 프롬프트를 제외한 최신 20개 메시지만 사용한다. 스트리밍 도중에는 DB 연결을 유지하지 않는다. 프론트는 POST를 지원하는 `fetch`로 SSE를 읽어야 하며, 기본 `EventSource`는 사용하지 않는다. 현재 화면에는 이 연결이 구현되지 않았다.

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

## Vercel 배포

프로젝트 루트를 Vercel에 연결하고 FastAPI 프리셋을 사용한다. 진입점은 `pyproject.toml`의 `app.main:app`이며, 의존성은 `uv.lock`으로 관리한다. 별도 프론트 빌드나 서비스 분리는 없다. 환경 변수는 Vercel 프로젝트 설정에 등록한다. [FastAPI 배포 문서](https://vercel.com/docs/frameworks/backend/fastapi)

**배포 전 영구 DB 연결이 필요하다.** Vercel 함수의 로컬 SQLite는 인스턴스 사이에 공유되지 않고 영속성을 보장하지 않는다. `/tmp`로 옮기는 것도 해결책이 아니다. 현재는 Vercel에서 SQLite 자동 초기화를 생략하고 DB 접근을 차단한다. 화면·API 뼈대의 배포 형태만 준비됐으며 회원·대화 저장 서비스의 배포가 완성된 상태는 아니다. Vercel을 유지하려면 외부 DB를 결정하고 인증·채팅 SQL과 `app/db.py`를 함께 맞춰야 한다. [Vercel SQLite 제약](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)

## 제출 전 확인

인증 검증: Python 3.12에서 **전체 52개 테스트(인증 46개 + 기존 기반 6개)** 통과. HTTPS 쿠키, 만료 경계, 새로운 Python 프로세스에서의 세션 유지, 동시 중복 가입, DB 장애 롤백과 사용자별 인증 구분을 확인했다. 실행 명령은 `uv run python -m unittest discover -s tests -v`다. 이 결과는 화면·채팅 구현이나 실제 배포 검증까지 완료됐다는 뜻은 아니다.

채팅 검증: Python 3.12에서 채팅 테스트 **22개(`test_chat.py` 15개 + `test_chat_stream.py` 7개)**를 포함해 전체 83개 중 82개 통과. 실패 1개는 `tests/test_auth_access.py`가 채팅 API의 미구현 응답 `501`을 기대하는 검증이다. 임시 SQLite와 실제 Uvicorn 서버, 실제 인증으로 방 생성·목록, 다른 사용자 방 차단(`404`), AI 실패 시 미저장을 확인했다. 실제 AI 응답 성공 후 저장은 AI 대체 테스트로만 확인했다.

- [ ] 로그인한 사용자만 질문 가능, 다른 사용자의 방·내역 접근 불가
- [ ] 실제 AI API 호출과 최신 20개 메시지 문맥 유지
- [ ] 질문·응답·사용자·생성 시각 누적 저장 및 조회
- [ ] 요청 수신 / AI 호출·성공·실패 / DB 저장 성공·실패 로그
- [ ] 빈 입력·길이 초과, AI 실패·타임아웃, DB 실패 처리
- [ ] 외부 서비스 URL과 영구 저장 검증, 실제 API 응답 예시 갱신
- [ ] 기능 브랜치·PR merge 기록, 팀원별 유의미한 커밋 10회 이상
- [ ] 팀원 이름·실제 작업 요약, GitHub 링크·배포 URL 기재

필수 요구사항 전체는 [MISSION.md](MISSION.md)를 따른다. 위 항목은 템플릿 테스트 통과만으로 완료되지 않는다.
