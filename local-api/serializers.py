"""DB row(dict) → 프론트 JSON 변환. 라우트에서 공유.

인원: IN_GU/INDO=인도자, SEOM_GU/SEOMGIM=섬김이, GYO_GU/GYOSA=교사
      사용구역 = IN_GU. 표시구역 = SEOM_GU 있으면 IN_GU+SEOM_GU, 없으면 IN_GU+GYO_GU
      MEET_DATE=만남 날짜, MEETCN=시간·장소, 1ST/2ND/3RD=TM차수,
      PRG=선택('')/진행/중단, STATUS=S0~S4, DEL_YN='Y'면 숨김
"""


def _num(v):
    return str(v) if v is not None else ''


def _zone_display(row):
    in_gu = '' if row['IN_GU'] is None else str(row['IN_GU'])
    second = ''
    if row['SEOM_GU'] is not None:
        second = str(row['SEOM_GU'])
    elif row['GYO_GU'] is not None:
        second = str(row['GYO_GU'])
    # 같은 구역이 두 번(예: 7+7) 나오면 하나로 합쳐서 표기 (7)
    parts = list(dict.fromkeys(v for v in (in_gu, second) if v))
    return '+'.join(parts)


def hire_to_outreach(row):
    return {
        'id':       row['NTT_ID'],
        'name':     row['NAME'] or '',
        'inGu':     _num(row['IN_GU']),
        'indo':     row['INDO'] or '',
        'sumGu':    _num(row['SEOM_GU']),
        'seomgim':  row['SEOMGIM'] or '',
        'gyoGu':    _num(row['GYO_GU']),
        'gyosa':    row['GYOSA'] or '',
        'zone':     _zone_display(row),
        'zoneMain': _num(row['IN_GU']),
        'meetDate': row['MEET_DATE'] or '',
        'regDt':    row['REG_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('REG_DT') else '',
        'meetCn':   row.get('MEETCN') or '',
        'tmName':   row.get('REMARK') or '',
        'tm1':      row.get('1ST') or '',
        'tm2':      row.get('2ND') or '',
        'tm3':      row.get('3RD') or '',
        'hireScore': row.get('HIRESCORE') or '',
        'prg':      row['PRG'] or '',
        'status':   row['STATUS'] or '',
        'ct':       _num(row.get('CT')),
    }


# ── /check  (CHOIHIRE read-only, different view) ─────────────────────────────
# TM 현황에는 "진행 여부 = 선택" 인원만 노출한다.
# PRG=선택('' 또는 NULL) / 진행 / 중단 이므로, 진행·중단이 아닌 인원만 조회.

def hire_to_check(row):
    return {
        'date':   row['MEET_DATE'] or '',
        'zone':   str(row['IN_GU']) if row['IN_GU'] is not None else '',
        'name':   row['NAME'] or '',
        'tmName': row.get('REMARK') or '',
        'tm':     'O' if row['PRG'] == 'O' else '',
        'check1': row.get('1ST') or '',
        'check2': row.get('2ND') or '',
        'check3': row.get('3RD') or '',
        'status': row['STATUS'] or '진행',
        'note':   row['COMMENT'] or '',
    }


# ── /outreach/<hire>/meetings  (CHOIMEETSCHEDULE) ───────────────────────────
# 섭외자별 만남 스케줄. SEQ=회차, MEETYN=만남여부, FEEDBACKYN=피드백여부,
# CANCELRS=취소사유(있으면 취소된 만남).

def meet_to_json(row):
    return {
        'id':         row['NTT_ID'],
        'hireId':     row['HIREID'],
        'seq':        row['SEQ'],
        'meetDt':     row['MEET_DT'].strftime('%Y-%m-%d') if row.get('MEET_DT') else '',
        'meetCn':     row['MEETCN'] or '',
        'goal':       row['GOAL'] or '',
        'feedbackYn': row['FEEDBACKYN'] or 'N',
        'meetYn':     row['MEETYN'] or 'N',
        'cancelRs':   row['CANCELRS'] or '',
        'regDt':      row['REG_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('REG_DT') else '',
        'modDt':      row['MOD_DT'].strftime('%Y-%m-%d %H:%M:%S') if row.get('MOD_DT') else '',
    }


_MEET_HIRE_JOIN = (
    "SELECT m.*, h.NAME AS HIRE_NAME, h.IN_GU, h.SEOM_GU, h.GYO_GU,"
    "       h.INDO, h.SEOMGIM, h.GYOSA, h.PRG"
    " FROM CHOIMEETSCHEDULE m"
    " LEFT JOIN CHOIHIRE h ON h.NTT_ID = m.HIREID"
)


def meeting_with_hire_to_json(row):
    d = meet_to_json(row)
    d['hireName']   = row.get('HIRE_NAME') or ''
    d['zone']       = _zone_display(row)
    d['indo']       = row.get('INDO') or ''
    d['seomgim']    = row.get('SEOMGIM') or ''
    d['gyosa']      = row.get('GYOSA') or ''
    d['meetPerson'] = row.get('SEOMGIM') or row.get('INDO') or ''  # 만남자: 섬김이 우선, 없으면 인도자
    return d
