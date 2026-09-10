/* 낙관적 업데이트 헬퍼 — "먼저 화면에 반영하고, API 실패하면 되돌린다" 패턴을 한 곳에 모은다.

   apply()   로컬 상태를 바꾼다
   revert()  apply 를 되돌린다 (실패 시)
   render()  화면을 다시 그린다
   call()    실제 API 호출 (Promise)
   onError   실패 알림 (기본: alert). (message) => void
   eager     true(기본)=apply 직후 render / false=성공 후에만 render (실패 시엔 항상 render) */
export async function optimistic({ apply, revert, render, call, onError, eager = true }) {
  apply();
  if (eager) render();
  try {
    await call();
    if (!eager) render();
  } catch (err) {
    revert();
    render();
    (onError || alert)(err.message);
  }
}
