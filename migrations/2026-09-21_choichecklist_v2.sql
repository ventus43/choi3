-- 사명자 체크리스트 재설계: 관리시스템(choi3 SPA) 밖의 독립 공개 페이지(c0p3X0jZsu.html)로
-- 완전히 이전 — 항목 개수 가변, 사용자 자가 체크, 관리자 비밀번호(DB 저장, 변경 가능), 스탬프,
-- 요일별 이력(이전주차요약)을 지원한다.
-- 이전 마이그레이션(2026-09-20_choichecklist.sql)의 테이블 3개를 대체한다 — 아직 운영 미반영 +
-- 로컬 테스트 데이터뿐이라 안전하게 DROP 후 재생성.
-- 운영 DB 적용: mysql -u choi3 -p choi3 < migrations/2026-09-21_choichecklist_v2.sql

USE choi3;

DROP TABLE IF EXISTS CHOICHECKLIST_HISTORY;
DROP TABLE IF EXISTS CHOICHECKLIST;
DROP TABLE IF EXISTS CHOICHECKLIST_ITEM;

-- 체크 항목 — 관리자가 추가/수정/삭제 가능(고정 개수 아님).
CREATE TABLE CHOICHECKLIST_ITEM (
    ID         INT          NOT NULL AUTO_INCREMENT,
    LABEL      VARCHAR(50)  NOT NULL,
    SORT_ORDER INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이번 주(마감 전) 요일별 체크 상태 — 사용자 본인이 직접 토글. DOW: 1=월 ... 7=일.
CREATE TABLE CHOICHECKLIST (
    NTT_ID  INT      NOT NULL,
    DOW     TINYINT  NOT NULL,
    ITEM_ID INT      NOT NULL,
    CHECKED CHAR(1)  NOT NULL DEFAULT 'N',
    MOD_DT  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, DOW, ITEM_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이번 주 요일별 스탬프 — 해당 요일 전 항목이 체크된 사용자에게 관리자가 부여.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_STAMP (
    NTT_ID INT      NOT NULL,
    DOW    TINYINT  NOT NULL,
    REG_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, DOW)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주 마감 시 남기는 요일별 요약 이력 — 사용자 '이전주차요약' 조회용(항목 텍스트 자체는 바뀔 수
-- 있어 개수/전체/스탬프 여부만 요약 보존한다).
CREATE TABLE CHOICHECKLIST_HISTORY (
    NTT_ID        INT      NOT NULL,
    WEEK_START    DATE     NOT NULL,
    DOW           TINYINT  NOT NULL,
    CHECKED_COUNT INT      NOT NULL,
    TOTAL_COUNT   INT      NOT NULL,
    STAMPED       CHAR(1)  NOT NULL DEFAULT 'N',
    PRIMARY KEY (NTT_ID, WEEK_START, DOW)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 체크리스트 공개 페이지 관리자 비밀번호(단일 행) — 관리자가 화면에서 바꿀 수 있다.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_ADMIN (
    ID       TINYINT      NOT NULL,
    PASSWORD VARCHAR(100) NOT NULL,
    PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO CHOICHECKLIST_ADMIN (ID, PASSWORD) VALUES (1, 'CHECK_KEY');
