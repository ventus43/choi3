import { meetingApi, outreachApi } from '../core/api.js';
import { effectiveMeetingStatus } from '../core/meeting-status.js';
import { todayIso } from '../core/date.js';

export const TEMPLATE = `
  <div class="panel-head"><div><h2>운영 대시보드</h2><p>주차 기준은 일요일~토요일입니다. 최근 4주 추이와 이번 주 구역별 상태를 확인합니다.</p></div><button type="button" class="btn btn-ghost btn-sm" id="dashboard-refresh">현황 새로고침</button></div>
  <div class="dashboard-surface" id="dashboard-surface">
    <div id="dashboard-content" aria-live="polite"><div class="loading">현황을 불러오는 중…</div></div>
    <div class="dashboard-blind" id="dashboard-blind"><form class="dashboard-unlock" id="dashboard-unlock-form"><strong>대시보드 보기</strong><span>비밀번호를 입력하면 현황이 표시됩니다.</span><label for="dashboard-password">비밀번호</label><input id="dashboard-password" type="password" autocomplete="off" inputmode="text"><p id="dashboard-unlock-error" role="alert"></p><button type="submit" class="btn btn-primary">내용 보기</button></form></div>
  </div>`;

const UNLOCK_KEY = 'choi3_dashboard_unlocked';
const els = {};

function localIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function weekStart(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  return localIso(date);
}
function weekEnd(weekStartIso) {
  const date = new Date(`${weekStartIso}T12:00:00`);
  date.setDate(date.getDate() + 6);
  return localIso(date);
}
function previousWeek(weekStartIso, weeksAgo) {
  const date = new Date(`${weekStartIso}T12:00:00`);
  date.setDate(date.getDate() - weeksAgo * 7);
  return localIso(date);
}
function blankCounts() { return { select: 0, confirm: 0, cancel: 0 }; }

function render({ outreach, meetings }) {
  const active = outreach.filter((p) => p.prg !== '중단');
  const currentWeek = weekStart(todayIso());
  const weeklyStarts = [3, 2, 1, 0].map((weeksAgo) => previousWeek(currentWeek, weeksAgo));
  const weekly = new Map(weeklyStarts.map((start) => [start, blankCounts()]));
  const byZone = new Map();
  let undatedSelect = 0;
  meetings.forEach((m) => {
    const status = effectiveMeetingStatus(m);
    if (!m.meetDt) { if (status === 'select') undatedSelect++; return; }
    const start = weekStart(m.meetDt);
    if (weekly.has(start)) weekly.get(start)[status]++;
    if (start !== currentWeek) return;
    const zone = m.zone || '미지정';
    if (!byZone.has(zone)) byZone.set(zone, { select: 0, confirm: 0, cancel: 0 });
    byZone.get(zone)[status]++;
  });
  const current = weekly.get(currentWeek);
  const zones = [...byZone.keys()].sort((a, b) => Number(a) - Number(b));
  els.content.innerHTML = `<div class="dashboard-stats">
    <div class="dashboard-stat"><span>활성 섭외자</span><strong>${active.length}</strong></div><div class="dashboard-stat pending"><span>이번 주 선택</span><strong>${current.select}</strong></div><div class="dashboard-stat success"><span>이번 주 만남</span><strong>${current.confirm}</strong></div><div class="dashboard-stat"><span>날짜 미정 선택</span><strong>${undatedSelect}</strong></div>
  </div><section class="dashboard-week-section"><h3>최근 4주 추이</h3><p>일요일~토요일 기준 · 선택 / 만남 / 취소</p><div class="dashboard-week-grid">${weeklyStarts.map((start) => { const s = weekly.get(start); return `<article class="dashboard-week${start === currentWeek ? ' current' : ''}"><time>${start.slice(5).replace('-', '.')}–${weekEnd(start).slice(5).replace('-', '.')}</time><dl><div><dt>선택</dt><dd>${s.select}</dd></div><div><dt>만남</dt><dd>${s.confirm}</dd></div><div><dt>취소</dt><dd>${s.cancel}</dd></div></dl></article>`; }).join('')}</div></section><section class="dashboard-zone-section"><h3>이번 주 구역별 만남 상태</h3><p>${currentWeek.slice(5).replace('-', '.')}–${weekEnd(currentWeek).slice(5).replace('-', '.')}</p><div class="dashboard-zone-grid">${zones.length ? zones.map((zone) => { const s = byZone.get(zone); return `<article class="dashboard-zone"><h4>${zone}구역</h4><dl><div><dt>선택</dt><dd>${s.select}</dd></div><div><dt>만남</dt><dd>${s.confirm}</dd></div><div><dt>취소</dt><dd>${s.cancel}</dd></div></dl></article>`; }).join('') : '<div class="empty">이번 주에 표시할 만남 일정이 없습니다.</div>'}</div></section>`;
}

async function load() {
  els.content.innerHTML = '<div class="loading">현황을 불러오는 중…</div>';
  try {
    const [outreach, meetings] = await Promise.all([outreachApi.list(), meetingApi.schedule()]);
    render({ outreach, meetings });
  } catch (error) {
    els.content.innerHTML = `<div class="error-banner">현황을 불러오지 못했습니다. (${error.message})</div>`;
  }
}

export async function initDashboardTab() {
  els.content = document.getElementById('dashboard-content');
  const blind = document.getElementById('dashboard-blind');
  const form = document.getElementById('dashboard-unlock-form');
  const input = document.getElementById('dashboard-password');
  const error = document.getElementById('dashboard-unlock-error');
  if (sessionStorage.getItem(UNLOCK_KEY) === 'yes') blind.hidden = true;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value !== 'wjseh') { error.textContent = '비밀번호를 다시 확인해 주세요.'; input.select(); return; }
    sessionStorage.setItem(UNLOCK_KEY, 'yes');
    blind.hidden = true;
  });
  document.getElementById('dashboard-refresh').addEventListener('click', load);
  await load();
}

export async function reloadDashboard() { if (els.content) await load(); }
