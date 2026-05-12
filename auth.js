const API = 'http://localhost:8000';

// ─── Session helpers ──────────────────────────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem('tetris_token', token);
  localStorage.setItem('tetris_user', JSON.stringify(user));
}

function getToken()  { return localStorage.getItem('tetris_token'); }
function getUser()   { const u = localStorage.getItem('tetris_user'); return u ? JSON.parse(u) : null; }
function clearSession() {
  localStorage.removeItem('tetris_token');
  localStorage.removeItem('tetris_user');
}

// ─── Already logged in → go to game ──────────────────────────────────────────
if (getToken()) {
  location.replace('game.html');
}

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(elId) {
  document.getElementById(elId).classList.add('hidden');
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || '오류가 발생했습니다');
  return data;
}

// ─── Login ────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideError('login-error');
  const btn = e.target.querySelector('.submit-btn');
  btn.disabled = true;
  try {
    const data = await apiPost('/auth/login', {
      email:    document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-pw').value,
    });
    saveSession(data.token, data.user);
    const next = new URLSearchParams(location.search).get('next') || 'game.html';
    location.replace(next);
  } catch (err) {
    showError('login-error', err.message);
    btn.disabled = false;
  }
});

// ─── Register ─────────────────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideError('reg-error');
  const btn = e.target.querySelector('.submit-btn');
  btn.disabled = true;
  try {
    const data = await apiPost('/auth/register', {
      email:    document.getElementById('reg-email').value.trim(),
      username: document.getElementById('reg-username').value.trim(),
      password: document.getElementById('reg-pw').value,
    });
    saveSession(data.token, data.user);
    location.replace('game.html');
  } catch (err) {
    showError('reg-error', err.message);
    btn.disabled = false;
  }
});
