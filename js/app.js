/* ═══════════════════════════════════════════════
   CryptoSignal — app.js
   Main app: state, tabs, data, render, entry logic
═══════════════════════════════════════════════ */

/* ── State ─────────────────────────────────── */
let activeSym = 'BTCUSDT';
let activeTf  = '1m';
let candles   = [];
let wsKline   = null;
let cdVal     = 5, cdTimer = null, autoTimer = null;
let lastP     = null;

const fxPairs = [
  { b:'USD', q:'EUR', lbl:'USD/EUR' },
  { b:'USD', q:'COP', lbl:'USD/COP' },
  { b:'EUR', q:'USD', lbl:'EUR/USD' },
  { b:'GBP', q:'USD', lbl:'GBP/USD' },
  { b:'USD', q:'JPY', lbl:'USD/JPY' },
  { b:'USD', q:'BRL', lbl:'USD/BRL' }
];

let fxRates = {}, fxHist = {}, activeFx = 'USD/EUR';

/* ── Init ──────────────────────────────────── */
function initApp() {
  initTabs();
  buildFxGrid();
  loadKlines().then(() => { startWs(); startAuto(); startCd(); load24h(); });
  loadFx();
  setInterval(loadFx, 10000);
  setInterval(load24h, 10000);
  initAccuracy();
  renderAccuracy();
}

function stopAll() {
  stopWs();
  if (autoTimer) clearInterval(autoTimer);
  if (cdTimer)   clearInterval(cdTimer);
}

/* ── Tabs ──────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('#symRow .sym-tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#symRow .sym-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      activeSym = b.dataset.sym;
      candles   = [];
      stopWs();
      loadKlines().then(startWs);
      sysLog('Par: ' + activeSym);
    });
  });

  document.querySelectorAll('#tfRow .tf-tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tfRow .tf-tab').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      activeTf = b.dataset.tf;
      candles  = [];
      stopWs();
      loadKlines().then(startWs);
      sysLog('TF: ' + activeTf);
    });
  });
}

/* ── Binance REST Klines ───────────────────── */
const limitMap = { '1m':200, '5m':200, '15m':150, '1h':120, '4h':100 };

async function loadKlines() {
  const url = 'https://api.binance.com/api/v3/klines?symbol=' + activeSym + '&interval=' + activeTf + '&limit=' + (limitMap[activeTf] || 150);
  try {
    const r   = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();
    candles   = raw.map(k => ({
      t: k[0],
      o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]),
      c: parseFloat(k[4]), v: parseFloat(k[5]),
      label: fmtLabel(k[0])
    }));
    sysLog('Klines: ' + activeSym + ' ' + activeTf + ' (' + candles.length + ')');
    renderAll();
  } catch(e) {
    sysLog('Error klines: ' + e.message);
  }
}

function fmtLabel(ts) {
  const d = new Date(ts);
  if (['1m','5m','15m','1h'].includes(activeTf))
    return d.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
  return d.toLocaleDateString('es', { day:'2-digit', month:'short' });
}

/* ── Binance WebSocket ─────────────────────── */
function startWs() {
  stopWs();
  const sym = activeSym.toLowerCase();
  const ws  = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + sym + '@kline_' + activeTf + '/' + sym + '@ticker');
  ws.onopen  = () => sysLog('WS conectado: ' + activeSym);
  ws.onerror = () => sysLog('WS error');
  ws.onclose = () => sysLog('WS desconectado');
  ws.onmessage = ev => {
    try {
      const msg = JSON.parse(ev.data), s = msg.stream || '';
      if (s.includes('@kline_')) {
        const k = msg.data.k;
        const c = { t:k.t, o:parseFloat(k.o), h:parseFloat(k.h), l:parseFloat(k.l), c:parseFloat(k.c), v:parseFloat(k.v), label:fmtLabel(k.t) };
        if (candles.length && candles[candles.length - 1].t === c.t) candles[candles.length - 1] = c;
        else { candles.push(c); if (candles.length > 300) candles.shift(); }
        renderAll();
        checkEntryAgainstPrice(activeSym, c.c);
      }
      if (s.includes('@ticker')) {
        const t = msg.data, p = parseFloat(t.c);
        updateTicker({ price:p, open:parseFloat(t.o), high:parseFloat(t.h), low:parseFloat(t.l), chgPct:parseFloat(t.P), vol:parseFloat(t.v) });
        checkEntryAgainstPrice(activeSym, p);
      }
    } catch(e) {}
  };
  wsKline = ws;
}

function stopWs() {
  if (wsKline) { try { wsKline.close(); } catch(e) {} wsKline = null; }
}

