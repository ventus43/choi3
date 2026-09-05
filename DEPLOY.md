# choi3 배포 (별도 repo → EC2, 서브도메인 choi3.gventus.store)

구성: 정적 빌드(nginx) + Flask API(gunicorn, PM2, 127.0.0.1:8001) + 기존 EC2의 system MySQL.

```
브라우저 → https://choi3.gventus.store
            ├─ /            → /home/ubuntu/choi3/dist  (정적, SPA 폴백)
            └─ /api/*       → 127.0.0.1:8001  (gunicorn: server:app)
                                └─ MySQL 127.0.0.1:3306  DB=choi3
```

---

## A. 최초 1회 (수동)

### 1) GitHub
- 이 폴더(`choi3/`)를 **새 저장소**로 만들고 push. 기본 브랜치 `main`.
- 저장소 **Settings → Secrets and variables → Actions** 에 등록:

| Secret | 필수 | 설명 |
|---|---|---|
| `SSH_KEY` | ✅ | EC2 접속용 개인키(.pem) 전체 내용 |
| `EC2_HOST` | ✅ | EC2 퍼블릭 IP 또는 도메인 |
| `OFFICE_PASSWORD` | 권장 | 백오피스 공통 비밀번호 (미설정 시 `choi3`) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | 선택 | EC2 MySQL 접속정보가 기본값과 다를 때만. 기본값: `127.0.0.1` / `3306` / `choi3` / `tjdgh2814@@` / `choi3` |

### 2) DNS
- `choi3.gventus.store` A레코드 → EC2 IP.

### 3) EC2 (SSH 접속 후)
```bash
sudo mkdir -p /home/ubuntu/choi3/{dist,api,nginx}
sudo chown -R ubuntu:ubuntu /home/ubuntu/choi3

# Node (프론트 빌드는 Actions에서 하지만, 없으면 설치)
node -v || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)

# PM2 (기존 gventus-api 로 이미 설치돼 있으면 생략)
command -v pm2 || sudo npm install -g pm2

# MySQL 확인 — 테이블/데이터가 들어있어야 함
mysql -uchoi3 -p'tjdgh2814@@' choi3 -e "SHOW TABLES;"
#  CHOIHIRE / CHOIMEETSCHEDULE / CHOIMEMBER 3개가 보여야 정상
#  (스키마만 새로 만들 경우: mysql -uroot -p < mysql-init/01_schema.sql)

# 인증서 발급 (nginx 플러그인)
sudo certbot certonly --nginx -d choi3.gventus.store
```

> MySQL 타임존: `REG_DT`/`MOD_DT` 는 앱이 커넥션마다 `SET time_zone='+09:00'` 하므로 KST로 저장됩니다.
> system MySQL 전역 타임존까지 KST로 맞추려면 `my.cnf` 에 `default-time-zone = '+09:00'` 후 재시작(선택).

---

## B. 자동 배포 (push 시)

`main` 에 push → `.github/workflows/deploy.yml` 실행:

1. `npm ci && VITE_API_BASE_URL=/api npm run build` → `dist/`
2. `dist/` → `EC2:/home/ubuntu/choi3/dist/` (rsync --delete)
3. `local-api/` → `EC2:/home/ubuntu/choi3/api/`
4. 시크릿을 `choi3.env` 로 만들어 서버에 전송
5. venv + `pip install -r requirements.txt` (gunicorn 포함) → `pm2 restart choi3-api` (127.0.0.1:8001)
6. `nginx/choi3.conf` → `/etc/nginx/sites-available/choi3` 링크 + `nginx -t` + `reload`

수동 실행: Actions 탭 → Deploy choi3 to EC2 → Run workflow.

---

## C. 접속

```
https://choi3.gventus.store/choi3-office/Y2hvaTM=
비밀번호: OFFICE_PASSWORD (기본 choi3)
```

## D. 트러블슈팅

| 증상 | 확인 |
|---|---|
| 502 Bad Gateway | `pm2 logs choi3-api` — gunicorn 죽었는지 / DB 접속 실패 |
| API 401 전부 | `OFFICE_PASSWORD` 시크릿과 입력한 비번 불일치 |
| `nginx -t` 실패로 워크플로우 중단 | 인증서 미발급 (A-3의 certbot). 발급 후 재실행 |
| 페이지는 뜨는데 데이터 안 나옴 | `/api/` 프록시 확인, `pm2 status`, MySQL 접속정보 시크릿 |
| 새 컬럼/테이블 없음 (신규 DB) | `mysql -uroot -p < mysql-init/01_schema.sql` |
