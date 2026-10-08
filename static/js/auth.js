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
  const nameField    = document.getElementById('nameField');
  const userEmail    = document.getElementById('userEmail');
  const userPw       = document.getElementById('userPw');
  const userName     = document.getElementById('userName');
  const submitBtn    = document.getElementById('submitBtn');
  const submitLabel  = document.getElementById('submitLabel');
  const togglePw     = document.getElementById('togglePw');
  const authTitle    = document.getElementById('authTitle');
  const authDesc     = document.getElementById('authDesc');
  const toastCont    = document.getElementById('toastContainer');

  // 에러 span
  const emailErr = document.getElementById('emailError');
  const pwErr    = document.getElementById('pwError');
  const nameErr  = document.getElementById('nameError');

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
    el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
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

    if (nameField) nameField.style.display = toRegister ? '' : 'none';
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
    clearFieldError(userEmail, emailErr);
    clearFieldError(userPw, pwErr);
    clearFieldError(userName, nameErr);
  }

  // 포커스 아웃 시 즉시 검증
  userEmail?.addEventListener('blur', () => validateEmail(true));
  userPw?.addEventListener('blur',    () => validatePw(true));
  userName?.addEventListener('blur',  () => { if (isRegister) validateName(true); });

  // 타이핑 중 에러 즉시 해소
  userEmail?.addEventListener('input', () => clearFieldError(userEmail, emailErr));
  userPw?.addEventListener('input',    () => clearFieldError(userPw, pwErr));
  userName?.addEventListener('input',  () => clearFieldError(userName, nameErr));

  /* ==========================================================================
     검증 함수
     ========================================================================== */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateEmail (show = false) {
    const val = userEmail?.value.trim() ?? '';
    if (!val) {
      if (show) showFieldError(userEmail, emailErr, '이메일 주소를 입력해 주세요.');
      return false;
    }
    if (!EMAIL_RE.test(val)) {
      if (show) showFieldError(userEmail, emailErr, '올바른 이메일 형식이 아닙니다.');
      return false;
    }
    if (val.length > 100) {
      if (show) showFieldError(userEmail, emailErr, '이메일은 100자 이내로 입력해 주세요.');
      return false;
    }
    clearFieldError(userEmail, emailErr);
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
    if (val.length > 72) {
      if (show) showFieldError(userPw, pwErr, '비밀번호는 72자 이내로 입력해 주세요.');
      return false;
    }
    clearFieldError(userPw, pwErr);
    return true;
  }

  function validateName (show = false) {
    if (!isRegister) return true;
    const val = userName?.value.trim() ?? '';
    if (!val) {
      if (show) showFieldError(userName, nameErr, '닉네임을 입력해 주세요.');
      return false;
    }
    if (val.length < 2) {
      if (show) showFieldError(userName, nameErr, '닉네임은 2자 이상이어야 합니다.');
      return false;
    }
    if (val.length > 20) {
      if (show) showFieldError(userName, nameErr, '닉네임은 20자 이내로 입력해 주세요.');
      return false;
    }
    clearFieldError(userName, nameErr);
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
      validateEmail(true),
      validatePw(true),
      validateName(true),
    ].every(Boolean);

    if (!ok) {
      // 첫 번째 에러 필드에 포커스
      const errField = [userName, userEmail, userPw]
        .find(f => f?.classList.contains('is-error'));
      errField?.focus();
      return;
    }

    setSubmitLoading(true);

    try {
      const endpoint = isRegister ? '/api/register' : '/api/login';
      const payload  = {
        email:    userEmail?.value.trim(),
        password: userPw?.value,
        ...(isRegister && { name: userName?.value.trim() }),
      };

      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(15_000),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast(isRegister ? '환영해요! 해피와 함께해요 🎉' : '돌아오셨군요! 반가워요 ☀️', 'success');
        setTimeout(() => { window.location.href = data?.redirect ?? '/chat'; }, 900);
      } else {
        // 필드별 오류
        if (data?.field === 'email')    showFieldError(userEmail, emailErr, data.message ?? '이미 사용 중인 이메일이에요.');
        else if (data?.field === 'password') showFieldError(userPw, pwErr, data.message ?? '비밀번호가 일치하지 않아요.');
        else showToast(data?.message ?? '오류가 발생했습니다. 다시 시도해 주세요.', 'error');
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
