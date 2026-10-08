// 같은 FastAPI 서버의 상대 경로를 사용한다. API 키는 브라우저에서 사용하지 않는다.
async function checkServer() {
  const status = document.querySelector("#status");
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("서버 확인 실패");
    status.textContent = "서버가 연결되었습니다.";
  } catch {
    status.textContent = "서버에 연결할 수 없습니다.";
  }
}
checkServer();
