/* ==========================================================================
   Page 1. 온보딩 및 로그인/회원가입 인터랙션 (auth.js)
   - 세그먼트 탭 슬라이딩 전환 (로그인 ↔ 회원가입)
   - 비밀번호 보기/숨기기 토글
   - 폼 유효성 검사 및 마이크로 인터랙션
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const tabSegment = document.querySelector('.auth-tab-segment');
  
  const authTitle = document.getElementById('authTitle');
  const authDesc = document.getElementById('authDesc');
  const authForm = document.getElementById('authForm');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const btnText = authSubmitBtn.querySelector('.btn-text');
  
  const nameGroup = document.getElementById('nameGroup');
  const nameInput = document.getElementById('userName');
  
  const togglePwBtn = document.getElementById('togglePwBtn');
  const passwordInput = document.getElementById('userPassword');

  let currentMode = 'login'; // 'login' | 'register'

  // --- 1. 탭 전환 처리 ---
  function switchMode(mode) {
    currentMode = mode;

    if (mode === 'register') {
      tabSegment.classList.add('register-active');
      tabRegisterBtn.classList.add('active');
      tabLoginBtn.classList.remove('active');
      tabRegisterBtn.setAttribute('aria-selected', 'true');
      tabLoginBtn.setAttribute('aria-selected', 'false');

      // 텍스트 & 액션 변경
      authTitle.textContent = '회원가입';
      authDesc.textContent = '해피와 함께 매일 긍정 습관을 시작해보세요 🌱';
      btnText.textContent = '가입하고 시작하기';
      authForm.action = '/register';

      // 이름 입력 필드 부드럽게 노출
      nameGroup.style.display = 'flex';
      nameInput.required = true;
      nameInput.focus();
    } else {
      tabSegment.classList.remove('register-active');
      tabLoginBtn.classList.add('active');
      tabRegisterBtn.classList.remove('active');
      tabLoginBtn.setAttribute('aria-selected', 'true');
      tabRegisterBtn.setAttribute('aria-selected', 'false');

      // 텍스트 & 액션 변경
      authTitle.textContent = '로그인';
      authDesc.textContent = '해피와 나눈 소중한 대화를 이어가보세요.';
      btnText.textContent = '로그인하기';
      authForm.action = '/login';

      // 이름 필드 숨김
      nameGroup.style.display = 'none';
      nameInput.required = false;
    }
  }

  tabLoginBtn.addEventListener('click', () => switchMode('login'));
  tabRegisterBtn.addEventListener('click', () => switchMode('register'));

  // --- 2. 비밀번호 표시/숨김 토글 ---
  togglePwBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    
    togglePwBtn.innerHTML = isPassword
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
           <line x1="1" y1="1" x2="23" y2="23"></line>
         </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
           <circle cx="12" cy="12" r="3"/>
         </svg>`;
  });

  // --- 3. 폼 제출 시 인터랙션 (서브밋 애니메이션) ---
  authForm.addEventListener('submit', (e) => {
    authSubmitBtn.disabled = true;
    authSubmitBtn.style.opacity = '0.85';
    btnText.textContent = currentMode === 'login' ? '로그인 중...' : '가입 처리 중...';
  });
});
