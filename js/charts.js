/* ═══════════════════════════════════════════════
   CryptoSignal — charts.js
   Canvas rendering: candles, RSI chart
═══════════════════════════════════════════════ */

function drawCandles(id, candles, opts = {}) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const dpr  = window.devicePixelRatio || 1;
  const rect = cv.parentElement.getBoundingClientRect();
  const W    = rect.width || 320;
  const H    = parseInt(cv.parentElement.style.height) || 200;
  cv.width   = W * dpr;
  cv.height  = H * dpr;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  const ctx  = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const pL = 46, pR = 8, pT = 12, pB = 24;
  const cW = W - pL - pR;
  const cH = H - pT - pB;
  ctx.clearRect(0, 0, W, H);

  if (!candles || candles.length < 2) {
    ctx.fillStyle = '#6e7681';
    ctx.font = '11px DM Mono,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Cargando...', W / 2, H / 2);
    return;
  }

  const n    = Math.min(candles.length, 80);
  const view = candles.slice(-n);
  let lo = Infinity, hi = -Infinity;
  view.forEach(c => { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; });
  if (opts.bolU) hi = Math.max(hi, ...opts.bolU.filter(Boolean));
  if (opts.bolL) lo = Math.min(lo, ...opts.bolL.filter(Boolean));

  const pad = (hi - lo) * 0.08;
  const rlo = lo - pad, rhi = hi + pad;
  const ry  = v => (1 - (v - rlo) / (rhi - rlo)) * cH + pT;
  const bw  = Math.max(2, Math.floor(cW / n) - 1);
  const cx  = i => pL + (i + 0.5) * cW / n;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pT + i * cH / 4;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(pL + cW, y); ctx.stroke();
    const v   = rhi - (rhi - rlo) * i / 4;
    const lbl = v >= 10000 ? '$' + (v / 1000).toFixed(1) + 'k'
              : v >= 1     ? '$' + v.toFixed(v >= 100 ? 0 : 2)
              : '$' + v.toFixed(4);
    ctx.fillStyle = '#4b5563';
    ctx.font = '9px DM Mono,monospace';
    ctx.textAlign = 'right';
    ctx.fillText(lbl, pL - 3, y + 3);
  }

  // Bollinger bands fill
  if (opts.bolS && opts.bolU && opts.bolL) {
    const si = candles.length - n;
    const uv = opts.bolU.slice(si);
    const lv = opts.bolL.slice(si);
    const sv = opts.bolS.slice(si);
    ctx.beginPath(); let mv = true;
    uv.forEach((v, i) => {
      if (v != null) { if (mv) { ctx.moveTo(cx(i), ry(v)); mv = false; } else ctx.lineTo(cx(i), ry(v)); }
    });
    for (let i = n - 1; i >= 0; i--) { if (lv[i] != null) ctx.lineTo(cx(i), ry(lv[i])); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(88,166,255,0.04)';
    ctx.fill();
    const dl = (arr, col, dash = []) => {
      ctx.beginPath(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash); let m2 = true;
      arr.forEach((v, i) => {
        if (v != null) { if (m2) { ctx.moveTo(cx(i), ry(v)); m2 = false; } else ctx.lineTo(cx(i), ry(v)); }
      });
      ctx.stroke(); ctx.setLineDash([]);
    };
    dl(uv, 'rgba(248,81,73,.45)');
    dl(lv, 'rgba(0,229,160,.45)');
    dl(sv, 'rgba(107,114,128,.5)', [3,3]);
  }

  // Candles
  view.forEach((c, i) => {
    const up  = c.c >= c.o;
    const col = up ? '#00e5a0' : '#f85149';
    const bt  = ry(Math.max(c.o, c.c));
    const bb  = ry(Math.min(c.o, c.c));
    const bh  = Math.max(1, bb - bt);
    const x   = cx(i);
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, ry(c.h)); ctx.lineTo(x, bt); ctx.moveTo(x, bb); ctx.lineTo(x, ry(c.l)); ctx.stroke();
    if (bh <= 1) {
      ctx.beginPath(); ctx.moveTo(x - bw / 2, ry(c.c)); ctx.lineTo(x + bw / 2, ry(c.c)); ctx.stroke();
    } else {
      ctx.fillStyle = up ? 'rgba(0,229,160,.85)' : 'rgba(248,81,73,.85)';
      ctx.fillRect(x - bw / 2, bt, bw, bh);
    }
  });

  // X-axis labels
  const step = Math.max(1, Math.floor(n / 6));
  ctx.fillStyle = '#4b5563';
  ctx.font = '9px DM Mono,monospace';
  ctx.textAlign = 'center';
  view.forEach((c, i) => { if (i % step === 0 || i === n - 1) ctx.fillText(c.label || '', cx(i), H - 6); });

  // Last price line
  const lp = view[n - 1].c;
  const ly = ry(lp);
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(pL, ly); ctx.lineTo(pL + cW, ly); ctx.stroke();
  ctx.setLineDash([]);
}

function drawRsi(id, rsiData) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const dpr  = window.devicePixelRatio || 1;
  const rect = cv.parentElement.getBoundingClientRect();
  const W    = rect.width || 200;
  const H    = parseInt(cv.parentElement.style.height) || 120;
  cv.width   = W * dpr;
  cv.height  = H * dpr;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  const ctx  = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const pL = 28, pR = 6, pT = 8, pB = 18;
  const cW = W - pL - pR;
  const cH = H - pT - pB;
  ctx.clearRect(0, 0, W, H);

  const v = rsiData.filter(x => x != null).slice(-80);
  if (!v.length) return;

  const ry = x => (1 - x / 100) * cH + pT;
  const rx = i => pL + (i + .5) * cW / v.length;

  // Zones
  [[70, 100, 'rgba(248,81,73,.07)'], [0, 30, 'rgba(0,229,160,.07)']].forEach(([lo, hi, c]) => {
    ctx.fillStyle = c; ctx.fillRect(pL, ry(hi), cW, ry(lo) - ry(hi));
  });

  // Reference lines
  [30, 50, 70].forEach(x => {
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.setLineDash(x === 50 ? [3,3] : []);
    ctx.beginPath(); ctx.moveTo(pL, ry(x)); ctx.lineTo(pL + cW, ry(x)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#4b5563'; ctx.font = '8px DM Mono,monospace'; ctx.textAlign = 'right';
    ctx.fillText(x, pL - 2, ry(x) + 3);
  });

  // RSI line
  ctx.beginPath(); ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5;
  v.forEach((x, i) => i === 0 ? ctx.moveTo(rx(i), ry(x)) : ctx.lineTo(rx(i), ry(x)));
  ctx.stroke();

  // Last value dot
  const last = v[v.length - 1];
  const lc   = last < 35 ? '#00e5a0' : last > 65 ? '#f85149' : '#d29922';
  ctx.fillStyle = lc;
  ctx.beginPath(); ctx.arc(rx(v.length - 1), ry(last), 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lc; ctx.font = 'bold 8px DM Mono,monospace'; ctx.textAlign = 'left';
  ctx.fillText(last.toFixed(1), rx(v.length - 1) + 5, ry(last) + 3);
}
