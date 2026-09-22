# choi3

섭외자 관리 백오피스. 별도 배포되는 하위 프로젝트로, `gventus_web` 루트 저장소와는 git 이력이 분리되어 있다(`.gitignore`로 제외됨). 배포 방법·인프라 구성은 [DEPLOY.md](./DEPLOY.md) 참고.

`/hub`(`public/hub.html`)에서 이 프로젝트의 화면들(관리 시스템·7Ius67Cp·체크리스트)을 한 페이지에서 링크로 찾아볼 수 있다.

## 로컬 개발 환경 (2026-09-14 기준 확정된 방식)

MySQL만 Docker로 띄우고, Vite/API는 로컬에서 네이티브로 실행한다 — 세 개 다 도커로 띄우던 이전 방식(`docker-compose.yml`의 web/api 서비스)에서 전환됨.

```bash
# 1) MySQL만 도커로 (계속 떠 있게 유지)
docker compose up -d db

# 2) API (Flask, local-api/server.py) — 최초 1회 venv 준비
cd local-api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 이후 계속 이 방식으로 실행 (도커 db는 3307 포트로 노출되어 있음)
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=choi3 DB_PASS='tjdgh2814@@' DB_NAME=choi3 SHARED_ENV_FILE=/dev/null \
  .venv/bin/python server.py    # http://localhost:8081, debug=True라 코드 수정 시 자동 리로드

# 3) Vite (프론트) — 별도 터미널, choi3/ 루트에서
API_TARGET=http://localhost:8081 npm run dev -- --host    # http://localhost:5174
```

- 로그인 비밀번호(OFFICE_PASSWORD) 기본값: `choi3`
- MySQL 데이터는 도커 볼륨(`choi3_mysql_data`)에 유지됨 — `docker compose down`(볼륨 삭제 없는 기본형)으로 컨테이너만 내려도 데이터는 보존됨
- 포트가 이미 사용 중이면(과거 세션에서 떠 있던 프로세스 등) `lsof -i :8081` / `lsof -i :5174`로 확인 후 정리

## DB 스키마

`mysql-init/01_schema.sql` 한 파일로 전체 스키마를 관리한다(별도 `migrations/` 디렉터리 없음). 모든 `CREATE TABLE`이 `IF NOT EXISTS`라 신규 DB든 이미 데이터가 있는 기존 DB(운영 EC2, 로컬 도커 볼륨)든 그대로 재실행해도 안전 — 새 테이블/컬럼이 필요하면 이 파일에 이어서 작성하고, 적용은 신규·기존 구분 없이 `mysql -uroot -p < mysql-init/01_schema.sql` 재실행 한 번으로 끝난다.

> 컬럼 타입을 바꾸는 등 `IF NOT EXISTS`로 표현 안 되는 변경(예: 과거 `CHOIMEETSCHEDULE.MEETYN`→`MEETST` 교체)은 적용 후 별도 파일 없이 이 스키마 파일 자체를 새 상태로 고쳐 쓰고, 운영 DB엔 그 변경분만 수동으로 반영한다.

## 신규 기능: 인원관리 시스템(`/7Ius67Cp`)

출석 보고 텍스트를 붙여넣으면 구역별·시간대별로 자동 집계해주는 독립 페이지. `choi3.gventus.store/7Ius67Cp`로 접근(난독화된 경로, `sabujak-book`과 동일한 패턴).

- **파일**: `public/7Ius67Cp.html` — Vite 앱(`src/tabs/*`)에 속하지 않는 완전히 독립적인 단일 HTML 파일. `public/`에 있으므로 빌드 시 `dist/` 루트로 그대로 복사됨.
  - UI 전체가 한 번 크게 리디자인됨(작업 흐름을 01~05단계 사이드 네비게이션으로 구성, ARIA/`announce()` 토스트/`setBusy()` 버튼 상태 등 추가) — `DESIGN.md`/`UX-CONTRACT.md`/`premium-ui.json` 참고(사용자가 직접 작업, 이 README와 별개로 관리됨). 로직(파싱/병합/대시보드/대조/❌ 처리 등)은 그대로고 마크업 구조·클래스명·이벤트 바인딩 방식(`onclick=""` → `addEventListener`)만 바뀌었으니, 기능을 찾을 땐 `id`/함수명으로 검색할 것.
