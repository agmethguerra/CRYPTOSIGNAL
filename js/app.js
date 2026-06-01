'use strict';

/* ═══════════════════════════════════════════════════════════
   LOGIN — SHA-256 hash de @crypto12345
═══════════════════════════════════════════════════════════ */
const AUTH_HASH = '28467e3b65605b885f22ec6a72716433aae3b688d1e19bc5dd4f6b3073957002';
const SESSION_KEY = 'cs_auth';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function initLogin() {
  const overlay  = document.getElementById('loginOverlay');
  const input    = document.getElementById('loginInput');
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');
  const eyeBtn   = document.getElementById('loginEye');
  const eyeIcon  = document.getElementById('loginEyeIcon');
  const field    = document.getElementById('loginField');

  // Already authenticated this session
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 0);
    return;
  }

  // Show/hide password toggle
  eyeBtn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    eyeIcon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  async function attempt() {
    const val = input.value;
    if (!val) return;

    const hash = await sha256(val);

    if (hash === AUTH_HASH) {
      sessionStorage.setItem(SESSION_KEY, '1');
      overlay.classList.add('hidden');
      // Remove overlay from DOM after transition
      setTimeout(() => {
        overlay.remove();
        // Force chart resize now that the container is fully visible
        if (state.chart) {
          const container = document.getElementById('chartContainer');
          if (container) {
            state.chart.resize(container.clientWidth, container.clientHeight);
            state.chart.timeScale().fitContent();
          }
        }
      }, 480);
    } else {
      errEl.classList.add('visible');
      field.classList.add('shake');
      input.value = '';
      setTimeout(() => {
        field.classList.remove('shake');
        errEl.classList.remove('visible');
      }, 1600);
    }
  }

  btn.addEventListener('click', attempt);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
}

