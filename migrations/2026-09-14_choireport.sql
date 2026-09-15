-- 주일예배 구역별 자동분석(7Ius67Cp) 결과 저장용 테이블 신규 추가.
-- 새 테이블 생성뿐이라 기존 데이터에 영향 없음 — 운영 DB에서 실행: mysql -u choi3 -p choi3 < migrations/2026-09-14_choireport.sql

USE choi3;

CREATE TABLE IF NOT EXISTS CHOIREPORT (
    REPORT_DT  DATE         NOT NULL,
    DATA       JSON         NOT NULL,
    REG_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    MOD_DT     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (REPORT_DT)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
