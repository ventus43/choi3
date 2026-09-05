import { getAuthToken, clearAuth } from './auth.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Office-Auth': getAuthToken(),
    },
    ...options,
  });

  if (res.status === 401) {
    // 저장된 비밀번호가 없거나 백엔드와 안 맞음 — 지우고 로그인 화면으로 되돌림
    clearAuth();
    location.reload();
    throw new Error('인증이 필요합니다. 다시 로그인해 주세요.');
  }

  if (!res.ok) {
    let message = `요청 실패 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch (_) {}
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const outreachApi = {
  list:   ()          => request('/outreach'),
  create: (input)     => request('/outreach', { method: 'POST',   body: JSON.stringify(input) }),
  update: (id, patch) => request(`/outreach/${id}`, { method: 'PATCH',  body: JSON.stringify(patch) }),
  remove: (id)        => request(`/outreach/${id}`, { method: 'DELETE' }),
};

function rangeQuery(range) {
  if (range && range.from && range.to) {
    return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  }
  return '';
}

export const meetingApi = {
  upcoming: (range)        => request(`/meetings/upcoming${rangeQuery(range)}`),
  schedule: (range)        => request(`/meetings/schedule${rangeQuery(range)}`),
  list:     (hireId)       => request(`/outreach/${hireId}/meetings`),
  create:   (hireId, input) => request(`/outreach/${hireId}/meetings`, { method: 'POST',  body: JSON.stringify(input) }),
  update:   (id, patch)    => request(`/meetings/${id}`, { method: 'PATCH',  body: JSON.stringify(patch) }),
  remove:   (id)           => request(`/meetings/${id}`, { method: 'DELETE' }),
};

export const checkApi = {
  list: () => request('/check'),
};

export const memberApi = {
  list:   ()          => request('/member'),
  create: (input)     => request('/member',      { method: 'POST',   body: JSON.stringify(input) }),
  update: (id, patch) => request(`/member/${id}`, { method: 'PUT',    body: JSON.stringify(patch) }),
  remove: (id)        => request(`/member/${id}`, { method: 'DELETE' }),
};
