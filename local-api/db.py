"""MySQL 커넥션. 요청마다 새 커넥션을 열고 닫는다(기존 동작 유지)."""
from contextlib import contextmanager

import pymysql

from config import DB as _DB

_CONN_KWARGS = dict(
    _DB,
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor,
    init_command="SET time_zone = '+09:00'",   # REG_DT/MOD_DT 등 CURRENT_TIMESTAMP 를 KST 로 저장
)


def get_conn():
    return pymysql.connect(**_CONN_KWARGS)


@contextmanager
def db_cursor(commit=False):
    """`with db_cursor(commit=True) as cur:` — 커넥션 열기/커밋/닫기 보일러플레이트를 한 곳에 모은다."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            yield cur
            if commit:
                conn.commit()
    finally:
        conn.close()