- **라우팅**: `nginx/choi3.conf`의 `location = /7Ius67Cp { try_files /7Ius67Cp.html =404; }`
- **인증**: choi3 SPA(본프로젝트) 로그인과 **완전히 분리된 별도 인증 영역** (권한 최소화 목적 — 이 페이지만 여는 사람에게 CHOIHIRE 등 섭외자 개인정보가 있는 본프로젝트 접근권을 줄 필요가 없음)
  - 비밀번호: `REPORT_PASSWORD` env (기본값 `SIM_KEY`, 로컬 개발용) — 본프로젝트의 `OFFICE_PASSWORD`와 별개
  - 로그인: `POST /api/reports/auth/login` (본프로젝트는 `POST /api/auth/login`)
  - 토큰: 별도 서명 salt(`report-session`)로 발급 — 본프로젝트 토큰(`X-Office-Auth`)으로 `/reports/*` 호출 불가, 반대로 이 토큰(`X-Report-Auth`)으로 `/outreach`·`/meetings` 등 다른 라우트 호출 불가 (`local-api/auth.py`의 `EXEMPT_PREFIXES` + `reports_bp.before_request(require_report_auth)`로 구현)
  - 프론트 localStorage 키: `choi3_report_token`/`choi3_report_exp` (본프로젝트는 `choi3_office_token`/`choi3_office_exp`) — 세션 자체가 공유되지 않음
  - 운영 배포 시 GitHub Actions 시크릿 + `choi3.env`에 `REPORT_PASSWORD` 추가 필요 (아직 미등록 — 기본값 `SIM_KEY`로 운영 중이라면 반드시 별도 값으로 교체할 것)
- **저장**: `CHOIREPORT` 테이블(날짜별 파싱 결과 JSON) — `local-api/routes/reports.py`의 `GET/PUT /reports/<date>`, `GET /reports` 사용. (처음엔 브라우저 `localStorage`로 구현했다가, "다른 사람/기기에서도 같은 기록이 보여야 한다"는 이유로 서버 저장으로 전환함)
- **이름 단위 수동 수정**: 렌더링된 구역/얼굴만-본-자 명단의 각 이름이 칩(chip) 형태로 표시되어 클릭하면 인라인 수정, ×로 삭제 가능. 수정 즉시 `PUT /reports/<date>`로 저장됨. 구역 카드의 펼침 상태는 `openZoneId` 전역 변수로 재렌더링 후에도 유지.
  - **이름 추가는 두 가지**: (1) `<select class="name-add-select">` — 그 구역(`CHOIMEMBER`, `rosterCache`)에 속한 사람 중 **이미 추가된 사람은 제외**하고 나열, 골라서 바로 추가(오타·구역 불일치 원천 차단). (2) `<input class="name-add-input">` — 로스터에 없는 미등록자(방문자 등)를 위한 자유 입력, 그대로 유지. `rosterCache`는 `initApp()`에서 한 번 불러와 전역 캐시(`refreshRosterCache()`) — 매 렌더마다 다시 조회하지 않음.
- **같은 날짜 재붙여넣기 = 병합** (덮어쓰기 아님): 파싱 전에 `GET /reports/<date>`로 기존 기록 유무를 확인해서
  - 기존 기록 없음 → 그냥 저장 (기존과 동일)
  - 기존 기록 있음 → 기존 위에 새로 파싱된 이름만 "추가" (기존에 있던 항목·수동 편집분은 절대 삭제 안 됨). 단, 아래 두 경우는 추가하지 않고 화면에 사유와 함께 경고 목록으로 보여준 뒤, "제외하고 병합 저장" 버튼을 눌러야 실제 저장됨(취소 가능):
    1. 같은 구역/그룹에 이미 있는 이름(중복)
    2. `CHOIMEMBER` 구역명단에 없거나 다른 구역 소속인 이름 — 이 대조를 위해 `GET /reports/roster`(이름·구역만 노출, `X-Report-Auth`로 접근 가능한 최소 권한 엔드포인트)를 신규로 뺐음
  - 관련 함수: `mergeReports`/`mergeNameGroup`/`checkNameAgainstRoster` (모두 `public/7Ius67Cp.html` 안에 있음)

