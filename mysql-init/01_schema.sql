CREATE DATABASE IF NOT EXISTS choi3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'choi3'@'%' IDENTIFIED BY 'tjdgh2814@@';
GRANT ALL PRIVILEGES ON choi3.* TO 'choi3'@'%';
FLUSH PRIVILEGES;

USE choi3;

CREATE TABLE IF NOT EXISTS CHOIMEMBER (
    NTT_ID  INT          NOT NULL,
    GU      VARCHAR(100),
    NAME    VARCHAR(100),
    TA      CHAR(1)      DEFAULT 'N',
    ISMISSION CHAR(1)    DEFAULT 'N',
    PRIMARY KEY (NTT_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CHOIHIRE (
    NTT_ID    BIGINT       NOT NULL AUTO_INCREMENT,
    NAME      VARCHAR(10),               -- 명단(이름)
    SEOMGIM   VARCHAR(10),               -- 섬김이
    GYOSA     VARCHAR(10),               -- 교사
    INDO      VARCHAR(10),               -- 인도자
    MEET_DATE VARCHAR(50),               -- 만남 날짜
    `1ST`     VARCHAR(100),              -- 1차 TM
    `2ND`     VARCHAR(100),              -- 2차 TM
    `3RD`     VARCHAR(100),              -- 3차 TM
    PRG       VARCHAR(10),               -- 선택('')/진행/중단
    STATUS    VARCHAR(10),               -- S0~S6/장기
    CT        INT,                       -- 센터 (STATUS=S5/S6일 때 입력)
    COMMENT   TEXT,
    REMARK    TEXT,
    MEETCNT   INT,                       -- 만남 횟수
    DEL_YN    CHAR(1)      NOT NULL DEFAULT 'N',
    IN_GU     INT,                       -- 인도자 구역 (사용구역)
    SEOM_GU   INT,                       -- 섬김이 구역
    GYO_GU    INT,                       -- 교사 구역
    HIRESCORE VARCHAR(20),               -- 등록 시 두 구역 "인도,교사" (미입력=0) — 구역별 점수 집계용
    MEETCN    VARCHAR(50),               -- 시간·장소
    REG_DT    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- 등록일자 (입력 시각)
    PRIMARY KEY (NTT_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CHOIMEETSCHEDULE (
    NTT_ID     BIGINT       NOT NULL AUTO_INCREMENT,  -- 고유 id
    HIREID     BIGINT,                                -- 섭외자 ID (CHOIHIRE.NTT_ID)
    SEQ        INT          NOT NULL DEFAULT 1,       -- 회차 (1차, 2차 …)
    MEET_DT    DATE,                                  -- 만남 날짜
    FEEDBACKYN CHAR(1)      NOT NULL DEFAULT 'N',     -- 피드백 여부
    MEETCN     VARCHAR(200),                          -- 만남 시간·장소
    GOAL       VARCHAR(200),                          -- 목표
    MEETST     TINYINT      NOT NULL DEFAULT 1,       -- 진행여부: 1=선택(대기중) 2=취소 3=만남
    CANCELRS   VARCHAR(200),                          -- 취소 사유
    DEL_YN     CHAR(1)      NOT NULL DEFAULT 'N',     -- 숨김(물리삭제 대신)
    REG_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,               -- 생성 시점
    MOD_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- 최종 수정 시점
    PRIMARY KEY (NTT_ID),
    KEY idx_meet_hireid (HIREID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CHOIREPORT (
    REPORT_DT  DATE         NOT NULL,      -- 주일 날짜
    DATA       JSON         NOT NULL,      -- 파싱된 결과(services/faceOnly/mismatches) 통째로 저장
    REG_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MOD_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (REPORT_DT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 사명자(ISMISSION='Y') 체크리스트 — 관리시스템 밖 독립 공개 페이지(c0p3X0jZsu.html) 전용.
-- 요일별로 항목 목록이 분리되어 있고(관리자가 요일마다 각각 추가/수정/삭제), 항목 개수는 고정이 아니다.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_ITEM (
    ID         INT          NOT NULL AUTO_INCREMENT,
    DOW        TINYINT      NOT NULL,   -- 1=월 ... 7=일
    LABEL      VARCHAR(50)  NOT NULL DEFAULT '',
    SORT_ORDER INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이번 주(마감 전) 체크 상태 — 사용자 본인이 직접 토글. 항목이 이미 요일을 갖고 있어 DOW 컬럼 불필요.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST (
    NTT_ID  INT      NOT NULL,
    ITEM_ID INT      NOT NULL,
    CHECKED CHAR(1)  NOT NULL DEFAULT 'N',
    MOD_DT  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, ITEM_ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이번 주 요일별 스탬프 — 해당 요일 전 항목이 체크된 사용자에게 관리자가 부여.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_STAMP (
    NTT_ID INT      NOT NULL,
    DOW    TINYINT  NOT NULL,
    REG_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, DOW)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 주 마감 시 남기는 요일별 요약 이력 — 사용자 '이전주차요약' 조회용.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_HISTORY (
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

INSERT INTO CHOICHECKLIST_ITEM (DOW, LABEL, SORT_ORDER)
SELECT d.dow, '', s.seq FROM
  (SELECT 1 AS dow UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) d
  CROSS JOIN
  (SELECT 1 AS seq UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) s
WHERE NOT EXISTS (SELECT 1 FROM CHOICHECKLIST_ITEM);
