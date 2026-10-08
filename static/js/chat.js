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
  const GUEST_LIMIT    = 5;    // 게스트 최대 대화 횟수
  const RETRY_DELAY    = 1200; // 재시도 최소 간격(ms)

  /* ==========================================================================
     DOM 참조
     ========================================================================== */
  const layout          = document.getElementById('chatLayout');
  const sidebar         = document.getElementById('sidebar');
  const backdrop        = document.getElementById('sidebarBackdrop');
  const btnToggle       = document.getElementById('btnToggle');
  const sidebarClose    = document.getElementById('sidebarClose');
  const btnNewChat      = document.getElementById('btnNewChat');
  const offlineBanner   = document.getElementById('offlineBanner');
  const guestLimitBanner= document.getElementById('guestLimitBanner');
  const chatFeed        = document.getElementById('chatFeed');
  const feedInner       = document.getElementById('feedInner');
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

  /* ==========================================================================
     상태
     ========================================================================== */
  let isSending    = false;
  let isCollapsed  = false;
  let guestCount   = parseInt(sessionStorage.getItem('happi_guest_count') || '0', 10);
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
    el.innerHTML = `<span>${icons[type] ?? '💬'}</span><span>${msg}</span>`;
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
     채팅 목록 인터랙션
     ========================================================================== */
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.item-actions')) return;
      document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('is-active'));
      item.classList.add('is-active');
      const title = item.querySelector('.chat-title')?.textContent;
      if (headerTitle && title) headerTitle.textContent = title;
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  document.querySelectorAll('.btn-item-act').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { action } = btn.dataset;
      const item = btn.closest('.chat-item');
      if (action === 'fav') {
        btn.classList.toggle('fav-on');
        btn.title = btn.classList.contains('fav-on') ? '즐겨찾기 해제' : '즐겨찾기';
      } else if (action === 'delete') {
        item.style.transition = 'all 0.22s ease';
        item.style.opacity = '0';
        item.style.height  = item.offsetHeight + 'px';
        setTimeout(() => {
          item.style.height  = '0';
          item.style.padding = '0';
          item.style.overflow = 'hidden';
          setTimeout(() => item.remove(), 200);
        }, 120);
      }
    });
  });

  /* 새 대화 */
  btnNewChat?.addEventListener('click', () => {
    document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('is-active'));
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
    btnSend.disabled = trimmed.length === 0 || isSending || !navigator.onLine;
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
    if (e.key === 'Enter' && !e.shiftKey) {
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
  const nowStr = () => {
    const d = new Date();
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `오${h < 12 ? '전' : '후'} ${h < 13 ? h : h - 12}:${m}`;
  };

  const escHtml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

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

    const timeStr = nowStr();

    if (role === 'bot') {
      row.innerHTML = `
        <div class="msg-av">${botAvatarSVG}</div>
        <div class="msg-col">
          <span class="msg-sender">해피</span>
          <div class="msg-bubble">${escHtml(text)}</div>
          <span class="msg-time">${timeStr}</span>
        </div>`;
    } else if (role === 'error') {
      const retryData = extra.retryText ? `data-retry="${escHtml(extra.retryText)}"` : '';
      row.innerHTML = `
        <div class="msg-av">${botAvatarSVG}</div>
        <div class="msg-col">
          <div class="msg-bubble">
            <span>⚠️ ${escHtml(text)}</span>
            ${retryData ? `<button class="btn-retry" ${retryData}>다시 시도</button>` : ''}
          </div>
        </div>`;

      // 재시도 버튼 이벤트
      const retryBtn = row.querySelector('.btn-retry');
      retryBtn?.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastRetryTime < RETRY_DELAY) {
          showToast('잠시 후 다시 시도해 주세요.', 'warn', 2000);
          return;
        }
        lastRetryTime = now;
        row.remove();
        sendMessage(retryBtn.dataset.retry);
      });
    } else {
      // user
      row.innerHTML = `
        <div class="msg-col">
          <div class="msg-bubble">${escHtml(text)}</div>
          <span class="msg-time">${timeStr}</span>
        </div>`;
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

    if (on) {
      setStatus('해피가 생각하는 중이에요...', 'var(--gold)');
      scrollFeed();
    } else {
      setStatus('해피가 귀 기울여 듣고 있어요', '');
      syncSendButton();
      msgInput?.focus();
    }
  }

  /* ==========================================================================
     API 호출
     ========================================================================== */
  async function sendMessage (text) {
    if (!text || isSending || !navigator.onLine) return;

    appendMsg(text, 'user');
    setLoading(true);

    // 게스트 카운터 증가
    guestCount++;
    sessionStorage.setItem('happi_guest_count', String(guestCount));

    // 게스트 제한 배너 표시
    if (guestLimitBanner && guestCount >= GUEST_LIMIT) {
      guestLimitBanner.classList.add('is-visible');
    }

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text }),
        signal:  AbortSignal.timeout(30_000), // 30초 타임아웃
      });

      if (!res.ok) {
        // HTTP 오류 상태
        if (res.status === 401) {
          // 비로그인 → 로그인 유도
          appendMsg(
            '로그인이 필요한 기능이에요. 로그인 후 이용해 주세요.',
            'error',
            {}
          );
          showToast('로그인이 필요합니다.', 'warn');
        } else if (res.status === 429) {
          appendMsg('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'error', { retryText: text });
          showToast('잠시 후 다시 시도해 주세요.', 'warn');
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
        return;
      }

      const data = await res.json();
      const reply = data?.reply
        ?? '잠깐 생각이 많아졌어요 😅 다시 이야기해 줄게요!';
      appendMsg(reply, 'bot');

    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        appendMsg('응답 시간이 너무 걸렸어요. 다시 시도해 주세요.', 'error', { retryText: text });
        showToast('응답 시간 초과. 재시도를 눌러주세요.', 'error');
      } else if (!navigator.onLine) {
        appendMsg('인터넷 연결이 끊겼어요. 연결 확인 후 재시도해 주세요.', 'error', { retryText: text });
      } else {
        appendMsg('일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error', { retryText: text });
        showToast('오류가 발생했습니다.', 'error');
      }
    } finally {
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
    if (isSending) return;

    clearInputError();
    msgInput.value = '';
    adjustTextarea();
    syncSendButton();

    sendMessage(text);
  });

  /* ==========================================================================
     auth.js 입력 검증
     ========================================================================== */
  const togglePw = document.getElementById('togglePw');
  const pwInput  = document.getElementById('userPw');

  if (togglePw && pwInput) {
    togglePw.addEventListener('click', () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      togglePw.style.color = show ? 'var(--gold)' : '';
    });
  }

  /* 초기 상태 동기화 */
  syncSendButton();

})();
