-- choi3 전체 스키마 — 유일한 소스(단일 파일로 관리, 별도 migrations/ 없음).
-- 모든 CREATE TABLE이 IF NOT EXISTS라 신규 DB든 이미 데이터가 있는 기존 DB(운영/로컬)든
-- 그대로 재실행해도 안전 — 새 테이블이 추가되면 이 파일에 이어 쓰고, DB에는 그냥 다시 실행하면 됨.
-- 실행: mysql -uroot -p < mysql-init/01_schema.sql  (docker-compose 로컬은 최초 기동 시 자동 실행)
CREATE DATABASE IF NOT EXISTS choi3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'choi3'@'%' IDENTIFIED BY 'tjdgh2814@@';
GRANT ALL PRIVILEGES ON choi3.* TO 'choi3'@'%';
FLUSH PRIVILEGES;

USE choi3;

-- 부서 — 구역(GU)들을 묶는 상위 단위. 부서마다 전용 비밀번호로 주간보고(7Ius67Cp.html)에
-- 로그인하며, 로그인한 부서의 구역/인원/보고 데이터만 보인다. 부서 생성·관리는 choi3 메인
-- SPA 가 아니라 7Ius67Cp.html 안의 별도 "관리자" 화면(아래 CHOIDEPT_ADMIN)에서 한다.
-- PASSWORD 는 UNIQUE — 로그인이 비밀번호 하나만으로 부서를 식별하므로 중복되면 안 됨.
CREATE TABLE IF NOT EXISTS CHOIDEPT (
    ID       INT          NOT NULL AUTO_INCREMENT,
    NAME     VARCHAR(50)  NOT NULL,
    PASSWORD VARCHAR(100) NOT NULL,
    REG_DT   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID),
    UNIQUE KEY uk_dept_password (PASSWORD)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 부서 관리자 비밀번호(단일 행) — 7Ius67Cp.html 안의 "관리자" 화면(부서 추가/수정)
-- 전용. 부서별 로그인 비밀번호(CHOIDEPT.PASSWORD)·choi3 본프로젝트 OFFICE_PASSWORD 와는
-- 완전히 별개. CHOICHECKLIST_ADMIN 과 동일한 패턴(DB 저장이라 관리자가 화면에서 바꿀 수 있음).
CREATE TABLE IF NOT EXISTS CHOIDEPT_ADMIN (
    ID       TINYINT      NOT NULL,
    PASSWORD VARCHAR(100) NOT NULL,
    PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO CHOIDEPT_ADMIN (ID, PASSWORD) VALUES (1, 'changeme-admin');

CREATE TABLE IF NOT EXISTS CHOIMEMBER (
    NTT_ID  INT          NOT NULL,
    DEPT_ID INT          NOT NULL DEFAULT 1,   -- 소속 부서 (CHOIDEPT.ID)
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

-- 부서별로 완전히 분리된 보고 — 같은 날짜라도 부서마다 별도 행(PK가 DEPT_ID+REPORT_DT).
CREATE TABLE IF NOT EXISTS CHOIREPORT (
    DEPT_ID    INT          NOT NULL DEFAULT 1,   -- 소속 부서 (CHOIDEPT.ID)
    REPORT_DT  DATE         NOT NULL,      -- 주일 날짜
    DATA       JSON         NOT NULL,      -- 파싱된 결과(services/faceOnly/mismatches) 통째로 저장
    REG_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MOD_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (DEPT_ID, REPORT_DT)
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

-- 날짜별 체크 상태 — 사용자 본인이 직접 토글. CHK_DATE = 그 항목 요일(DOW)이 속한 주의 실제
-- 캘린더 날짜(체크리스트 기준 "오늘"은 KST 오전 10시 컷오프, mychecklist.py _checklist_today 참고).
-- 요일별로 실제 날짜가 다르므로 마감(초기화) 없이도 주가 바뀌면 자동으로 새 행이 쌓인다.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST (
    NTT_ID   INT      NOT NULL,
    ITEM_ID  INT      NOT NULL,
    CHK_DATE DATE     NOT NULL,
    CHECKED  CHAR(1)  NOT NULL DEFAULT 'N',
    MOD_DT   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, ITEM_ID, CHK_DATE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 날짜별 스탬프 — 해당 날짜(그 주 해당 요일) 전 항목이 체크된 사용자에게 관리자가 부여.
-- STAMP_DATE 가 곧 이력이라 CHOICHECKLIST_HISTORY/주 마감 없이도 기간별 조회가 가능하다.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_STAMP (
    NTT_ID     INT      NOT NULL,
    DOW        TINYINT  NOT NULL,   -- 표시 편의용(요일 라벨) — 실제 식별은 STAMP_DATE
    STAMP_DATE DATE     NOT NULL,
    REG_DT     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (NTT_ID, STAMP_DATE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 체크리스트 공개 페이지 관리자 비밀번호(단일 행) — 관리자가 화면에서 바꿀 수 있다.
CREATE TABLE IF NOT EXISTS CHOICHECKLIST_ADMIN (
    ID       TINYINT      NOT NULL,
    PASSWORD VARCHAR(100) NOT NULL,
    PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO CHOICHECKLIST_ADMIN (ID, PASSWORD) VALUES (1, 'chlrkd3qn');

-- 기본 부서 — 부서 개념 도입 이전 데이터(DEPT_ID 기본값 1)가 속하는 자리. 비밀번호는
-- 반드시 7Ius67Cp.html "관리자" 화면에서 실제 값으로 바꿀 것(공용 REPORT_PASSWORD 는 폐지됨).
INSERT IGNORE INTO CHOIDEPT (ID, NAME, PASSWORD) VALUES (1, '기본부서', 'changeme');

INSERT INTO CHOICHECKLIST_ITEM (DOW, LABEL, SORT_ORDER)
SELECT d.dow, '', s.seq FROM
  (SELECT 1 AS dow UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) d
  CROSS JOIN
  (SELECT 1 AS seq UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) s
WHERE NOT EXISTS (SELECT 1 FROM CHOICHECKLIST_ITEM);
