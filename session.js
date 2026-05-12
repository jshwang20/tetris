// Shared session utilities — included by game.js and landing.js
const API = 'http://localhost:8000';

function getToken()  { return localStorage.getItem('tetris_token'); }
function getUser()   { const u = localStorage.getItem('tetris_user'); return u ? JSON.parse(u) : null; }
function clearSession() {
  localStorage.removeItem('tetris_token');
  localStorage.removeItem('tetris_user');
}

async function logout() {
  const token = getToken();
  if (token) {
    fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearSession();
  location.href = 'index.html';
}
