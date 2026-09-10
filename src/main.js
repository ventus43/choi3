import './styles/index.css';
import { ensureAuth } from './core/auth.js';
import { initScreenshotButtons } from './screenshot.js';

import * as zonestat from './tabs/zonestat.js';
import * as meetview from './tabs/meetview.js';
import * as check from './tabs/check.js';
import * as schedule from './tabs/schedule.js';
import * as outreach from './tabs/outreach.js';
import * as member from './tabs/member.js';

/* 탭 순서 = 탭바 버튼 순서 = 패널 주입 순서. 첫 항목이 처음 열리는 탭. */
const TABS = [
  { name: 'zonestat',  template: zonestat.TEMPLATE, init: zonestat.initZoneStatTab,  reload: zonestat.reloadZoneStat },
  { name: 'meetsched', template: meetview.TEMPLATE, init: meetview.initMeetSchedTab, reload: meetview.reloadMeetSched },
  { name: 'check',     template: check.TEMPLATE,    init: check.initCheckTab,        reload: check.reloadCheck },
  { name: 'schedule',  template: schedule.TEMPLATE, init: schedule.initScheduleTab,  reload: schedule.reloadSchedule },
  { name: 'outreach',  template: outreach.TEMPLATE, init: outreach.initOutreachTab },
  { name: 'member',    template: member.TEMPLATE,   init: member.initMemberTab },
];

const RELOAD = Object.fromEntries(TABS.filter((t) => t.reload).map((t) => [t.name, t.reload]));

/* 각 탭의 HTML 템플릿을 <div class="stage"> 안에 패널로 주입. 첫 탭만 보이게. */
function mountPanels() {
  const stage = document.querySelector('.stage');
  stage.innerHTML = TABS.map(({ name, template }, i) =>
    `<section class="panel" id="panel-${name}"${i === 0 ? '' : ' hidden'}>${template}</section>`,
  ).join('');
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      TABS.forEach(({ name }) => {
        document.getElementById(`panel-${name}`).hidden = name !== tab.dataset.tab;
      });

      // 작은 화면에서는 선택한 탭이 가로 스크롤 밖으로 사라지지 않게 중앙으로 이동.
      if (window.matchMedia('(max-width: 640px)').matches) {
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      RELOAD[tab.dataset.tab]?.();
    });
  });
}

async function main() {
  mountPanels();
  setupTabs();
  initScreenshotButtons();
  await Promise.all(TABS.map((t) => t.init()));
}

if (ensureAuth()) main();
