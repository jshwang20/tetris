# SQLite → MySQL 마이그레이션 작업 목록

MySQL을 Docker Compose로 띄우고, 백엔드를 `sqlite3` → `mysql-connector-python`으로 전환하는 체크리스트.

---

## 1. `docker-compose.yml` 생성 (프로젝트 루트)

```yaml
version: '3.9'
services:
  db:
    image: mysql:8.0
    container_name: tetris_mysql
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: tetris
      MYSQL_USER: tetris
      MYSQL_PASSWORD: tetrispassword
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-prootpassword"]
      interval: 5s
      timeout: 3s
      retries: 12

volumes:
  mysql_data:
```

```bash
# MySQL 컨테이너 시작
docker compose up -d

# 준비 확인 (healthy 상태가 될 때까지 대기)
docker compose ps
```

---

## 2. `backend/requirements.txt` 수정

`sqlite3`는 표준 라이브러리라 제거할 항목이 없지만, MySQL 드라이버를 추가한다.

```diff
 fastapi>=0.100.0
 uvicorn>=0.23.0
 pydantic[email]>=2.0.0
+mysql-connector-python>=8.0
```

```bash
pip install -r backend/requirements.txt
```

---

## 3. `backend/main.py` 수정

### 3-1. import 및 접속 정보

```diff
-import sqlite3
 import hashlib
 import os
 import secrets
 from datetime import datetime

+import mysql.connector

 from fastapi import FastAPI, HTTPException, Header
 from fastapi.middleware.cors import CORSMiddleware
 from pydantic import BaseModel, EmailStr, Field

-DB_PATH = os.path.join(os.path.dirname(__file__), "tetris.db")
+DB_HOST     = os.getenv("DB_HOST",     "localhost")
+DB_PORT     = int(os.getenv("DB_PORT", "3306"))
+DB_NAME     = os.getenv("DB_NAME",     "tetris")
+DB_USER     = os.getenv("DB_USER",     "tetris")
+DB_PASSWORD = os.getenv("DB_PASSWORD", "tetrispassword")
```

### 3-2. `get_conn()` 교체

```python
def get_conn():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )
```

### 3-3. `init_db()` DDL 변경

SQLite와 MySQL의 주요 차이:

| SQLite | MySQL |
|--------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)` |
| `TEXT NOT NULL UNIQUE` (이메일·토큰 등) | `VARCHAR(255) NOT NULL UNIQUE` (TEXT는 unique index 불가) |
| `PRAGMA foreign_keys = ON` | 불필요 (InnoDB 기본 지원) |
| `ENGINE` 지정 불필요 | `ENGINE=InnoDB` 추가 (외래 키 필수) |
| `?` 파라미터 바인딩 | `%s` 파라미터 바인딩 |

```python
def init_db():
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INT          NOT NULL AUTO_INCREMENT,
            email         VARCHAR(255) NOT NULL UNIQUE,
            username      VARCHAR(20)  NOT NULL,
            password_hash TEXT         NOT NULL,
            created_at    VARCHAR(30)  NOT NULL,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id         INT          NOT NULL AUTO_INCREMENT,
            user_id    INT          NOT NULL,
            token      VARCHAR(64)  NOT NULL UNIQUE,
            created_at VARCHAR(30)  NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id          INT         NOT NULL AUTO_INCREMENT,
            user_id     INT,
            player_name VARCHAR(20) NOT NULL,
            score       INT         NOT NULL,
            lines       INT         NOT NULL DEFAULT 0,
            level       INT         NOT NULL DEFAULT 1,
            created_at  VARCHAR(30) NOT NULL,
            PRIMARY KEY (id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
    """)
    conn.commit()
    cursor.close()
    conn.close()
```

### 3-4. `with get_conn() as conn:` 패턴 전면 교체

`sqlite3`의 `with conn:` 은 자동 commit/rollback 컨텍스트 매니저지만, `mysql-connector`는 그 방식을 지원하지 않는다. 모든 DB 접근 블록을 아래 패턴으로 변경한다.

**변경 전 (sqlite3 패턴):**
```python
with get_conn() as conn:
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    ...
    conn.commit()
```

**변경 후 (mysql-connector 패턴):**
```python
conn = get_conn()
cursor = conn.cursor(dictionary=True)   # dictionary=True → dict 반환 (sqlite3.Row 대체)
try:
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    row = cursor.fetchone()
    ...
    conn.commit()
finally:
    cursor.close()
    conn.close()
```

**핵심 변경 규칙 요약:**

| 항목 | sqlite3 | mysql-connector |
|------|---------|-----------------|
| 커서 생성 | `conn.execute()` 직접 | `cursor = conn.cursor(dictionary=True)` |
| 쿼리 실행 | `conn.execute(sql, params)` | `cursor.execute(sql, params)` |
| 결과 조회 | `.fetchone()` / `.fetchall()` | 동일 |
| 반환 타입 | `sqlite3.Row` → `dict(row)` | `dictionary=True`면 이미 dict |
| 마지막 삽입 ID | `cur.lastrowid` | `cursor.lastrowid` |
| 파라미터 바인딩 | `?` | `%s` |
| commit | `conn.commit()` | 동일 |
| 정리 | context manager 자동 처리 | `cursor.close()`, `conn.close()` 명시 |

### 3-5. `get_current_user()` 수정 예시

```python
def get_current_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    token = authorization[7:]
    conn = get_conn()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT u.* FROM users u
               JOIN sessions s ON s.user_id = u.id
               WHERE s.token = %s""",
            (token,),
        )
        row = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
    return row
