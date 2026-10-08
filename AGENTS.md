# 긍정봇 개발 지침

상위 Codyssey 지침과 MISSION.md를 따른다. 이 저장소는 4명이 기능을 채워 넣는 단일 FastAPI 프로젝트다.

- 담당별 파일 소유권은 README.md, 연결 계약은 docs/CONTRIBUTING.md를 따른다.
- API 경로·요청/응답 모델·get_current_user·generate_reply 계약은 관련 담당과 합의 후 변경한다.
- 기능 담당자는 자기 폴더 중심으로 수정한다. main.py, 의존성, 환경 변수 등 공통 변경은 통합 담당자가 모은다.
- 필수 요구사항과 명시된 채팅방 기능만 구현한다. ORM, 범용 저장소 계층, 별도 프론트 빌드, 스트리밍, 관리자 기능을 임의로 추가하지 않는다.
- 미구현 기능을 가짜 성공이나 인증 우회로 대체하지 않는다. 테스트 대체물은 tests 안에서만 사용한다.
- Vercel 로컬 파일을 영구 DB로 취급하지 않는다. 배포 저장소는 별도 확정이 필요하다.
- 기능 구현 시 README의 현재 상태·예시와 해당 테스트를 함께 갱신한다.
- uv run python -m unittest discover -s tests -v 및 git diff --check로 확인한다.
