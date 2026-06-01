/* ═══════════════════════════════════════════════
   CryptoSignal — indicators.js
   Technical analysis: RSI, Bollinger, ATR, Signal
═══════════════════════════════════════════════ */

function calcRsi(cls, p = 14) {
  const o = new Array(cls.length).fill(null);
  if (cls.length < p + 1) return o;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = cls[i] - cls[i-1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= p; al /= p;
  o[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < cls.length; i++) {
    const d = cls[i] - cls[i-1];
    ag = (ag * (p-1) + Math.max(d, 0)) / p;
    al = (al * (p-1) + Math.max(-d, 0)) / p;
    o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return o;
}

function calcBol(cls, w = 20, k = 2) {
  const s = [], u = [], l = [];
  for (let i = 0; i < cls.length; i++) {
    if (i < w - 1) { s.push(null); u.push(null); l.push(null); continue; }
    const sl = cls.slice(i - w + 1, i + 1);
    const m  = sl.reduce((a, b) => a + b, 0) / w;
    const sd = Math.sqrt(sl.reduce((a, b) => a + (b - m) ** 2, 0) / w);
    s.push(m); u.push(m + k * sd); l.push(m - k * sd);
  }
  return { sma: s, upper: u, lower: l };
}

function calcAtr(ohlc, w = 14) {
  const t = [];
  for (let i = 1; i < ohlc.length; i++) {
    t.push(Math.max(
      ohlc[i].h - ohlc[i].l,
      Math.abs(ohlc[i].h - ohlc[i-1].c),
      Math.abs(ohlc[i].l - ohlc[i-1].c)
    ));
  }
  const s = t.slice(-w);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
}

function genSignal(cls, rsi, bol, atr, price) {
  const r  = rsi[rsi.length - 1];
  const up = bol.upper[bol.upper.length - 1];
  const lo = bol.lower[bol.lower.length - 1];
  const sm = bol.sma[bol.sma.length - 1];

  if (r == null || sm == null) {
    return { type:'HOLD', score:0, rsi:null, tp:price + atr * 2.5, sl:price - atr * 1.5, reasons:['Datos insuficientes'] };
  }

  let sc = 0;
  const rs = [];

  // RSI
  if      (r < 30) { sc += 3; rs.push('RSI sobreventa profunda (' + r.toFixed(1) + ')'); }
  else if (r < 40) { sc += 2; rs.push('RSI sobreventa (' + r.toFixed(1) + ')'); }
  else if (r < 50) { sc += 1; rs.push('RSI ligeramente bajo (' + r.toFixed(1) + ')'); }
  else if (r > 70) { sc -= 3; rs.push('RSI sobrecompra profunda (' + r.toFixed(1) + ')'); }
  else if (r > 60) { sc -= 2; rs.push('RSI sobrecompra (' + r.toFixed(1) + ')'); }
  else if (r > 50) { sc -= 1; rs.push('RSI ligeramente alto (' + r.toFixed(1) + ')'); }
  else rs.push('RSI neutral (' + r.toFixed(1) + ')');

  // Bollinger
  if      (price <= lo * 1.005) { sc += 2; rs.push('Precio en banda inferior Bollinger'); }
  else if (price >= up * 0.995) { sc -= 2; rs.push('Precio en banda superior Bollinger'); }
  else rs.push('Precio dentro de Bollinger (' + ((price - lo) / (up - lo) * 100).toFixed(0) + '%)');

  // Trend
  const tr = cls.slice(-5);
  if (tr[4] > tr[0]) {
    if (sc > 0) { sc++; rs.push('Tendencia alcista confirma'); }
    else rs.push('Tendencia alcista (contra señal)');
  } else {
    if (sc < 0) { sc--; rs.push('Tendencia bajista confirma'); }
    else rs.push('Tendencia bajista (contra señal)');
  }

  let type = 'HOLD';
  if (sc >=  3) type = 'BUY';
  if (sc <= -3) type = 'SELL';

  const tpM = Math.abs(sc) >= 5 ? 3.0 : 2.5;
  const tp  = type === 'BUY'  ? price + atr * tpM
            : type === 'SELL' ? price - atr * tpM
            : price + atr * 2.5;
  const sl  = type === 'BUY'  ? price - atr * 1.5
            : type === 'SELL' ? price + atr * 1.5
            : price - atr * 1.5;

  return { type, score: sc, rsi: r, tp, sl, reasons: rs };
}