```

---

## 4. `backend/run.sh` 수정 (선택)

환경 변수를 파일로 관리하려면 `.env`를 만들고 run.sh에서 로드한다.

```bash
# backend/.env (git에 올리지 않도록 .gitignore에 추가)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=tetris
DB_USER=tetris
DB_PASSWORD=tetrispassword
```

```bash
# backend/run.sh
#!/usr/bin/env bash
cd "$(dirname "$0")"
set -a && source .env && set +a
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# .gitignore에 추가
backend/.env
```

---

## 5. 기존 SQLite 데이터 마이그레이션 (데이터가 있는 경우)

테스트 데이터만 있다면 건너뛰어도 무방하다. 실제 데이터를 옮기려면:

```bash
# SQLite에서 CSV로 내보내기
sqlite3 backend/tetris.db -csv "SELECT * FROM users;" > users.csv
sqlite3 backend/tetris.db -csv "SELECT * FROM scores;" > scores.csv

# MySQL에 LOAD DATA로 임포트하거나, Python 스크립트로 행 단위 INSERT
```

---

## 6. 동작 확인 순서

```bash
# 1) MySQL 컨테이너 시작
docker compose up -d

# 2) healthy 대기
docker compose ps   # db 컨테이너 상태가 healthy 인지 확인

# 3) 백엔드 실행
cd backend && bash run.sh

# 4) 헬스체크
curl http://localhost:8000/health
# → {"status":"ok"}

# 5) 회원가입 테스트
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"tester","password":"123456"}'
```

---

## 작업 체크리스트

- [ ] `docker-compose.yml` 생성 및 `docker compose up -d` 실행
- [ ] `requirements.txt`에 `mysql-connector-python` 추가 및 `pip install`
- [ ] `main.py` — import 교체 (`sqlite3` → `mysql.connector`)
- [ ] `main.py` — DB 접속 정보 환경 변수화 (`DB_HOST`, `DB_PORT` 등)
- [ ] `main.py` — `get_conn()` MySQL 버전으로 교체
- [ ] `main.py` — `init_db()` DDL MySQL 문법으로 재작성
- [ ] `main.py` — 모든 `with get_conn() as conn:` 블록을 cursor 패턴으로 교체
- [ ] `main.py` — 모든 `?` 플레이스홀더를 `%s`로 교환
- [ ] `main.py` — `dict(row)` 제거 (dictionary cursor는 이미 dict 반환)
- [ ] `run.sh` — `.env` 로드 추가 (선택)
- [ ] `.gitignore` — `backend/.env`, `backend/tetris.db` 추가
- [ ] 헬스체크 및 회원가입/로그인 API 동작 확인