### 검증 방법 메모

브라우저 확장 프로그램(claude-in-chrome)이 이 프로젝트 작업 내내 응답하지 않아서, 실제 클릭 조작 검증은 `public/7Ius67Cp.html`에 박혀 있는 `<script>` 내용을 그대로 추출해 **jsdom으로 실제 DOM 이벤트를 발생시켜** 확인하는 방식을 반복 사용했다(`npm install --no-save jsdom` 후 임시 테스트 스크립트 작성 → 실행 → 삭제, `package.json`엔 안 남김). fetch는 스텁 없이 실제 로컬 API(`localhost:5174/api` 경유)를 그대로 호출해서 백엔드까지 통째로 검증함. 다음 세션에서도 이 방식이 유효 — 확장 프로그램이 복구되지 않았다면 같은 패턴을 재사용할 것.

### 출석 대시보드 (Phase 2)

`fetchRoster()`(위 병합 기능에서 쓰던 `GET /reports/roster`)를 재사용해서 페이지 하단에 두 섹션 추가:

- **날짜별 출석 현황** (`computeAttendance`): 선택한 날짜에 대해 `CHOIMEMBER` 전체 인원을 아래 우선순위로 4단계 판정
  1. 그 날짜 어느 예배든 main/extra 명단에 있음 → **QR인증**
  2. 얼굴만 본 자 - 심방(visit)에 있음 → **QR안함**
  3. 얼굴만 본 자 - 줌(zoom)에 있음 → **줌**
  4. 위 어디에도 없음 → **결석**

  구역별 인원 리스트 + 상태 뱃지, 전체 요약(QR인증/QR안함/줌/결석 카운트) 표시.
- **구역별 출석 추이 — 점 그래프 + 숫자 표** (`buildTrendMatrix`/`renderTrendChart`/`renderTrendNumberTable`, `renderTrendSection`이 묶어서 호출): 표·그래프가 같은 계산 결과(`buildTrendMatrix`)를 공유해서 저장된 주차 수만큼 하는 `GET /reports/<date>` N+1 호출을 한 번만 함
  - **그래프**: SVG로 직접 그린 라인차트, 구역 7개를 각각 다른 색 선으로 동시에 비교(Y축=구역별 출석률 QR인증/구역전체×100). 크로스헤어+툴팁으로 하나의 날짜에 커서를 올리면 7개 구역 값이 한 번에 뜸. 라이브러리 없이 순수 SVG. 색상은 `dataviz` 스킬의 검증된 8색 카테고리 팔레트 중 7개를 고정 순서로 사용(`validate_palette.js`로 라이트모드 인접쌍 CVD 통과 확인 — 3개 색상이 3:1 명암비 미달이라 WARN이 떴는데, 바로 아래 숫자 표가 릴리프 역할을 함)
  - **구역별 카드** (`renderTrendZoneCards`): 종합 그래프는 7개 선이 겹쳐서 구역 하나의 흐름만 보기 어려우니, 구역별로 미니 스파크라인 카드를 따로 둠 — 최신 주차 수치(`5%(1/22)`), 전주 대비 증감(▲/▼/– + %p, 상승=`good`green/하락=`critical`red — dataviz 스킬의 상태색 규칙대로 아이콘+텍스트 병기), 최신 날짜 표시. 그래프와 동일한 `buildTrendMatrix` 결과 재사용이라 추가 조회 없음
  - **숫자 표**: 그래프/카드 아래, 구역×날짜 표로 7개 구역을 한 번에 숫자(`QR인증/구역전체`, 예: `5/22`)로 확인 가능 — 그래프에서 안 보이는 정확한 값 확인용
  - 현재는 버튼 클릭 시에만 조회, 자동 로드 안 함(N+1 비용 때문)

**동명이인 이슈**: `CHOIMEMBER`에 이름+구역이 같은 행이 실제로 존재함(예: 구역1 "정수연" 2명, `ISMISSION` 값이 서로 다름 — 진짜 다른 두 사람). `fetchRoster()`의 중복 제거 키를 이름+구역+`ISMISSION`(사명 여부)까지 확장해서, 완전 중복 입력(3개 값이 전부 같음)만 하나로 합치고 진짜 동명이인은 별도 인원으로 카운트하도록 함. 단 카톡 보고 텍스트·붙여넣기 명단 모두 "이름"만 있고 사명 여부는 안 나오므로, **구역+이름+사명까지 전부 같은 동명이인은 여전히 서로 구분 불가**(입력 데이터 자체의 한계, 코드로 해결 불가) — 이 상태로 원본 `CHOIMEMBER`는 건드리지 않음.

