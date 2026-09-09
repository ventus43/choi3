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
    MEETYN     CHAR(1)      NOT NULL DEFAULT 'N',     -- 만남 여부
    CANCELRS   VARCHAR(200),                          -- 취소 사유
    DEL_YN     CHAR(1)      NOT NULL DEFAULT 'N',     -- 숨김(물리삭제 대신)
    REG_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,               -- 생성 시점
    MOD_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- 최종 수정 시점
    PRIMARY KEY (NTT_ID),
    KEY idx_meet_hireid (HIREID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
