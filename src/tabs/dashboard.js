import { meetingApi, outreachApi } from '../core/api.js';
import { effectiveMeetingStatus } from '../core/meeting-status.js';
import { todayIso } from '../core/date.js';

export const TEMPLATE = `
  <div class="panel-head"><div><h2>운영 대시보드</h2><p>주차 기준은 일요일~토요일입니다.</p></div><button type="button" class="btn btn-ghost btn-sm" id="dashboard-refresh">현황 새로고침</button></div>
  <div class="dashboard-surface" id="dashboard-surface">
    <div id="dashboard-content" aria-live="polite"><div class="loading">현황을 불러오는 중…</div></div>
  </div>`;

const els = {};

// 진행(S0~S6) 단계 — '장기'는 별도 보류 상태라 이 순서에 포함하지 않음(퍼널 전환 계산에서 자동 제외됨)
const STAGE_ORDER = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const WEEKLY_STATUS_LIST = ['S2', 'S3', 'S4'];

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
function mdLabel(iso) {
  return iso.slice(5).replace('-', '.');
}
function stageIndex(status) {
  return STAGE_ORDER.indexOf(status);
}
/* 직전 단계 대비 전환율(%, 소수 1자리). 분모 0이면 0으로 표시. */
function pct(count, base) {
  return base > 0 ? Math.round((count / base) * 1000) / 10 : 0;
}

function render({ outreach, meetings }) {
  const active = outreach.filter((p) => p.prg !== '중단');
  const today = todayIso();
  const currentWeek = weekStart(today);
  const weekEndIso = weekEnd(currentWeek);

  /* ── 최상단: 오늘 ── */
  const todayHireCount = active.filter((p) => p.regDt && p.regDt.slice(0, 10) === today).length;
  let todayRemain = 0;
  let todayMet = 0;
  meetings.forEach((m) => {
    if (m.meetDt !== today) return;
    const status = effectiveMeetingStatus(m);
    if (status === 'select') todayRemain++;
    else if (status === 'confirm') todayMet++;
  });

  /* ── 주간 데이터(일~토) ── */
  const weekHireCount = active.filter((p) => {
    const d = p.regDt ? p.regDt.slice(0, 10) : '';
    return d && d >= currentWeek && d <= weekEndIso;
  }).length;
  let weekMet = 0;
  meetings.forEach((m) => {
    if (!m.meetDt || m.meetDt < currentWeek || m.meetDt > weekEndIso) return;
    if (effectiveMeetingStatus(m) === 'confirm') weekMet++;
  });
  const statusLists = Object.fromEntries(WEEKLY_STATUS_LIST.map((s) => [
    s,
    active.filter((p) => p.status === s).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ko')),
  ]));

  /* ── 전체 데이터: 섭외자 → 첫만남 진행 → 단계만남 진행 → S3 전환 → S4 전환 ── */
  const firstMetIds = new Set();
  const stepMetIds = new Set();
  meetings.forEach((m) => {
    if (effectiveMeetingStatus(m) !== 'confirm') return;
    (m.seq === 1 ? firstMetIds : stepMetIds).add(m.hireId);
  });
  const totalCount = active.length;
  const firstMetCount = active.filter((p) => firstMetIds.has(p.id)).length;
  const stepMetCount = active.filter((p) => stepMetIds.has(p.id)).length;
  const s3Count = active.filter((p) => stageIndex(p.status) >= stageIndex('S3')).length;
  const s4Count = active.filter((p) => stageIndex(p.status) >= stageIndex('S4')).length;

  const funnel = [
    { label: '섭외자', count: totalCount, pct: null },
    { label: '첫만남 진행', count: firstMetCount, pct: pct(firstMetCount, totalCount) },
    { label: '단계만남 진행', count: stepMetCount, pct: pct(stepMetCount, firstMetCount) },
    { label: 'S3 전환', count: s3Count, pct: pct(s3Count, stepMetCount) },
    { label: 'S4 전환', count: s4Count, pct: pct(s4Count, s3Count) },
  ];

  els.content.innerHTML = `
    <section class="dashboard-today-section">
      <h3>오늘 (${mdLabel(today)})</h3>
      <div class="dashboard-stats dashboard-stats-3">
        <div class="dashboard-stat"><span>오늘 섭외자</span><strong>${todayHireCount}</strong></div>
        <div class="dashboard-stat pending"><span>남은 만남</span><strong>${todayRemain}</strong></div>
        <div class="dashboard-stat success"><span>만나진 수</span><strong>${todayMet}</strong></div>
      </div>
    </section>

    <section class="dashboard-week-section">
      <h3>주간 데이터</h3>
      <p>${mdLabel(currentWeek)}–${mdLabel(weekEndIso)} (일~토)</p>
      <div class="dashboard-stats dashboard-stats-2">
        <div class="dashboard-stat"><span>주간 섭외 수치</span><strong>${weekHireCount}</strong></div>
        <div class="dashboard-stat success"><span>주간 만나진 수치</span><strong>${weekMet}</strong></div>
      </div>
      <div class="dashboard-status-board">
        ${WEEKLY_STATUS_LIST.map((s) => `
          <article class="dashboard-status-card">
            <h4>${s} <span class="dashboard-status-count">${statusLists[s].length}명</span></h4>
            ${statusLists[s].length
              ? `<ul>${statusLists[s].map((n) => `<li>${n}</li>`).join('')}</ul>`
              : '<p class="dashboard-status-empty">해당 인원 없음</p>'}
          </article>`).join('')}
      </div>
    </section>

    <section class="dashboard-funnel-section">
      <h3>전체 데이터</h3>
      <p>섭외자 → 첫만남 진행 → 단계만남 진행 → S3 전환 → S4 전환 · %는 직전 단계 대비 전환율</p>
      <div class="dashboard-funnel">
        ${funnel.map((f, i) => `
          <div class="dashboard-funnel-stage">
            <span class="dashboard-funnel-label">${f.label}</span>
            <strong class="dashboard-funnel-count">${f.count}<small>명</small></strong>
            <span class="dashboard-funnel-pct">${f.pct === null ? '' : `${f.pct}%`}</span>
          </div>${i < funnel.length - 1 ? '<div class="dashboard-funnel-arrow">→</div>' : ''}`).join('')}
      </div>
    </section>`;
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
  document.getElementById('dashboard-refresh').addEventListener('click', load);
  await load();
}

export async function reloadDashboard() { if (els.content) await load(); }