### 구역 명단 대조 (Phase 3) — 삭제됨

한때 있었던 "붙여넣은 명단 vs CHOIMEMBER 대조" 기능(`compareRoster` 등)은 **제거함** — "DB에 입력된 항목이 전부"라 별도로 대조할 필요가 없다는 판단(2026-09-15). 관련 UI 섹션(`#roster`), 함수(`parsePastedNames`/`countBy`/`compareRoster`/`renderRosterCheckResult`/`refreshRosterCheckZones`), nav 링크, CSS(`.roster-grid`)를 모두 지웠다. `GET /reports/roster`·`fetchRoster()`는 병합·대시보드·추이 그래프가 여전히 쓰고 있어서 그대로 둠.

### ❌ 표시 이름 처리

카톡 보고 텍스트에 "정현태❌"처럼 이름 뒤에 ❌가 붙어있는 경우가 있음(예시 실제로 SAMPLE_TEXT에도 있음). `parsePart()`가 파싱 시 ❌를 떼어 이름은 그대로 두되, 그 이름을 해당 그룹의 `noauth` 배열에 별도로 기록한다. `computeAttendance()`는 `noauth`에 있는 이름을 최우선으로 **QR안함**(성전 외 심방과 동일 취급) 처리 — main/extra(원래는 QR인증으로 잡히는 그룹)에 있어도 무조건 QR안함으로 강등됨. 병합(`mergeNameGroup`)·기존 저장 기록(옛 데이터엔 `noauth` 필드가 없음, `||[]`로 방어) 모두 대응함.
- 한계: 칩 편집 UI(이름 추가/삭제/수정)는 `names`만 다루고 `noauth`는 건드리지 않음 — ❌ 표시된 사람을 칩에서 지우면 `noauth`엔 이름이 남지만 `names`에 없으므로 실질적으로 무해(적용 대상이 없어짐). 반대로 칩으로 새로 추가한 이름은 ❌ 표시가 있을 수 없으므로 `noauth`에 안 들어가는 게 맞음.

### 진행 상태

- ✅ **Phase 1**: 텍스트 붙여넣기 → 파싱 → 구역별/시간대별 렌더링 → 서버 저장/조회/이력 목록 → 이름 단위 칩 수정 → 같은 날짜 재붙여넣기 시 병합(로스터 대조 포함) → ❌ 표시 이름 QR안함 강제 처리
- ✅ **Phase 2**: 출석 대시보드(날짜별 현황 + 구역×날짜 추이 표+그래프)
- ~~Phase 3~~: 구역 명단 대조 — 만들었다가 불필요 판단으로 삭제(위 참고)
- ✅ **UI 리디자인**(사용자 직접 작업, `DESIGN.md`/`UX-CONTRACT.md`): 01~04단계 워크플로우로 재구성. 이 과정에서 각 섹션을 "입력 카드"(`.input-card`)와 "결과 패널"(`.panel`)로 분리 — 출석 대시보드(03)도 조회 날짜+새로고침 버튼(입력)과 요약+구역별 목록(결과)을 별개 카드로 나눔(2026-09-15)
- ✅ **화면 자체를 입력/보기 탭으로 분리**(2026-09-15): 카드 단위 분리로는 부족하다고 판단, choi3 SPA(`src/main.js`)의 탭 전환(`hidden` 속성 토글, 한 번에 패널 하나만 노출)과 동일한 방식을 적용. `.page-tabs`의 "입력하는 곳"(01 분석 섹션만) / "보기만 하는 곳"(02 검토·03 대시보드·04 추이 전부)으로 완전히 나뉜 화면 — `setupPageTabs()`/`switchToTab()`. 저장 성공 시 자동으로 "보기" 탭으로 전환됨(붙여넣고 바로 결과 확인). 사이드바 앵커 네비게이션(`.workflow-nav`)은 제거함.