/* ═══════════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════════ */
const CONFIG = {
  REST:            'https://api.binance.com/api/v3',
  WS_BASE:         'wss://stream.binance.com:9443/stream',
  SIGNAL_INTERVAL: 60_000,
  RECONNECT_DELAY: 4_000,

  // Klines to load per timeframe (aim for ~48h of data minimum)
  TF_CONFIG: {
    '1m':  { label: '1 min',    klines: 200,  hoursBack: 3,   signalWindow: 48 * 60 },
    '5m':  { label: '5 min',    klines: 200,  hoursBack: 16,  signalWindow: 48 * 12 },
    '15m': { label: '15 min',   klines: 200,  hoursBack: 50,  signalWindow: 48 * 4  },
    '1h':  { label: '1 hora',   klines: 120,  hoursBack: 120, signalWindow: 48      },
    '4h':  { label: '4 horas',  klines: 100,  hoursBack: 400, signalWindow: 12      },
    '1d':  { label: '1 día',    klines: 90,   hoursBack: 90 * 24, signalWindow: 2   },
  },

  // Timing labels for signal in minutes by timeframe
  TF_TIMING: {
    '1m':  [5, 10, 15, 30],
    '5m':  [15, 30, 60, 90],
    '15m': [30, 60, 120, 240],
    '1h':  [60, 120, 180, 360],
    '4h':  [240, 480, 720, 1440],
    '1d':  [1440, 2880, 4320, 7200],
  },

  COINS: [
    { symbol: 'BTCUSDT',  name: 'Bitcoin',    short: 'BTC',  icon: 'bi-currency-bitcoin' },
    { symbol: 'ETHUSDT',  name: 'Ethereum',   short: 'ETH',  icon: 'bi-layers' },
    { symbol: 'BNBUSDT',  name: 'BNB',        short: 'BNB',  icon: 'bi-hexagon' },
    { symbol: 'SOLUSDT',  name: 'Solana',     short: 'SOL',  icon: 'bi-sun' },
    { symbol: 'XRPUSDT',  name: 'XRP',        short: 'XRP',  icon: 'bi-water' },
    { symbol: 'ADAUSDT',  name: 'Cardano',    short: 'ADA',  icon: 'bi-grid-3x3-gap' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin',   short: 'DOGE', icon: 'bi-circle' },
    { symbol: 'AVAXUSDT', name: 'Avalanche',  short: 'AVAX', icon: 'bi-triangle' },
  ],
};

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const state = {
  active:       'BTCUSDT',
  timeframe:    '1h',
  prices:       {},
  klines:       {},     // [symbol][timeframe] -> candle[]
  signals:      {},     // [symbol][timeframe] -> Signal
  ws:           null,
  chart:        null,
  candleSeries: null,
  ema9Series:   null,
  ema21Series:  null,
};

/* ═══════════════════════════════════════════════════════════
   FORMATTERS
═══════════════════════════════════════════════════════════ */
const fmt = {
  price(v) {
    if (!v && v !== 0) return '—';
    const n = parseFloat(v);
    const d = n > 10000 ? 1 : n > 1000 ? 2 : n > 1 ? 4 : 6;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  pct(v, sign = true) {
    if (v == null) return '—';
    const s = sign && v > 0 ? '+' : '';
    return `${s}${parseFloat(v).toFixed(2)}%`;
  },
  volume(v) {
    if (!v) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  },
  time() {
    return new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },
  duration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.round(minutes / 60);
    return h === 1 ? '1 hora' : `${h} horas`;
  },
  timeSince(ms) {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `hace ${s}s`;
    return `hace ${Math.floor(s / 60)}min`;
  },
};

/* ═══════════════════════════════════════════════════════════
   TECHNICAL INDICATORS
═══════════════════════════════════════════════════════════ */
function emaFull(arr, period) {
  if (arr.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function emaLast(arr, period) {
  const s = emaFull(arr, period);
  return s.length ? s[s.length - 1] : null;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 2) return null;
  const src = closes.slice(-(period + 20));
  const d = src.slice(1).map((v, i) => v - src[i]);
  let ag = 0, al = 0;
  for (let i = 0; i < period; i++) {
    if (d[i] > 0) ag += d[i]; else al += Math.abs(d[i]);
  }
  ag /= period; al /= period;
  for (let i = period; i < d.length; i++) {
    ag = (ag * (period - 1) + Math.max(d[i], 0)) / period;
    al = (al * (period - 1) + Math.max(-d[i], 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function calcMACD(closes) {
  const fast = emaFull(closes, 12);
  const slow = emaFull(closes, 26);
  const len  = Math.min(fast.length, slow.length);
  if (len < 9) return null;
  const macdLine = fast.slice(-len).map((v, i) => v - slow.slice(-len)[i]);
  const signal   = emaFull(macdLine, 9);
  if (!signal.length) return null;
  return {
    value:  macdLine[macdLine.length - 1],
    signal: signal[signal.length - 1],
    hist:   macdLine[macdLine.length - 1] - signal[signal.length - 1],
    crossingUp:   macdLine[macdLine.length - 1] > signal[signal.length - 1] && macdLine[macdLine.length - 2] <= signal[signal.length - 2],
    crossingDown: macdLine[macdLine.length - 1] < signal[signal.length - 1] && macdLine[macdLine.length - 2] >= signal[signal.length - 2],
  };
}

function calcBB(closes, period = 20) {
  if (closes.length < period) return null;
  const s    = closes.slice(-period);
  const mean = s.reduce((a, b) => a + b, 0) / period;
  const std  = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std, std, pctB: (closes.at(-1) - (mean - 2 * std)) / (4 * std) };
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const s  = candles.slice(-(period + 1));
  const tr = s.slice(1).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - s[i].close), Math.abs(c.low - s[i].close)));
  return tr.reduce((a, b) => a + b, 0) / period;
}

function calcVolume(candles, period = 20) {
  if (candles.length < period) return null;
  const v = candles.slice(-period).map(c => c.volume);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  return { ratio: v[v.length - 1] / avg, current: v[v.length - 1], avg };
}

function calcStochRSI(closes, period = 14) {
  if (closes.length < period + 10) return null;
  // compute RSI series for last 30 bars
  const rsis = [];
  for (let i = closes.length - period - 14; i <= closes.length - period; i++) {
    rsis.push(calcRSI(closes.slice(0, i + period)));
  }
  const validRsis = rsis.filter(r => r !== null);
  if (validRsis.length < 3) return null;
  const minR = Math.min(...validRsis);
  const maxR = Math.max(...validRsis);
  if (maxR === minR) return 50;
  const lastRsi = validRsis[validRsis.length - 1];
  return ((lastRsi - minR) / (maxR - minR)) * 100;
}

/* ═══════════════════════════════════════════════════════════
   TIMING GENERATOR — key feature
═══════════════════════════════════════════════════════════ */
function buildTimingText(direction, confidence, timeframe, rsi, macd, bb, h48Trend, mom6) {
  const timings = CONFIG.TF_TIMING[timeframe] || CONFIG.TF_TIMING['1h'];

  // Pick timing window based on how strong the signal is
  let timingIdx;
  if (confidence >= 75) timingIdx = 0;       // tightest window = most confident
  else if (confidence >= 60) timingIdx = 1;
  else if (confidence >= 45) timingIdx = 2;
  else timingIdx = 3;

  const mins     = timings[timingIdx];
  const durationText = fmt.duration(mins);

  if (direction === 'wait') {
    if (confidence < 70) {
      return `Señal debil (${confidence}%) — espera mas claridad antes de actuar`;
    }
    return `Mejor esperar los proximos ${durationText}`;
  }

  // Build reason fragments
  const reasons = [];

  if (direction === 'buy') {
    if (rsi && rsi < 35)    reasons.push('el RSI indica que el precio esta sobrevendido');
    if (macd && macd.hist > 0) reasons.push('el impulso esta cambiando a favor de una subida');
    if (bb && bb.pctB < 0.2) reasons.push('el precio esta cerca del soporte inferior');
    if (mom6 < -0.5)        reasons.push(`bajo ${Math.abs(mom6).toFixed(1)}% recientemente y puede rebotar`);
    if (h48Trend < -3)      reasons.push('lleva 48h bajando y podria revertirse pronto');
    if (reasons.length === 0) reasons.push('varios indicadores apuntan a una posible subida');
    return `Considera comprar en los proximos ${durationText}: ${reasons[0]}.`;
  }

  if (direction === 'sell') {
    if (rsi && rsi > 65)    reasons.push('el RSI indica que el precio esta sobrecomprado');
    if (macd && macd.hist < 0) reasons.push('el impulso esta girando a la baja');
    if (bb && bb.pctB > 0.8) reasons.push('el precio esta cerca del techo de las bandas');
    if (mom6 > 0.5)         reasons.push(`subio ${mom6.toFixed(1)}% recientemente y puede corregir`);
    if (h48Trend > 3)       reasons.push('lleva 48h subiendo y podria corregirse pronto');
    if (reasons.length === 0) reasons.push('varios indicadores apuntan a una posible bajada');
    return `Considera vender en los proximos ${durationText}: ${reasons[0]}.`;
  }

  return `Observa el mercado en los proximos ${durationText}.`;
}

/* ═══════════════════════════════════════════════════════════
   SIGNAL ENGINE
═══════════════════════════════════════════════════════════ */
function computeSignal(symbol, candles, timeframe) {
  if (!candles || candles.length < 55) return null;

  const closes = candles.map(c => c.close);
  const price  = closes.at(-1);
  const tfCfg  = CONFIG.TF_CONFIG[timeframe] || CONFIG.TF_CONFIG['1h'];

  const rsiVal  = calcRSI(closes);
  const macdVal = calcMACD(closes);
  const bbVal   = calcBB(closes);
  const ema9    = emaLast(closes, 9);
  const ema21   = emaLast(closes, 21);
  const ema50   = emaLast(closes, 50);
  const atrVal  = calcATR(candles);
  const volVal  = calcVolume(candles);

  if (!rsiVal || !macdVal || !bbVal || !ema9 || !ema21 || !ema50 || !atrVal) return null;

  const votes = [];

  // 1. RSI
  if (rsiVal < 30)       votes.push({ w: 1.3, dir: 1,  cls: 'bull', icon: 'bi-graph-down-arrow', text: `RSI muy bajo (${rsiVal.toFixed(0)}) — el precio esta sobrevendido, posible rebote`,  badge: 'SUBIDA' });
  else if (rsiVal < 40)  votes.push({ w: 0.8, dir: 1,  cls: 'bull', icon: 'bi-graph-down',       text: `RSI bajo (${rsiVal.toFixed(0)}) — zona de posible recuperacion`,                     badge: 'SUBIDA' });
  else if (rsiVal > 70)  votes.push({ w: 1.3, dir: -1, cls: 'bear', icon: 'bi-graph-up-arrow',   text: `RSI muy alto (${rsiVal.toFixed(0)}) — el precio esta sobrecomprado, posible caida`,   badge: 'BAJADA' });
  else if (rsiVal > 60)  votes.push({ w: 0.8, dir: -1, cls: 'bear', icon: 'bi-graph-up',         text: `RSI alto (${rsiVal.toFixed(0)}) — zona donde suelen aparecer correcciones`,            badge: 'BAJADA' });
  else if (rsiVal > 50)  votes.push({ w: 0.3, dir: 1,  cls: 'neut', icon: 'bi-dash-circle',      text: `RSI neutro (${rsiVal.toFixed(0)}) — mercado en equilibrio, leve tendencia alcista`,    badge: 'NEUTRO' });
  else                   votes.push({ w: 0.3, dir: -1, cls: 'neut', icon: 'bi-dash-circle',      text: `RSI neutro (${rsiVal.toFixed(0)}) — mercado en equilibrio, leve tendencia bajista`,    badge: 'NEUTRO' });

  // 2. MACD
  if (macdVal.crossingUp)        votes.push({ w: 1.4, dir: 1,  cls: 'bull', icon: 'bi-lightning-charge-fill', text: 'MACD acaba de cruzar al alza — senal de entrada fuerte',               badge: 'SUBIDA' });
  else if (macdVal.crossingDown) votes.push({ w: 1.4, dir: -1, cls: 'bear', icon: 'bi-lightning-charge',      text: 'MACD acaba de cruzar a la baja — senal de salida fuerte',              badge: 'BAJADA' });
  else if (macdVal.hist > 0 && macdVal.value > 0) votes.push({ w: 0.9, dir: 1,  cls: 'bull', icon: 'bi-arrow-up-right', text: 'MACD muestra momentum de subida sostenido',  badge: 'SUBIDA' });
  else if (macdVal.hist < 0 && macdVal.value < 0) votes.push({ w: 0.9, dir: -1, cls: 'bear', icon: 'bi-arrow-down-right', text: 'MACD muestra momentum de bajada sostenido', badge: 'BAJADA' });
  else if (macdVal.hist > 0)     votes.push({ w: 0.5, dir: 1,  cls: 'bull', icon: 'bi-arrow-up',             text: 'MACD empieza a mejorar — impulso girando al alza',                     badge: 'SUBIDA' });
  else                           votes.push({ w: 0.5, dir: -1, cls: 'bear', icon: 'bi-arrow-down',           text: 'MACD empieza a debilitarse — impulso girando a la baja',               badge: 'BAJADA' });

  // 3. EMAs trend
  if (ema9 > ema21 && ema21 > ema50)      votes.push({ w: 1.0, dir: 1,  cls: 'bull', icon: 'bi-distribute-vertical', text: 'Las medias moviles apuntan hacia arriba — tendencia alcista clara',  badge: 'SUBIDA' });
  else if (ema9 < ema21 && ema21 < ema50) votes.push({ w: 1.0, dir: -1, cls: 'bear', icon: 'bi-distribute-vertical', text: 'Las medias moviles apuntan hacia abajo — tendencia bajista clara',   badge: 'BAJADA' });
  else                                    votes.push({ w: 0.1, dir: 0,  cls: 'neut', icon: 'bi-distribute-vertical', text: 'Las medias moviles estan mezcladas — sin tendencia definida',       badge: 'NEUTRO' });

  // 4. Price vs EMA50
  if (price > ema50 * 1.003)      votes.push({ w: 0.6, dir: 1,  cls: 'bull', icon: 'bi-reception-4', text: 'El precio esta por encima de la media de largo plazo — mercado saludable', badge: 'SUBIDA' });
  else if (price < ema50 * 0.997) votes.push({ w: 0.6, dir: -1, cls: 'bear', icon: 'bi-reception-1', text: 'El precio esta por debajo de la media de largo plazo — mercado debil',     badge: 'BAJADA' });

  // 5. Bollinger Bands
  if (bbVal.pctB < 0.1)      votes.push({ w: 0.9, dir: 1,  cls: 'bull', icon: 'bi-arrows-collapse', text: 'El precio toco el borde inferior de las bandas — zona tipica de rebote',  badge: 'SUBIDA' });
  else if (bbVal.pctB > 0.9) votes.push({ w: 0.9, dir: -1, cls: 'bear', icon: 'bi-arrows-expand',   text: 'El precio toco el borde superior de las bandas — zona tipica de caida',   badge: 'BAJADA' });
  else if (bbVal.pctB < 0.35) votes.push({ w: 0.3, dir: 1,  cls: 'neut', icon: 'bi-arrows-collapse', text: 'El precio esta en la parte baja de las bandas — posible apoyo cerca',     badge: 'NEUTRO' });
  else if (bbVal.pctB > 0.65) votes.push({ w: 0.3, dir: -1, cls: 'neut', icon: 'bi-arrows-expand',   text: 'El precio esta en la parte alta de las bandas — posible resistencia cerca', badge: 'NEUTRO' });

  // 6. Volume
  if (volVal) {
    const lastC = candles.at(-1);
    if (volVal.ratio > 2.0) {
      if (lastC.close > lastC.open) votes.push({ w: 0.9, dir: 1,  cls: 'bull', icon: 'bi-bar-chart-fill', text: `Volumen muy alto con vela verde (${volVal.ratio.toFixed(1)}x el promedio) — compras fuertes`, badge: 'SUBIDA' });
      else                          votes.push({ w: 0.9, dir: -1, cls: 'bear', icon: 'bi-bar-chart-fill', text: `Volumen muy alto con vela roja (${volVal.ratio.toFixed(1)}x el promedio) — ventas fuertes`,    badge: 'BAJADA' });
    } else if (volVal.ratio > 1.4) {
      if (lastC.close > lastC.open) votes.push({ w: 0.6, dir: 1,  cls: 'bull', icon: 'bi-bar-chart', text: `Volumen elevado con cierre al alza (${volVal.ratio.toFixed(1)}x promedio)`,   badge: 'SUBIDA' });
      else                          votes.push({ w: 0.6, dir: -1, cls: 'bear', icon: 'bi-bar-chart', text: `Volumen elevado con cierre a la baja (${volVal.ratio.toFixed(1)}x promedio)`, badge: 'BAJADA' });
    } else {
      votes.push({ w: 0.1, dir: 0, cls: 'neut', icon: 'bi-bar-chart-line', text: `Volumen normal (${volVal.ratio.toFixed(1)}x el promedio) — sin presion especial`, badge: 'NEUTRO' });
    }
  }

  // 7. Short momentum (last 6 candles)
  const momCloses = closes.slice(-7);
  const mom6 = (momCloses.at(-1) - momCloses[0]) / momCloses[0] * 100;
  if (mom6 > 0.8)       votes.push({ w: 0.6, dir: 1,  cls: 'bull', icon: 'bi-rocket',         text: `El precio subio ${mom6.toFixed(1)}% en las ultimas 6 velas — momentum positivo`,  badge: 'SUBIDA' });
  else if (mom6 < -0.8) votes.push({ w: 0.6, dir: -1, cls: 'bear', icon: 'bi-chevron-double-down', text: `El precio bajo ${Math.abs(mom6).toFixed(1)}% en las ultimas 6 velas — presion vendedora`, badge: 'BAJADA' });

  // 8. 48h trend (in signal window bars)
  const sw = Math.min(tfCfg.signalWindow, candles.length - 1);
  const h48c     = closes.slice(-sw);
  const h48Trend = (h48c.at(-1) - h48c[0]) / h48c[0] * 100;
  if (h48Trend > 3)       votes.push({ w: 0.5, dir: 1,  cls: 'bull', icon: 'bi-calendar2-check', text: `Tendencia de 48h: subida de ${h48Trend.toFixed(1)}% — mercado en modo alcista`,    badge: 'SUBIDA' });
  else if (h48Trend < -3) votes.push({ w: 0.5, dir: -1, cls: 'bear', icon: 'bi-calendar2-x',     text: `Tendencia de 48h: bajada de ${Math.abs(h48Trend).toFixed(1)}% — mercado debil`,    badge: 'BAJADA' });
  else                    votes.push({ w: 0.2, dir: 0,  cls: 'neut', icon: 'bi-calendar2',        text: `Mercado lateral en las ultimas 48h (${fmt.pct(h48Trend)})`,                        badge: 'NEUTRO' });

  // ── Score ──
  const totalW = votes.reduce((a, v) => a + v.w, 0);
  const sumW   = votes.reduce((a, v) => a + v.dir * v.w, 0);
  const score  = totalW ? sumW / totalW : 0;

  let direction = 'wait';
  if (score >= 0.20)  direction = 'buy';
  if (score <= -0.20) direction = 'sell';

  const confidence = Math.round(Math.min(97, Math.abs(score) * 115 + 20));

  // Si la fiabilidad no supera el 70%, no vale la pena actuar — mejor esperar
  if (confidence < 70) direction = 'wait';

  // TP / SL via ATR
  const atrMult = confidence > 70 ? 2.3 : 1.7;
  const slMult  = confidence > 70 ? 1.4 : 1.0;
  let tp, sl;
  if (direction === 'buy') {
    tp = price + atrVal * atrMult;
    sl = price - atrVal * slMult;
  } else if (direction === 'sell') {
    tp = price - atrVal * atrMult;
    sl = price + atrVal * slMult;
  } else {
    const highs48 = candles.slice(-sw).map(c => c.high);
    const lows48  = candles.slice(-sw).map(c => c.low);
    tp = Math.max(...highs48);
    sl = Math.min(...lows48);
  }

  const tpPct = (tp - price) / price * 100;
  const slPct = (sl - price) / price * 100;

  // 48h stats
  const highs48 = candles.slice(-sw).map(c => c.high);
  const lows48  = candles.slice(-sw).map(c => c.low);
  const vols48  = candles.slice(-sw).map(c => c.volume);
  const avgVol48 = vols48.reduce((a, b) => a + b, 0) / vols48.length;

  // Timing text
  const timingText = buildTimingText(direction, confidence, timeframe, rsiVal, macdVal, bbVal, h48Trend, mom6);

  return {
    symbol, direction, confidence, price, score,
    tp, sl, tpPct, slPct,
    rsi: rsiVal, macd: macdVal, bb: bbVal,
    ema9, ema21, ema50, atr: atrVal, vol: volVal,
    votes, h48Trend, mom6,
    h48High: Math.max(...highs48),
    h48Low:  Math.min(...lows48),
    h48Avg:  avgVol48,
    timingText,
    updatedAt: Date.now(),
  };
}

/* ═══════════════════════════════════════════════════════════
   BINANCE DATA FETCHING
═══════════════════════════════════════════════════════════ */
async function fetchKlines(symbol, timeframe) {
  try {
    const limit = CONFIG.TF_CONFIG[timeframe]?.klines ?? 120;
    const r = await fetch(`${CONFIG.REST}/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`);
    const d = await r.json();
    if (!Array.isArray(d)) return null;
    return d.map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch { return null; }
}

async function fetch24h(symbol) {
  try {
    const r = await fetch(`${CONFIG.REST}/ticker/24hr?symbol=${symbol}`);
    return await r.json();
  } catch { return null; }
}

/* ═══════════════════════════════════════════════════════════
   WEBSOCKET
═══════════════════════════════════════════════════════════ */
function connectWS() {
  setWsStatus('loading');
  const streams = CONFIG.COINS.map(c => `${c.symbol.toLowerCase()}@ticker`).join('/');
  const ws = new WebSocket(`${CONFIG.WS_BASE}?streams=${streams}`);
  state.ws = ws;

  ws.onopen  = () => setWsStatus('on');
  ws.onerror = () => setWsStatus('off');
  ws.onclose = () => {
    setWsStatus('off');
    setTimeout(connectWS, CONFIG.RECONNECT_DELAY);
  };

  ws.onmessage = ({ data }) => {
    try {
      const { data: t } = JSON.parse(data);
      if (!t?.s) return;
      const sym  = t.s;
      const prev = state.prices[sym]?.price;
      const cur  = parseFloat(t.c);

      state.prices[sym] = {
        price:    cur,
        change24h: parseFloat(t.P),
        high:     parseFloat(t.h),
        low:      parseFloat(t.l),
        volume:   parseFloat(t.v) * parseFloat(t.c),
      };

      // Update last kline close in all timeframes
      if (state.klines[sym]) {
        for (const tf of Object.keys(state.klines[sym])) {
          const kls = state.klines[sym][tf];
          if (kls?.length) {
            const last = kls.at(-1);
            last.close = cur;
            if (cur > last.high) last.high = cur;
            if (cur < last.low)  last.low  = cur;
          }
        }
      }

      updatePillPrice(sym, state.prices[sym]);

      if (sym === state.active) {
        updateChartHeader(sym);
        if (state.candleSeries) {
          const kls = state.klines[sym]?.[state.timeframe];
          if (kls?.length) {
            const last = kls.at(-1);
            state.candleSeries.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
          }
        }
      }

      if (prev && Math.abs((cur - prev) / prev) > 0.003) {
        reScore(sym);
      }
    } catch {}
  };
}

function setWsStatus(s) {
  const dot   = document.getElementById('liveDot');
  const label = document.getElementById('liveLabel');
  dot.className = `live-dot ${s}`;
  label.textContent = { on: 'en vivo', off: 'reconectando...', loading: 'conectando...' }[s] ?? '';
}

/* ═══════════════════════════════════════════════════════════
   CHART
═══════════════════════════════════════════════════════════ */
function initChart() {
  const container = document.getElementById('chartContainer');
  container.innerHTML = '';

  if (state.chart) { try { state.chart.remove(); } catch {} }

  const isMobile = window.innerWidth <= 600;

  state.chart = LightweightCharts.createChart(container, {
    width:  container.clientWidth,
    height: container.clientHeight,
    layout: { background: { color: '#07090e' }, textColor: '#5e708a' },
    grid:   { vertLines: { color: '#101520' }, horzLines: { color: '#101520' } },
    crosshair: {
      mode:     isMobile ? 1 : 0,
      vertLine: { color: '#4d78d440' },
      horzLine: { color: '#4d78d440' },
    },
    rightPriceScale: {
      borderColor: '#1a2235',
      scaleMargins: { top: 0.08, bottom: 0.08 },
    },
    timeScale: {
      borderColor:     '#1a2235',
      timeVisible:     true,
      secondsVisible:  false,
      fixLeftEdge:     false,
      fixRightEdge:    false,
      lockVisibleTimeRangeOnResize: true,
    },
    handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  });

  state.candleSeries = state.chart.addCandlestickSeries({
    upColor:         '#00d084',
    downColor:       '#ff4560',
    borderUpColor:   '#00d084',
    borderDownColor: '#ff4560',
    wickUpColor:     '#00d08460',
    wickDownColor:   '#ff456060',
  });

  // EMA9 line
  state.ema9Series = state.chart.addLineSeries({
    color:            '#f5a62390',
    lineWidth:        1,
    lineStyle:        0,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  // EMA21 line
  state.ema21Series = state.chart.addLineSeries({
    color:            '#4d78d490',
    lineWidth:        1,
    lineStyle:        0,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  const ro = new ResizeObserver(() => {
    if (state.chart) state.chart.resize(container.clientWidth, container.clientHeight);
  });
  ro.observe(container);
}

function loadChartData(symbol, timeframe) {
  const klines = state.klines[symbol]?.[timeframe];
  if (!klines || !state.candleSeries) return;

  const closes = klines.map(k => k.close);

  state.candleSeries.setData(klines.map(k => ({
    time: k.time, open: k.open, high: k.high, low: k.low, close: k.close,
  })));

  // EMA overlay data
  const ema9Full  = emaFull(closes, 9);
  const ema21Full = emaFull(closes, 21);

  const ema9Data  = klines.slice(-ema9Full.length).map((k, i) => ({ time: k.time, value: ema9Full[i] }));
  const ema21Data = klines.slice(-ema21Full.length).map((k, i) => ({ time: k.time, value: ema21Full[i] }));

  if (state.ema9Series)  state.ema9Series.setData(ema9Data);
  if (state.ema21Series) state.ema21Series.setData(ema21Data);

  state.chart.timeScale().fitContent();
}

/* ═══════════════════════════════════════════════════════════
   UI RENDERERS
═══════════════════════════════════════════════════════════ */
function renderNavPills() {
  const nav = document.getElementById('navCoins');
  nav.innerHTML = CONFIG.COINS.map(coin => `
    <button class="coin-pill ${coin.symbol === state.active ? 'active' : ''}"
            onclick="selectCoin('${coin.symbol}')"
            id="pill-${coin.symbol}">
      <i class="bi ${coin.icon} coin-bi"></i>
      <span class="coin-name">${coin.short}</span>
      <span class="coin-live-price" id="pill-price-${coin.symbol}">—</span>
      <span class="pill-signal" id="pill-sig-${coin.symbol}"></span>
    </button>
  `).join('');
}

function updatePillPrice(sym, data) {
  const el = document.getElementById(`pill-price-${sym}`);
  if (el && data?.price) el.textContent = '$' + fmt.price(data.price);
}

function updatePillSignal(sym, direction) {
  const el = document.getElementById(`pill-sig-${sym}`);
  if (el) el.className = `pill-signal ${direction ?? ''}`;
}

function updateChartHeader(sym) {
  const coin  = CONFIG.COINS.find(c => c.symbol === sym);
  const data  = state.prices[sym];

  document.getElementById('chartSymbol').textContent   = `${coin?.short ?? sym} / USDT`;
  document.getElementById('chartCoinName').textContent = coin?.name ?? sym;

  const priceEl  = document.getElementById('chartPrice');
  const prevText = priceEl.textContent;
  const newText  = data?.price ? '$' + fmt.price(data.price) : '—';

  if (data?.price && prevText !== '—' && prevText !== newText) {
    const prevNum = parseFloat(prevText.replace(/[^0-9.]/g, ''));
    priceEl.className = `chart-price ${data.price > prevNum ? 'price-up' : 'price-down'}`;
    setTimeout(() => { priceEl.className = 'chart-price'; }, 600);
  }
  priceEl.textContent = newText;

  const chg  = data?.change24h ?? 0;
  const chEl = document.getElementById('chartChange');
  chEl.textContent = fmt.pct(chg);
  chEl.className   = `chart-change ${chg >= 0 ? 'up' : 'down'}`;

  document.getElementById('metaHigh').textContent = data?.high ? '$' + fmt.price(data.high) : '—';
  document.getElementById('metaLow').textContent  = data?.low  ? '$' + fmt.price(data.low)  : '—';
  document.getElementById('metaVol').textContent  = '$' + fmt.volume(data?.volume);
  document.getElementById('footerTime').textContent = fmt.time();
}

function renderSignalPanel(sym, tf) {
  const sig  = state.signals[sym]?.[tf];
  const btn  = document.getElementById('signalButton');
  const icon = document.getElementById('signalBiIcon');
  const act  = document.getElementById('signalAction');
  const tim  = document.getElementById('signalTiming');
  const sub  = document.getElementById('signalSubtitle');
  const upd  = document.getElementById('signalUpdated');

  if (!sig) {
    btn.className  = 'signal-button loading';
    icon.className = 'bi bi-arrow-repeat';
    act.textContent = 'ANALIZANDO';
    tim.textContent = '';
    sub.textContent = 'Descargando datos del mercado...';
    upd.textContent = '';
    renderIndicators([]);
    renderSummary(null);
    return;
  }

  const meta = {
    buy:  { cls: 'buy',  icon: 'bi-arrow-up-circle-fill',   label: 'COMPRAR' },
    sell: { cls: 'sell', icon: 'bi-arrow-down-circle-fill', label: 'VENDER'  },
    wait: { cls: 'wait', icon: 'bi-pause-circle-fill',      label: 'ESPERAR' },
  };
  const m = meta[sig.direction];

  btn.className   = `signal-button ${m.cls}`;
  icon.className  = `bi ${m.icon}`;
  act.textContent = m.label;
  tim.textContent = sig.timingText;
  upd.textContent = `Actualizado ${fmt.timeSince(sig.updatedAt)}`;

  // Sub description
  const confLabel = sig.confidence >= 70 ? 'alta' : sig.confidence >= 50 ? 'moderada' : 'baja';
  sub.textContent = `Confianza ${confLabel} (${sig.confidence}%). Basado en ${sig.votes.length} indicadores tecnicos del mercado.`;

  // TP / SL
  document.getElementById('tpPrice').textContent = '$' + fmt.price(sig.tp);
  document.getElementById('slPrice').textContent = '$' + fmt.price(sig.sl);
  document.getElementById('tpPct').textContent   = fmt.pct(sig.tpPct, true);
  document.getElementById('slPct').textContent   = fmt.pct(sig.slPct, true);

  // Confidence bar
  const cc = sig.confidence >= 70 ? 'high' : sig.confidence >= 50 ? 'medium' : 'low';
  const cdesc = {
    high:   `Señal solida — la mayoria de indicadores apuntan en la misma direccion.`,
    medium: `Señal moderada — hay indicadores que no estan de acuerdo. Procede con cuidado.`,
    low:    `Señal debil — el mercado esta muy indeciso. Mejor esperar mas claridad.`,
  }[cc];
  document.getElementById('confValue').textContent = sig.confidence + '%';
  document.getElementById('confValue').className   = `conf-value ${cc}`;
  document.getElementById('confBar').style.width   = sig.confidence + '%';
  document.getElementById('confBar').className     = `conf-bar-fill ${cc}`;
  document.getElementById('confDesc').textContent  = cdesc;

  renderIndicators(sig.votes);
  renderSummary(sig, tf);
  updatePillSignal(sym, sig.direction);
}

function renderIndicators(votes) {
  const list = document.getElementById('indicatorsList');
  if (!votes?.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);font-style:italic">Calculando indicadores...</div>';
    return;
  }
  const badgeClass = { 'SUBIDA': 'bull', 'BAJADA': 'bear', 'NEUTRO': 'neut' };
  list.innerHTML = votes.slice(0, 7).map(v => `
    <div class="ind-row">
      <i class="bi ${v.icon} ind-icon ${v.cls}"></i>
      <span class="ind-text">${v.text}</span>
      <span class="ind-badge ${badgeClass[v.badge] ?? 'neut'}">${v.badge}</span>
    </div>
  `).join('');
}

function renderSummary(sig, tf) {
  const body = document.getElementById('summaryBody');
  if (!sig) { body.innerHTML = '<div class="summary-skeleton">Cargando analisis...</div>'; return; }

  const tfLabel  = CONFIG.TF_CONFIG[tf]?.label ?? tf;
  const sym      = sig.symbol;
  const trendDir = sig.h48Trend > 0 ? 'up' : sig.h48Trend < 0 ? 'down' : 'neut';
  const trendLbl = sig.h48Trend > 2 ? 'Subida' : sig.h48Trend < -2 ? 'Bajada' : 'Lateral';

  const rsiState = sig.rsi > 68 ? 'Sobrecomprado' : sig.rsi < 32 ? 'Sobrevendido' : 'Normal';
  const rsiCls   = sig.rsi > 68 ? 'down' : sig.rsi < 32 ? 'up' : 'neut';

  const rows = [
    { key: 'Tendencia 48h',         val: `${trendLbl} ${fmt.pct(sig.h48Trend)}`,               cls: trendDir },
    { key: 'Precio mas alto (48h)', val: '$' + fmt.price(sig.h48High),                          cls: 'up' },
    { key: 'Precio mas bajo (48h)', val: '$' + fmt.price(sig.h48Low),                           cls: 'down' },
    { key: 'RSI ahora',             val: `${sig.rsi?.toFixed(1)} — ${rsiState}`,                cls: rsiCls },
    { key: 'Momentum reciente',     val: `${sig.mom6 >= 0 ? '+' : ''}${sig.mom6?.toFixed(2)}%`, cls: sig.mom6 >= 0 ? 'up' : 'down' },
    { key: 'Sesion de mercado',     val: currentSessionLabel(),                                  cls: 'neut' },
  ];

  body.innerHTML = rows.map(r => `
    <div class="stat-row">
      <span class="stat-key">${r.key}</span>
      <span class="stat-val ${r.cls}">${r.val}</span>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   MARKET SESSIONS
═══════════════════════════════════════════════════════════ */
const SESSIONS = [
  { name: 'Asia (Tokio)',    icon: 'bi-sunrise',    utcOpen: 0,  utcClose: 8  },
  { name: 'Europa (Londres)',icon: 'bi-buildings',  utcOpen: 7,  utcClose: 16 },
  { name: 'EE.UU. (NY)',     icon: 'bi-bank',       utcOpen: 13, utcClose: 22 },
];

function currentSessionLabel() {
  const h = new Date().getUTCHours();
  const active = SESSIONS.filter(s => h >= s.utcOpen && h < s.utcClose);
  if (active.length === 0) return 'Mercado tranquilo';
  return active.map(s => s.name).join(' + ');
}

function renderSessions() {
  const h    = new Date().getUTCHours();
  const list = document.getElementById('sessionsList');
  list.innerHTML = SESSIONS.map(s => {
    const isOpen = h >= s.utcOpen && h < s.utcClose;
    return `
      <div class="session-row ${isOpen ? 'active-session' : ''}">
        <span class="session-name">
          <i class="bi ${s.icon}"></i>
          ${s.name}
        </span>
        <span class="session-hours">${String(s.utcOpen).padStart(2,'0')}:00–${String(s.utcClose).padStart(2,'0')}:00 UTC</span>
        <span class="session-status ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Abierta' : 'Cerrada'}</span>
      </div>
    `;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   TIMEFRAME SELECTOR
═══════════════════════════════════════════════════════════ */
function initTimeframeButtons() {
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tf = btn.dataset.tf;
      if (tf === state.timeframe) return;

      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.timeframe = tf;
      document.getElementById('footerTf').textContent      = CONFIG.TF_CONFIG[tf]?.label ?? tf;
      document.getElementById('footerKlines').textContent  = CONFIG.TF_CONFIG[tf]?.klines ?? '—';

      // Show loading
      renderSignalPanel(state.active, tf);

      // Load klines for this TF if not cached
      if (!state.klines[state.active]) state.klines[state.active] = {};
      if (!state.klines[state.active][tf]) {
        const klines = await fetchKlines(state.active, tf);
        if (klines) state.klines[state.active][tf] = klines;
      }

      // Recompute
      const klines = state.klines[state.active]?.[tf];
      if (klines) {
        if (!state.signals[state.active]) state.signals[state.active] = {};
        state.signals[state.active][tf] = computeSignal(state.active, klines, tf);
      }

      loadChartData(state.active, tf);
      updateChartHeader(state.active);
      renderSignalPanel(state.active, tf);
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   COIN SELECTION
═══════════════════════════════════════════════════════════ */
async function selectCoin(symbol) {
  if (symbol === state.active) return;
  state.active = symbol;

  document.querySelectorAll('.coin-pill').forEach(p => {
    p.classList.toggle('active', p.id === `pill-${symbol}`);
  });

  renderSignalPanel(symbol, state.timeframe);
  updateChartHeader(symbol);

  // Ensure klines map exists
  if (!state.klines[symbol]) state.klines[symbol] = {};

  if (!state.klines[symbol][state.timeframe]) {
    const klines = await fetchKlines(symbol, state.timeframe);
    if (klines) state.klines[symbol][state.timeframe] = klines;
  }

  const klines = state.klines[symbol]?.[state.timeframe];
  if (klines) {
    if (!state.signals[symbol]) state.signals[symbol] = {};
    state.signals[symbol][state.timeframe] = computeSignal(symbol, klines, state.timeframe);
  }

  loadChartData(symbol, state.timeframe);
  updateChartHeader(symbol);
  renderSignalPanel(symbol, state.timeframe);
}

/* ═══════════════════════════════════════════════════════════
   RE-SCORE
═══════════════════════════════════════════════════════════ */
function reScore(symbol) {
  const klines = state.klines[symbol]?.[state.timeframe];
  if (!klines) return;

  const prev = state.signals[symbol]?.[state.timeframe];
  const next = computeSignal(symbol, klines, state.timeframe);
  if (!next) return;

  if (!state.signals[symbol]) state.signals[symbol] = {};
  state.signals[symbol][state.timeframe] = next;

  if (symbol === state.active) renderSignalPanel(symbol, state.timeframe);

  if (prev && prev.direction !== next.direction) {
    const pill = document.getElementById(`pill-${symbol}`);
    if (pill) {
      const col = next.direction === 'buy' ? 'var(--green)' : next.direction === 'sell' ? 'var(--red)' : 'var(--yellow)';
      pill.style.outline = `2px solid ${col}`;
      setTimeout(() => { pill.style.outline = ''; }, 1800);
    }
  }
  updatePillSignal(symbol, next.direction);
}

/* ═══════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
async function init() {
  renderNavPills();
  initChart();
  initTimeframeButtons();
  renderSessions();

  // Set footer TF label
  document.getElementById('footerTf').textContent     = CONFIG.TF_CONFIG[state.timeframe]?.label ?? state.timeframe;
  document.getElementById('footerKlines').textContent = CONFIG.TF_CONFIG[state.timeframe]?.klines ?? '—';

  // Load active coin first
  if (!state.klines[state.active]) state.klines[state.active] = {};

  const [activeKlines, activeTicker] = await Promise.all([
    fetchKlines(state.active, state.timeframe),
    fetch24h(state.active),
  ]);

  if (activeTicker) {
    state.prices[state.active] = {
      price:    parseFloat(activeTicker.lastPrice),
      change24h: parseFloat(activeTicker.priceChangePercent),
      high:     parseFloat(activeTicker.highPrice),
      low:      parseFloat(activeTicker.lowPrice),
      volume:   parseFloat(activeTicker.quoteVolume),
    };
  }

  if (activeKlines) {
    state.klines[state.active][state.timeframe] = activeKlines;
    if (!state.signals[state.active]) state.signals[state.active] = {};
    state.signals[state.active][state.timeframe] = computeSignal(state.active, activeKlines, state.timeframe);
  }

  updateChartHeader(state.active);
  loadChartData(state.active, state.timeframe);
  renderSignalPanel(state.active, state.timeframe);
  updatePillPrice(state.active, state.prices[state.active]);

  // Load background coins
  for (const coin of CONFIG.COINS.filter(c => c.symbol !== state.active)) {
    (async () => {
      const [klines, ticker] = await Promise.all([
        fetchKlines(coin.symbol, state.timeframe),
        fetch24h(coin.symbol),
      ]);
      if (!state.klines[coin.symbol]) state.klines[coin.symbol] = {};
      if (ticker) {
        state.prices[coin.symbol] = {
          price:    parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
          high:     parseFloat(ticker.highPrice),
          low:      parseFloat(ticker.lowPrice),
          volume:   parseFloat(ticker.quoteVolume),
        };
        updatePillPrice(coin.symbol, state.prices[coin.symbol]);
      }
      if (klines) {
        state.klines[coin.symbol][state.timeframe] = klines;
        if (!state.signals[coin.symbol]) state.signals[coin.symbol] = {};
        state.signals[coin.symbol][state.timeframe] = computeSignal(coin.symbol, klines, state.timeframe);
        updatePillSignal(coin.symbol, state.signals[coin.symbol][state.timeframe]?.direction);
      }
    })();
  }

  connectWS();

  // Periodic refresh
  setInterval(async () => {
    if (!state.klines[state.active]) state.klines[state.active] = {};
    const klines = await fetchKlines(state.active, state.timeframe);
    if (klines) {
      state.klines[state.active][state.timeframe] = klines;
      reScore(state.active);
      loadChartData(state.active, state.timeframe);
    }
    document.getElementById('footerTime').textContent = fmt.time();

    // Refresh session display
    renderSessions();

    // Update signal updated time
    const sig = state.signals[state.active]?.[state.timeframe];
    if (sig) {
      document.getElementById('signalUpdated').textContent = `Actualizado ${fmt.timeSince(sig.updatedAt)}`;
    }
  }, CONFIG.SIGNAL_INTERVAL);
}

window.selectCoin = selectCoin;
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  init();
});
