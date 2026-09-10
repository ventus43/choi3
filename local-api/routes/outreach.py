"""/outreach  (CHOIHIRE) — 섭외자 CRUD + /check 읽기 뷰."""
from flask import Blueprint, jsonify, request

from db import db_cursor
from serializers import hire_to_check, hire_to_outreach
from sqlpatch import build_update

outreach_bp = Blueprint('outreach', __name__)


@outreach_bp.route('/outreach', methods=['GET'])
def outreach_list():
    with db_cursor() as cur:
        cur.execute("SELECT * FROM CHOIHIRE WHERE DEL_YN = 'N' ORDER BY NTT_ID DESC")
        return jsonify([hire_to_outreach(r) for r in cur.fetchall()])


@outreach_bp.route('/outreach', methods=['POST'])
def outreach_create():
    body = request.get_json(silent=True) or {}
    # 날짜 없이 등록되면 첫만남(SEQ=1)에 날짜가 안 잡혀서, 이후 "다음 만남 추가" 제약(첫만남 날짜 필요)에
    # 무조건 걸리게 됨 — 등록 시점에 필수로 막음(프론트 검증과 별개로 API 직접 호출도 방어).
    if not body.get('meetDate'):
        return jsonify({'message': '날짜는 필수 입력입니다.'}), 400
    # 입력된 두 구역을 "인도구역,교사구역" (미입력=0) 형태로 기록 — 추후 구역별 점수 집계용
    hirescore = f"{body.get('inGu') or 0},{body.get('gyoGu') or 0}"
    with db_cursor(commit=True) as cur:
        cur.execute(
            'INSERT INTO CHOIHIRE (NAME, IN_GU, GYO_GU, INDO, GYOSA, REMARK, MEET_DATE, MEETCN, HIRESCORE)'
            ' VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
            (body.get('name'),
             body.get('inGu') or None,
             body.get('gyoGu') or None,
             body.get('indo') or None,
             body.get('gyosa') or None,
             body.get('tmName') or None,
             body.get('meetDate'), body.get('meetCn'),
             hirescore),
        )
        new_id = cur.lastrowid
        # 섭외자 등록 시 1차 만남을 함께 생성 (섭외자ID + 날짜 + 시간·장소)
        cur.execute(
            'INSERT INTO CHOIMEETSCHEDULE (HIREID, SEQ, MEET_DT, MEETCN, GOAL)'
            ' VALUES (%s, 1, %s, %s, %s)',
            (new_id, body.get('meetDate') or None, body.get('meetCn'), body.get('goal')),
        )
        cur.execute('SELECT * FROM CHOIHIRE WHERE NTT_ID=%s', (new_id,))
        return jsonify(hire_to_outreach(cur.fetchone())), 201


@outreach_bp.route('/outreach/<int:ntt_id>', methods=['PATCH'])
def outreach_update(ntt_id):
    body = request.get_json(silent=True) or {}

    # MEETCN(시간·장소) 누적 추가
    if 'appendMeet' in body:
        with db_cursor(commit=True) as cur:
            cur.execute('SELECT MEETCN FROM CHOIHIRE WHERE NTT_ID=%s', (ntt_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({'message': '없음'}), 404
            cur_val = row['MEETCN'] or ''
            new_val = f"{cur_val}|{body['appendMeet']}" if cur_val else body['appendMeet']
            cur.execute('UPDATE CHOIHIRE SET MEETCN=%s WHERE NTT_ID=%s', (new_val, ntt_id))
            return jsonify({'ok': True})

    col_map = {
        'name': 'NAME',
        'inGu': 'IN_GU', 'indo': 'INDO',
        'sumGu': 'SEOM_GU', 'seomgim': 'SEOMGIM',
        'gyoGu': 'GYO_GU', 'gyosa': 'GYOSA',
        'meetDate': 'MEET_DATE', 'meetCn': 'MEETCN',
        'tmName': 'REMARK',
        'tm1': '1ST', 'tm2': '2ND', 'tm3': '3RD',
        'prg': 'PRG', 'status': 'STATUS', 'ct': 'CT',
    }
    int_cols = {'IN_GU', 'SEOM_GU', 'GYO_GU', 'CT'}
    sets, vals = build_update(col_map, body, int_cols=int_cols)
    if not sets:
        return jsonify({'message': '변경 항목 없음'}), 400
    vals.append(ntt_id)
    with db_cursor(commit=True) as cur:
        cur.execute(f'UPDATE CHOIHIRE SET {",".join(sets)} WHERE NTT_ID=%s', vals)
        return jsonify({'ok': True})


@outreach_bp.route('/outreach/<int:ntt_id>', methods=['DELETE'])
def outreach_delete(ntt_id):
    # 물리 삭제 대신 숨김 처리(soft delete)
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE CHOIHIRE SET DEL_YN='Y' WHERE NTT_ID=%s", (ntt_id,))
        return ('', 204)


@outreach_bp.route('/check', methods=['GET'])
def check_list():
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM CHOIHIRE"
            " WHERE DEL_YN = 'N'"
            "   AND (PRG IS NULL OR PRG NOT IN ('진행', '중단'))"
            " ORDER BY MEET_DATE DESC"
        )
        return jsonify([hire_to_check(r) for r in cur.fetchall()])
