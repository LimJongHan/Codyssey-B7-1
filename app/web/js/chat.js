/* ==========================================================================
   긍정봇 해피 — 메인 대화 및 채팅방 제어 모듈
   FastAPI 백엔드 계약 (/api/rooms/*) 및 CONTRIBUTING.md 화면 규칙 준수
   ========================================================================== */
;(function (window) {
  'use strict';

  const ChatApp = {
    currentRoomId: null,
    rooms: [],
    isLoading: false,
    lastFailedQuestion: null,

    init() {
      this.bindElements();
      this.bindEvents();
      this.setupAutoResize();
      this.setupCharCounter();
      this.setupNetworkStatus();
      this.loadRooms();
    },

    bindElements() {
      // 레이아웃 & 사이드바
      this.sidebar       = document.getElementById('sidebar');
      this.sidebarToggle = document.getElementById('sidebarToggle');
      this.sidebarClose  = document.getElementById('sidebarClose');
      this.btnNewChat    = document.getElementById('btnNewChat');
      this.roomList      = document.getElementById('roomList');
      this.chatTitle     = document.getElementById('chatTitle');

      // 채팅 피드
      this.chatFeed      = document.getElementById('chatFeed');
      this.welcomeHero   = document.getElementById('welcomeHero');
      this.offlineBanner = document.getElementById('offlineBanner');
      this.toastContainer = document.getElementById('toastContainer');

      // 인풋독
      this.chatForm      = document.getElementById('chatForm');
      this.chatInput     = document.getElementById('chatInput');
      this.btnSend       = document.getElementById('btnSend');
      this.charCount     = document.getElementById('charCount');
      this.inputDock     = document.getElementById('inputDock');

      // 퀵칩
      this.quickChips    = document.querySelectorAll('.chip');
    },

    bindEvents() {
      // 사이드바 토글
      this.sidebarToggle?.addEventListener('click', () => {
        this.sidebar?.classList.toggle('is-open');
      });
      this.sidebarClose?.addEventListener('click', () => {
        this.sidebar?.classList.remove('is-open');
      });

      // 새 대화 시작
      this.btnNewChat?.addEventListener('click', () => {
        this.createNewRoom();
      });

      // 폼 제출 (메시지 전송)
      this.chatForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        this.sendMessage();
      });

      // 텍스트 영역 키보드 입력 (Enter = 전송, Shift+Enter = 줄바꿈)
      this.chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // 퀵칩 클릭 시 전송
      this.quickChips?.forEach((chip) => {
        chip.addEventListener('click', () => {
          const text = chip.getAttribute('data-prompt') || chip.textContent.trim();
          if (this.chatInput) {
            this.chatInput.value = text;
            this.updateCharCount();
            this.sendMessage();
          }
        });
      });
    },

    /* ==========================================================================
       네트워크 & 토스트 안내
       ========================================================================== */
    setupNetworkStatus() {
      const updateNet = () => {
        if (!navigator.onLine) {
          this.offlineBanner?.classList.add('is-visible');
          this.setInputDisabled(true);
        } else {
          this.offlineBanner?.classList.remove('is-visible');
          if (!this.isLoading) this.setInputDisabled(false);
        }
      };

      window.addEventListener('online', () => {
        updateNet();
        this.showToast('인터넷이 다시 연결되었습니다. ☀️', 'success');
      });
      window.addEventListener('offline', () => {
        updateNet();
        this.showToast('네트워크 연결이 끊겼습니다.', 'error');
      });
      updateNet();
    },

    showToast(msg, type = 'info', duration = 3500) {
      if (!this.toastContainer) return;
      const icons = { error: '⚠️', success: '✅', warn: '💛', info: '☀️' };
      const el = document.createElement('div');
      el.className = `toast toast--${type}`;
      el.innerHTML = `<span>${icons[type] || '☀️'}</span><span>${msg}</span>`;
      this.toastContainer.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        setTimeout(() => el.remove(), 300);
      }, duration);
    },

    /* ==========================================================================
       입력창 자동 높이 조절 & 글자 수 카운터 (2,000자 제한)
       ========================================================================== */
    setupAutoResize() {
      if (!this.chatInput) return;
      this.chatInput.addEventListener('input', () => {
        this.chatInput.style.height = 'auto';
        const newHeight = Math.min(this.chatInput.scrollHeight, 180);
        this.chatInput.style.height = `${newHeight}px`;
      });
    },

    setupCharCounter() {
      this.chatInput?.addEventListener('input', () => this.updateCharCount());
      this.updateCharCount();
    },

    updateCharCount() {
      if (!this.chatInput || !this.charCount) return;
      const len = this.chatInput.value.length;
      this.charCount.textContent = `${len.toLocaleString()} / 2,000`;

      this.charCount.classList.remove('is-warn', 'is-limit');
      if (len >= 1950) {
        this.charCount.classList.add('is-limit');
      } else if (len >= 1800) {
        this.charCount.classList.add('is-warn');
      }
    },

    setInputDisabled(disabled) {
      if (this.chatInput) this.chatInput.disabled = disabled;
      if (this.btnSend) this.btnSend.disabled = disabled;
    },

    setLoading(loading) {
      this.isLoading = loading;
      this.setInputDisabled(loading);
      if (this.btnSend) {
        this.btnSend.classList.toggle('is-loading', loading);
      }
    },

    /* ==========================================================================
       방(Room) 목록 및 생성
       ========================================================================== */
    async loadRooms() {
      try {
        const res = await fetch('/api/rooms', {
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        });

        if (res.ok) {
          const data = await res.json();
          this.rooms = Array.isArray(data) ? data : [];
          this.renderRoomList();
          if (this.rooms.length > 0 && !this.currentRoomId) {
            this.selectRoom(this.rooms[0].id);
          }
        } else if (res.status === 401) {
          // 비로그인 상태일 때 임시 로컬 방 구성
          this.rooms = [{ id: 'guest', title: '오늘의 대화 (게스트)' }];
          this.renderRoomList();
          this.selectRoom('guest');
        } else if (res.status === 501) {
          // 백엔드 미구현 시
          this.rooms = [{ id: 'mock', title: '해피와의 긍정 대화' }];
          this.renderRoomList();
          this.selectRoom('mock');
        }
      } catch (err) {
        // 오프라인이거나 초기 로컬 구동 시
        this.rooms = [{ id: 'local', title: '따뜻한 일상 대화' }];
        this.renderRoomList();
        this.selectRoom('local');
      }
    },

    renderRoomList() {
      if (!this.roomList) return;
      this.roomList.innerHTML = '';

      this.rooms.forEach((r) => {
        const li = document.createElement('li');
        li.className = `chat-item ${r.id === this.currentRoomId ? 'is-active' : ''}`;
        li.setAttribute('data-id', r.id);

        const emoji = document.createElement('span');
        emoji.className = 'chat-emoji';
        emoji.textContent = '☀️';

        const title = document.createElement('span');
        title.className = 'chat-title';
        title.textContent = r.title || '새 대화';

        li.appendChild(emoji);
        li.appendChild(title);

        li.addEventListener('click', () => {
          this.selectRoom(r.id);
          this.sidebar?.classList.remove('is-open');
        });

        this.roomList.appendChild(li);
      });
    },

    async createNewRoom() {
      if (!window.AuthModule?.currentUser) {
        window.AuthModule?.openModal();
        this.showToast('새 대화방을 만들려면 로그인이 필요합니다.', 'warn');
        return;
      }

      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ title: '새로운 긍정 대화' }),
          credentials: 'same-origin'
        });

        if (res.ok) {
          const newRoom = await res.json();
          this.rooms.unshift(newRoom);
          this.renderRoomList();
          this.selectRoom(newRoom.id);
          this.clearChatFeed();
          this.showToast('새로운 대화방이 생성되었습니다.', 'success');
        } else if (res.status === 401) {
          window.AuthModule?.openModal();
        } else {
          this.showToast('대화방 생성에 실패했습니다.', 'error');
        }
      } catch (e) {
        this.showToast('네트워크 오류가 발생했습니다.', 'error');
      }
    },

    async selectRoom(roomId) {
      this.currentRoomId = roomId;
      this.renderRoomList();
      const room = this.rooms.find((r) => r.id === roomId);
      if (this.chatTitle && room) {
        this.chatTitle.textContent = room.title;
      }

      if (roomId === 'guest' || roomId === 'mock' || roomId === 'local') {
        return;
      }

      // 메시지 목록 불러오기
      try {
        const res = await fetch(`/api/rooms/${roomId}/messages`, {
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        });
        if (res.ok) {
          const messages = await res.json();
          this.clearChatFeed();
          if (Array.isArray(messages) && messages.length > 0) {
            this.hideWelcomeHero();
            messages.forEach((ex) => {
              this.appendMessage('user', ex.question);
              this.appendMessage('bot', ex.answer);
            });
          } else {
            this.showWelcomeHero();
          }
        }
      } catch (e) {
        // 실패 시 유지
      }
    },

    clearChatFeed() {
      if (!this.chatFeed) return;
      const bubbles = this.chatFeed.querySelectorAll('.msg-row');
      bubbles.forEach((b) => b.remove());
      this.showWelcomeHero();
    },

    showWelcomeHero() {
      if (this.welcomeHero) this.welcomeHero.style.display = 'flex';
    },

    hideWelcomeHero() {
      if (this.welcomeHero) this.welcomeHero.style.display = 'none';
    },

    /* ==========================================================================
       메시지 전송 및 상태 UX (로딩, 오류, 재시도, textContent 렌더링)
       ========================================================================== */
    async sendMessage(retryText = null) {
      if (this.isLoading) return;

      const rawText = retryText !== null ? retryText : (this.chatInput?.value ?? '');
      const question = rawText.trim();

      // 1. 빈 값 검증
      if (!question) {
        this.inputDock?.classList.add('shake');
        setTimeout(() => this.inputDock?.classList.remove('shake'), 400);
        this.showToast('메시지를 입력해 주세요.', 'warn');
        return;
      }

      // 2. 길이 검증 (2,000자 초과)
      if (question.length > 2000) {
        this.showToast('질문은 2,000자 이내로 입력해 주세요.', 'error');
        return;
      }

      // 입력창 초기화
      if (this.chatInput && retryText === null) {
        this.chatInput.value = '';
        this.chatInput.style.height = 'auto';
        this.updateCharCount();
      }

      this.hideWelcomeHero();
      this.appendMessage('user', question);
      this.setLoading(true);

      // 로딩 스피너 말풍선 노출 ("해피가 생각하고 있어요...")
      const typingIndicator = this.appendTypingIndicator();

      try {
        const roomId = this.currentRoomId || 1;
        const res = await fetch(`/api/rooms/${roomId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ question }),
          credentials: 'same-origin',
          signal: AbortSignal.timeout(30_000)
        });

        typingIndicator.remove();

        if (res.ok) {
          const exchange = await res.json();
          // 보안 규칙 준수: AI 응답은 반드시 textContent로 렌더링 (CONTRIBUTING.md 준수)
          this.appendMessage('bot', exchange.answer);
          this.lastFailedQuestion = null;
        } else if (res.status === 401) {
          this.appendErrorMessage('로그인한 사용자만 대화할 수 있어요. 로그인 후 이용해 주세요.', question);
          window.AuthModule?.openModal();
        } else if (res.status === 422) {
          this.appendErrorMessage('질문 형식이 올바르지 않습니다. (1~2,000자 이내)', question);
        } else if (res.status === 502 || res.status === 504) {
          this.appendErrorMessage('해피가 답변을 생각하는 데 시간이 걸리고 있어요. 잠시 후 다시 시도해 주세요.', question, true);
        } else if (res.status === 501) {
          // 백엔드가 아직 501(미구현) 상태인 경우 개발용 친절한 긍정 답변 목업 제공
          const demoReplies = [
            `"${question}"라고 말씀해주셨군요! 항상 당신의 곁에서 응원하고 있어요. 힘내세요! ☀️`,
            `오늘 하루도 정말 고생 많으셨어요. 당신은 그 자체로 빛나는 소중한 존재예요. ✨`,
            `마음이 한결 편안해지셨으면 좋겠어요. 언제든 해피에게 또 이야기해 주세요! 💛`
          ];
          const reply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
          this.appendMessage('bot', reply);
        } else {
          const data = await res.json().catch(() => ({}));
          this.appendErrorMessage(data.detail || '응답을 받아오지 못했습니다.', question, true);
        }
      } catch (err) {
        typingIndicator.remove();
        if (err.name === 'TimeoutError') {
          this.appendErrorMessage('응답 대기 시간이 초과되었습니다.', question, true);
        } else if (!navigator.onLine) {
          this.appendErrorMessage('네트워크 연결이 끊겼습니다.', question, true);
        } else {
          this.appendErrorMessage('일시적인 연결 오류가 발생했습니다.', question, true);
        }
      } finally {
        this.setLoading(false);
        this.scrollToBottom();
      }
    },

    /* ==========================================================================
       말풍선 DOM 렌더링 (XSS 방지: textContent 강제 적용)
       ========================================================================== */
    appendMessage(role, text) {
      if (!this.chatFeed) return;

      const row = document.createElement('div');
      row.className = `msg-row msg-row--${role}`;

      if (role === 'bot') {
        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.innerHTML = `
          <div class="happi happi--icon" role="img" aria-label="해피">
            <svg class="happi__svg" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="40" fill="#FFB830"/>
              <circle cx="38" cy="48" r="5" fill="#1A1040"/>
              <circle cx="62" cy="48" r="5" fill="#1A1040"/>
              <path d="M 38 60 Q 50 72 62 60" stroke="#1A1040" stroke-width="3" stroke-linecap="round" fill="none"/>
            </svg>
          </div>
        `;
        row.appendChild(avatar);
      }

      const bubble = document.createElement('div');
      bubble.className = `msg-bubble msg-bubble--${role}`;

      // XSS 방지: CONTRIBUTING.md 규칙대로 textContent 사용
      const textSpan = document.createElement('p');
      textSpan.className = 'msg-text';
      textSpan.textContent = text;
      bubble.appendChild(textSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'msg-time';
      const now = new Date();
      timeSpan.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      bubble.appendChild(timeSpan);

      row.appendChild(bubble);
      this.chatFeed.appendChild(row);
      this.scrollToBottom();
      return row;
    },

    appendTypingIndicator() {
      const row = document.createElement('div');
      row.className = 'msg-row msg-row--bot msg-typing';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = `
        <div class="happi happi--icon">
          <svg class="happi__svg" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="40" fill="#FFB830"/>
            <path d="M 38 60 Q 50 72 62 60" stroke="#1A1040" stroke-width="3" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
      `;
      row.appendChild(avatar);

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble msg-bubble--bot msg-bubble--typing';
      bubble.innerHTML = `
        <span class="typing-label">해피가 생각하는 중이에요</span>
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      `;
      row.appendChild(bubble);

      this.chatFeed?.appendChild(row);
      this.scrollToBottom();
      return row;
    },

    appendErrorMessage(errorText, retryQuestion, showRetry = false) {
      if (!this.chatFeed) return;

      const row = document.createElement('div');
      row.className = 'msg-row msg-row--bot msg-row--error';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble msg-bubble--error';

      const errP = document.createElement('p');
      errP.className = 'msg-error-text';
      errP.textContent = `⚠️ ${errorText}`;
      bubble.appendChild(errP);

      if (showRetry && retryQuestion) {
        const btnRetry = document.createElement('button');
        btnRetry.className = 'btn-retry';
        btnRetry.textContent = '다시 시도 ↻';
        btnRetry.addEventListener('click', () => {
          row.remove();
          this.sendMessage(retryQuestion);
        });
        bubble.appendChild(btnRetry);
      }

      row.appendChild(bubble);
      this.chatFeed.appendChild(row);
      this.scrollToBottom();
    },

    scrollToBottom() {
      if (!this.chatFeed) return;
      this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
    }
  };

  window.ChatApp = ChatApp;
})(window);
