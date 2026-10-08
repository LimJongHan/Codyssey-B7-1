# 긍정봇

일상의 고민을 이야기하고 공감과 격려를 받는 웹 AI 챗봇이다. 사용자는 로그인 후 채팅방을 만들고 대화를 이어가며 이전 대화를 다시 확인한다.

현재는 **인증 API 4개가 구현된 4인 개발용 프로젝트**다. 회원가입·로그인·현재 사용자 조회·로그아웃과 보호 API 인증 검사가 동작한다. 화면·채팅 저장·실제 AI 호출은 아직 초기 템플릿이다. 로그인해도 채팅 API는 아직 `501`을 반환한다.

인증 내부의 비밀번호 해시·검증은 `argon2-cffi`의 Argon2id로 구현되어 있다. 공통 의존성 변경은 이 패키지와 잠금 파일에 한정하며 통합 시 함께 반영한다.

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
| `AI_API_KEY` | AI 제공자 비밀 키 | AI 담당 구현 예정 |
| `AI_MODEL` | AI 모델 이름 | AI 담당 구현 예정 |
| `AI_TIMEOUT_SECONDS` | AI 요청 제한 시간, 기본 계획 30초 | AI 담당 구현 예정 |

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

## API 계약

인증 정책과 담당 연결·완료 기준은 [인증 기능명세](docs/auth.md)를 참고한다.

