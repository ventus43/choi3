import { ensureAuth } from './auth.js';
import { initOutreachTab } from './tabs/outreach.js';
import { initScheduleTab, reloadSchedule } from './tabs/schedule.js';
import { initCheckTab }    from './tabs/check.js';
import { initMemberTab }   from './tabs/member.js';
import { initMeetSchedTab, reloadMeetSched } from './tabs/meetview.js';
import { initZoneStatTab, reloadZoneStat } from './tabs/zonestat.js';

const TAB_NAMES = ['zonestat', 'meetsched', 'check', 'schedule', 'outreach', 'member'];

// 탭을 다시 열 때 API를 재호출해 최신 데이터로 갱신할 탭들.
const TAB_RELOAD = {
  schedule: reloadSchedule,
  zonestat: reloadZoneStat,
  meetsched: reloadMeetSched,
};

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      TAB_NAMES.forEach((name) => {
        document.getElementById(`panel-${name}`).style.display =
          name === tab.dataset.tab ? 'block' : 'none';
      });
      TAB_RELOAD[tab.dataset.tab]?.();
    });
  });
}

async function main() {
  setupTabs();
  await Promise.all([
    initOutreachTab(), initScheduleTab(), initCheckTab(), initMemberTab(), initMeetSchedTab(), initZoneStatTab(),
  ]);
}

if (ensureAuth()) main();
