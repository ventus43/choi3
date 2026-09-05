// 백오피스 공통 비밀번호 게이트.
// 입력한 비밀번호를 저장해두고 매 API 요청에 헤더(X-Office-Auth)로 실어 보내서,
// 백엔드(local-api/server.py)가 요청마다 실제로 검사합니다 — 화면만 가리는 잠금이 아님.

const STORAGE_KEY = 'choi3_office_pw';
const PASSWORD = 'choi3';

/* api.js 에서 매 요청에 실어 보낼 값 */
export function getAuthToken() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

/* 백엔드가 401을 주면(비밀번호 틀림/누락) 저장값을 지워서 다시 로그인하게 함 */
export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

function isAuthed() {
  return getAuthToken() === PASSWORD;
}

function renderGate() {
  const overlay = document.createElement('div');
  overlay.id = 'auth-gate';
  overlay.innerHTML = `
    <div class="auth-box">
      <div class="auth-title">관리시스템</div>
      <p class="auth-sub">비밀번호를 입력해 주세요.</p>
      <input type="password" id="auth-pw" placeholder="비밀번호" autocomplete="off">
      <div class="auth-error" id="auth-error">비밀번호가 올바르지 않습니다.</div>
      <button type="button" id="auth-submit" class="btn btn-primary">확인</button>
    </div>`;
  document.body.appendChild(overlay);

  const input  = overlay.querySelector('#auth-pw');
  const error  = overlay.querySelector('#auth-error');
  const submit = overlay.querySelector('#auth-submit');

  const tryLogin = () => {
    if (input.value === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, PASSWORD);
      location.reload();
      return;
    }
    error.classList.add('show');
    input.value = '';
    input.focus();
  };

  submit.addEventListener('click', tryLogin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  input.focus();
}

/* 인증돼 있으면 true(그대로 앱 실행), 아니면 비밀번호 입력창을 띄우고 false 반환 */
export function ensureAuth() {
  if (isAuthed()) return true;
  renderGate();
  return false;
}
