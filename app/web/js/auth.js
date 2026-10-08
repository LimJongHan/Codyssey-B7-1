/* ==========================================================================
   긍정봇 해피 — 인증(로그인 / 회원가입) 모듈
   FastAPI 백엔드 계약 (/api/auth/*) 준수
   ========================================================================== */
;(function (window) {
  'use strict';

  const Auth = {
    currentUser: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.checkSession();
    },

    bindElements() {
      this.authModal   = document.getElementById('authModal');
      this.authTabs    = document.getElementById('authTabs');
      this.tabLogin    = document.getElementById('tabLogin');
      this.tabRegister = document.getElementById('tabRegister');
      this.authForm    = document.getElementById('authForm');
      this.userName    = document.getElementById('userName');
      this.userPw      = document.getElementById('userPw');
      this.submitBtn   = document.getElementById('submitBtn');
      this.submitLabel = document.getElementById('submitLabel');
      this.togglePw    = document.getElementById('togglePw');
      this.authTitle   = document.getElementById('authTitle');
      this.authDesc    = document.getElementById('authDesc');
      this.userDisplay = document.getElementById('userDisplayName');
      this.authBtnTop  = document.getElementById('authBtnTop');
      this.modalClose  = document.getElementById('authModalClose');

      // 에러 메시지 요소
      this.nameErr = document.getElementById('nameError');
      this.pwErr   = document.getElementById('pwError');

      this.isRegister = false;
      this.isLoading  = false;
    },

    bindEvents() {
      this.tabLogin?.addEventListener('click', () => this.switchTab(false));
      this.tabRegister?.addEventListener('click', () => this.switchTab(true));

      this.togglePw?.addEventListener('click', () => {
        if (!this.userPw) return;
        const show = this.userPw.type === 'password';
        this.userPw.type = show ? 'text' : 'password';
        this.togglePw.style.color = show ? 'var(--gold, #F5A623)' : '';
      });

      this.userName?.addEventListener('blur', () => this.validateUsername(true));
      this.userName?.addEventListener('input', () => this.clearFieldError(this.userName, this.nameErr));

      this.userPw?.addEventListener('blur', () => this.validatePassword(true));
      this.userPw?.addEventListener('input', () => this.clearFieldError(this.userPw, this.pwErr));

      this.authForm?.addEventListener('submit', (e) => this.handleSubmit(e));

      this.authBtnTop?.addEventListener('click', () => {
        if (this.currentUser) {
          this.logout();
        } else {
          this.openModal();
        }
      });

      this.modalClose?.addEventListener('click', () => this.closeModal());
    },

    openModal(registerMode = false) {
      if (!this.authModal) return;
      this.switchTab(registerMode);
      this.authModal.classList.add('is-open');
      this.userName?.focus();
    },

    closeModal() {
      if (!this.authModal) return;
      this.authModal.classList.remove('is-open');
      this.clearAllErrors();
    },

    switchTab(toRegister) {
      this.isRegister = toRegister;
      this.authTabs?.classList.toggle('tab--register', toRegister);
      this.tabLogin?.classList.toggle('is-active', !toRegister);
      this.tabRegister?.classList.toggle('is-active', toRegister);

      if (this.authTitle) {
        this.authTitle.textContent = toRegister ? '해피와 함께 시작해요!' : '다시 만나서 반가워요!';
      }
      if (this.authDesc) {
        this.authDesc.textContent = toRegister
          ? '아이디와 비밀번호로 간편하게 가입하세요.'
          : '해피와 나눈 소중한 대화를 이어가 보세요.';
      }
      if (this.submitLabel) {
        this.submitLabel.textContent = toRegister ? '회원가입하기' : '로그인하기';
      }
      this.clearAllErrors();
    },

    showFieldError(input, spanEl, msg) {
      if (input) {
        input.classList.add('is-error');
        input.setAttribute('aria-invalid', 'true');
      }
      if (spanEl) {
        spanEl.textContent = msg;
        spanEl.classList.add('is-visible');
      }
    },

    clearFieldError(input, spanEl) {
      input?.classList.remove('is-error');
      input?.removeAttribute('aria-invalid');
      if (spanEl) {
        spanEl.textContent = '';
        spanEl.classList.remove('is-visible');
      }
    },

    clearAllErrors() {
      this.clearFieldError(this.userName, this.nameErr);
      this.clearFieldError(this.userPw, this.pwErr);
    },

    validateUsername(show = false) {
      const val = this.userName?.value.trim() ?? '';
      if (!val) {
        if (show) this.showFieldError(this.userName, this.nameErr, '아이디를 입력해 주세요.');
        return false;
      }
      if (val.length < 3 || val.length > 30) {
        if (show) this.showFieldError(this.userName, this.nameErr, '아이디는 3~30자여야 합니다.');
        return false;
      }
      const regex = /^[a-zA-Z0-9_]+$/;
      if (!regex.test(val)) {
        if (show) this.showFieldError(this.userName, this.nameErr, '영문, 숫자, 언더스코어(_)만 사용할 수 있습니다.');
        return false;
      }
      this.clearFieldError(this.userName, this.nameErr);
      return true;
    },

    validatePassword(show = false) {
      const val = this.userPw?.value ?? '';
      if (!val) {
        if (show) this.showFieldError(this.userPw, this.pwErr, '비밀번호를 입력해 주세요.');
        return false;
      }
      if (val.length < 8) {
        if (show) this.showFieldError(this.userPw, this.pwErr, '비밀번호는 최소 8자 이상이어야 합니다.');
        return false;
      }
      if (val.length > 128) {
        if (show) this.showFieldError(this.userPw, this.pwErr, '비밀번호는 128자 이내여야 합니다.');
        return false;
      }
      this.clearFieldError(this.userPw, this.pwErr);
      return true;
    },

    setLoading(on) {
      this.isLoading = on;
      if (!this.submitBtn) return;
      this.submitBtn.disabled = on;
      this.submitBtn.classList.toggle('is-loading', on);
    },

    async checkSession() {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        });
        if (res.ok) {
          const user = await res.json();
          this.onLoginSuccess(user);
        } else {
          this.onLogoutSuccess();
        }
      } catch (e) {
        this.onLogoutSuccess();
      }
    },

    async handleSubmit(e) {
      e.preventDefault();
      if (this.isLoading) return;

      const validUser = this.validateUsername(true);
      const validPw   = this.validatePassword(true);
      if (!validUser || !validPw) {
        (validUser ? this.userPw : this.userName)?.focus();
        return;
      }

      this.setLoading(true);

      const endpoint = this.isRegister ? '/api/auth/signup' : '/api/auth/login';
      const payload  = {
        username: this.userName.value.trim(),
        password: this.userPw.value
      };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'same-origin'
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (this.isRegister) {
            window.ChatApp?.showToast('회원가입이 완료되었습니다! 로그인해 주세요.', 'success');
            this.switchTab(false);
          } else {
            window.ChatApp?.showToast(`${data.username}님, 반가워요! ☀️`, 'success');
            this.onLoginSuccess(data);
            this.closeModal();
            window.ChatApp?.loadRooms();
          }
        } else if (res.status === 409) {
          this.showFieldError(this.userName, this.nameErr, '이미 존재하는 아이디입니다.');
        } else if (res.status === 401) {
          this.showFieldError(this.userPw, this.pwErr, '아이디 또는 비밀번호가 일치하지 않습니다.');
        } else if (res.status === 422) {
          window.ChatApp?.showToast('입력 형식이 올바르지 않습니다. (아이디 3~30자 영문/숫자, 비밀번호 8자 이상)', 'error');
        } else if (res.status === 501) {
          // 백엔드가 아직 501(미구현) 상태인 경우 친절한 안내
          window.ChatApp?.showToast('백엔드 인증 API가 개발 중입니다. 로컬 세션으로 연결합니다.', 'info');
          const mockUser = { id: 1, username: payload.username };
          this.onLoginSuccess(mockUser);
          this.closeModal();
        } else {
          const detail = data?.detail || '오류가 발생했습니다. 다시 시도해 주세요.';
          window.ChatApp?.showToast(detail, 'error');
        }
      } catch (err) {
        if (!navigator.onLine) {
          window.ChatApp?.showToast('인터넷 연결이 끊겼습니다.', 'error');
        } else {
          window.ChatApp?.showToast('네트워크 오류가 발생했습니다.', 'error');
        }
      } finally {
        this.setLoading(false);
      }
    },

    async logout() {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin'
        });
      } catch (e) {
        // 무시
      }
      this.onLogoutSuccess();
      window.ChatApp?.showToast('로그아웃되었습니다.', 'info');
    },

    onLoginSuccess(user) {
      this.currentUser = user;
      if (this.userDisplay) {
        this.userDisplay.textContent = user.username;
        this.userDisplay.style.display = 'inline-block';
      }
      if (this.authBtnTop) {
        this.authBtnTop.textContent = '로그아웃';
        this.authBtnTop.classList.add('is-logged-in');
      }
      document.body.classList.add('is-authenticated');
      document.body.classList.remove('is-guest');
    },

    onLogoutSuccess() {
      this.currentUser = null;
      if (this.userDisplay) {
        this.userDisplay.textContent = '';
        this.userDisplay.style.display = 'none';
      }
      if (this.authBtnTop) {
        this.authBtnTop.textContent = '로그인';
        this.authBtnTop.classList.remove('is-logged-in');
      }
      document.body.classList.remove('is-authenticated');
      document.body.classList.add('is-guest');
    }
  };

  window.AuthModule = Auth;
})(window);
