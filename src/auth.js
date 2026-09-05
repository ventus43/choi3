// 백오피스 공통 비밀번호 게이트 + 세션 만료(기본 30분).
// 로그인 시 백엔드(POST /auth/login)에서 서명된 토큰을 받아 저장하고,
// 매 API 요청에 헤더(X-Office-Auth)로 실어 보냅니다.
// 백엔드는 토큰 서명과 발급 후 경과시간(SESSION_TTL)을 검사 — 만료되면 401.
// 프론트도 저장해둔 만료시각을 보고, 만료됐으면 곧바로 로그인 화면으로 돌립니다.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'choi3_office_token';
const EXP_KEY   = 'choi3_office_exp';     // 클라이언트측 만료시각(ms) — 화면 잠금용
const FALLBACK_TTL = 1800;               // 백엔드가 ttl 을 안 주면 쓸 기본값(초)

let expiryTimer = null;

/* api.js 에서 매 요청에 실어 보낼 토큰 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

/* 백엔드가 401(토큰 만료/위조/누락)을 주거나, 클라이언트 만료시각이 지났을 때 호출 */
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXP_KEY);
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
}

function storeSession(token, ttlSec) {
  const ttl = Number(ttlSec) > 0 ? Number(ttlSec) : FALLBACK_TTL;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXP_KEY, String(Date.now() + ttl * 1000));
}

/* 토큰이 있고, 저장된 만료시각이 아직 안 지났으면 true */
function isAuthed() {
  if (!getAuthToken()) return false;
  const exp = Number(localStorage.getItem(EXP_KEY) || 0);
  if (!exp || Date.now() >= exp) {
    clearAuth();
    return false;
  }
  return true;
}

/* 만료시각에 맞춰 자동 로그아웃(탭을 열어둔 채 방치한 경우 대비) */
function scheduleExpiry() {
  const exp = Number(localStorage.getItem(EXP_KEY) || 0);
  if (!exp) return;
  const ms = exp - Date.now();
  if (expiryTimer) clearTimeout(expiryTimer);
  if (ms <= 0) { clearAuth(); location.reload(); return; }
  expiryTimer = setTimeout(() => {
    clearAuth();
    location.reload();
  }, ms);
}

async function login(password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    let message = '비밀번호가 올바르지 않습니다.';
    try { const b = await res.json(); if (b?.message) message = b.message; } catch (_) {}
    throw new Error(message);
  }
  const { token, ttl } = await res.json();
  storeSession(token, ttl);
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

  const showError = (msg) => {
    error.textContent = msg;
    error.classList.add('show');
    input.value = '';
    input.focus();
  };

  const tryLogin = async () => {
    const pw = input.value;
    if (!pw) return;
    submit.disabled = true;
    try {
      await login(pw);
      location.reload();
    } catch (err) {
      showError(err.message || '로그인에 실패했습니다.');
      submit.disabled = false;
    }
  };

  submit.addEventListener('click', tryLogin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  input.focus();
}

/* 인증돼 있으면 true(그대로 앱 실행), 아니면 비밀번호 입력창을 띄우고 false 반환 */
export function ensureAuth() {
  if (isAuthed()) {
    scheduleExpiry();
    return true;
  }
  renderGate();
  return false;
}