/* ── Ticker ────────────────────────────────── */
function updateTicker(t) {
  const el = document.getElementById('mPrice');
  if (el) {
    el.textContent = fmt(t.price);
    if (lastP !== null) {
      const card = document.getElementById('priceCard');
      card.classList.remove('flash-up', 'flash-dn');
      void card.offsetWidth;
      card.classList.add(t.price >= lastP ? 'flash-up' : 'flash-dn');
    }
    lastP = t.price;
  }
  const chg = document.getElementById('mChg');
  if (chg) { chg.textContent = fmtP(t.chgPct); chg.className = 'price-chg ' + (t.chgPct >= 0 ? 'up' : 'dn'); }
  ['mOpen','mHigh','mLow'].forEach((id, i) => {
    const e = document.getElementById(id);
    if (e) e.textContent = fmt([t.open, t.high, t.low][i]);
  });
  const v = document.getElementById('mVol');
  if (v && t.vol) v.textContent = t.vol >= 1e6 ? (t.vol / 1e6).toFixed(2) + 'M' : (t.vol / 1e3).toFixed(1) + 'K';
}

async function load24h() {
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + activeSym);
    const t = await r.json();
    updateTicker({ price:parseFloat(t.lastPrice), open:parseFloat(t.openPrice), high:parseFloat(t.highPrice), low:parseFloat(t.lowPrice), chgPct:parseFloat(t.priceChangePercent), vol:parseFloat(t.volume) });
  } catch(e) {}
}

function startAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(renderAll, 5000);
}

function startCd() {
  if (cdTimer) clearInterval(cdTimer);
  cdVal = 5;
  cdTimer = setInterval(() => {
    cdVal--;
    if (cdVal <= 0) cdVal = 5;
    const e = document.getElementById('cdRing');
    if (e) e.textContent = cdVal + 's';
  }, 1000);
}

/* ── Render All ────────────────────────────── */
function renderAll() {
  if (!candles.length) return;
  const cls   = candles.map(c => c.c);
  const price = cls[cls.length - 1];
  const rsiArr = calcRsi(cls);
  const bol    = calcBol(cls);
  const atr    = calcAtr(candles);
  const sig    = genSignal(cls, rsiArr, bol, atr, price);

  // Charts
  document.getElementById('chartLbl').textContent = activeSym.replace('USDT','/USDT') + ' · ' + activeTf;
  document.getElementById('chartTs').textContent  = new Date().toLocaleTimeString('es');
  drawCandles('cMain', candles, { bolS:bol.sma, bolU:bol.upper, bolL:bol.lower });
  drawRsi('cRsi', rsiArr);
  drawCandles('cBol', candles, { bolS:bol.sma, bolU:bol.upper, bolL:bol.lower });

  // OHLC
  const lc = candles[candles.length - 1];
  ['ciO','ciH','ciL','ciC'].forEach((id, i) => {
    const e = document.getElementById(id);
    if (e) e.textContent = fmt([lc.o, lc.h, lc.l, lc.c][i]);
  });

  // RSI metric
  const rsi = sig.rsi;
  const rm  = document.getElementById('mRsi');
  if (rm) rm.textContent = rsi ? rsi.toFixed(1) : '—';
  const rc = !rsi ? 'var(--muted)' : rsi < 35 ? 'var(--green)' : rsi > 65 ? 'var(--red)' : 'var(--amber)';
  const rf = document.getElementById('rsiFill');
  if (rf) { rf.style.width = (rsi || 50) + '%'; rf.style.background = rc; }

  // ATR
  const am = document.getElementById('mAtr');
  if (am) am.textContent = fmt(atr);
  const af = document.getElementById('atrFill');
  if (af) af.style.width = Math.min(100, atr / price * 1000) + '%';

  // Signal
  const sNames = { BUY:'COMPRA', SELL:'VENTA', HOLD:'ESPERAR' };
  const sm = document.getElementById('mSig');
  if (sm) { sm.textContent = sNames[sig.type]; sm.style.color = sig.type === 'BUY' ? 'var(--green)' : sig.type === 'SELL' ? 'var(--red)' : 'var(--muted)'; }
  const ss = document.getElementById('mSigSub');
  if (ss) ss.textContent = Math.abs(sig.score) >= 5 ? 'muy fuerte' : Math.abs(sig.score) >= 3 ? 'moderada' : 'débil';
  const sc = document.getElementById('sigCard');
  if (sc) sc.className = 'metric' + (sig.type === 'BUY' ? ' m-accent' : sig.type === 'SELL' ? ' m-danger' : '');

  // Score
  const sco = document.getElementById('mScore');
  if (sco) sco.textContent = (sig.score > 0 ? '+' : '') + sig.score;

  // Levels
  const tpPct = (sig.tp - price) / price * 100;
  const slPct = (sig.sl - price) / price * 100;
  const rr    = Math.abs(tpPct / slPct);
  ['lEntry','lTp','lSl','lRr'].forEach((id, i) => {
    const e = document.getElementById(id);
    if (!e) return;
    if (i < 3) e.textContent = fmt([price, sig.tp, sig.sl][i]);
    else        e.textContent = rr.toFixed(2) + 'x';
  });
  const tp2 = document.getElementById('lTpPct'); if (tp2) tp2.textContent = fmtP(tpPct);
  const sl2 = document.getElementById('lSlPct'); if (sl2) sl2.textContent = fmtP(slPct);
  const lb  = document.getElementById('lBadge');
  if (lb) { lb.textContent = sNames[sig.type]; lb.className = 'badge ' + (sig.type === 'BUY' ? 'b-buy' : sig.type === 'SELL' ? 'b-sell' : 'b-hold'); }

  // Reasons
  const dc = sig.type === 'BUY' ? 'var(--green)' : sig.type === 'SELL' ? 'var(--red)' : 'var(--muted)';
  const rb = document.getElementById('reasonBox');
  if (rb) rb.innerHTML = sig.reasons.map(r => '<div class="reason"><div class="r-dot" style="background:' + dc + '"></div>' + r + '</div>').join('');

  // Score bar
  const rawSc = sig.score;
  const sp    = Math.min(100, Math.max(0, (rawSc + 6) / 12 * 100));
  const sf    = document.getElementById('scoreFill');
  if (sf) { sf.style.width = sp + '%'; sf.style.background = rawSc > 0 ? 'var(--green)' : rawSc < 0 ? 'var(--red)' : 'var(--muted)'; }
  const sv = document.getElementById('scoreVal');
  if (sv) { sv.textContent = (rawSc > 0 ? '+' : '') + rawSc; sv.style.color = rawSc > 0 ? 'var(--green)' : rawSc < 0 ? 'var(--red)' : 'var(--muted)'; }

  const rrSub = document.getElementById('mRrSub');
  if (rrSub) rrSub.textContent = rr >= 2 ? 'buena relación' : rr >= 1 ? 'aceptable' : 'baja';

  updateEntryButton(sig, price);
  saveSignalHistory({ sym:activeSym, tf:activeTf, type:sig.type, price, tp:sig.tp, sl:sig.sl, rsi:sig.rsi, score:sig.score, rr, timestamp:Date.now() });
}

