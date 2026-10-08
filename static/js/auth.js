/* ==========================================================================
   인증 페이지 — 세그먼트 탭, 폼 전환, 비밀번호 토글
   ========================================================================== */

;(function () {
  'use strict';

  const tabs    = document.getElementById('authTabs');
  const btnLogin    = document.getElementById('tabLogin');
  const btnReg      = document.getElementById('tabRegister');
  const form        = document.getElementById('authForm');
  const nameField   = document.getElementById('nameField');
  const title       = document.getElementById('authTitle');
  const desc        = document.getElementById('authDesc');
  const submitLabel = document.getElementById('submitLabel');
  const togglePw    = document.getElementById('togglePw');
  const pwInput     = document.getElementById('userPw');

  /* ── 탭 전환 ── */
  function setTab(mode) {
    const isReg = mode === 'register';

    btnLogin.classList.toggle('is-active', !isReg);
    btnReg.classList.toggle('is-active', isReg);
    btnLogin.setAttribute('aria-selected', String(!isReg));
    btnReg.setAttribute('aria-selected', String(isReg));

    tabs.classList.toggle('tab--register', isReg);

    nameField.style.display = isReg ? 'flex' : 'none';

    title.textContent = isReg ? '해피와 함께 시작해요!' : '다시 만나서 반가워요!';
    desc.textContent  = isReg
      ? '간단하게 가입하고 나만의 긍정 공간을 만들어 보세요.'
      : '해피와 나눈 소중한 대화를 이어가 보세요.';
    submitLabel.textContent = isReg ? '회원가입하기' : '로그인하기';

    form.action = isReg ? '/register' : '/login';
  }

  btnLogin.addEventListener('click', () => setTab('login'));
  btnReg.addEventListener('click', () => setTab('register'));

  /* ── 비밀번호 토글 ── */
  if (togglePw && pwInput) {
    togglePw.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      togglePw.style.color = show ? 'var(--amber)' : '';
    });
  }

  /* ── URL 파라미터로 초기 탭 결정 ── */
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'register') setTab('register');

})();
