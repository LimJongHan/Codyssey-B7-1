/* ==========================================================================
   채팅 페이지 — 사이드바 토글, 메시지 전송, UI 인터랙션
   ========================================================================== */

;(function () {
  'use strict';

  /* ── 요소 참조 ── */
  const layout       = document.getElementById('chatLayout');
  const sidebar      = document.getElementById('sidebar');
  const backdrop     = document.getElementById('sidebarBackdrop');
  const btnToggle    = document.getElementById('btnToggle');
  const sidebarClose = document.getElementById('sidebarClose');
  const btnNewChat   = document.getElementById('btnNewChat');
  const chatForm     = document.getElementById('chatForm');
  const msgInput     = document.getElementById('msgInput');
  const btnSend      = document.getElementById('btnSend');
  const msgList      = document.getElementById('msgList');
  const typingRow    = document.getElementById('typingRow');
  const welcomeBanner= document.getElementById('welcomeBanner');
  const chatFeed     = document.getElementById('chatFeed');

  /* ==========================================================================
     사이드바 토글
     ========================================================================== */
  let isCollapsed = false;

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
    if (window.innerWidth <= 768) {
      layout.classList.contains('sidebar-open') ? closeSidebar() : openSidebar();
    } else {
      isCollapsed ? openSidebar() : closeSidebar();
    }
  });

  sidebarClose?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);

  /* ==========================================================================
     채팅 아이템 클릭
     ========================================================================== */
  document.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.item-actions')) return;

      document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('is-active'));
      item.classList.add('is-active');

      const title = item.querySelector('.chat-title')?.textContent;
      const headerTitle = document.getElementById('headerTitle');
      if (headerTitle && title) headerTitle.textContent = title;

      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  /* 즐겨찾기 / 삭제 액션 */
  document.querySelectorAll('.btn-item-act').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const item   = btn.closest('.chat-item');

      if (action === 'fav') {
        btn.classList.toggle('fav-on');
        const isFav = btn.classList.contains('fav-on');
        btn.title = isFav ? '즐겨찾기 해제' : '즐겨찾기';
      } else if (action === 'delete') {
        item.style.transition = 'all 0.2s ease';
        item.style.opacity = '0';
        item.style.height  = item.offsetHeight + 'px';
        setTimeout(() => {
          item.style.height  = '0';
          item.style.padding = '0';
          item.style.overflow = 'hidden';
          setTimeout(() => item.remove(), 180);
        }, 120);
      }
    });
  });

  /* 새 대화 */
  btnNewChat?.addEventListener('click', () => {
    document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('is-active'));
    msgList.innerHTML = '';
    if (welcomeBanner) welcomeBanner.style.display = '';
    msgInput?.focus();
    if (window.innerWidth <= 768) closeSidebar();
  });

  /* ==========================================================================
     퀵 칩 (예시 메시지 자동 입력)
     ========================================================================== */
  document.querySelectorAll('.q-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt && msgInput) {
        msgInput.value = prompt;
        adjustTextarea();
        btnSend.disabled = false;
        msgInput.focus();
      }
    });
  });

  /* ==========================================================================
     텍스트에리어 자동 높이
     ========================================================================== */
  function adjustTextarea () {
    if (!msgInput) return;
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 140) + 'px';
    btnSend.disabled = msgInput.value.trim().length === 0;
  }

  msgInput?.addEventListener('input', adjustTextarea);

  /* Enter 전송 (Shift+Enter = 줄바꿈) */
  msgInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) chatForm.requestSubmit();
    }
  });

  /* 감정 태그 클릭 */
  document.querySelectorAll('.btn-emotion').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.e;
      if (msgInput) {
        const val = msgInput.value.trim();
        msgInput.value = val ? `[${tag}] ${val}` : `[${tag}] `;
        adjustTextarea();
        msgInput.focus();
        btnSend.disabled = false;
      }
    });
  });

  /* ==========================================================================
     메시지 전송 & 봇 응답
     ========================================================================== */
  const now = () => {
    const d = new Date();
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `오${h < 12 ? '전' : '후'} ${h < 13 ? h : h - 12}:${m}`;
  };

  function appendMsg (text, role) {
    if (welcomeBanner) welcomeBanner.style.display = 'none';

    const row = document.createElement('div');
    row.className = `msg-row msg-row--${role}`;

    const timeStr = now();

    if (role === 'bot') {
      row.innerHTML = `
        <div class="msg-av">
          <div class="happi happi--sm happi--listening" data-happi>
            <div class="happi__aura"></div>
            <div class="happi__body">
              <svg class="happi__svg" viewBox="0 0 200 200" fill="none"
                   xmlns="http://www.w3.org/2000/svg" overflow="visible">
                <defs>
                  <radialGradient id="hbjs" cx="38%" cy="28%" r="72%">
                    <stop offset="0%" stop-color="#FFD966"/>
                    <stop offset="42%" stop-color="#FFA800"/>
                    <stop offset="78%" stop-color="#E07800"/>
                    <stop offset="100%" stop-color="#BF5C00"/>
                  </radialGradient>
                  <radialGradient id="hsjs" cx="36%" cy="22%" r="45%">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.72"/>
                    <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
                  </radialGradient>
                  <filter id="hshjs" x="-20%" y="-10%" width="150%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="14"
                      flood-color="#FF7A00" flood-opacity="0.30"/>
                  </filter>
                </defs>
                <g filter="url(#hshjs)">
                  <path fill="url(#hbjs)"
                    d="M100 16C138 16 172 42 178 80C184 118 166 152 138 168C118 180 82 180
                       62 168C34 152 16 118 22 80C28 42 62 16 100 16Z"/>
                </g>
                <ellipse fill="url(#hsjs)" cx="82" cy="54" rx="34" ry="22" transform="rotate(-18 82 54)"/>
                <g class="happi__eyes">
                  <g class="happi__eye happi__eye--l">
                    <ellipse cx="74" cy="96" rx="12" ry="14" fill="#1A1C22"/>
                    <circle cx="69" cy="90" r="2" fill="#FFFFFF"/>
                  </g>
                  <g class="happi__eye happi__eye--r">
                    <ellipse cx="126" cy="96" rx="12" ry="14" fill="#1A1C22"/>
                    <circle cx="121" cy="90" r="2" fill="#FFFFFF"/>
                  </g>
                </g>
                <path class="happi__mouth--smile"
                  d="M78 130 Q100 152 122 130"
                  stroke="#1A1C22" stroke-width="4" stroke-linecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="msg-col">
          <span class="msg-sender">해피</span>
          <div class="msg-bubble">${escHtml(text)}</div>
          <span class="msg-time">${timeStr}</span>
        </div>`;
    } else {
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

  function escHtml (str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;')
              .replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  function scrollFeed () {
    requestAnimationFrame(() => {
      chatFeed.scrollTop = chatFeed.scrollHeight;
    });
  }

  /* 타이핑 표시 */
  function showTyping () {
    if (typingRow) {
      typingRow.style.display = 'flex';
      scrollFeed();
    }
  }
  function hideTyping () {
    if (typingRow) typingRow.style.display = 'none';
  }

  /* 폼 제출 */
  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;

    appendMsg(text, 'user');
    msgInput.value = '';
    adjustTextarea();
    btnSend.disabled = true;

    showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = res.ok ? await res.json() : null;
      hideTyping();

      const reply = data?.reply
        ?? '잠깐 생각이 많아졌어요 😅 조금 있다가 다시 이야기해 줄게요!';
      appendMsg(reply, 'bot');
    } catch {
      hideTyping();
      appendMsg('잠시 연결이 끊긴 것 같아요. 다시 시도해 볼게요 🌿', 'bot');
    }
  });

})();
