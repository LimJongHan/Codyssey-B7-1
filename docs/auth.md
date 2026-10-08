# 인증 기능명세

회원가입·로그인·현재 사용자 조회·로그아웃과 보호 API 인증 검사가 구현되어 있다. 이 문서는 현재 코드의 인증 정책, 실행 예시와 팀 연결 방법을 설명한다. 화면·채팅·실제 배포는 별도 통합 단계다.

## 범위와 연결

인증 담당은 회원가입, 비밀번호 해시, 로그인, DB 세션, 현재 사용자 조회, 로그아웃을 구현한다.
화면 담당은 입력 폼과 로그인 상태 표시를, 채팅 담당은 방 소유권과 대화 저장을 구현한다.
공개 연결은 `get_current_user(request) -> User`이며 `User`는 `id`, `username`만 제공한다.
채팅 라우터는 기존 `Depends(get_current_user)`를 유지하고 요청 본문의 사용자 ID를 인증 근거로 쓰지 않는다.

## 입력 및 세션 정책

- 아이디는 영문 대소문자·숫자·밑줄 3~30자다. 대소문자를 구분하고 공백 제거·소문자 변환을 하지 않는다.
- 비밀번호는 8~128자다. 공백이나 유니코드 문자를 임의 변환하지 않는다. 기존 입력 모델을 유지한다.
- 가입 후 별도로 로그인한다. 가입 요청으로 새로운 세션을 발급하지 않는다.
- 비밀번호는 `argon2-cffi`의 `PasswordHasher` 기본 Argon2id 설정과 임의 salt로 저장한다. 원문과 해시를 응답·로그에 넣지 않는다.
- 세션은 `secrets.token_urlsafe(32)`의 임의 토큰으로 발급하며 DB에는 SHA-256 토큰 해시와 사용자 ID, UTC 만료 시각만 저장한다. 비밀번호 해시에 SHA-256을 사용하지 않는다.
- 세션은 로그인 시점부터 **24시간** 유효하며 요청 때마다 연장하지 않는다. 만료 시각과 현재 시각이 같으면 만료다.
- 쿠키도 최대 24시간 유지한다. 브라우저를 다시 열어도 쿠키가 보존되어 있고 서버 세션이 유효하면 로그인 상태를 유지한다.
- 여러 기기의 로그인을 허용한다. 같은 브라우저에서 다시 로그인하면 이전 쿠키에 해당하는 세션을 폐기하고 새 토큰을 발급한다.
- 로그아웃은 현재 쿠키의 세션만 폐기한다. 다른 기기의 세션은 유지한다.
- 쿠키 이름은 `session`, 속성은 `HttpOnly`, `SameSite=Lax`, `Path=/`다. HTTPS 또는 배포 환경에서는 `Secure`를 적용한다.
- 인증 요청은 같은 출처에서 보낸다. 가입·로그인 본문은 JSON이며 CORS를 무조건 허용하지 않는다.

24시간 수명·대소문자 구분·다중 기기 허용은 미션에 지정된 수치가 아닌 이번 구현의 기본 정책이다.
새 환경 변수는 우선 추가하지 않는다. 공통 의존성 변경은 인증에 필요한 패키지와 잠금 파일에 한정해 통합 시 함께 검토한다.