/* ── Entry Button ──────────────────────────── */
let _curSig = null, _activeEntry = null, _aebInt = null;

function updateEntryButton(sig, price) {
  _curSig = { ...sig, price };
  const zone   = document.getElementById('entryZone');
  const pill   = document.getElementById('ezPill');
  const desc   = document.getElementById('ezDesc');
  const dotsEl = document.getElementById('ezDots');
  const btn    = document.getElementById('entryBtn');
  const txtEl  = document.getElementById('entryBtnTxt');
  const ee     = document.getElementById('ezEntry');
  const et     = document.getElementById('ezTp');
  const es     = document.getElementById('ezSl');
  if (!zone || !pill || !desc || !dotsEl || !btn) return;

  ee.textContent = fmt(price);
  et.textContent = fmt(sig.tp);
  es.textContent = fmt(sig.sl);

  const dots = dotsEl.children;
  const abs  = Math.min(Math.abs(sig.score), 6);
  Array.from(dots).forEach((d, i) => {
    d.className = 'ez-dot';
    if (i < abs) d.classList.add(sig.type === 'SELL' ? 'ons' : 'on');
  });

  const isBuy  = sig.type === 'BUY'  && abs >= 3;
  const isSell = sig.type === 'SELL' && abs >= 3;

  if (_activeEntry) {
    zone.className  = 'entry-zone ' + (_activeEntry.type === 'BUY' ? 'buy' : 'sell');
    pill.className  = 'ez-pill ' + (_activeEntry.type === 'BUY' ? 'buy' : 'sell');
    pill.textContent = _activeEntry.type === 'BUY' ? '▲ ACTIVA' : '▼ ACTIVA';
    desc.textContent = 'Monitoreando — esperando TP/SL';
    btn.className   = 'btn-entry idle'; btn.disabled = true;
    txtEl.innerHTML = '⏳ Verificando entrada...';
  } else if (isBuy) {
    zone.className  = 'entry-zone buy'; pill.className = 'ez-pill buy'; pill.textContent = '▲ SEÑAL COMPRA';
    desc.textContent = 'Score +' + sig.score + ' · RSI ' + (sig.rsi ? sig.rsi.toFixed(1) : '—');
    btn.className   = 'btn-entry buy'; btn.disabled = false;
    btn.innerHTML   = '<div class="btn-pulse"></div><span>REGISTRAR ENTRADA LARGA (BUY)</span>';
    btn.onclick     = confirmEntry;
  } else if (isSell) {
    zone.className  = 'entry-zone sell'; pill.className = 'ez-pill sell'; pill.textContent = '▼ SEÑAL VENTA';
    desc.textContent = 'Score ' + sig.score + ' · RSI ' + (sig.rsi ? sig.rsi.toFixed(1) : '—');
    btn.className   = 'btn-entry sell'; btn.disabled = false;
    btn.innerHTML   = '<div class="btn-pulse"></div><span>REGISTRAR ENTRADA CORTA (SELL)</span>';
    btn.onclick     = confirmEntry;
  } else {
    zone.className  = 'entry-zone'; pill.className = 'ez-pill idle'; pill.textContent = 'SIN SEÑAL';
    const need = Math.max(0, 3 - Math.abs(sig.score));
    desc.textContent = 'Score ' + (sig.score > 0 ? '+' : '') + sig.score + ' — necesita ' + need + ' punto' + (need !== 1 ? 's' : '') + ' más';
    btn.className   = 'btn-entry idle'; btn.disabled = true; btn.onclick = null;
    btn.innerHTML   = '<span>⊘ Sin señal suficiente (score < 3)</span>';
  }
}

