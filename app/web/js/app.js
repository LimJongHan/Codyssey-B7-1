/* ==========================================================================
   긍정봇 해피 — 메인 앱 진입점 (FastAPI 정적 웹 서빙)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  if (window.AuthModule) {
    window.AuthModule.init();
  }
  if (window.ChatApp) {
    window.ChatApp.init();
  }
});
