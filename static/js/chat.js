/* ==========================================================================
   Page 2. 메인 채팅 및 사이드바 아카이브 인터랙션 (chat.js)
   - 사이드바 열기/닫기 (데스크톱 콜랩스 & 모바일 드로어)
   - 즐겨찾기(Favorites) 토글 및 대화 히스토리 관리
   - 퀵 프롬프트 칩 및 긍정 응답 시뮬레이션
   - 자동 줄바꿈 textarea 및 스크롤 핸들링
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const chatAppLayout = document.getElementById('chatAppLayout');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  
  const chatMessagesContainer = document.getElementById('chatMessagesContainer');
  const messageFeed = document.getElementById('messageFeed');
  const chatWelcomeBanner = document.getElementById('chatWelcomeBanner');
  const typingIndicator = document.getElementById('typingIndicator');
  
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  
  const newChatBtn = document.getElementById('newChatBtn');
  const currentChatTitle = document.getElementById('currentChatTitle');
  const favoritesList = document.getElementById('favoritesList');
  const favCount = document.getElementById('favCount');

  // --- 1. 사이드바 열기 / 닫기 토글 ---
  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      chatAppLayout.classList.toggle('sidebar-mobile-open');
    } else {
      chatAppLayout.classList.toggle('sidebar-collapsed');
    }
  }

  function closeMobileSidebar() {
    chatAppLayout.classList.remove('sidebar-mobile-open');
  }

  sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  // --- 2. 입력창 자동 높이 조절 & 전송 버튼 제어 ---
  function updateInputState() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + 'px';
    sendBtn.disabled = messageInput.value.trim().length === 0;
  }

  messageInput.addEventListener('input', updateInputState);

  // Enter 전송 (Shift+Enter는 줄바꿈)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        chatForm.dispatchEvent(new Event('submit'));
      }
    }
  });

  // 감정 태그 클릭 시 텍스트 접두어 추가
  document.querySelectorAll('.btn-emotion-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = btn.dataset.emotion;
      messageInput.value = `[오늘의 기분: ${emotion}] ` + messageInput.value;
      messageInput.focus();
      updateInputState();
    });
  });

  // --- 3. 퀵 프롬프트 칩 클릭 시 즉시 전송 ---
  document.querySelectorAll('.quick-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      sendMessage(prompt);
    });
  });

  // --- 4. 메시지 전송 및 봇 응답 처리 ---
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    sendMessage(text);
  });

  function scrollToBottom() {
    chatMessagesContainer.scrollTo({
      top: chatMessagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  }

  function getCurrentTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? '오후' : '오전';
    const displayHours = hours % 12 || 12;
    return `${period} ${displayHours}:${minutes}`;
  }

  function sendMessage(userText) {
    // 웰컴 배너 축소/숨김
    if (chatWelcomeBanner) {
      chatWelcomeBanner.style.display = 'none';
    }

    // 1) 유저 메시지 렌더링
    const userRow = document.createElement('div');
    userRow.className = 'msg-row msg-user';
    userRow.innerHTML = `
      <div class="msg-content-col">
        <div class="msg-bubble-card">${escapeHtml(userText)}</div>
        <span class="msg-time-stamp">${getCurrentTime()}</span>
      </div>
    `;
    messageFeed.appendChild(userRow);

    // 입력창 리셋
    messageInput.value = '';
    updateInputState();
    scrollToBottom();

    // 2) 봇 타이핑 인디케이터 표시
    typingIndicator.style.display = 'flex';
    scrollToBottom();

    // 3) 긍정봇 해피의 따뜻한 응답 생성 (1.1초 딜레이)
    setTimeout(() => {
      typingIndicator.style.display = 'none';
      const botResponse = generatePositiveResponse(userText);
      
      const botRow = document.createElement('div');
      botRow.className = 'msg-row msg-bot';
      botRow.innerHTML = `
        <div class="msg-avatar-col">
          <div class="happi-character-wrapper happi-size-sm happi-mood-cheering">
            <div class="happi-aura-glow"></div>
            <div class="happi-mascot-container">
              <svg class="happi-svg" viewBox="0 0 160 160" fill="none">
                <path d="M80 18C44 18 20 45 20 84C20 120 46 142 80 142C114 142 140 120 140 84C140 45 116 18 80 18Z" fill="#FFB300" />
                <ellipse cx="54" cy="78" rx="8" ry="10" fill="#263238" />
                <ellipse cx="106" cy="78" rx="8" ry="10" fill="#263238" />
                <path d="M70 94C73 103 87 103 90 94" stroke="#263238" stroke-width="4.5" stroke-linecap="round" fill="#FF5252" />
                <ellipse cx="42" cy="95" rx="10" ry="6" fill="#FF5252" fill-opacity="0.32" />
                <ellipse cx="118" cy="95" rx="10" ry="6" fill="#FF5252" fill-opacity="0.32" />
              </svg>
            </div>
          </div>
        </div>
        <div class="msg-content-col">
          <div class="msg-sender-name">해피</div>
          <div class="msg-bubble-card">${botResponse}</div>
          <span class="msg-time-stamp">${getCurrentTime()}</span>
        </div>
      `;
      messageFeed.appendChild(botRow);
      scrollToBottom();
    }, 1100);
  }

  // 긍정봇 특화 응답 생성 엔진
  function generatePositiveResponse(text) {
    if (text.includes('칭찬') || text.includes('수고')) {
      return `오늘 하루 그 힘든 과정들을 묵묵히 버텨내신 것만으로도 정말 대단해요! 👏<br>
              남들은 모르는 당신만의 노력과 정성을 해피는 온전히 알고 있어요. 오늘 밤은 스스로에게 <strong>"참 잘 해냈어, 고마워"</strong>라고 다정하게 말해주세요. 당신은 최고의 하루를 보냈습니다! 💛`;
    }
    if (text.includes('불안') || text.includes('지치') || text.includes('힘들')) {
      return `마음이 많이 버겁고 지치셨군요. 토닥토닥... 🌿<br>
              잠시 숨을 깊게 들이쉬고 내쉬어 보세요. 힘든 감정이 드는 건 결코 당신이 부족해서가 아니에요. 잘 해내고 싶다는 마음이 그만큼 컸기 때문입니다.<br>
              언제나 제가 곁에서 당신을 믿고 응원할게요. 천천히 가도 괜찮아요!`;
    }
    if (text.includes('확언') || text.includes('힘')) {
      return `내일을 환하게 밝혀줄 <strong>오늘의 긍정 확언 3가지</strong>를 선물해 드릴게요! ✨<br><br>
              1. <em>"나는 생각보다 훨씬 강하고 지혜로운 사람이다."</em><br>
              2. <em>"어떤 상황에서도 나는 나만의 빛을 잃지 않는다."</em><br>
              3. <em>"내일은 오늘보다 더 좋은 일들이 나를 기다리고 있다."</em><br><br>
              가슴에 손을 얹고 세 번만 소리 내어 읽어보세요. 긍정의 기운이 솟아날 거예요! ☀️`;
    }
    return `당신의 솔직한 이야기를 들려주셔서 고마워요. 😊<br>
            어떤 순간에도 잊지 마세요. 당신은 이미 충분히 빛나는 존재이고, 모든 한 걸음 한 걸음이 소중한 의미를 품고 있습니다.<br>
            제가 늘 온 마음을 다해 당신 편이 되어드릴게요! 또 나누고 싶은 생각이 있다면 무엇이든 말씀해 주세요 🌿`;
  }

  function escapeHtml(string) {
    const div = document.createElement('div');
    div.textContent = string;
    return div.innerHTML;
  }

  // --- 5. 새 대화 시작 버튼 ---
  newChatBtn.addEventListener('click', () => {
    messageFeed.innerHTML = '';
    if (chatWelcomeBanner) {
      chatWelcomeBanner.style.display = 'block';
    }
    currentChatTitle.textContent = '새로운 긍정 대화 ✨';
    messageInput.value = '';
    updateInputState();
  });

  // --- 6. 즐겨찾기(Favorites) 토글 및 사이드바 상호작용 ---
  document.addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      e.stopPropagation();
      const chatItem = favBtn.closest('.chat-item');
      const isFav = favBtn.classList.toggle('fav-active');
      const svg = favBtn.querySelector('svg');

      if (isFav) {
        svg.setAttribute('fill', '#FFB300');
        svg.setAttribute('stroke', '#FF9800');
        // 즐겨찾기 섹션으로 복제 이동
        const clone = chatItem.cloneNode(true);
        favoritesList.appendChild(clone);
      } else {
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        // 즐겨찾기 목록에서 제거
        const itemId = chatItem.dataset.chatId;
        const inFav = favoritesList.querySelector(`[data-chat-id="${itemId}"]`);
        if (inFav) inFav.remove();
      }
      favCount.textContent = favoritesList.querySelectorAll('.chat-item').length;
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete-chat"]');
    if (deleteBtn) {
      e.stopPropagation();
      const chatItem = deleteBtn.closest('.chat-item');
      chatItem.style.opacity = '0';
      chatItem.style.transform = 'scale(0.95)';
      setTimeout(() => chatItem.remove(), 200);
      return;
    }

    // 대화 항목 클릭 시 활성화
    const chatItem = e.target.closest('.chat-item');
    if (chatItem) {
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      chatItem.classList.add('active');
      const title = chatItem.querySelector('.chat-item-title').textContent;
      currentChatTitle.textContent = title;
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    }
  });
});
