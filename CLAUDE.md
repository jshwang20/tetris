# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git workflow

브랜치 통합 시 **rebase 대신 merge를 사용**한다.

```bash
git merge <branch>   # O
git rebase <branch>  # X
```

## Running the project

```bash
# 1) 백엔드 서버 먼저 실행 (포트 8000)
cd backend && bash run.sh

# 2) 프론트엔드 — WSL2 환경에서 브라우저로 직접 열기
explorer.exe index.html   # 랜딩 페이지
explorer.exe game.html    # 게임 페이지
```

백엔드 없이 프론트를 열면 리더보드에 "서버에 연결할 수 없습니다" 메시지가 표시된다.

## File structure

| 파일 | 역할 |
|------|------|
| `index.html` + `landing.css` + `landing.js` | 랜딩 페이지 |
| `game.html` + `game.css` + `game.js` | 게임 페이지 |
| `backend/main.py` | FastAPI 서버 (SQLite 연동) |
| `backend/tetris.db` | SQLite 데이터베이스 (자동 생성) |
| `backend/requirements.txt` | Python 의존성 |

페이지 간 이동: `index.html` → (플레이 버튼) → `game.html` → (← Back) → `index.html`

## Architecture: game.js

모든 게임 상태는 단일 `state` 객체로 관리한다.

```
state = { board[][], current, next, score, lines, level, running, rafId, lastTick, interval }
```

**핵심 데이터 흐름:**

```
startGame()
  └─ spawnPiece() ×2          ← current + next 초기화
       └─ checkGameOver()     ← spawn 직후 충돌 시 즉시 종료

gameLoop(timestamp)           ← requestAnimationFrame 루프
  ├─ movePiece(0,1)           ← 중력 (interval ms마다)
  └─ render()                 ← renderBoard + renderPreview + updateHUD

movePiece / rotatePiece / hardDrop
  └─ isValid(piece)           ← 벽·바닥·기존 블록 충돌 검사
       └─ getAbsoluteCells()  ← piece.y+dr, piece.x+dc로 절대 좌표 변환

lockPiece()
  └─ clearLines()             ← 꽉 찬 행 splice→unshift, 점수·레벨·interval 갱신
       └─ spawnPiece()
```

**테트로미노 정의 (`TETROMINOES`):** 각 피스는 `{ color, glow, shapes[] }`. `shapes`는 회전 상태별 `[row, col]` 오프셋 배열. 회전은 `rotIndex % shapes.length`로 인덱싱.

**렌더링:** 매 프레임 `ctx.clearRect` 후 격자선 → 잠긴 블록 → 고스트 피스(`globalAlpha=0.22`) → 현재 피스 순으로 그린다. `drawCell()`은 `shadowBlur`로 글로우, 상단 흰색 3px 줄로 하이라이트를 표현한다.

**레벨·속도:** `interval = max(100, 800 - (level-1) * 70)` ms. 10줄 클리어마다 레벨 +1.

**Wall kick:** `rotatePiece()`는 `[0, 1, -1, 2, -2]` x 오프셋을 순서대로 시도한다.

## Design tokens

두 CSS 파일 모두 동일한 CSS 변수를 사용한다. 색상을 바꿀 때는 두 파일을 함께 수정한다.

```css
--bg: #0a0a14  --surface2: #1a1a2e  --accent: #a78bfa  --text: #e9e4ff  --muted: #7c75a0
```

테트로미노 색상은 `game.js`의 `TETROMINOES` 객체와 `landing.js`의 `PIECES` 배열에 각각 정의되어 있어 **양쪽을 동기화**해야 한다.

## Architecture: backend

FastAPI + SQLite. 별도 ORM 없이 `sqlite3` 표준 라이브러리 사용.

```
POST /auth/register  { email, username, password }  → { token, user }
POST /auth/login     { email, password }            → { token, user }
POST /auth/logout    (Bearer token)                 → 204
GET  /auth/me        (Bearer token)                 → UserOut

POST /scores  (Bearer token) { score, lines, level } → ScoreOut  # 로그인 필수
GET  /scores  ?limit=10                              → ScoreOut[]

GET  /health                                         → { status: "ok" }
```

DB 스키마:
- `users(id, email, username, password_hash, created_at)`
- `sessions(id, user_id, token, created_at)`
- `scores(id, user_id, player_name, score, lines, level, created_at)`

비밀번호: `hashlib.pbkdf2_hmac` (SHA-256, 200,000 iterations, 랜덤 salt)  
세션 토큰: `secrets.token_hex(32)` — DB에 저장  
CORS: `allow_origins=["*"]` — file:// 프로토콜에서 직접 호출 가능

## Auth flow (frontend)

`session.js`를 공통 유틸로 모든 페이지에 포함. `localStorage` 키:
- `tetris_token` — Bearer 토큰
- `tetris_user` — `{ id, email, username, created_at }` JSON

페이지 흐름:
```
index.html  →  auth.html  →  game.html
               (로그인/회원가입)  (로그인 필수 — 미로그인 시 auth.html 리디렉션)
```
