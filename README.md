# ⬡ CryptoSignal

Plataforma de señales de trading crypto/forex en tiempo real.  
Datos en vivo: Binance WebSocket + REST · open.er-api.com

---

## Estructura del proyecto

```
cryptosignal/
├── index.html          ← Punto de entrada principal (HTML limpio)
├── css/
│   └── main.css        ← Todos los estilos, mobile-first responsive
├── js/
│   ├── utils.js        ← fmt(), sysLog(), showToast()
│   ├── indicators.js   ← calcRsi(), calcBol(), calcAtr(), genSignal()
│   ├── charts.js       ← drawCandles(), drawRsi() (Canvas 2D)
│   ├── accuracy.js     ← Motor de precisión: watchList, TP/SL resolution
│   ├── app.js          ← Estado principal, tabs, WebSocket, renderAll()
│   └── auth.js         ← SHA-256 login, sesión, logout
└── README.md
```

### Orden de carga de scripts
```html
utils.js → indicators.js → charts.js → accuracy.js → app.js → auth.js
```
Cada módulo depende solo de los anteriores (no hay bundler necesario).

---

## Despliegue rápido

### Opción A — Netlify / Vercel (drag & drop)
1. Sube la carpeta `cryptosignal/` completa.
2. El archivo raíz `index.html` se sirve automáticamente.
3. Listo. No requiere build ni configuración extra.

### Opción B — GitHub Pages
```bash
git init
git add .
git commit -m "init cryptosignal"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cryptosignal.git
git push -u origin main
# Activar GitHub Pages → Settings → Pages → Source: main /root
```

### Opción C — Servidor estático (nginx / apache)
```nginx
server {
  listen 80;
  root /var/www/cryptosignal;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

### Opción D — Local (sin servidor)
```bash
npx serve .
# o
python3 -m http.server 8080
```
Abre http://localhost:8080

---

## Clave de acceso

La clave se valida contra un hash SHA-256 hardcodeado en `index.html`:
```html
<script>const ACCESS_KEY_HASH = "28467e3b65605b885f22ec6a72716433aae3b688d1e19bc5dd4f6b3073957002";</script>
```

Para cambiar la clave, genera el hash de tu nueva clave en la consola:
```js
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
}
sha256('TU_NUEVA_CLAVE').then(console.log);
```
Reemplaza el valor en `index.html`.

---

## APIs utilizadas

| Servicio | Endpoint | Uso |
|---|---|---|
| Binance REST | `api.binance.com/api/v3/klines` | Velas históricas |
| Binance WS | `stream.binance.com:9443` | Precio en tiempo real |
| Binance REST | `api.binance.com/api/v3/ticker/24hr` | Stats 24h |
| ExchangeRate API | `open.er-api.com/v6/latest/{base}` | Forex (primario) |
| Fawazahmed0 | `cdn.jsdelivr.net/npm/@fawazahmed0/...` | Forex (fallback) |

Todas las APIs son públicas y gratuitas (sin API key).

---

## Responsividad

| Breakpoint | Diseño |
|---|---|
| < 380px | AEB compacto, precios ajustados, acc-counters 2 cols |
| < 480px | RSI+Bollinger en columna única, chart 200px |
| 480–700px | 3 columnas métricas, 6 columnas forex, charts 2 cols |
| ≥ 700px | 5 columnas métricas, chart 280px |
| ≥ 768px | Padding mayor, cards más espaciados |

Safe areas de iPhone X+ (`env(safe-area-inset-*)`) aplicadas en topbar, content y toast.
