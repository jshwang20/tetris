// ─── Auth guard ───────────────────────────────────────────────────────────────
(function () {
  if (!getToken()) {
    location.replace('auth.html?next=game.html');
  }
  const user = getUser();
  if (user) {
    document.getElementById('user-greeting').textContent = `${user.username} 님`;
  }
  document.getElementById('logout-btn').addEventListener('click', logout);
})();

// ─── API helpers ──────────────────────────────────────────────────────────────
async function postScore(score, lines, level) {
  try {
    await fetch(`${API}/scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ score, lines, level }),
    });
    return true;
  } catch {
    return false;
  }
}

async function fetchLeaderboard(limit = 5) {
  try {
    const res = await fetch(`${API}/scores?limit=${limit}`);
    return await res.json();
  } catch {
    return [];
  }
}

async function fetchMyHistory() {
  try {
    const res = await fetch(`${API}/scores/me`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return await res.json();
  } catch {
    return [];
  }
}

function renderLeaderboard(rows) {
  const el = document.getElementById('leaderboard-list');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<li class="lb-empty">기록 없음</li>'; return; }
  el.innerHTML = rows.map((r, i) =>
    `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escHtml(r.player_name)}</span><span class="lb-score">${r.score.toLocaleString()}</span></li>`
  ).join('');
}

function renderMyHistory(rows) {
  const el = document.getElementById('my-history-list');
  if (!el) return;
  if (!rows.length) { el.innerHTML = '<li class="lb-empty">기록 없음</li>'; return; }
  el.innerHTML = rows.slice(0, 5).map((r, i) =>
    `<li><span class="lb-rank">${i + 1}</span><span class="lb-score">${r.score.toLocaleString()}</span><span class="lb-meta">Lv.${r.level}</span></li>`
  ).join('');
}

function updateGlobalBest(rows) {
  if (!rows.length) return;
  const top = rows[0];
  document.getElementById('global-best-score').textContent = top.score.toLocaleString();
  document.getElementById('global-best-name').textContent  = top.player_name;
}

function escHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const COLS          = 10;
const ROWS          = 20;
const CELL          = 32;
const PREVIEW_CELL  = 24;
const PREVIEW_GRID  = 5;
const SCORE_TABLE   = [0, 100, 300, 500, 800];
const BASE_INTERVAL = 800;

// ─── Tetromino definitions ────────────────────────────────────────────────────
const TETROMINOES = {
  I: {
    color: '#22d3ee', glow: 'rgba(34,211,238,0.55)',
    shapes: [
      [[0,0],[0,1],[0,2],[0,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,1],[1,1],[2,1],[3,1]],
    ],
  },
  O: {
    color: '#fde047', glow: 'rgba(253,224,71,0.55)',
    shapes: [[[0,0],[0,1],[1,0],[1,1]]],
  },
  T: {
    color: '#c084fc', glow: 'rgba(192,132,252,0.55)',
    shapes: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,0],[1,0],[1,1],[2,0]],
      [[1,0],[1,1],[1,2],[2,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
  },
  S: {
    color: '#4ade80', glow: 'rgba(74,222,128,0.55)',
    shapes: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
  },
  Z: {
    color: '#f87171', glow: 'rgba(248,113,113,0.55)',
    shapes: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
  },
  J: {
    color: '#60a5fa', glow: 'rgba(96,165,250,0.55)',
    shapes: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,0],[0,1],[1,0],[2,0]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,0],[2,1]],
    ],
  },
  L: {
    color: '#fb923c', glow: 'rgba(251,146,60,0.55)',
    shapes: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,0],[1,0],[2,0],[2,1]],
      [[1,0],[1,1],[1,2],[2,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ],
  },
};

const PIECE_KEYS = Object.keys(TETROMINOES);

// ─── Canvas setup ─────────────────────────────────────────────────────────────
const boardCanvas   = document.getElementById('board');
const previewCanvas = document.getElementById('preview');
const ctx           = boardCanvas.getContext('2d');
const pCtx          = previewCanvas.getContext('2d');

boardCanvas.width    = COLS * CELL;
boardCanvas.height   = ROWS * CELL;
previewCanvas.width  = PREVIEW_GRID * PREVIEW_CELL;
previewCanvas.height = PREVIEW_GRID * PREVIEW_CELL;

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  board:    [],
  current:  null,
  next:     null,
  score:    0,
  lines:    0,
  level:    1,
  running:  false,
  rafId:    null,
  lastTick: 0,
  interval: BASE_INTERVAL,
};

// ─── Board helpers ────────────────────────────────────────────────────────────
function initBoard() {
  state.board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

function emptyRow() {
  return new Array(COLS).fill(null);
}

// ─── Piece utilities ──────────────────────────────────────────────────────────
function randomPiece() {
  const type = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
  const def  = TETROMINOES[type];
  return { type, rotIndex: 0, x: 3, y: 0, color: def.color, glow: def.glow };
}

function getAbsoluteCells(piece) {
  const shapes = TETROMINOES[piece.type].shapes;
  return shapes[piece.rotIndex % shapes.length].map(([dr, dc]) => [piece.y + dr, piece.x + dc]);
}

function isValid(piece) {
  for (const [r, c] of getAbsoluteCells(piece)) {
    if (c < 0 || c >= COLS) return false;
    if (r >= ROWS) return false;
    if (r >= 0 && state.board[r][c] !== null) return false;
  }
  return true;
}

// ─── Game actions ─────────────────────────────────────────────────────────────
function spawnPiece() {
  state.current = state.next || randomPiece();
  state.next    = randomPiece();
  if (!isValid(state.current)) {
    checkGameOver();
  }
}

function movePiece(dx, dy) {
  if (!state.running) return;
  const candidate = { ...state.current, x: state.current.x + dx, y: state.current.y + dy };
  if (isValid(candidate)) {
    state.current = candidate;
  } else if (dy === 1) {
    lockPiece();
  }
}

function rotatePiece() {
  if (!state.running) return;
  const shapes = TETROMINOES[state.current.type].shapes;
  const newRot = (state.current.rotIndex + 1) % shapes.length;
  const kicks  = [0, 1, -1, 2, -2];
  for (const kick of kicks) {
    const candidate = { ...state.current, rotIndex: newRot, x: state.current.x + kick };
    if (isValid(candidate)) {
      state.current = candidate;
      return;
    }
  }
}

function hardDrop() {
  if (!state.running) return;
  let ghost = { ...state.current };
  while (isValid({ ...ghost, y: ghost.y + 1 })) ghost.y++;
  state.current = ghost;
  lockPiece();
}

function lockPiece() {
  for (const [r, c] of getAbsoluteCells(state.current)) {
    if (r >= 0) state.board[r][c] = state.current.color;
  }
  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  let r = ROWS - 1;
  while (r >= 0) {
    if (state.board[r].every(cell => cell !== null)) {
      state.board.splice(r, 1);
      state.board.unshift(emptyRow());
      cleared++;
    } else {
      r--;
    }
  }
  if (cleared > 0) {
    state.score    += SCORE_TABLE[cleared] ?? 0;
    state.lines    += cleared;
    state.level     = Math.floor(state.lines / 10) + 1;
    state.interval  = Math.max(100, BASE_INTERVAL - (state.level - 1) * 70);
  }
}

async function checkGameOver() {
  if (!isValid(state.current)) {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    document.getElementById('final-score').textContent = state.score;
    document.getElementById('overlay').classList.remove('hidden');

    const saveEl = document.getElementById('save-status');
    saveEl.textContent = '점수 저장 중...';
    saveEl.className = 'overlay-saved';

    const ok = await postScore(state.score, state.lines, state.level);
    saveEl.textContent = ok ? '점수가 저장됐습니다!' : '저장 실패 (서버 오류)';
    saveEl.style.color = ok ? '' : '#f87171';

    // 저장 후 개인 기록 + 전체 리더보드 + 글로벌 베스트 갱신
    const [lb, history] = await Promise.all([fetchLeaderboard(5), fetchMyHistory()]);
    renderLeaderboard(lb);
    renderMyHistory(history);
    updateGlobalBest(lb);
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawCell(context, col, row, color, glow, cellSize) {
  const x = col * cellSize;
  const y = row * cellSize;
  const m = 1;
  context.shadowColor = glow;
  context.shadowBlur  = 12;
  context.fillStyle   = color;
  context.fillRect(x + m, y + m, cellSize - m * 2, cellSize - m * 2);
  context.shadowBlur  = 0;
  context.fillStyle   = 'rgba(255,255,255,0.18)';
  context.fillRect(x + m, y + m, cellSize - m * 2, 3);
}

function ghostY() {
  let ghost = { ...state.current };
  while (isValid({ ...ghost, y: ghost.y + 1 })) ghost.y++;
  return ghost.y;
}

function renderBoard() {
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(COLS * CELL, r * CELL); ctx.stroke();
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.board[r][c]) {
        const color = state.board[r][c];
        const def   = Object.values(TETROMINOES).find(t => t.color === color);
        drawCell(ctx, c, r, color, def ? def.glow : 'transparent', CELL);
      }
    }
  }

  if (state.current) {
    const gy    = ghostY();
    const ghost = { ...state.current, y: gy };
    ctx.globalAlpha = 0.22;
    for (const [r, c] of getAbsoluteCells(ghost)) {
      if (r >= 0) drawCell(ctx, c, r, state.current.color, 'transparent', CELL);
    }
    ctx.globalAlpha = 1;

    for (const [r, c] of getAbsoluteCells(state.current)) {
      if (r >= 0) drawCell(ctx, c, r, state.current.color, state.current.glow, CELL);
    }
  }
}

function renderPreview() {
  pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (!state.next) return;

  const shapes = TETROMINOES[state.next.type].shapes[0];
  const rows   = shapes.map(([r]) => r);
  const cols   = shapes.map(([, c]) => c);
  const minR   = Math.min(...rows);
  const minC   = Math.min(...cols);
  const maxR   = Math.max(...rows);
  const maxC   = Math.max(...cols);
  const h      = maxR - minR + 1;
  const w      = maxC - minC + 1;
  const offR   = Math.floor((PREVIEW_GRID - h) / 2) - minR;
  const offC   = Math.floor((PREVIEW_GRID - w) / 2) - minC;

  for (const [dr, dc] of shapes) {
    drawCell(pCtx, offC + dc, offR + dr, state.next.color, state.next.glow, PREVIEW_CELL);
  }
}

function updateHUD() {
  document.getElementById('score').textContent = state.score;
  document.getElementById('lines').textContent = state.lines;
  document.getElementById('level').textContent = state.level;
}

function render() {
  renderBoard();
  renderPreview();
  updateHUD();
}

// ─── Input ────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); movePiece(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); movePiece(+1, 0); break;
    case 'ArrowDown':  e.preventDefault(); movePiece(0, +1); break;
    case 'ArrowUp':    e.preventDefault(); rotatePiece();    break;
    case ' ':          e.preventDefault(); hardDrop();        break;
  }
});

// ─── Game loop ────────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!state.running) return;
  if (timestamp - state.lastTick >= state.interval) {
    movePiece(0, 1);
    state.lastTick = timestamp;
  }
  render();
  state.rafId = requestAnimationFrame(gameLoop);
}

// ─── Game control ─────────────────────────────────────────────────────────────
function startGame() {
  cancelAnimationFrame(state.rafId);
  initBoard();
  state.score    = 0;
  state.lines    = 0;
  state.level    = 1;
  state.interval = BASE_INTERVAL;
  state.next     = randomPiece();
  spawnPiece();
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('save-status').className = 'overlay-saved hidden';
  state.running  = true;
  state.lastTick = performance.now();
  state.rafId    = requestAnimationFrame(gameLoop);
}

document.getElementById('restart-btn').addEventListener('click', startGame);

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchLeaderboard(5).then(rows => {
    renderLeaderboard(rows);
    updateGlobalBest(rows);
  });
  startGame();
});
