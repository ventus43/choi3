import { checkApi } from '../api.js';

let entries = [];

const els = {};

function cacheEls() {
  els.stats = document.getElementById('check-stats');
  els.body  = document.getElementById('check-body');
  els.count = document.getElementById('count-check');
}

function render(loadFailed) {
  els.count.textContent = entries.length;

  if (loadFailed) {
    els.stats.innerHTML = '';
    els.body.innerHTML = `<tr><td colspan="9"><div class="error-banner">점검 현황을 불러오지 못했습니다. API 서버 연결을 확인해 주세요.</div></td></tr>`;
    return;
  }

  const ongoing = entries.filter((c) => c.status === '진행').length;
  const stopped = entries.filter((c) => c.status === '중단').length;
  const tmDone  = entries.filter((c) => c.tm === 'O').length;

  els.stats.innerHTML = `
    <div class="stat"><div class="num">${entries.length}</div><div class="lbl">전체 섭외자</div></div>
    <div class="stat"><div class="num">${ongoing}</div><div class="lbl">진행 중</div></div>
    <div class="stat"><div class="num">${stopped}</div><div class="lbl">중단</div></div>
    <div class="stat"><div class="num">${tmDone}</div><div class="lbl">TM 완료</div></div>
  `;

  if (entries.length === 0) {
    els.body.innerHTML = `<tr><td colspan="9"><div class="empty">점검 데이터가 없습니다.</div></td></tr>`;
    return;
  }

  els.body.innerHTML = entries.map((c) => {
    const c1 = c.check1 ?? c.c1 ?? '';
    const c2 = c.check2 ?? c.c2 ?? '';
    const c3 = c.check3 ?? c.c3 ?? '';
    return `
      <tr>
        <td class="mono">${c.date}</td>
        <td>${c.zone}</td>
        <td>${c.name}</td>
        <td>${c.tm === 'O' ? '<span class="check-tag done">완료</span>' : '<span class="check-tag pending">대기</span>'}</td>
        <td>${c1}</td>
        <td>${c2}</td>
        <td>${c3}</td>
        <td><span class="status-pill ${c.status === '진행' ? 'ongoing' : 'stopped'}">${c.status}</span></td>
        <td>${c.note ?? ''}</td>
      </tr>`;
  }).join('');
}

export async function initCheckTab() {
  cacheEls();
  els.body.innerHTML = `<tr><td colspan="9"><div class="loading">불러오는 중…</div></td></tr>`;
  try {
    entries = await checkApi.list();
    render(false);
  } catch {
    entries = [];
    render(true);
  }
}
