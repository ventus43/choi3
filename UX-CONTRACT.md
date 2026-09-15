# UX Contract — 주일예배 구역별 분석

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
| 구역 명단 복사 | 구역 카드의 `명단 복사` | 버튼 비활성화, 복사 중 | 상태별 제목과 이름 목록을 클립보드에 복사하고 성공 알림 | 권한 확인 안내를 표시하고 다시 시도 가능 |
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
- `주일 기록만 보기`를 선택하면 일요일 이외의 저장 기록을 그래프·구역 카드·수치 표에서 모두 제외하며, 제외 건수는 조회 결과 문구로 알린다.
- 구역 카드의 미니 추이는 각 구역의 해당 기간 변화폭을 확대해 보여 주며, 카드 안에 적용 범위를 함께 표시한다. 전체 그래프는 구역 간 비교를 위해 0~100% 기준을 유지한다.
- 구역 카드에는 기간 조회에 포함된 모든 기록 날짜를 `날짜 · 출석률 · QR인증/구역인원`으로 함께 표시한다. 기간을 좁혀 카드 정보를 빠르게 비교할 수 있다.