function confirmEntry() {
  if (!_curSig || _activeEntry) return;
  if (Math.abs(_curSig.score) < 3) return;
  const now = Date.now();
  _activeEntry = { id:now+'_'+activeSym, sym:activeSym, type:_curSig.type, entryPrice:_curSig.price, tp:_curSig.tp, sl:_curSig.sl, score:_curSig.score, rsi:_curSig.rsi, signalTs:now, timestamp:now };
  registerEntry(_activeEntry);
  showAeb();
  showToast('<strong>Entrada ' + _activeEntry.type + ' registrada</strong> · Monitoreando hasta TP/SL', _activeEntry.type.toLowerCase(), 5000);
  sysLog('📍 Entrada: ' + activeSym + ' ' + _activeEntry.type + ' @ ' + fmt(_activeEntry.entryPrice) + ' TP=' + fmt(_activeEntry.tp) + ' SL=' + fmt(_activeEntry.sl));
  updateEntryButton(_curSig, _curSig.price);
}

function showAeb() {
  if (!_activeEntry) return;
  const bar = document.getElementById('aeb');
  bar.classList.add('show');
  document.getElementById('aebSym').textContent   = _activeEntry.sym.replace('USDT','/USDT');
  document.getElementById('aebType').textContent  = _activeEntry.type;
  document.getElementById('aebType').style.color  = _activeEntry.type === 'BUY' ? 'var(--green)' : 'var(--red)';
  document.getElementById('aebEntry').textContent = fmt(_activeEntry.entryPrice);
  document.getElementById('aebTp').textContent    = fmt(_activeEntry.tp);
  document.getElementById('aebSl').textContent    = fmt(_activeEntry.sl);
  if (_aebInt) clearInterval(_aebInt);
  _aebInt = setInterval(() => {
    if (!_activeEntry) { clearInterval(_aebInt); return; }
    const still = _watchList.find(w => w.id === _activeEntry.id);
    if (!still) {
      clearInterval(_aebInt); _aebInt = null;
      document.getElementById('aeb').classList.remove('show');
      _activeEntry = null;
      if (_curSig) updateEntryButton(_curSig, _curSig.price);
    }
  }, 2000);
}

function cancelEntry() {
  if (_aebInt) { clearInterval(_aebInt); _aebInt = null; }
  _activeEntry = null;
  _watchList   = _watchList.filter(() => false);
  document.getElementById('aeb').classList.remove('show');
  if (_curSig) updateEntryButton(_curSig, _curSig.price);
  sysLog('Entrada cancelada.');
}

/* ── Forex ─────────────────────────────────── */
function buildFxGrid() {
  document.getElementById('fxGrid').innerHTML = fxPairs.map(p => `
    <div class="fx-card ${p.lbl === activeFx ? 'on' : ''}" onclick="selectFx('${p.lbl}')" id="fc_${p.lbl.replace('/','_')}">
      <div class="fx-pair">${p.lbl}</div>
      <div class="fx-rate" id="fr_${p.lbl.replace('/','_')}">—</div>
      <div class="fx-chg" id="fc2_${p.lbl.replace('/','_')}" style="color:var(--muted)">—</div>
    </div>`).join('');
}