계획했던 3단계 모두 완료됨. 다음 세션에서 추가 요청이 있으면 위 로컬 개발 환경부터 띄우고 시작할 것.

## 신규 기능: 체크리스트(`/c0p3X0jZsu.html`)

사명자(`CHOIMEMBER.ISMISSION='Y'`) 대상 요일별 체크리스트. `choi3.gventus.store/c0p3X0jZsu.html`로 접근(난독화된 파일명, `7Ius67Cp`와 동일한 패턴이지만 확장자 없는 clean URL 라우팅은 nginx에 따로 없음 — `.html`을 붙여서 접근).

- **파일**: `public/c0p3X0jZsu.html` — `7Ius67Cp.html`처럼 Vite 앱(`src/tabs/*`)에 속하지 않는 완전히 독립적인 단일 HTML 파일. choi3 SPA(관리시스템) 항목이 **아니다** — 처음엔 SPA 탭으로 만들었다가 관리시스템 밖 독립 페이지로 전면 이전함.
- **접근/인증**: 이름 입력창 하나로 두 갈래 — 이름을 입력하면 본인 조회(무인증), 관리자 비밀번호를 입력하면 관리자 화면으로 전환. 관리자 비밀번호는 `OFFICE_PASSWORD`/`REPORT_PASSWORD`와 별개로 `CHOICHECKLIST_ADMIN` 테이블에 저장되어 있어 관리자가 화면에서 직접 변경 가능(env 고정값이 아님). 로그인 성공 시 발급되는 토큰(`X-Checklist-Auth`)은 `local-api/auth.py`의 `CHECKLIST_SESSION_SECRET`으로 서명 — 본프로젝트(`X-Office-Auth`)·7Ius67Cp(`X-Report-Auth`) 토큰과 서로 호환 안 됨.
  - `/mychecklist/*` 전체가 `auth.EXEMPT_PREFIXES`에 등록되어 전역 백오피스 인증(`X-Office-Auth`) 검사 대상이 아니다.
- **항목 구조**: 체크 항목이 **요일별로 완전히 분리**되어 있다(월요일 항목과 화요일 항목이 서로 다른 목록) — 관리자가 요일마다 항목을 추가/수정/삭제. 요일마다 기본 5개 빈 항목으로 시작.
- **API** (`local-api/routes/mychecklist.py`): `GET /mychecklist/search`(이름 조회) · `GET/PUT /mychecklist/<id>`, `/mychecklist/<id>/check`(본인 자가 체크) · `GET /mychecklist/<id>/history`(이전주차요약) · `POST /mychecklist/admin/login` · `PUT /mychecklist/admin/password` · `GET/POST/PUT/DELETE /mychecklist/admin/items`(요일별 항목 CRUD) · `GET /mychecklist/admin/board`(구역별 현황) · `POST/DELETE /mychecklist/admin/stamp`(스탬프 부여/취소, 해당 요일 전 항목 체크 시에만 서버에서 허용) · `POST /mychecklist/admin/close-week`(요일별 요약을 이력에 남기고 초기화).
- **저장**: `CHOICHECKLIST_ITEM`(요일별 항목) · `CHOICHECKLIST`(이번 주 체크 상태, 사용자 자가 토글) · `CHOICHECKLIST_STAMP`(이번 주 요일별 스탬프) · `CHOICHECKLIST_HISTORY`(주 마감 시 남는 요일별 요약: 체크 개수/전체/스탬프 여부) · `CHOICHECKLIST_ADMIN`(관리자 비밀번호 단일 행). 스키마는 `mysql-init/01_schema.sql`에 있음(운영 DB엔 아직 수동 미적용 — `mysql -uroot -p < mysql-init/01_schema.sql` 재실행하면 적용됨, `IF NOT EXISTS`라 기존 테이블엔 영향 없음).
- **관리자 화면 구성**: 오늘 현황(전체 사명자/오늘 전항목 완료/오늘 스탬프 + 구역별 완료 칩) → 구역별 현황(인원×요일 표, 칸마다 체크개수 + 조건 충족 시 스탬프 버튼) → 날짜별 체크항목 관리(요일별 그리드, 항목마다 인라인 수정/삭제 + 요일별 추가 입력창). 비밀번호 변경 카드는 현재 숨김 처리(로직은 남아있음).
