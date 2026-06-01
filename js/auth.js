/* ═══════════════════════════════════════════════
   CryptoSignal — auth.js
   Authentication module
═══════════════════════════════════════════════ */

async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
}

const isAuth = () => sessionStorage.getItem('cs_a') === '1';

window.addEventListener('DOMContentLoaded', () => isAuth() ? showApp() : null);

async function doLogin() {
  const k = document.getElementById('loginKey').value.trim();
  const btn = document.getElementById('loginBtn');
  if (k.length < 8) { showLgErr('Mínimo 8 caracteres'); return; }
  btn.disabled = true;
  btn.textContent = 'Verificando...';
  const h = await sha256(k);
  if (h !== ACCESS_KEY_HASH) {
    await new Promise(r => setTimeout(r, 1200));
    showLgErr('Clave incorrecta');
    btn.disabled = false;
    btn.textContent = 'Verificar acceso';
    return;
  }
  sessionStorage.setItem('cs_a', '1');
  showApp();
}

function doLogout() {
  sessionStorage.removeItem('cs_a');
  stopAll();
  location.reload();
}

function showLgErr(m) {
  const e = document.getElementById('loginErr');
  e.textContent = m;
  e.style.display = 'block';
}

function showApp() {
  document.getElementById('loginView').classList.remove('active');
  document.getElementById('appView').classList.add('active');
  document.getElementById('loginKey').value = '';
  try { ['cs_acc4','cs_ver4'].forEach(k => localStorage.removeItem(k)); } catch(e) {}
  sysLog('Sesión activa. Conectando a mercados...');
  initApp();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginView').classList.contains('active')) {
    doLogin();
  }
});
