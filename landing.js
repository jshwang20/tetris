// ─── Auth nav ─────────────────────────────────────────────────────────────────
(function () {
  const user = getUser();
  const greeting = document.getElementById('auth-greeting');
  const link     = document.getElementById('auth-link');
  const logoutBtn = document.getElementById('auth-logout');
  if (user) {
    greeting.textContent = `${user.username} 님`;
    link.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    logoutBtn.addEventListener('click', logout);
  }
})();

// ─── Leaderboard ──────────────────────────────────────────────────────────────
// API constant already declared in session.js

function escHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadLeaderboard() {
  const tbody = document.getElementById('lb-body');
  if (!tbody) return;
  try {
    const res  = await fetch(`${API}/scores?limit=10`);  // API from session.js
    const rows = await res.json();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="lb-loading">아직 기록이 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r, i) => `
      <tr>
        <td class="td-rank">${i + 1}</td>
        <td class="td-name">${escHtml(r.player_name)}</td>
        <td class="td-score">${r.score.toLocaleString()}</td>
        <td>${r.level}</td>
        <td>${r.lines}</td>
      </tr>`).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="lb-loading">서버에 연결할 수 없습니다</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);

// ─── Pieces preview ───────────────────────────────────────────────────────────
const PIECES = [
  { name: 'I', color: '#22d3ee', glow: 'rgba(34,211,238,0.5)',   cells: [[0,0],[0,1],[0,2],[0,3]] },
  { name: 'O', color: '#fde047', glow: 'rgba(253,224,71,0.5)',   cells: [[0,0],[0,1],[1,0],[1,1]] },
  { name: 'T', color: '#c084fc', glow: 'rgba(192,132,252,0.5)',  cells: [[0,1],[1,0],[1,1],[1,2]] },
  { name: 'S', color: '#4ade80', glow: 'rgba(74,222,128,0.5)',   cells: [[0,1],[0,2],[1,0],[1,1]] },
  { name: 'Z', color: '#f87171', glow: 'rgba(248,113,113,0.5)',  cells: [[0,0],[0,1],[1,1],[1,2]] },
  { name: 'J', color: '#60a5fa', glow: 'rgba(96,165,250,0.5)',   cells: [[0,0],[1,0],[1,1],[1,2]] },
  { name: 'L', color: '#fb923c', glow: 'rgba(251,146,60,0.5)',   cells: [[0,2],[1,0],[1,1],[1,2]] },
];

const CELL = 18;
const PAD  = 2;

const grid = document.getElementById('pieces-grid');

PIECES.forEach(({ name, color, glow, cells }) => {
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const h    = Math.max(...rows) - Math.min(...rows) + 1;
  const w    = Math.max(...cols) - Math.min(...cols) + 1;

  const card = document.createElement('div');
  card.className = 'piece-card';

  const canvas = document.createElement('canvas');
  canvas.className = 'piece-canvas';
  canvas.width  = 4 * CELL;
  canvas.height = 3 * CELL;

  const offR = Math.floor((3 - h) / 2) - Math.min(...rows);
  const offC = Math.floor((4 - w) / 2) - Math.min(...cols);

  const ctx = canvas.getContext('2d');
  cells.forEach(([r, c]) => {
    const x = (offC + c) * CELL + PAD;
    const y = (offR + r) * CELL + PAD;
    const s = CELL - PAD * 2;
    ctx.shadowColor = glow;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = color;
    ctx.fillRect(x, y, s, s);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.2)';
    ctx.fillRect(x, y, s, 3);
  });

  const label = document.createElement('p');
  label.className = 'piece-name';
  label.textContent = name + '-piece';

  card.appendChild(canvas);
  card.appendChild(label);
  grid.appendChild(card);
});