async function loadFx() {
  const bases = [...new Set(fxPairs.map(p => p.b))];
  for (const base of bases) {
    let data = null;
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/' + base, { cache:'no-store' });
      if (r.ok) data = await r.json();
    } catch(e) {}
    if (!data) {
      try {
        const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/' + base.toLowerCase() + '.json');
        if (r.ok) {
          const raw   = await r.json();
          const rates = {};
          const inner = raw[base.toLowerCase()] || {};
          Object.keys(inner).forEach(k => { rates[k.toUpperCase()] = inner[k]; });
          data = { rates };
        }
      } catch(e) {}
    }
    if (!data) continue;
    fxPairs.filter(p => p.b === base).forEach(p => {
      const rate = data.rates ? data.rates[p.q] : null;
      if (!rate) return;
      const noise = rate * (Math.random() * .0008 - .0004);
      const live  = rate + noise;
      const prev  = fxRates[p.lbl], chg = prev ? (live - prev) / prev * 100 : 0;
      fxRates[p.lbl] = live;
      if (!fxHist[p.lbl]) fxHist[p.lbl] = [];
      const label = new Date().toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
      const n2    = rate * .0003;
      fxHist[p.lbl].push({ o:prev||live, h:Math.max(prev||live,live)+n2, l:Math.min(prev||live,live)-n2, c:live, label });
      if (fxHist[p.lbl].length > 80) fxHist[p.lbl].shift();
      const re = document.getElementById('fr_'  + p.lbl.replace('/','_'));
      const ce = document.getElementById('fc2_' + p.lbl.replace('/','_'));
      if (re) re.textContent = fmtFx(live);
      if (ce) { ce.textContent = prev ? fmtP(chg) : '—'; ce.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)'; }
    });
  }
  renderFxChart();
  const e = document.getElementById('fxTs');
  if (e) e.textContent = new Date().toLocaleTimeString('es');
}

function selectFx(lbl) {
  activeFx = lbl;
  document.querySelectorAll('.fx-card').forEach(c => c.classList.remove('on'));
  const e = document.getElementById('fc_' + lbl.replace('/','_'));
  if (e) e.classList.add('on');
  const l = document.getElementById('fxLbl');
  if (l) l.textContent = lbl;
  renderFxChart();
}

function renderFxChart() {
  const h = fxHist[activeFx];
  if (h && h.length >= 2) drawCandles('cFx', h, {});
}

/* ── Signal History ────────────────────────── */
let _lastHistSig = null;

function saveSignalHistory(sig) {
  if (sig.type === 'HOLD') return;
  if (_lastHistSig && _lastHistSig.sym === sig.sym && _lastHistSig.type === sig.type && Date.now() - _lastHistSig.ts < 30000) return;
  _lastHistSig = { sym:sig.sym, type:sig.type, ts:Date.now() };
  try {
    const k    = 'cs_hist';
    const prev = JSON.parse(localStorage.getItem(k) || '[]');
    prev.unshift(sig);
    localStorage.setItem(k, JSON.stringify(prev.slice(0, 30)));
  } catch(e) {}
  renderHistory();
}

function renderHistory() {
  const tbody = document.getElementById('histBody');
  if (!tbody) return;
  try {
    const entries = JSON.parse(localStorage.getItem('cs_hist') || '[]');
    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:1rem">Sin señales aún.</td></tr>';
      return;
    }
    tbody.innerHTML = entries.slice(0, 20).map(d => {
      const ts = new Date(d.timestamp).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const b  = d.type === 'BUY' ? '<span class="badge b-buy">BUY</span>' : '<span class="badge b-sell">SELL</span>';
      return '<tr><td>' + ts + '</td><td style="color:var(--green)">' + d.sym.replace('USDT','/USDT') + '</td><td>' + b + '</td><td>' + fmt(d.price) + '</td><td style="color:var(--blue)">' + fmt(d.tp) + '</td><td style="color:var(--red)">' + fmt(d.sl) + '</td><td>' + (d.rr ? d.rr.toFixed(2)+'x' : '—') + '</td></tr>';
    }).join('');
  } catch(e) {}
}

/* ── Resize ────────────────────────────────── */
let _rt;
window.addEventListener('resize', () => {
  clearTimeout(_rt);
  _rt = setTimeout(() => { renderAll(); renderFxChart(); }, 150);
});
