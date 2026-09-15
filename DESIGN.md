---
version: alpha
colors:
  canvas: "#f4f7f8"
  surface: "#ffffff"
  ink: "#17252c"
  muted: "#62727a"
  line: "#d8e1e3"
  primary: "#0b6b68"
  primary-soft: "#e3f3f0"
  warning: "#a84210"
  danger: "#b42318"
  success: "#087443"
typography:
  display:
    fontFamily: "'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "1.5rem"
    lineHeight: "1.3"
  body:
    fontFamily: "'Pretendard Variable', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
    fontSize: "0.9375rem"
    lineHeight: "1.55"
  data:
    fontFamily: "ui-monospace, 'SFMono-Regular', Consolas, monospace"
    fontSize: "0.8125rem"
    lineHeight: "1.4"
rounded:
  sm: "0.5rem"
  md: "0.875rem"
  lg: "1.25rem"
spacing:
  xs: "0.375rem"
  sm: "0.625rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.25rem"
components:
  button:
    background: "var(--accent)"
    borderRadius: "var(--radius-sm)"
  panel:
    background: "var(--card)"
    borderRadius: "var(--radius-lg)"
---

## Overview

주일예배 보고를 빠르게 검토하고 확정하는 한국어 운영 콘솔이다. 핵심 사용자는 보고를 붙여넣고 이상을 확인한 뒤 저장하는 구역 담당자다. 화면은 차분한 교회 행정 문서처럼 신뢰감 있게, 다만 일상적으로 쓰는 도구답게 경쾌하고 명확해야 한다.

## Colors

기존 CSS 변수(`:root`)가 런타임 토큰의 정본이다. 이 문서는 그 값을 설명·추적하는 Model B 매핑이며, `--accent`, `--accent-soft`, `--good`, `--warn`, `--line`을 각각 primary, primary-soft, success, warning, line으로 사용한다. 청록은 기록 확정과 현재 상태를 나타내며, 주황은 사람이 확인할 수 있는 불일치에만 사용한다.

## Typography

한국어 본문은 시스템 한글 글꼴 우선의 편안한 행간을 유지한다. 수치와 날짜는 data 역할로 정렬 가능한 밀도를 준다. 과도한 대문자, 영문식 자간, 이탤릭은 사용하지 않는다.

## Layout

데스크톱은 좌측의 고정되지 않은 작업 목차와 우측 작업 영역의 12열 감각을 사용한다. 모바일에서는 목차를 가로 스크롤 가능한 단계 안내로 전환하고, 주요 행동은 전폭으로 제공한다. 입력→검토·저장→출석→추이→대조 순서를 구조에 그대로 반영한다.

## Elevation & Depth

표면은 얇은 테두리와 매우 약한 그림자로 구분한다. 경고와 현재 분석 결과만 색면을 사용한다. 떠 있는 요소는 인증 창과 상태 알림으로 제한한다.

## Shapes

제어는 8px, 작업 패널은 16px 반경을 쓴다. 배지와 이름 칩만 완전한 알약 형태를 쓴다.

## Components

기본 버튼은 구체적 동사와 busy 상태를 갖는다. 상태 메시지는 `aria-live`로 알리고, 오류는 원인과 다음 행동을 말한다. 접이식 구역과 기록 목록은 키보드로 조작 가능한 native button으로 구현한다.

## Do's and Don'ts

작업 단계와 저장 상태를 항상 화면에 남긴다. 모바일에서 표는 가로 스크롤을 허용하되 첫 열을 고정한다. 장식용 이모지로 의미를 전달하지 않고, 색만으로 상태를 구분하지 않는다.

