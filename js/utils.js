/* ═══════════════════════════════════════════════
   CryptoSignal — utils.js
   Helper functions & toast/log utilities
═══════════════════════════════════════════════ */

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 10000) return '$' + n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

function fmtP(n) {
  if (isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtFx(n) {
  return n ? n.toFixed(5) : '—';
}

function sysLog(m) {
  const b = document.getElementById('logBox');
  if (!b) return;
  const d = document.createElement('div');
  d.className = 'log-line';
  const t = new Date().toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  d.innerHTML = '<span class="log-ts">' + t + '</span>' + m;
  b.prepend(d);
  while (b.children.length > 12) b.removeChild(b.lastChild);
}

let _toastT = null;
function showToast(msg, type = 'buy', dur = 4000) {
  const t  = document.getElementById('toast');
  const i  = document.getElementById('toastIco');
  const m  = document.getElementById('toastMsg');
  t.className = 'toast ' + type;
  i.textContent = type === 'buy' ? '▲' : type === 'sell' ? '▼' : '✓';
  m.innerHTML = msg;
  t.classList.add('show');
  if (_toastT) clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('show'), dur);
}
