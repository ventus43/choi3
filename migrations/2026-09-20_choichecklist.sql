-- 사명자(ISMISSION='Y') 요일별 체크리스트 기능 신규 추가.
-- 새 테이블 생성뿐이라 기존 데이터에 영향 없음 — 운영 DB에서 실행: mysql -u choi3 -p choi3 < migrations/2026-09-20_choichecklist.sql

USE choi3;

-- 체크 항목(5개 고정 슬롯) — 라벨은 관리자 페이지(사명 체크리스트 탭)에서 입력. 초기값은 빈 문자열.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_ITEM (
    SEQ   TINYINT      NOT NULL,
    LABEL VARCHAR(50)  NOT NULL DEFAULT '',
    PRIMARY KEY (SEQ)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO CHOICHECKLIST_ITEM (SEQ, LABEL) VALUES (1,''),(2,''),(3,''),(4,''),(5,'');

-- 이번 주(마감 전) 요일별 체크 상태. DOW: 1=월 ... 7=일. ITEM_SEQ: 1~5.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST (
    NTT_ID   INT      NOT NULL,
    DOW      TINYINT  NOT NULL,
    ITEM_SEQ TINYINT  NOT NULL,
    CHECKED  CHAR(1)  NOT NULL DEFAULT 'N',
    MOD_DT   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, DOW, ITEM_SEQ)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주 마감(관리자 '이번 주 마감') 시 남기는 간단 이력 — 인원별 그 주 체크 개수만 요약 저장.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_HISTORY (
    NTT_ID        INT      NOT NULL,
    WEEK_START    DATE     NOT NULL,   -- 그 주 월요일 날짜
    CHECKED_COUNT INT      NOT NULL,
    TOTAL_COUNT   INT      NOT NULL,
    REG_DT        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, WEEK_START)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
