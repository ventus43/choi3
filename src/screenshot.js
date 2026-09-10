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

const CAPTURE_MIN_WIDTH = 1920;   // 가로 고정 하한 (항상 가로형 landscape)
const CAPTURE_MAX_WIDTH = 6000;   // 캔버스 폭 폭주 방지용 상한
const PAD = 24;

let statusEl = null;

function setStatus(msg, isError) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('err', !!isError);
}

/* 캡처 시각(프론트 로컬 시간) — 파일명용 compact / 캡션·전송용 표시 문자열 */
function captureStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return { file: `${date.replace(/-/g, '')}_${time.replace(':', '')}`, display: `${date} ${time}` };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const raf  = () => new Promise((r) => requestAnimationFrame(r));

/* iframe 캡처 실패 시 폴백 — 현재 문서에서 클론 후 폭 고정 + 스크롤 제약만 해제.
   (모바일에서 실행하면 모바일 레이아웃이 나올 수 있음 — 최후의 수단) */
async function captureInline(panelId) {
  const src = document.getElementById(panelId);
  if (!src) throw new Error('대상 화면을 찾을 수 없습니다.');

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText =
    `position:fixed; top:0; left:0; background:#fff; padding:${PAD}px; box-sizing:content-box;` +
    'transform:translateX(-200vw); pointer-events:none;';

  const clone = src.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  clone.style.display = 'block';
  clone.style.width = 'max-content';
  clone.style.maxWidth = 'none';
  holder.appendChild(clone);
  document.body.appendChild(holder);

  clone.querySelectorAll('table').forEach((t) => {
    t.style.display = 'table'; t.style.width = 'auto'; t.style.whiteSpace = 'normal';
  });
  clone.querySelectorAll('*').forEach((el) => {
    const ox = getComputedStyle(el).overflowX;
    if (ox === 'auto' || ox === 'scroll') { el.style.overflow = 'visible'; el.style.overflowX = 'visible'; }
  });

  await wait(60); await raf();
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch (_) { /* noop */ } }

  const natural = Math.max(clone.scrollWidth, Math.ceil(clone.getBoundingClientRect().width));
  const width = Math.min(CAPTURE_MAX_WIDTH, Math.max(CAPTURE_MIN_WIDTH, natural));
  clone.style.width = `${width}px`;
  holder.style.width = `${width}px`;
  await raf();

  const opts = {
    width: width + PAD * 2,
    height: Math.max(holder.scrollHeight, holder.offsetHeight, 1),
    backgroundColor: '#ffffff', pixelRatio: 1, cacheBust: true, skipAutoScale: true,
    style: { transform: 'none', transformOrigin: 'top left', left: '0', top: '0' },
  };
  try {
    await htmlToImage.toBlob(holder, opts);
    return await htmlToImage.toBlob(holder, opts);
  } finally {
    holder.remove();
  }
}

/* 대상 패널을 '데스크톱 폭(≥1920) iframe' 안에서 렌더해 PNG(Blob)로 캡처.
   - iframe 은 자체 뷰포트를 가지므로 모바일 @media 규칙이 걸리지 않음
     → 모바일에서 눌러도 컴퓨터 화면 레이아웃으로 전송됨.
   - 폭 = max(1920, 내용 자연 너비) → 넓은 표도 안 잘리고 전부 보임. 항상 가로형. */
async function captureViaIframe(panelId) {
  const src = document.getElementById(panelId);
  if (!src) throw new Error('대상 화면을 찾을 수 없습니다.');

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed; left:0; top:0; border:0; background:#fff;' +
    `width:${CAPTURE_MIN_WIDTH}px; height:800px;` +
    'transform:translateX(-200vw); pointer-events:none;';
  document.body.appendChild(frame);

  try {
    const idoc = frame.contentDocument;
    idoc.open();
    idoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    idoc.close();

    // 페이지 스타일/폰트 그대로 이식 (iframe 뷰포트가 1920 이라 데스크톱 규칙이 적용됨)
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
      idoc.head.appendChild(n.cloneNode(true));
    });
    idoc.documentElement.style.background = '#fff';
    idoc.body.style.cssText = `margin:0; background:#fff; padding:${PAD}px;`;

    const clone = src.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));   // 중복 id 방지
    clone.style.display = 'block';
    clone.style.maxWidth = 'none';
    idoc.body.appendChild(clone);

    await wait(150);
    await raf();
    if (idoc.fonts && idoc.fonts.ready) { try { await idoc.fonts.ready; } catch (_) { /* noop */ } }

    // 내용이 넓으면 iframe 폭 확장해서 안 잘리게
    const natural = Math.max(
      clone.scrollWidth, idoc.body.scrollWidth, idoc.documentElement.scrollWidth,
    );
    const width = Math.min(CAPTURE_MAX_WIDTH, Math.max(CAPTURE_MIN_WIDTH, natural + PAD * 2));
    frame.style.width = `${width}px`;
    await wait(80);
    await raf();

    const opts = {
      width,
      height: Math.max(idoc.body.scrollHeight, idoc.documentElement.scrollHeight, 1),
      backgroundColor: '#ffffff',
      pixelRatio: 1,
      cacheBust: true,
      skipAutoScale: true,
    };

    await htmlToImage.toBlob(idoc.body, opts);          // 워밍업(첫 호출 blank 회피)
    return await htmlToImage.toBlob(idoc.body, opts);   // 실제
  } finally {
    frame.remove();
  }
}

/* iframe 방식 우선, 실패 시 현재-문서 방식으로 폴백 */
async function capture(panelId) {
  try {
    const blob = await captureViaIframe(panelId);
    if (blob && blob.size > 0) return blob;
  } catch (err) {
    console.warn('[screenshot] iframe 캡처 실패 → 폴백:', err);
  }
  return captureInline(panelId);
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

    const ts = captureStamp();   // 캡처 시각을 프론트에서 확정해 함께 전송
    const blob = await capture(panelId);
    if (!blob) throw new Error('이미지 생성에 실패했습니다.');

    setStatus(`${target.label} 전송 중… (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);

    const fd = new FormData();
    fd.append('image', blob, `${target.label}_${ts.file}.png`);
    fd.append('label', target.label);
    fd.append('capturedAt', ts.display);

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
