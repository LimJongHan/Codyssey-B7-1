/* ==========================================================================
   로그인 / 회원가입 — 입력 검증 & UX 인터랙션
   ========================================================================== */
;(function () {
  'use strict';

  /* ==========================================================================
     DOM
     ========================================================================== */
  const authTabs     = document.getElementById('authTabs');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');
  const authForm     = document.getElementById('authForm');
  const userId       = document.getElementById('userId');
  const userPw       = document.getElementById('userPw');
  const submitBtn    = document.getElementById('submitBtn');
  const submitLabel  = document.getElementById('submitLabel');
  const togglePw     = document.getElementById('togglePw');
  const authTitle    = document.getElementById('authTitle');
  const authDesc     = document.getElementById('authDesc');
  const toastCont    = document.getElementById('toastContainer');

  // 에러 span
  const idErr    = document.getElementById('idError');
  const pwErr    = document.getElementById('pwError');

  let isRegister = false;
  let isLoading  = false;

  /* ==========================================================================
     토스트
     ========================================================================== */
  function showToast (msg, type = 'info', duration = 3500) {
    if (!toastCont) return;
    const icons = { error:'⚠️', success:'✅', warn:'💛', info:'☀️' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const icon = document.createElement('span');
    const body = document.createElement('span');
    icon.textContent = icons[type];
    body.textContent = msg; // 서버 detail도 들어오므로 HTML로 해석하지 않는다
    el.append(icon, body);
    toastCont.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => el.remove(), 280);
    }, duration);
  }

  /* ==========================================================================
     탭 전환
     ========================================================================== */
  function switchTab (toRegister) {
    isRegister = toRegister;
    authTabs?.classList.toggle('tab--register', toRegister);
    tabLogin?.classList.toggle('is-active', !toRegister);
    tabRegister?.classList.toggle('is-active', toRegister);

    if (authTitle) authTitle.textContent = toRegister ? '해피와 함께 시작해요!' : '다시 만나서 반가워요!';
    if (authDesc)  authDesc.textContent  = toRegister
      ? '지금 가입하면 모든 대화 기록을 보관할 수 있어요.'
      : '해피와 나눈 소중한 대화를 이어가 보세요.';
    if (submitLabel) submitLabel.textContent = toRegister ? '회원가입하기' : '로그인하기';

    clearAllErrors();
  }

  tabLogin?.addEventListener('click',    () => switchTab(false));
  tabRegister?.addEventListener('click', () => switchTab(true));

  /* ==========================================================================
     비밀번호 토글
     ========================================================================== */
  togglePw?.addEventListener('click', () => {
    if (!userPw) return;
    const show = userPw.type === 'password';
    userPw.type = show ? 'text' : 'password';
    togglePw.style.color = show ? 'var(--gold)' : '';
  });

  /* ==========================================================================
     인라인 에러 표시 / 해제
     ========================================================================== */
  function showFieldError (input, spanEl, msg) {
    if (input) {
      input.classList.add('is-error');
      input.setAttribute('aria-invalid', 'true');
    }
    if (spanEl) {
      spanEl.textContent = msg;
      spanEl.classList.add('is-visible');
    }
  }

  function clearFieldError (input, spanEl) {
    input?.classList.remove('is-error');
    input?.removeAttribute('aria-invalid');
    if (spanEl) {
      spanEl.textContent = '';
      spanEl.classList.remove('is-visible');
    }
  }

  function clearAllErrors () {
    clearFieldError(userId, idErr);
    clearFieldError(userPw, pwErr);
  }

  // 포커스 아웃 시 즉시 검증
  userId?.addEventListener('blur', () => validateId(true));
  userPw?.addEventListener('blur', () => validatePw(true));

  // 타이핑 중 에러 즉시 해소
  userId?.addEventListener('input', () => clearFieldError(userId, idErr));
  userPw?.addEventListener('input', () => clearFieldError(userPw, pwErr));

  /* ==========================================================================
     검증 함수
     ========================================================================== */
  const ID_RE = /^[A-Za-z0-9_]{3,30}$/; // 서버 Credentials.username 규칙과 같다

  function validateId (show = false) {
    const val = userId?.value.trim() ?? '';
    if (!val) {
      if (show) showFieldError(userId, idErr, '아이디를 입력해 주세요.');
      return false;
    }
    if (!ID_RE.test(val)) {
      if (show) showFieldError(userId, idErr, '아이디는 영문·숫자·밑줄 3~30자로 입력해 주세요.');
      return false;
    }
    clearFieldError(userId, idErr);
    return true;
  }

  function validatePw (show = false) {
    const val = userPw?.value ?? '';
    if (!val) {
      if (show) showFieldError(userPw, pwErr, '비밀번호를 입력해 주세요.');
      return false;
    }
    if (val.length < 8) {
      if (show) showFieldError(userPw, pwErr, '비밀번호는 8자 이상이어야 합니다.');
      return false;
    }
    if (val.length > 128) { // 서버 Credentials.password 최대 길이와 같다
      if (show) showFieldError(userPw, pwErr, '비밀번호는 128자 이내로 입력해 주세요.');
      return false;
    }
    clearFieldError(userPw, pwErr);
    return true;
  }

  /* ==========================================================================
     폼 제출
     ========================================================================== */
  function setSubmitLoading (on) {
    isLoading = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.classList.toggle('is-loading', on);
  }

  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isLoading) return;

    // 전체 검증 실행
    const ok = [
      validateId(true),
      validatePw(true),
    ].every(Boolean);

    if (!ok) {
      // 첫 번째 에러 필드에 포커스
      const errField = [userId, userPw]
        .find(f => f?.classList.contains('is-error'));
      errField?.focus();
      return;
    }

    setSubmitLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/signup' : '/api/auth/login';

      // 팀 규격: username (3~30자, 영문/숫자/언더스코어), password (8자 이상)
      // 가입과 로그인에 입력한 아이디를 그대로 보낸다. 다른 값으로 바꾸면 가입한 계정으로 로그인할 수 없다.
      const payload = {
        username: userId.value.trim(),
        password: userPw?.value,
      };

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(payload),
        credentials: 'same-origin',
        signal:  AbortSignal.timeout(15_000),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast(isRegister ? '환영해요! 해피와 함께해요 🎉' : '돌아오셨군요! 반가워요 ☀️', 'success');
        if (isRegister) {
          // 가입 성공 시 로그인 탭으로 전환 또는 자동 로그인 안내
          setTimeout(() => {
            switchTab(false);
            showToast('로그인을 진행해 주세요.', 'info');
          }, 900);
        } else {
          setTimeout(() => { window.location.href = '/chat'; }, 900);
        }
      } else {
        if (res.status === 409) {
          showFieldError(userId, idErr, data?.detail || '이미 사용 중인 아이디입니다.');
        } else if (res.status === 401) {
          showFieldError(userPw, pwErr, data?.detail || '아이디 또는 비밀번호가 일치하지 않아요.');
        } else if (res.status === 422) {
          showToast('입력 형식을 확인해 주세요. (아이디 3~30자, 비밀번호 8자 이상)', 'error');
        } else {
          showToast(data?.detail || data?.message || '오류가 발생했습니다. 다시 시도해 주세요.', 'error');
        }
      }
    } catch (err) {
      if (err.name === 'TimeoutError') {
        showToast('요청 시간이 초과됐어요. 다시 시도해 주세요.', 'error');
      } else if (!navigator.onLine) {
        showToast('인터넷 연결이 끊겼습니다.', 'error');
      } else {
        showToast('일시적인 오류가 발생했어요.', 'error');
      }
    } finally {
      setSubmitLoading(false);
    }
  });

})();
