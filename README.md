# 긍정봇

일상의 고민을 이야기하고 공감과 격려를 받는 웹 AI 챗봇이다. 사용자는 로그인 후 채팅방을 만들고 대화를 이어가며 이전 대화를 다시 확인한다.

현재는 **4인 개발용 초기 템플릿**이다. FastAPI 실행, 시작 화면, API 계약, 입력 검증, 로컬 SQLite 초기화가 준비되어 있다. Codyssey OpenAI 호환 Chat Completions API 호출은 구현되어 있으며, 회원가입·로그인·채팅 저장과 AI 함수 연결은 담당자가 구현해야 한다. 미구현 API는 `501`, 인증이 필요한 API는 `401`을 반환한다.

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

`AI_API_KEY`에 Codyssey 발급 API 키를 설정한다. 호출 주소는 `https://copa.codyssey.kr/v1/chat/completions`이며, `AI_MODEL=gpt-5-mini`를 사용한다. [Codyssey API 문서](https://usr.codyssey.kr/public-api-console)를 기준으로 연결한다. AI 함수는 새 질문을 포함한 최신 메시지 최대 20개를 순서대로 보내며(시스템 프롬프트 별도), 공감 프롬프트·자동 재시도 없는 타임아웃·호출 성공/실패 로그를 적용한다. 자동 테스트는 외부 API를 대체하므로 비용이 발생하지 않는다. 2026-10-08 기준 자동 테스트 12개 통과 및 `gpt-5-mini` 실제 응답 수신을 확인했다.

`.env`와 DB 파일은 Git에서 제외한다. 인증 구현에 추가 설정이 필요하면 `.env.example`에 이름과 빈 값만 추가한다.

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

## API 계약

아래는 **구현 목표**이며, 성공 예시는 아직 실제 서비스 응답이 아니다. `/docs`의 스키마와 아래 계약을 기준으로 각 영역을 구현한다. 인증은 동일 출처의 `session` 쿠키를 사용한다.

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

오류는 `{"detail":"안내 문구"}`를 사용한다. `401` 인증 실패, `404` 방 없음/다른 사람 소유, `409` 아이디 중복, `502` AI 실패, `504` AI 타임아웃, `500` DB 저장 실패로 맞춘다. 입력 오류 `422`는 FastAPI 기본 검증 응답(`detail` 배열)을 그대로 사용하므로 화면에서 별도로 안내한다. 질문은 공백 제거 후 1~2,000자, 방 제목은 1~100자로 제한한다.

## DB 구조와 확인

| 테이블 | 필드 | 소유 |
| --- | --- | --- |
| `users` | `id`, `username`(고유), `password_hash`, `created_at` | 인증 |
| `sessions` | `token_hash`(PK), `user_id`(FK), `expires_at` | 인증 |
| `rooms` | `id`, `user_id`(FK), `title`, `created_at` | 채팅 |
| `exchanges` | `id`, `room_id`(FK), `question`, `answer`, `created_at` | 채팅 |

`users → rooms → exchanges`로 사용자별 질문·응답·생성 시각을 추적한다. 생성 시각은 UTC다. 한 행에 질문과 답변을 함께 저장한다. 별도의 ORM이나 마이그레이션 프레임워크는 사용하지 않는다.

SQLite CLI가 설치되어 있으면 기본 DB를 다음처럼 확인할 수 있다. 현재 템플릿은 테이블만 생성하므로 대화 조회 결과는 비어 있다.

```sh
sqlite3 .data/positive-bot.db '.tables'
sqlite3 -header -column .data/positive-bot.db 'SELECT r.user_id, e.* FROM exchanges e JOIN rooms r ON r.id = e.room_id ORDER BY e.id DESC LIMIT 10;'
```

## Vercel 배포

프로젝트 루트를 Vercel에 연결하고 FastAPI 프리셋을 사용한다. 진입점은 `pyproject.toml`의 `app.main:app`이며, 의존성은 `uv.lock`으로 관리한다. 별도 프론트 빌드나 서비스 분리는 없다. 환경 변수는 Vercel 프로젝트 설정에 등록한다. [FastAPI 배포 문서](https://vercel.com/docs/frameworks/backend/fastapi)

**배포 전 영구 DB 연결이 필요하다.** Vercel 함수의 로컬 SQLite는 인스턴스 사이에 공유되지 않고 영속성을 보장하지 않는다. `/tmp`로 옮기는 것도 해결책이 아니다. 현재는 Vercel에서 SQLite 자동 초기화를 생략하고 DB 접근을 차단한다. 화면·API 뼈대의 배포 형태만 준비됐으며 회원·대화 저장 서비스의 배포가 완성된 상태는 아니다. Vercel을 유지하려면 외부 DB를 결정하고 인증·채팅 SQL과 `app/db.py`를 함께 맞춰야 한다. [Vercel SQLite 제약](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)

## 제출 전 확인

- [ ] 로그인한 사용자만 질문 가능, 다른 사용자의 방·내역 접근 불가
- [ ] 실제 AI API 호출과 최근 5개 Q/A 문맥 유지
- [ ] 질문·응답·사용자·생성 시각 누적 저장 및 조회
- [ ] 요청 수신 / AI 호출·성공·실패 / DB 저장 성공·실패 로그
- [ ] 빈 입력·길이 초과, AI 실패·타임아웃, DB 실패 처리
- [ ] 외부 서비스 URL과 영구 저장 검증, 실제 API 응답 예시 갱신
- [ ] 기능 브랜치·PR merge 기록, 팀원별 유의미한 커밋 10회 이상
- [ ] 팀원 이름·실제 작업 요약, GitHub 링크·배포 URL 기재

필수 요구사항 전체는 [MISSION.md](MISSION.md)를 따른다. 위 항목은 템플릿 테스트 통과만으로 완료되지 않는다.
