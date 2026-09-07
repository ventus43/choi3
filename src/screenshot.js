import * as htmlToImage from 'html-to-image';
import { BASE_URL } from './api.js';
import { getAuthToken } from './auth.js';
import { reloadZoneStat } from './tabs/zonestat.js';
import { reloadMeetSched } from './tabs/meetview.js';
import { reloadCheck } from './tabs/check.js';

/* 캡처 대상 탭: 패널 id → { 라벨, 최신화 함수 } */
const TARGETS = {
  'panel-zonestat': { label: '섭외자 리스트', reload: reloadZoneStat },
  'panel-meetsched': { label: '만남 일정',    reload: reloadMeetSched },
  'panel-check':     { label: 'TM 현황',      reload: reloadCheck },
};

const CAPTURE_WIDTH = 1920;   // 가로 고정, 세로는 내용 전체

let statusEl = null;

function setStatus(msg, isError) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('err', !!isError);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/* 대상 패널을 1920px 폭으로 복제해 PNG(Blob)로 렌더.
   화면에 안 보이도록 translate 로 밀어두고, 렌더 시엔 transform:none 을 적용해 원점에서 캡처. */
async function capture(panelId) {
  const src = document.getElementById(panelId);
  if (!src) throw new Error('대상 화면을 찾을 수 없습니다.');

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText =
    `position:fixed; top:0; left:0; width:${CAPTURE_WIDTH}px;` +
    'background:#ffffff; padding:24px; box-sizing:border-box;' +
    'transform:translateX(-200vw); pointer-events:none;';

  const clone = src.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));   // 중복 id 방지
  clone.style.display = 'block';
  clone.style.width = '100%';
  clone.style.maxWidth = 'none';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  // 레이아웃/폰트 반영 대기
  await new Promise((r) => setTimeout(r, 60));
  await new Promise((r) => requestAnimationFrame(r));
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) { /* noop */ }
  }

  const opts = {
    width: CAPTURE_WIDTH,
    height: Math.max(holder.scrollHeight, holder.offsetHeight, 1),
    backgroundColor: '#ffffff',
    pixelRatio: 1,
    cacheBust: true,
    skipAutoScale: true,
    style: { transform: 'none', transformOrigin: 'top left', left: '0', top: '0' },
  };

  try {
    await htmlToImage.toBlob(holder, opts);          // 1차: 첫 호출이 비어 나오는 이슈 회피용 워밍업
    return await htmlToImage.toBlob(holder, opts);   // 2차: 실제 사용
  } finally {
    holder.remove();
  }
}

async function run(panelId) {
  const target = TARGETS[panelId];
  if (!target) return;

  const buttons = document.querySelectorAll('#screenshot-bar [data-ss]');
  buttons.forEach((b) => { b.disabled = true; });
  setStatus(`${target.label} 캡처 중…`);

  try {
    if (target.reload) {
      try { await target.reload(); } catch (_) { /* 갱신 실패해도 현재 화면으로 진행 */ }
    }

    const blob = await capture(panelId);
    if (!blob) throw new Error('이미지 생성에 실패했습니다.');

    setStatus(`${target.label} 전송 중… (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);

    const fd = new FormData();
    fd.append('image', blob, `${target.label}_${stamp()}.png`);
    fd.append('label', target.label);

    const res = await fetch(`${BASE_URL}/screenshot`, {
      method: 'POST',
      headers: { 'X-Office-Auth': getAuthToken() },
      body: fd,
    });

    if (!res.ok) {
      let message = `전송 실패 (${res.status})`;
      try { const b = await res.json(); if (b?.message) message = b.message; } catch (_) { /* noop */ }
      throw new Error(message);
    }

    setStatus(`${target.label} 전송 완료 ✓`);
  } catch (err) {
    setStatus(`오류: ${err.message}`, true);
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

export function initScreenshotButtons() {
  const bar = document.getElementById('screenshot-bar');
  if (!bar) return;
  statusEl = document.getElementById('screenshot-status');
  bar.querySelectorAll('[data-ss]').forEach((btn) => {
    btn.addEventListener('click', () => run(btn.dataset.ss));
  });
}
