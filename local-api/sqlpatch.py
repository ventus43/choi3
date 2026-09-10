"""부분 수정(PATCH/PUT) 공통 헬퍼 — body 의 키를 DB 컬럼으로 매핑해 UPDATE 절을 만든다."""


def build_update(col_map, body, int_cols=(), blank_to_null=True):
    """col_map: {요청키: DB컬럼}. body 에 있는 키만 사용.

    blank_to_null=True 면 '' 는 NULL 로, int_cols 에 속한 컬럼은 ''/None 을 NULL 로 바꾼다.
    반환: (sets, vals) — sets 는 "`COL`=%s" 목록, vals 는 대응 값 목록.
    """
    sets, vals = [], []
    for fk, col in col_map.items():
        if fk not in body:
            continue
        sets.append(f'`{col}`=%s')
        v = body[fk]
        if blank_to_null and (v == '' or (col in int_cols and v in ('', None))):
            v = None
        vals.append(v)
    return sets, vals
