import { APIError, responseError, readChatStream } from './api.js';

/* ==========================================================================
   채팅 페이지 — 상태 관리, 입력 검증, UX 인터랙션
   ========================================================================== */

;(function () {
  'use strict';

  /* ==========================================================================
     상수
     ========================================================================== */
  const MAX_CHARS      = 2000;
  const WARN_CHARS     = 1800; // 경고 시작
  const DANGER_CHARS   = 1950; // 위험 표시
  const RETRY_DELAY    = 1200; // 재시도 최소 간격(ms)
  const SEND_TIMEOUT   = 40_000; // 마지막 수신 이후의 대기 시간. 조각 수신마다 갱신한다
  const ROOM_TITLE_LEN = 30;   // 새 대화의 첫 질문 앞부분을 방 제목으로 쓴다

  /* ==========================================================================
     DOM 참조
     ========================================================================== */
  const layout          = document.getElementById('chatLayout');
  const backdrop        = document.getElementById('sidebarBackdrop');
  const btnToggle       = document.getElementById('btnToggle');
  const sidebarClose    = document.getElementById('sidebarClose');
  const btnNewChat      = document.getElementById('btnNewChat');
  const offlineBanner   = document.getElementById('offlineBanner');
  const guestLimitBanner= document.getElementById('guestLimitBanner');
  const chatFeed        = document.getElementById('chatFeed');
  const welcomeBanner   = document.getElementById('welcomeBanner');
  const msgList         = document.getElementById('msgList');
  const typingRow       = document.getElementById('typingRow');
  const chatForm        = document.getElementById('chatForm');
  const msgInput        = document.getElementById('msgInput');
  const btnSend         = document.getElementById('btnSend');
  const charCounter     = document.getElementById('charCounter');
  const inputError      = document.getElementById('inputError');
  const statusTxt       = document.getElementById('statusTxt');
  const liveStatus      = document.getElementById('liveStatus');
  const headerTitle     = document.getElementById('headerTitle');
  const toastContainer  = document.getElementById('toastContainer');
  const btnLogout       = document.getElementById('btnLogout');

  /* ==========================================================================
     상태
     ========================================================================== */
  let isSending    = false;
  let isLoggingOut = false;
  let isLoadingRoom = false;
  let isCollapsed  = false;
  let isLoggedIn   = false; // /api/auth/me 결과. 로그인 사용자에게는 게스트 안내를 보이지 않는다
  let lastRetryTime= 0;

  /* ==========================================================================
     토스트 알림 시스템
     ========================================================================== */
  function showToast (msg, type = 'info', duration = 3500) {
    if (!toastContainer) return;

    const icons = {
      error:   '⚠️',
      success: '✅',
      warn:    '💛',
      info:    '☀️',
    };

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const icon = document.createElement('span');
    const body = document.createElement('span');
    icon.textContent = icons[type] ?? '💬';
    body.textContent = msg; // 메시지는 HTML로 해석하지 않는다
    el.append(icon, body);
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => el.remove(), 280);
    }, duration);
  }

  /* ==========================================================================
     오프라인 감지
     ========================================================================== */
  function syncOnline () {
    const offline = !navigator.onLine;
    offlineBanner?.classList.toggle('is-visible', offline);
    if (offline) {
      setStatus('연결 끊김', '#FF6B8A');
      showToast('인터넷 연결이 끊겼습니다.', 'error');
    } else {
      setStatus('해피가 귀 기울여 듣고 있어요', '');
    }
    syncSendButton();
  }

  window.addEventListener('online',  syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  function setStatus (txt, color) {
    if (!statusTxt) return;
    statusTxt.textContent = txt;
    if (color && liveStatus) {
      liveStatus.style.background  = color;
      liveStatus.style.boxShadow   = `0 0 8px ${color}`;
    } else if (liveStatus) {
      liveStatus.style.background  = '';
      liveStatus.style.boxShadow   = '';
    }
  }

  /* ==========================================================================
     사이드바 토글
     ========================================================================== */
  function openSidebar () {
    if (window.innerWidth <= 768) {
      layout.classList.add('sidebar-open');
    } else {
      layout.classList.remove('sidebar-collapsed');
      isCollapsed = false;
    }
  }

  function closeSidebar () {
    if (window.innerWidth <= 768) {
      layout.classList.remove('sidebar-open');
    } else {
      layout.classList.add('sidebar-collapsed');
      isCollapsed = true;
    }
  }

  btnToggle?.addEventListener('click', () => {
    window.innerWidth <= 768
      ? (layout.classList.contains('sidebar-open') ? closeSidebar() : openSidebar())
      : (isCollapsed ? openSidebar() : closeSidebar());
  });
  sidebarClose?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);

  /* ==========================================================================
     채팅방 목록 · 이전 대화 (GET /api/rooms, GET /api/rooms/{id}/messages)
     ========================================================================== */
  const roomList = document.getElementById('chatHistoryList');
  let activeRoomId = null; // null이면 새 대화. 첫 질문을 보낼 때 방을 만든다

  function markActiveRoom () {
    roomList?.querySelectorAll('.chat-item').forEach(item => {
      item.classList.toggle('is-active', Number(item.dataset.id) === activeRoomId);
    });
  }

  function renderRoom (room, { prepend = false } = {}) {
    const item  = document.createElement('li');
    const emoji = document.createElement('span');
    const title = document.createElement('span');
    item.className  = 'chat-item';
    item.dataset.id = String(room.id);
    emoji.className = 'chat-emoji';
    emoji.textContent = '💬';
    title.className = 'chat-title';
    title.textContent = room.title;
    item.append(emoji, title);
    item.addEventListener('click', () => openRoom(room));
    prepend ? roomList?.prepend(item) : roomList?.append(item);
  }

  async function loadRooms () {
    try {
      const res = await fetch('/api/rooms', { credentials: 'same-origin' });
      if (res.status === 401) return; // 비로그인: 목록 없이 게스트 안내만 보인다
      if (!res.ok) throw await responseError(res);
      const rooms = await res.json();
      roomList?.replaceChildren();
      rooms.forEach(room => renderRoom(room));
      markActiveRoom();
    } catch (error) {
      showToast(error instanceof APIError ? error.message : '대화 목록을 불러오지 못했어요.', 'error');
    }
  }

  async function openRoom (room) {
    if (isSending) {
      showToast('답변을 기다리는 중이에요.', 'warn', 2000);
      return;
    }
    activeRoomId = room.id;
    isLoadingRoom = true;
    syncSendButton();
    markActiveRoom();
    if (headerTitle) headerTitle.textContent = room.title;
    if (msgList) msgList.replaceChildren();
    if (window.innerWidth <= 768) closeSidebar();
    try {
      const res = await fetch(`/api/rooms/${room.id}/messages`, { credentials: 'same-origin' });
      if (!res.ok) throw await responseError(res);
      const exchanges = await res.json();
      if (activeRoomId !== room.id) return; // 그사이 다른 방을 열었으면 무시한다
      if (welcomeBanner) welcomeBanner.style.display = exchanges.length ? 'none' : '';
      exchanges.forEach(exchange => {
        const time = new Date(exchange.created_at);
        appendMsg(exchange.question, 'user', { time });
        appendMsg(exchange.answer, 'bot', { time });
      });
    } catch (error) {
      if (activeRoomId === room.id) showToast(error instanceof APIError ? error.message : '이전 대화를 불러오지 못했어요.', 'error');
    } finally {
      if (activeRoomId === room.id) {
        isLoadingRoom = false;
        syncSendButton();
      }
    }
  }

  /* 새 대화: 화면만 비우고, 방은 첫 질문을 보낼 때 만든다 */
  btnNewChat?.addEventListener('click', () => {
    if (isSending) {
      showToast('답변을 기다리는 중이에요.', 'warn', 2000);
      return;
    }
    activeRoomId = null;
    isLoadingRoom = false;
    syncSendButton();
    markActiveRoom();
    if (msgList) msgList.innerHTML = '';
    if (welcomeBanner) welcomeBanner.style.display = '';
    if (headerTitle) headerTitle.textContent = '새로운 대화 ✨';
    msgInput?.focus();
    if (window.innerWidth <= 768) closeSidebar();
  });

  /* ==========================================================================
     퀵 칩
     ========================================================================== */
  document.querySelectorAll('.q-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt && msgInput) {
        msgInput.value = prompt;
        adjustTextarea();
        syncSendButton();
        msgInput.focus();
      }
    });
  });

  /* ==========================================================================
     텍스트에리어 자동 높이 & 글자수 카운터
     ========================================================================== */
  function adjustTextarea () {
    if (!msgInput) return;
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
  }

  function syncSendButton () {
    if (!msgInput || !btnSend || !charCounter) return;

    const len = msgInput.value.length;
    const trimmed = msgInput.value.trim();

    // 글자수 카운터
    charCounter.textContent = `${len} / ${MAX_CHARS}`;
    charCounter.classList.toggle('is-warning', len >= WARN_CHARS && len < DANGER_CHARS);
    charCounter.classList.toggle('is-danger',  len >= DANGER_CHARS);

    // 에러 메시지
    if (len > MAX_CHARS) {
      showInputError(`최대 ${MAX_CHARS}자까지 입력할 수 있습니다.`);
      btnSend.disabled = true;
      return;
    }
    clearInputError();

    // 빈 입력 검사
    btnSend.disabled = trimmed.length === 0 || isSending || isLoggingOut || isLoadingRoom || !navigator.onLine;
  }

  function showInputError (msg) {
    if (!inputError) return;
    inputError.textContent = msg;
    inputError.classList.add('is-visible');
  }

  function clearInputError () {
    if (!inputError) return;
    inputError.textContent = '';
    inputError.classList.remove('is-visible');
  }

  msgInput?.addEventListener('input', () => {
    adjustTextarea();
    syncSendButton();
  });

  // Enter 전송 / Shift+Enter 줄바꿈
  msgInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (!btnSend.disabled) chatForm.requestSubmit();
    }
  });

  // 감정 태그
  document.querySelectorAll('.btn-emotion').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.e;
      if (msgInput) {
        const val = msgInput.value.trim();
        const newVal = val ? `[${tag}] ${val}` : `[${tag}] `;
        if (newVal.length <= MAX_CHARS) {
          msgInput.value = newVal;
          adjustTextarea();
          syncSendButton();
        }
        msgInput.focus();
      }
    });
  });

  /* ==========================================================================
     메시지 렌더링
     ========================================================================== */
  const formatTime = (d = new Date()) => {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `오${h < 12 ? '전' : '후'} ${h % 12 || 12}:${m}`;
  };

  /* 봇 아바타 인라인 SVG (컴포넌트 의존 없이 재사용) */
  const botAvatarSVG = `
    <div class="happi happi--sm happi--cheerful" role="img" aria-label="해피">
      <div class="happi__glow"></div>
      <svg class="happi__svg" viewBox="0 0 100 100" fill="none"
           xmlns="http://www.w3.org/2000/svg" overflow="visible">
        <defs>
          <radialGradient id="hFace_js" cx="40%" cy="32%" r="70%">
            <stop offset="0%"  stop-color="#FFE566"/>
            <stop offset="50%" stop-color="#FFB830"/>
            <stop offset="85%" stop-color="#F08A00"/>
            <stop offset="100%" stop-color="#CC6600"/>
          </radialGradient>
          <filter id="hShad_js" x="-25%" y="-15%" width="155%" height="150%">
            <feDropShadow dx="0" dy="4" stdDeviation="8"
              flood-color="#FF8800" flood-opacity="0.35"/>
          </filter>
        </defs>
        <g filter="url(#hShad_js)">
          <circle cx="50" cy="50" r="36" fill="url(#hFace_js)"/>
        </g>
        <ellipse cx="40" cy="37" rx="13" ry="9" fill="white" fill-opacity="0.55"
                 transform="rotate(-18 40 37)"/>
        <g class="happi__eyes">
          <g><circle cx="38" cy="48" r="6" fill="#1A1040"/>
             <circle cx="35.5" cy="45.5" r="2" fill="white"/></g>
          <g><circle cx="62" cy="48" r="6" fill="#1A1040"/>
             <circle cx="59.5" cy="45.5" r="2" fill="white"/></g>
        </g>
        <path d="M 37 62 Q 50 76 63 62"
              stroke="#1A1040" stroke-width="2.8" stroke-linecap="round" fill="none"/>
      </svg>
    </div>`;

  function appendMsg (text, role, extra = {}) {
    if (welcomeBanner) welcomeBanner.style.display = 'none';

    const row = document.createElement('div');
    row.className = `msg-row msg-row--${role}`;

    const timeStr = formatTime(extra.time); // 이전 대화는 저장 시각, 새 메시지는 현재 시각

    if (role === 'bot') {
      row.innerHTML = `
        <div class="msg-av">${botAvatarSVG}</div>
        <div class="msg-col">
          <span class="msg-sender">해피</span>
          <div class="msg-bubble"></div>
          <span class="msg-time">${timeStr}</span>
        </div>`;
      row.querySelector('.msg-bubble').textContent = text;
    } else if (role === 'error') {
      row.innerHTML = `
        <div class="msg-av">${botAvatarSVG}</div>
        <div class="msg-col">
          <div class="msg-bubble">
            <span class="err-txt"></span>
          </div>
        </div>`;
      row.querySelector('.err-txt').textContent = `⚠️ ${text}`;

      // 재시도 버튼: 질문 원문은 HTML 속성에 넣지 않고 클릭 핸들러에서 그대로 사용한다
      if (extra.retryText) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn-retry';
        retryBtn.textContent = '다시 시도';
        row.querySelector('.msg-bubble').append(retryBtn);
        retryBtn.addEventListener('click', () => {
          if (isSending || isLoggingOut || isLoadingRoom) return;
          const now = Date.now();
          if (now - lastRetryTime < RETRY_DELAY) {
            showToast('잠시 후 다시 시도해 주세요.', 'warn', 2000);
            return;
          }
          lastRetryTime = now;
          row.remove();
          sendMessage(extra.retryText);
        });
      }
    } else {
      // user
      row.innerHTML = `
        <div class="msg-col">
          <div class="msg-bubble"></div>
          <span class="msg-time">${timeStr}</span>
        </div>`;
      row.querySelector('.msg-bubble').textContent = text;
    }

    msgList.appendChild(row);
    scrollFeed();
    return row;
  }

  function scrollFeed () {
    requestAnimationFrame(() => { chatFeed.scrollTop = chatFeed.scrollHeight; });
  }

  /* ==========================================================================
     로딩 상태 관리
     ========================================================================== */
  function setLoading (on) {
    isSending = on;
    if (typingRow)    typingRow.style.display    = on ? 'flex' : 'none';
    if (btnSend)      btnSend.classList.toggle('is-loading', on);
    if (chatForm)     chatForm.classList.toggle('is-disabled', on);
    if (msgInput)     msgInput.disabled = on;
    if (btnLogout)    btnLogout.disabled = on;
    syncSendButton();

    if (on) {
      setStatus('해피가 생각하는 중이에요...', 'var(--gold)');
      scrollFeed();
    } else {
      setStatus('해피가 귀 기울여 듣고 있어요', '');
      msgInput?.focus();
    }
  }

  /* ==========================================================================
     API 호출
     ========================================================================== */
  async function sendMessage (text) {
    if (!text || isSending || isLoggingOut || isLoadingRoom || !navigator.onLine) return;

    appendMsg(text, 'user');
    setLoading(true);
    const controller = new AbortController();
    let timeout;
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(new DOMException('응답 대기 시간 초과', 'TimeoutError')), SEND_TIMEOUT);
    };
    resetTimeout();
    let botRow = null;
    let streamStatus = null;

    try {
      if (activeRoomId === null) {
        const title = Array.from(text.replace(/\s+/g, ' ')).slice(0, ROOM_TITLE_LEN).join('');
        const res = await fetch('/api/rooms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }), credentials: 'same-origin', signal: controller.signal,
        });
        if (!res.ok) throw await responseError(res);
        const room = await res.json();
        activeRoomId = room.id;
        renderRoom(room, { prepend: true });
        markActiveRoom();
        if (headerTitle) headerTitle.textContent = room.title;
      }

      resetTimeout();
      const response = await fetch(`/api/rooms/${activeRoomId}/messages/stream`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ question: text }), credentials: 'same-origin', signal: controller.signal,
      });
      resetTimeout();
      let answer = '';
      const exchange = await readChatStream(response, text => {
        if (!botRow) {
          botRow = appendMsg('', 'bot');
          botRow.classList.add('is-streaming');
          streamStatus = document.createElement('span');
          streamStatus.className = 'msg-stream-status';
          streamStatus.textContent = '답변을 받는 중…';
          botRow.querySelector('.msg-col').append(streamStatus);
          if (typingRow) typingRow.style.display = 'none';
          setStatus('해피가 답변하는 중이에요...', 'var(--gold)');
        }
        answer += text;
        botRow.querySelector('.msg-bubble').textContent = answer;
        scrollFeed();
      }, resetTimeout);
      if (!botRow) botRow = appendMsg(exchange.answer, 'bot');
      botRow.querySelector('.msg-bubble').textContent = exchange.answer;
      botRow.querySelector('.msg-time').textContent = formatTime(new Date(exchange.created_at));
      botRow.dataset.exchangeId = String(exchange.id);
      botRow.classList.remove('is-streaming');
      streamStatus?.remove();
      scrollFeed();
    } catch (error) {
      if (botRow) {
        botRow.classList.remove('is-streaming');
        botRow.classList.add('msg-row--incomplete');
        streamStatus.textContent = '완료되지 않은 응답';
      }
      let message;
      if (error instanceof APIError) message = error.message;
      else if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        message = '답변 수신이 지연되고 있습니다. 대화 내역을 확인한 뒤 다시 시도해 주세요.';
      } else if (!navigator.onLine) message = '인터넷 연결이 끊겼어요. 연결 확인 후 재시도해 주세요.';
      else message = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
      appendMsg(message, 'error', error.status === 401 ? {} : { retryText: text });
      if (error.status === 401) {
        renderAuthState(null);
        showToast(message, 'warn');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  /* ==========================================================================
     폼 제출 (입력 검증 포함)
     ========================================================================== */
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    // ── 검증 게이트 ──
    const raw  = msgInput?.value ?? '';
    const text = raw.trim();

    // 1) 빈 입력
    if (!text) {
      showInputError('메시지를 입력해 주세요.');
      msgInput?.focus();
      return;
    }

    // 2) 길이 초과
    if (raw.length > MAX_CHARS) {
      showInputError(`최대 ${MAX_CHARS}자까지 입력할 수 있습니다.`);
      return;
    }

    // 3) 오프라인
    if (!navigator.onLine) {
      showToast('인터넷 연결을 확인해 주세요.', 'error');
      return;
    }

    // 4) 중복 전송 방지
    if (isSending || isLoggingOut || isLoadingRoom) return;

    clearInputError();
    msgInput.value = '';
    adjustTextarea();
    syncSendButton();

    sendMessage(text);
  });

  function renderAuthState (user) {
    isLoggedIn = Boolean(user);
    const guestCard = document.getElementById('guestCard');
    const headerAuthArea = document.getElementById('headerAuthArea');
    if (guestCard) guestCard.hidden = isLoggedIn;
    if (headerAuthArea) headerAuthArea.hidden = isLoggedIn;
    if (btnLogout) btnLogout.hidden = !isLoggedIn;
    guestLimitBanner?.classList.remove('is-visible');
  }

  async function syncAuthState () {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.status === 401) renderAuthState(null);
      else {
        if (!res.ok) throw await responseError(res);
        renderAuthState(await res.json());
      }
    } catch (error) {
      showToast(error instanceof APIError ? error.message : '로그인 상태를 확인하지 못했어요.', 'error');
    }
  }

  btnLogout?.addEventListener('click', async () => {
    if (isSending || isLoggingOut) return;
    isLoggingOut = true;
    btnLogout.disabled = true;
    syncSendButton();
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw await responseError(res);
      renderAuthState(null);
      activeRoomId = null;
      roomList?.replaceChildren();
      msgList?.replaceChildren();
      window.location.assign('/auth');
    } catch (error) {
      showToast(error instanceof APIError ? error.message : '로그아웃하지 못했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      isLoggingOut = false;
      btnLogout.disabled = false;
      syncSendButton();
    }
  });

  syncSendButton();
  syncAuthState();
  loadRooms();

})();
