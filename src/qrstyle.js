// QR-код в фирменном стиле клиники: ромбики коралловым градиентом, угловые «листики» красного и малинового цвета,
// посередине логотип «Митти юрак». Исправление ошибок уровня H оставляет код читаемым, несмотря на логотип.
import qrcode from 'qrcode-generator';
import logoUrl from './assets/logo-qr.png';

const logo = new Image(); let logoOk = false, waiters = [];
logo.onload = function () { logoOk = true; cache.clear(); waiters.splice(0).forEach(function (f) { try { f(); } catch (e) { /* не страшно */ } }); };
logo.src = logoUrl;
const cache = new Map();
// Линии синхронизации и узоры выравнивания остаются квадратными: по ним сканер находит сетку кода, ромбики эту разметку ломают
const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66] };
function isGuide(r, k, n) {
  if (r === 6 || k === 6) return true;
  var a = ALIGN[(n - 17) / 4] || [], last = a[a.length - 1];
  for (var i = 0; i < a.length; i++) for (var j = 0; j < a.length; j++) {
    var cr = a[i], ck = a[j]; if ((cr === 6 && ck === 6) || (cr === 6 && ck === last) || (cr === last && ck === 6)) continue;
    if (Math.abs(r - cr) <= 2 && Math.abs(k - ck) <= 2) return true;
  }
  return false;
}
export function onLogoReady(f) { if (logoOk) f(); else waiters.push(f); }

// прямоугольник со скруглением каждого угла по-своему (радиусы в пикселях)
function leaf(g, x, y, w, h, tl, tr, br, bl) {
  g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); if (tr) g.arcTo(x + w, y, x + w, y + tr, tr); else g.lineTo(x + w, y);
  g.lineTo(x + w, y + h - br); if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br); else g.lineTo(x + w, y + h);
  g.lineTo(x + bl, y + h); if (bl) g.arcTo(x, y + h, x, y + h - bl, bl); else g.lineTo(x, y + h);
  g.lineTo(x, y + tl); if (tl) g.arcTo(x, y, x + tl, y, tl); else g.lineTo(x, y);
  g.closePath();
}

export function qrStyled(text, px) {
  px = px || 1200;
  var key = text + '|' + px; if (cache.has(key)) return cache.get(key);
  try {
    var q = qrcode(0, 'H'); q.addData(text); q.make();
    var n = q.getModuleCount(), mg = 4, sc = Math.max(6, Math.floor(px / (n + 2 * mg))), size = (n + 2 * mg) * sc, c = document.createElement('canvas');
    c.width = c.height = size; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
    var X = function (m) { return (m + mg) * sc; };
    var finder = function (r, k) { return (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7); };
    // место под логотип: на уровне H закрываем около 8% модулей
    var lw = Math.round(n * 0.31), lh = Math.round(lw / 1.231), lx = Math.floor((n - lw) / 2), ly = Math.floor((n - lh) / 2), pad = 1;
    var inLogo = function (r, k) { return logoOk && k >= lx - pad && k < lx + lw + pad && r >= ly - pad && r < ly + lh + pad; };
    var grad = g.createLinearGradient(0, 0, size, size); grad.addColorStop(0, '#f2484a'); grad.addColorStop(1, '#e8633a');
    g.fillStyle = grad; var hd = sc * 0.74;
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) {
      if (!q.isDark(r, k) || finder(r, k) || inLogo(r, k)) continue;
      if (isGuide(r, k, n)) { g.fillRect(X(k), X(r), sc, sc); continue; }
      var cx = X(k) + sc / 2, cy = X(r) + sc / 2; g.beginPath(); g.moveTo(cx, cy - hd); g.lineTo(cx + hd, cy); g.lineTo(cx, cy + hd); g.lineTo(cx - hd, cy); g.closePath(); g.fill();
    }
    // угловые узоры: «листик» — скруглены три угла, угол к центру кода острый
    [[0, 0, 1], [n - 7, 0, 2], [0, n - 7, 3]].forEach(function (f) {
      var fx = X(f[0]), fy = X(f[1]), s7 = 7 * sc, o = [2.4, 1.5, 0, 1.5];
      var rad = function (kf) { var out = kf === 1 ? [o[0], o[1], 0, o[3]] : kf === 2 ? [o[1], o[0], o[3], 0] : [o[1], 0, o[3], o[0]]; return out; }; // [TL, TR, BR, BL]; острый угол смотрит в центр
      var R = rad(f[2]);
      g.beginPath(); leaf(g, fx, fy, s7, s7, R[0] * sc, R[1] * sc, R[2] * sc, R[3] * sc);
      leaf(g, fx + sc, fy + sc, 5 * sc, 5 * sc, R[0] * sc * 0.6, R[1] * sc * 0.6, R[2] * sc * 0.6, R[3] * sc * 0.6);
      g.fillStyle = '#e60000'; g.fill('evenodd');
      g.beginPath(); leaf(g, fx + 2 * sc, fy + 2 * sc, 3 * sc, 3 * sc, R[0] * sc * 0.4, R[1] * sc * 0.4, R[2] * sc * 0.4, R[3] * sc * 0.4); g.fillStyle = '#d6009c'; g.fill();
    });
    if (logoOk) { g.fillStyle = '#f8f9f8'; g.fillRect(X(lx), X(ly), lw * sc, lh * sc); g.drawImage(logo, X(lx), X(ly), lw * sc, lh * sc); }
    var url = c.toDataURL('image/png'); cache.set(key, url); return url;
  } catch (e) { return ''; }
}
