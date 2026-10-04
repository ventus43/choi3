# UX Contract — 인원관리 시스템

## Canonical ownership

단일 HTML 앱이므로 CSS `:root`와 native HTML controls가 정본이다. 날짜와 select는 플랫폼 소유 native control을 허용한다. 알림은 `#globalStatus` live region, 인라인 오류는 각 필드의 `aria-describedby`로 일관되게 제공한다.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select | HTML / premium-ui.json | Native only | Keyboard and popup check |
| Date | Native date input | HTML / premium-ui.json | Native only | Keyboard and locale check |
| Form | Native controls + explicit JS validation | This contract | Report / roster | Required, invalid, IME check |
| Toast | `#globalStatus` | HTML `announce` function | Success / failure | Live-region check |

## Workflow

| Operation | Trigger | Pending | Success | Failure / recovery |
|---|---|---|---|---|
| 보고 분석 | `분석하고 저장하기` | 버튼 비활성화, 분석 중 | 결과·저장 상태 표시, 대시보드 날짜 갱신 | 입력 카드의 오류, 원문 수정 후 재시도 |
| 동일 날짜 병합 | 분석 후 기존 기록 발견 | 미리보기 | 사용자 확인 뒤 저장 | 제외 대상을 보여주고 취소 가능 |
| 이름 편집 | 이름 버튼/추가 입력 | 저장 중 상태 | 저장됨 live status | 저장 실패 상태를 유지하고 재시도 안내 |
| 기록 조회 | 저장된 날짜 선택 | 불러오는 중 | 해당 보고를 검토 영역에 표시 | 오류 배너와 새로고침 |
| 대시보드/추이 | 날짜 변경/불러오기 | 고정 높이 로딩 영역 | 데이터 표시 | 원인과 다시 불러오기 행동 |
| 명단 대조 | `명단 대조하기` | 버튼 비활성화 | 일치/신규/누락을 분리 | 입력 오류 또는 조회 오류 |
| 추이 기간 조회 | 시작일·종료일 입력 후 `기간 조회` | 버튼 비활성화 | 해당 기간의 그래프·카드·표 갱신 | 날짜 역전 또는 결과 없음 안내 |

## Accessibility and responsive behavior

- 한국어 UI의 버튼·오류·상태 메시지는 한국어로 제공한다.
- 모든 클릭 조작은 native button이며, 포커스 링을 명확히 보인다.
- Enter 제출은 IME 조합 중에는 실행하지 않는다.
- 1180px 초과에서는 출석 대시보드 구역 카드를 3열로, 760px~1180px에서는 2열로, 760px 이하에서는 1열로 표시한다.
- 760px 이하에서는 작업 단계를 가로 스크롤하고, 입력/행동을 한 열로 쌓는다.
- 결과 표는 가로 스크롤 가능하며 첫 열을 유지한다.
- 출석 추이는 전체 기간 또는 ISO 날짜 시작일·종료일 범위로 조회하며, 시작일이 종료일보다 늦으면 조회하지 않는다.

## 주간보고 인원 관리

- 근거: local-api/routes/reports.py의 /reports/roster, /reports/member 및 _require_dept. 부서 권한과 삭제 의미는 API를 따른다.
- CRUD owner: public/7Ius67Cp.html의 setupRosterManage, openRosterForm, handleRosterAdd, handleRosterDelete. 등록/수정은 같은 폼을 사용한다.
- 이름 필수, 구역 선택(양의 정수). 체크 여부가 바뀌지 않으면 기존 사명 직책 값을 보존한다.
- 조회 실패/빈 명단을 구분한다. 저장 실패 시 입력값을 유지한다. 저장 중 중복 제출/닫기를 막는다.
- 삭제 확인은 이름/구역/공유 명단 삭제를 설명하고 취소에 초기 포커스를 둔다.
- 미저장 변경은 취소/Escape에서 폐기 확인. native dialog로 포커스를 격리한다.
- 검색은 개인정보를 URL에 남기지 않는 메모리 상태. IME 조합 종료 후 검색하며 구역 필터 없이 모든 구역을 보여준다. 인원 수 제한 없이 검색 조건에 맞는 전체 명단을 표시한다.
- 가상 API 브라우저 fixture로 등록/수정 성공, 실패 복구, 검색, 모바일 배치를 검증한다. 실제 DB 변경 검증과 구분한다.

- 엑셀 등록: 구역/이름 헤더의 .xlsx, 명단 시트만 읽고 작성 예시는 제외한다. 미리보기 후 명시적으로 등록한다. 오류가 있으면 전체 등록을 막고, 동일 부서의 같은 구역/이름 및 파일 내 중복은 건너뛴다. 동일 구역 동명이인은 개별 등록을 사용한다. 등록 시 서버에서 검증/중복 확인을 다시 수행하며 하나의 트랜잭션으로 저장한다.

## 부서 관리자

- 근거: reports.py의 /reports/admin/depts. 관리자 인증 범위를 유지하고 인원이 있는 부서의 삭제 금지는 서버 응답으로 안내한다.
- 등록/수정은 deptForm 하나를 사용한다. 비밀번호는 기본 password 타입이며 명시적으로 표시/숨기기 가능하다. 대화상자를 닫으면 필드를 비운다.
- 저장 중 중복 제출/닫기를 방지하며 실패는 폼에 표시하고 입력값을 유지한다. 미저장 취소는 폐기 확인을 거친다.
- 삭제 확인은 부서 이름과 로그인 불가를 안내하며 취소를 기본 포커스로 둔다. 부서 검색은 메모리 상태이고 30개 단위로 더 표시한다.