라이브러리 동작은 [argon2-cffi 사용 안내](https://argon2-cffi.readthedocs.io/en/stable/howto.html)와 [API 문서](https://argon2-cffi.readthedocs.io/en/stable/api.html)를 따른다. 인증은 기존 `DATABASE_PATH`를 사용한다. `VERCEL`은 플랫폼이 제공하는 배포 표시이며 현재 배포 DB 차단 및 Secure 쿠키 정책에 사용된다.

## API 계약

가입과 로그인 입력은 `{"username":"demo","password":"example-password"}`다.

| API | 정상 동작 | 오류 |
| --- | --- | --- |
| `POST /api/auth/signup` | 사용자 저장, `201 {"id":1,"username":"demo"}`, 새 세션 없음 | 중복 아이디 `409`, 입력 `422`, 저장 실패 `500` |
| `POST /api/auth/login` | 비밀번호 확인, 세션·쿠키 발급, `200 User` | 없는 아이디·오답은 동일 안내의 `401`, 입력 `422`, 저장 실패 `500` |
| `GET /api/auth/me` | 유효한 세션의 `200 User` | 쿠키 없음·위조·만료·폐기·사용자 없음 `401`, DB 장애 `500` |
| `POST /api/auth/logout` | 서버 세션·쿠키 삭제, 본문 없는 `204` | DB 삭제 실패 `500`. 이미 로그아웃되어도 `204` |

일반 오류는 `{"detail":"안내 문구"}`, 입력 오류는 기존 FastAPI `422`의 `detail` 배열이다.
DB 오류를 인증 성공이나 아이디 중복으로 위장하지 않는다. 세션 저장이 끝난 뒤에만 성공 쿠키를 발급한다.

인증 응답은 `Cache-Control: no-store`다. `422`는 `type`, `loc`, `msg`를 유지하고 원문 `input`/`ctx`를 제외한다. 예를 들어 비밀번호 길이 오류는 아래와 같다.

```json
{"detail":[{"type":"string_too_short","loc":["body","password"],"msg":"String should have at least 8 characters"}]}
```

아이디가 없거나 비밀번호가 틀리면 동일하게 `401 {"detail":"아이디 또는 비밀번호가 올바르지 않습니다."}`를 반환한다. 쿠키 없음·만료·폐기 상태의 `/me`는 `401 {"detail":"로그인이 필요합니다."}`다. 로그인 실패는 이미 있던 다른 유효 세션을 제거하지 않는다.

DB 오류는 `500 {"detail":"인증 정보를 처리하지 못했습니다."}`이며, 배포 DB 미설정은 `500 {"detail":"인증 저장소를 사용할 수 없습니다."}`다. 세션 교체 도중 저장이 실패하면 이전 세션 삭제도 롤백한다. 로그아웃 DB 삭제가 실패하면 `500`을 반환하고 쿠키를 성공적으로 삭제한 것처럼 처리하지 않는다.

## 실제 API 사용 예시

서버를 실행한 상태에서 아래 순서로 확인한다. `demo`가 이미 존재하면 가입은 `409`다. 예시 비밀번호는 로컬 검증용이며 실제 계정 비밀번호를 공유 문서에 남기지 않는다.

```sh
# 회원가입: 201 {"id":1,"username":"demo"}. 자동 로그인하지 않는다.
curl -sS http://127.0.0.1:8000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"example-password"}'

# 세션 쿠키 파일은 로컬 임시 파일로 만든다.
AUTH_COOKIE_FILE=$(mktemp)
chmod 600 "$AUTH_COOKIE_FILE"

# 로그인: 200 User + session 쿠키. 토큰 원문을 문서나 로그에 복사하지 않는다.
curl -sS -c "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"example-password"}'

# 현재 사용자: 200 {"id":1,"username":"demo"}
curl -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/auth/me

# 로그아웃: 204, 응답 본문 없음
curl -sS -b "$AUTH_COOKIE_FILE" -c "$AUTH_COOKIE_FILE" \
  -X POST http://127.0.0.1:8000/api/auth/logout

# 이후 조회: 401 {"detail":"로그인이 필요합니다."}
curl -sS -b "$AUTH_COOKIE_FILE" http://127.0.0.1:8000/api/auth/me
rm -f "$AUTH_COOKIE_FILE"
```

쿠키는 이름 `session`, 경로 `/`, HttpOnly, SameSite=Lax, Max-Age=86400을 사용한다. HTTPS/배포에서는 Secure가 추가된다. 로컬 HTTP에서 발급한 쿠키와 배포 HTTPS 쿠키를 혼용하지 않는다.

## 화면·채팅 연결 방법

화면에서는 같은 출처의 `/api/auth/...`에 JSON을 보내고 `credentials: "same-origin"`을 사용한다. HttpOnly 쿠키는 자바스크립트에서 읽지 않는다.

```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
const result = await response.json();
// response.ok이면 result.id/result.username으로 로그인 화면 상태를 갱신한다.
// 401은 인증 안내, 422는 detail 배열의 입력 안내, 500은 재시도 안내를 표시한다.
```

화면 시작·새로고침 때 `/api/auth/me`를 조회한다. `401`이면 로그인 화면을 표시한다. 로그아웃은 `204`라서 `response.json()`을 호출하지 않는다. `500`이면 성공으로 처리하지 않고 오류를 안내한다. 화면은 API 오류를 표시할 때 `textContent`를 사용한다.

채팅 담당은 기존 함수를 다음처럼 주입받는다. 인증 담당이 사용자를 확인한 뒤 **방 소유권 검사는 채팅 담당이 수행한다.**

```python
from typing import Annotated
from fastapi import Depends
from app.auth.dependencies import get_current_user
from app.auth.schemas import User

CurrentUser = Annotated[User, Depends(get_current_user)]
# 기존 채팅 핸들러의 user: CurrentUser에서 user.id를 DB 조회 조건에 사용한다.
```

## DB 구조

| 테이블 | 필드 | 제약·의미 |
| --- | --- | --- |
| `users` | `id INTEGER` | 기본키, 공개 사용자 식별자 |
| `users` | `username TEXT` | NOT NULL, UNIQUE |
| `users` | `password_hash TEXT` | NOT NULL, 원문 대신 해시 |
| `users` | `created_at TEXT` | NOT NULL, UTC 생성 시각 기본값 |
| `sessions` | `token_hash TEXT` | 기본키, 임의 토큰의 해시 |
| `sessions` | `user_id INTEGER` | NOT NULL, `users.id` 외래키, 사용자 삭제 시 CASCADE |
| `sessions` | `expires_at TEXT` | NOT NULL, UTC 만료 시각 |

기존 `app/db.py`의 연결과 `app/auth/schema.sql`을 사용한다. 별도 ORM이나 범용 저장소 계층은 추가하지 않는다.

회원·세션 확인에는 README의 `id/username/created_at`, `user_id/expires_at` 조회 예시를 사용한다. 비밀번호 해시나 토큰 해시를 제출 화면에 출력할 필요는 없다. 인증 테이블 검증은 팀의 **대화 로그 저장·조회 가이드**를 대신하지 않는다.

## 완료 기준

1. 정상 가입과 중복·잘못된 입력 처리가 동작하고 가입만으로 로그인되지 않는다.
2. 정상 로그인만 세션을 발급하며 응답에 비밀번호·해시·토큰을 포함하지 않는다.
3. `/me`가 실제 세션에 연결된 사용자만 반환한다.
4. 보호 API에서 미인증·위조·만료 세션이 `401`로 차단된다.
5. 로그아웃한 토큰은 재사용할 수 없고 다른 기기·사용자의 세션은 유지된다.
6. DB 재연결 후에도 유효 세션이 유지되며 장애 시 일반 오류를 반환한다.
7. 쿠키 속성, 입력 경계, 두 사용자 구분, 세션 수명을 테스트한다.
8. `uv run python -m unittest discover -s tests -v`와 `git diff --check`로 확인한다.

## 검증 결과

2026-10-08, Python 3.12.13에서 전체 **52개 테스트**를 통과했다. 아래 인증 테스트 46개와 기존 기반 테스트 6개가 포함된다. 테스트는 임시 SQLite DB를 사용하며 실제 사용자 데이터를 수정하지 않는다.

| 파일 | 검증 내용 |
| --- | --- |
| `tests/test_auth_passwords.py` | 임의 salt, 정답·오답, 손상된 해시, 공백 보존 |
| `tests/test_auth_signup.py` | 회원가입, 중복, 원문 비저장, 가입 후 미인증 |
| `tests/test_auth_sessions.py` | 토큰 해시, 만료 경계, 교체·폐기, 사용자 삭제 |
| `tests/test_auth_login.py` | 로그인 성공·실패, 재로그인, 손상 해시 거부 |
| `tests/test_auth_me.py` | 현재 사용자, 위조·만료·사용자 삭제 시 거부 |
| `tests/test_auth_logout.py` | 쿠키·서버 세션 삭제, 재사용 거부, 다른 기기 보존 |
| `tests/test_auth_failures.py` | 저장·삭제 실패 롤백, 안전한 오류·로그, 422 비밀번호 비노출 |
| `tests/test_auth_validation.py` | 입력 길이·타입·문자, 동시 중복 가입, 사용자 ID 조작 거부 |
| `tests/test_auth_lifecycle.py` | HTTPS 쿠키, 고정 만료, 새 Python 프로세스에서 세션 유지 |
| `tests/test_auth_access.py` | 실제 보호 API 인증 연결, 사용자 구분, 로그인 중 가입 |

`TestClient`를 사용한 HTTP/HTTPS 쿠키 검증이며 실제 배포 브라우저 검증은 아니다. 채팅 미구현 상태에서 인증 통과 후 `501`에 도달하는 것을 검증했으며, 실제 방 생성·소유권·AI 호출 성공을 검증했다고 간주하지 않는다.

별도로 임시 SQLite DB와 실제 Uvicorn 서버를 실행해 로컬 HTTP에서 가입·중복 가입·로그인·현재 사용자 조회·입력 오류·로그아웃·로그아웃 후 접근 차단을 확인했다. 위 API 예시의 JSON 응답과 HttpOnly 쿠키 발급도 함께 확인했다.

인증 테스트만 실행하려면 `uv run python -m unittest discover -s tests -p 'test_auth_*.py' -v`를 사용한다.

## 팀 통합 시 확인

- 화면: 가입 → 별도 로그인 → `/me` 확인 → 로그아웃 및 `401` 안내.
- 채팅: 인증된 `user.id`로 소유권 검사. 인증 통과만으로 타인 방 차단까지 완료된 것은 아니다.
- 배포: 영구 DB는 아직 미정이다. 현재 Vercel DB 접근 차단을 유지하고 인증·채팅 담당이 저장소 변경을 함께 반영해야 한다.
- 로그인 시도 제한과 외부 서비스의 전체 운영 검증은 현재 구현 완료 기준에 포함되어 있지 않다.