아래 인증 API 4개는 구현·검증되었으며 사용자 ID는 실제 DB에 따라 달라진다. 채팅 API 4개와 Room/Exchange 예시는 **아직 구현 목표**다. 인증은 동일 출처의 `session` 쿠키를 사용한다. 실제 가입·로그인·조회·로그아웃 실행 명령은 [인증 사용 예시](docs/auth.md#실제-api-사용-예시)에 있다.

| 메서드·경로 | JSON 입력 | 성공 응답 |
| --- | --- | --- |
| `POST /api/auth/signup` | `{"username":"demo","password":"example-password"}` | `201 {"id":1,"username":"demo"}` |
| `POST /api/auth/login` | 위와 동일 | `200 {"id":1,"username":"demo"}` + 쿠키 |
| `POST /api/auth/logout` | 없음 | `204`, 쿠키 제거 |
| `GET /api/auth/me` | 없음 | `200 {"id":1,"username":"demo"}` |
| `POST /api/rooms` | `{"title":"오늘 이야기"}` | `201 Room` |
| `GET /api/rooms` | 없음 | `200 [Room]`, 최신순 |
| `GET /api/rooms/{room_id}/messages` | 없음 | `200 [Exchange]`, 과거→최신 |
| `POST /api/rooms/{room_id}/messages` | `{"question":"오늘 많이 지쳤어"}` | `201 Exchange` |

`Room`: `{"id":1,"title":"오늘 이야기","created_at":"2026-10-08T06:00:00Z"}`

`Exchange`: `{"id":1,"room_id":1,"question":"오늘 많이 지쳤어","answer":"많이 힘든 하루였겠어요.","created_at":"2026-10-08T06:01:00Z"}`

오류는 `{"detail":"안내 문구"}`를 사용한다. `401` 인증 실패, `409` 아이디 중복, `500` 인증 저장소/해시 처리 실패가 구현되어 있다. 채팅의 `404` 방 없음/다른 사람 소유, `502` AI 실패, `504` AI 타임아웃, `500` DB 저장 실패는 구현 목표다. 입력 오류 `422`는 `detail` 배열을 사용하므로 화면에서 별도로 안내한다. 인증에서는 원문 `input`/`ctx`를 제외한다. 질문은 공백 제거 후 1~2,000자, 방 제목은 1~100자로 제한한다.

## DB 구조와 확인

| 테이블 | 필드 | 소유 |
| --- | --- | --- |
| `users` | `id`, `username`(고유), `password_hash`, `created_at` | 인증 |
| `sessions` | `token_hash`(PK), `user_id`(FK), `expires_at` | 인증 |
| `rooms` | `id`, `user_id`(FK), `title`, `created_at` | 채팅 |
| `exchanges` | `id`, `room_id`(FK), `question`, `answer`, `created_at` | 채팅 |

`users → rooms → exchanges`로 사용자별 질문·응답·생성 시각을 추적한다. 생성 시각은 UTC다. 한 행에 질문과 답변을 함께 저장한다. 별도의 ORM이나 마이그레이션 프레임워크는 사용하지 않는다.

SQLite CLI가 설치되어 있으면 기본 DB를 다음처럼 확인할 수 있다. 회원가입·로그인 시 users/sessions가 저장된다. 채팅 저장은 아직 미구현이므로 대화 조회 결과는 비어 있다.

```sh
sqlite3 .data/positive-bot.db '.tables'
sqlite3 -header -column .data/positive-bot.db 'SELECT id, username, created_at FROM users;'
sqlite3 -header -column .data/positive-bot.db 'SELECT user_id, expires_at FROM sessions;'
sqlite3 -header -column .data/positive-bot.db 'SELECT r.user_id, e.* FROM exchanges e JOIN rooms r ON r.id = e.room_id ORDER BY e.id DESC LIMIT 10;'
```

## Vercel 배포

프로젝트 루트를 Vercel에 연결하고 FastAPI 프리셋을 사용한다. 진입점은 `pyproject.toml`의 `app.main:app`이며, 의존성은 `uv.lock`으로 관리한다. 별도 프론트 빌드나 서비스 분리는 없다. 환경 변수는 Vercel 프로젝트 설정에 등록한다. [FastAPI 배포 문서](https://vercel.com/docs/frameworks/backend/fastapi)

**배포 전 영구 DB 연결이 필요하다.** Vercel 함수의 로컬 SQLite는 인스턴스 사이에 공유되지 않고 영속성을 보장하지 않는다. `/tmp`로 옮기는 것도 해결책이 아니다. 현재는 Vercel에서 SQLite 자동 초기화를 생략하고 DB 접근을 차단한다. 화면·API 뼈대의 배포 형태만 준비됐으며 회원·대화 저장 서비스의 배포가 완성된 상태는 아니다. Vercel을 유지하려면 외부 DB를 결정하고 인증·채팅 SQL과 `app/db.py`를 함께 맞춰야 한다. [Vercel SQLite 제약](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)

## 제출 전 확인

인증 검증: Python 3.12에서 **전체 52개 테스트(인증 46개 + 기존 기반 6개)** 통과. HTTPS 쿠키, 만료 경계, 새로운 Python 프로세스에서의 세션 유지, 동시 중복 가입, DB 장애 롤백과 사용자별 인증 구분을 확인했다. 실행 명령은 `uv run python -m unittest discover -s tests -v`다. 이 결과는 화면·채팅 구현이나 실제 배포 검증까지 완료됐다는 뜻은 아니다.

- [ ] 로그인한 사용자만 질문 가능, 다른 사용자의 방·내역 접근 불가
- [ ] 실제 AI API 호출과 최근 5개 Q/A 문맥 유지
- [ ] 질문·응답·사용자·생성 시각 누적 저장 및 조회
- [ ] 요청 수신 / AI 호출·성공·실패 / DB 저장 성공·실패 로그
- [ ] 빈 입력·길이 초과, AI 실패·타임아웃, DB 실패 처리
- [ ] 외부 서비스 URL과 영구 저장 검증, 실제 API 응답 예시 갱신
- [ ] 기능 브랜치·PR merge 기록, 팀원별 유의미한 커밋 10회 이상
- [ ] 팀원 이름·실제 작업 요약, GitHub 링크·배포 URL 기재

필수 요구사항 전체는 [MISSION.md](MISSION.md)를 따른다. 위 항목은 템플릿 테스트 통과만으로 완료되지 않는다.
