import hashlib
import os
import secrets
import sqlite3
from datetime import datetime

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

DB_PATH = os.path.join(os.path.dirname(__file__), "tetris.db")

app = FastAPI(title="Tetris API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


# ─── DB ───────────────────────────────────────────────────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                email         TEXT    NOT NULL UNIQUE,
                username      TEXT    NOT NULL,
                password_hash TEXT    NOT NULL,
                created_at    TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token      TEXT    NOT NULL UNIQUE,
                created_at TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
                player_name TEXT    NOT NULL,
                score       INTEGER NOT NULL,
                lines       INTEGER NOT NULL DEFAULT 0,
                level       INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT    NOT NULL
            )
        """)
        conn.commit()


init_db()


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return f"{salt}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":", 1)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
        return secrets.compare_digest(dk.hex(), hashed)
    except Exception:
        return False


# ─── Auth helpers ─────────────────────────────────────────────────────────────

def get_current_user(authorization: str | None):
    """Resolve Bearer token → user row. Raises 401 on failure."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    token = authorization[7:]
    with get_conn() as conn:
        row = conn.execute(
            """SELECT u.* FROM users u
               JOIN sessions s ON s.user_id = u.id
               WHERE s.token = ?""",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
    return dict(row)


def now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=1, max_length=20)
    password: str = Field(..., min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    created_at: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class ScoreIn(BaseModel):
    score: int = Field(..., ge=0)
    lines: int = Field(0, ge=0)
    level: int = Field(1, ge=1)


class ScoreOut(BaseModel):
    id: int
    player_name: str
    score: int
    lines: int
    level: int
    created_at: str


# ─── Auth routes ──────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn):
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM users WHERE email = ?", (body.email,)
        ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다")

        pw_hash = hash_password(body.password)
        cur = conn.execute(
            "INSERT INTO users (email, username, password_hash, created_at) VALUES (?,?,?,?)",
            (body.email, body.username, pw_hash, now_iso()),
        )
        user_id = cur.lastrowid

        token = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO sessions (user_id, token, created_at) VALUES (?,?,?)",
            (user_id, token, now_iso()),
        )
        conn.commit()

        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())

    return {"token": token, "user": user}


@app.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (body.email,)
        ).fetchone()
        if not row or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

        token = secrets.token_hex(32)
        conn.execute(
            "INSERT INTO sessions (user_id, token, created_at) VALUES (?,?,?)",
            (row["id"], token, now_iso()),
        )
        conn.commit()

    return {"token": token, "user": dict(row)}


@app.post("/auth/logout", status_code=204)
def logout(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        return
    token = authorization[7:]
    with get_conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


@app.get("/auth/me", response_model=UserOut)
def me(authorization: str | None = Header(default=None)):
    user = get_current_user(authorization)
    return user


# ─── Score routes ─────────────────────────────────────────────────────────────

@app.post("/scores", response_model=ScoreOut, status_code=201)
def create_score(body: ScoreIn, authorization: str | None = Header(default=None)):
    user = get_current_user(authorization)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO scores (user_id, player_name, score, lines, level, created_at) VALUES (?,?,?,?,?,?)",
            (user["id"], user["username"], body.score, body.lines, body.level, now_iso()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM scores WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


@app.get("/scores", response_model=list[ScoreOut])
def get_scores(limit: int = 10):
    """유저별 최고 점수 1개씩 반환 (리더보드용)."""
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be 1–100")
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT s.*
            FROM scores s
            INNER JOIN (
                SELECT user_id, MAX(score) AS best
                FROM scores
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            ) b ON s.user_id = b.user_id AND s.score = b.best
            GROUP BY s.user_id
            ORDER BY s.score DESC, s.created_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/scores/me", response_model=list[ScoreOut])
def get_my_scores(authorization: str | None = Header(default=None)):
    """로그인한 사용자의 전체 플레이 기록 (최신순)."""
    user = get_current_user(authorization)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user["id"],),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/health")
def health():
    return {"status": "ok"}
