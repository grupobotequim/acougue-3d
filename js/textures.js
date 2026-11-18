// Texturas procedurais (canvas) — tudo gerado no navegador, sem arquivo externo.
import * as THREE from 'three';

export let ANISO = 4;
export function setAniso(a) { ANISO = a; }

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// mapa normal a partir de altura (Float32Array w*h, 0..1), com wrap pra ladrilhar
function normalFromHeight(hm, w, h, strength = 2) {
  const [c, x] = cv(w, h);
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const jm = ((j - 1 + h) % h) * w, jp = ((j + 1) % h) * w, jr = j * w;
    for (let i = 0; i < w; i++) {
      const im = (i - 1 + w) % w, ip = (i + 1) % w;
      const dx = (hm[jr + ip] - hm[jr + im]) * strength;
      const dy = (hm[jp + i] - hm[jm + i]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const k = (jr + i) * 4;
      d[k] = (nx / l * 0.5 + 0.5) * 255;
      d[k + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[k + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

function grayCanvas(w, h, fn) {
  const [c, x] = cv(w, h);
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = Math.max(0, Math.min(255, fn(i, j) * 255));
    const k = (j * w + i) * 4;
    d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function speckle(x, w, h, n, colors, r, rmin = 0.5, rmax = 1.6, amin = 0.05, amax = 0.25) {
  for (let i = 0; i < n; i++) {
    x.globalAlpha = amin + r() * (amax - amin);
    x.fillStyle = colors[(r() * colors.length) | 0];
    const s = rmin + r() * (rmax - rmin);
    x.fillRect(r() * w, r() * h, s, s);
  }
  x.globalAlpha = 1;
}

// ---------- TIJOLINHO PRETO 24x6 rejunte 1cm (1px = 1mm; tile 1,00 x 0,98 m)
export function tijolinho() {
  const W = 1000, H = 980, MW = 250, MH = 70, J = 10;
  const r = rng(11);
  const [c, x] = cv(W, H);
  // argamassa grafite (mais escura que a face do tijolo, rugosa)
  x.fillStyle = '#1b1b1c'; x.fillRect(0, 0, W, H);
  speckle(x, W, H, 30000, ['#0a0a0a', '#2c2c2c', '#141414'], r, 0.6, 2, 0.2, 0.5);
  const [rc, rx] = cv(W, H);
  rx.fillStyle = '#f4f4f4'; rx.fillRect(0, 0, W, H);
  // deslocamento aleatório por fiada (quebra a repetição do "meio tijolo" perfeito)
  const offs = [];
  for (let row = 0; row < H / MH; row++) offs.push(((row % 2) * 0.5 + (r() - 0.5) * 0.04) * MW); // RODADA 9: amarração ½ tijolo (±2%)
  for (let row = 0; row < H / MH; row++) {
    const off = offs[row];
    for (let i = -1; i <= W / MW; i++) {
      const bx = i * MW + off + J / 2, by = row * MH + J / 2;
      // tom tijolo a tijolo (±8% em luminância) + alguns mais "queimados"/mais claros
      let L = 34 * (0.88 + r() * 0.24);
      if (r() < 0.08) L *= 0.78; else if (r() < 0.06) L *= 1.22;
      const tint = (r() - 0.5) * 3;
      const g = x.createLinearGradient(0, by, 0, by + MH - J);
      g.addColorStop(0, `rgb(${L + 5 + tint},${L + 5},${L + 6 - tint})`);
      g.addColorStop(0.5, `rgb(${L},${L},${L + 1})`);
      g.addColorStop(1, `rgb(${L - 5},${L - 5},${L - 4})`);
      x.fillStyle = g;
      const dw = (r() - 0.5) * 3; // aresta levemente irregular
      x.fillRect(bx + dw, by, MW - J - dw, MH - J);
      const rough = 0.38 + r() * 0.26;
      rx.fillStyle = `rgb(${rough * 255},${rough * 255},${rough * 255})`;
      rx.fillRect(bx, by, MW - J, MH - J);
      // wrap horizontal
      if (bx + MW - J > W) { x.fillStyle = g; x.fillRect(bx - W, by, MW - J, MH - J); rx.fillRect(bx - W, by, MW - J, MH - J); }
    }
  }
  // manchas/eflorescência sutil e poros
  blotch(x, W, H, r, 60, ['rgb(70,70,72)', 'rgb(8,8,8)'], 20, 90, 0.10);
  speckle(x, W, H, 26000, ['#000', '#454545', '#111'], r, 0.6, 2.2, 0.08, 0.3);
  speckle(rx, W, H, 9000, ['#fff', '#999'], r, 1, 3, 0.05, 0.25);
  // altura analítica
  const hm = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const row = Math.floor(j / MH), yy = j % MH;
    const off = offs[row];
    for (let i = 0; i < W; i++) {
      const xx = (((i - off) % MW) + MW) % MW;
      const dx = Math.min(xx - J / 2, MW - J / 2 - xx);
      const dy = Math.min(yy - J / 2, MH - J / 2 - yy);
      const d = Math.min(dx, dy);
      hm[j * W + i] = d < 0 ? 0.05 * Math.random() : Math.min(1, 0.35 + d / 5) + (Math.random() - 0.5) * 0.06;
    }
  }
  return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: normalFromHeight(hm, W, H, 1.6), tile: [1.0, 0.98] };
}

// ---------- PORCELANATO CINZA CLARO 60x60 (canvas = 1,20 m)
export function porcelanato() {
  // RODADA 6: polido (roughness 0,20–0,30 variando por placa) e rejunte fino de 2 mm
  const W = 1024, T = 512, G = 2;
  const r = rng(22);
  const [c, x] = cv(W, W);
  x.fillStyle = '#8d8d89'; x.fillRect(0, 0, W, W);
  const [rc, rx] = cv(W, W);
  rx.fillStyle = '#e6e6e6'; rx.fillRect(0, 0, W, W);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const L = 140 + r() * 8;
    x.fillStyle = `rgb(${L},${L},${L - 3})`;
    x.fillRect(a * T + G, b * T + G, T - G * 2, T - G * 2);
    // nuvens suaves
    for (let k = 0; k < 40; k++) {
      const cx = a * T + r() * T, cy = b * T + r() * T, rad = 30 + r() * 120;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const tone = r() < 0.75 ? '255,255,255' : '200,200,196'; // RODADA 11: sem nuvem escura (lia como sujeira)
      g.addColorStop(0, `rgba(${tone},0.06)`); g.addColorStop(1, `rgba(${tone},0)`);
      x.fillStyle = g;
      x.save(); x.beginPath(); x.rect(a * T + G, b * T + G, T - G * 2, T - G * 2); x.clip();
      x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); x.restore();
    }
    const R = 0.20 + r() * 0.10;
    rx.fillStyle = `rgb(${R * 255},${R * 255},${R * 255})`;
    rx.fillRect(a * T + G, b * T + G, T - G * 2, T - G * 2);
  }
  x.save(); x.beginPath();
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) x.rect(a * T + G, b * T + G, T - G * 2, T - G * 2);
  x.clip();
  speckle(x, W, W, 60000, ['#777', '#999', '#fff', '#666'], r, 0.6, 1.8, 0.08, 0.35);
  x.restore();
  speckle(rx, W, W, 9000, ['#999', '#333'], r, 1, 3, 0.03, 0.10);
  const hm = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const a = i % T, b = j % T;
    const d = Math.min(a, T - 1 - a, b, T - 1 - b);
    hm[j * W + i] = d < G ? 0 : Math.min(1, 0.5 + (d - G) / 3);
  }
  return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: normalFromHeight(hm, W, W, 1.2), tile: [1.2, 1.2] };
}

// ---------- PORCELANATO BRANCO 60x120 (parede esquerda)
export function porcelanatoBranco() {
  // RODADA 8 — porcelanato polido 0,60 × 1,20: canvas = 2,40 m (4 placas × 2 fileiras), CADA PLACA com tom e veio
  // próprios (variação sutil), junta de 2 mm cinza-clara #c9c9c9 (não "linha de lápis"), sulco leve no normal map
  const W = 2048, G = 2, PW = W / 4, PH = W / 2;
  const r = rng(33);
  const [c, x] = cv(W, W);
  x.fillStyle = '#c9c9c9'; x.fillRect(0, 0, W, W);
  for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) {
    const k = (r() - 0.5) * 8, wm = r() * 4;
    const base = [239 + k, 238 + k, 233 + k - wm];
    const g = x.createLinearGradient(a * PW, b * PH, a * PW + PW * (0.5 + r()), b * PH + PH);
    g.addColorStop(0, `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`);
    g.addColorStop(1, `rgb(${(base[0] - 3 - r() * 4) | 0},${(base[1] - 3 - r() * 4) | 0},${(base[2] - 2 - r() * 4) | 0})`);
    x.fillStyle = g; x.fillRect(a * PW + G, b * PH + G, PW - G * 2, PH - G * 2);
    // veios suaves por placa
    x.save(); x.beginPath(); x.rect(a * PW + G, b * PH + G, PW - G * 2, PH - G * 2); x.clip();
    x.strokeStyle = `rgba(150,150,148,${0.10 + r() * 0.10})`;
    for (let v = 0; v < 4; v++) {
      x.lineWidth = 0.8 + r() * 2.2; x.filter = 'blur(1.2px)';
      x.beginPath(); let px = a * PW + r() * PW, py = b * PH + r() * PH; x.moveTo(px, py);
      for (let s = 0; s < 26; s++) { px += (r() - 0.35) * 38; py += (r() - 0.5) * 34; x.lineTo(px, py); }
      x.stroke();
    }
    x.filter = 'none'; x.restore();
  }
  const N = 1024, hm = new Float32Array(N * N), sc = W / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = (i * sc) % PW, b = (j * sc) % PH;
    const d = Math.min(a, PW - 1 - a, b, PH - 1 - b) / sc;
    hm[j * N + i] = d < 1.5 ? 0.4 + d * 0.3 : 1;
  }
  return { map: tex(c), normalMap: normalFromHeight(hm, N, N, 0.6), tile: [2.4, 2.4] };
}

// RODADA 8 — FORRO: halo/lavagem de luz em volta dos perfis LED (emissiveMap) + leve escurecimento p/ os cantos (map).
// Canvas = forro inteiro (X −0,159 → 6,998; Z 0 → −4,538), mapeado pelo worldUV com tile = tamanho do forro.
export function forroLuz() {
  const W = 1024, H = 650, sx = W / 7.157, sz = H / 4.538;
  const [c, x] = cv(W, H), [e, y] = cv(W, H);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,66,60,0.32)');
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  y.fillStyle = '#000'; y.fillRect(0, 0, W, H);
  for (const z of [-0.55, -1.55, -3.30]) {
    const cy = (-z) * sz, x0 = (0.5 + 0.159) * sx, x1 = (6.3 + 0.159) * sx;
    for (const [rad, al] of [[95, 0.16], [45, 0.32], [16, 0.55]]) {
      const g = y.createLinearGradient(0, cy - rad, 0, cy + rad);
      g.addColorStop(0, 'rgba(255,244,230,0)'); g.addColorStop(0.5, `rgba(255,244,230,${al})`); g.addColorStop(1, 'rgba(255,244,230,0)');
      y.fillStyle = g; y.fillRect(x0 - rad * 0.4, cy - rad, x1 - x0 + rad * 0.8, rad * 2);
    }
  }
  const t1 = tex(c, { repeat: false }), t2 = tex(e, { repeat: false });
  // worldUV dá u = x / 7,157 (precisa +0,159) e v = −z / 4,538; o canvas tem v = 0 embaixo (flipY): espelha em V
  for (const t of [t1, t2]) { t.offset.set(0.159 / 7.157, 1); t.repeat.set(1, -1); t.wrapT = THREE.RepeatWrapping; }
  return { map: t1, emissiveMap: t2 };
}

// ---------- MDF NOGUEIRA ESCURO (canvas = 0,80 m, veio horizontal)
export function mdfEscuro() {
  // RODADA 11 — nogueira de verdade (juízes: "chapa canelada"): veio IRREGULAR a cada 6–15 mm com ondulação de baixa
  // frequência, 2–3 CATEDRAIS (arcos) por chapa, contraste ~10% e tom quente #4a3020 → #6b4a30 em manchas largas.
  const W = 1024, H = 1024, PXMM = W / 800;
  const r = rng(44);
  const nLow = ruido(W, H, r, 300, 3, 0.25);   // ondulação larga do veio
  const nTom = ruido(W, H, r, 200, 3, 0.4);    // manchas de tom
  const nFino = ruido(W, H, r, 48, 3, 0.05);   // fibra fina
  const nEsp = ruido(W, H, r, 128, 2, 0.5);    // espaçamento variável
  const cats = [];
  for (let k = 0; k < 3; k++) cats.push([r() * W, H * (0.15 + r() * 0.7), 140 + r() * 200, 50 + r() * 70]);
  const [c, x] = cv(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const hmM = new Float32Array(512 * 512);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    let g = j + (nLow[k] - 0.5) * 70;
    for (const [cx, cy, wx, amp] of cats) {
      const u = (i - cx) / wx, dy = (j - cy) / (amp * 2.2);
      if (Math.abs(u) < 1 && Math.abs(dy) < 1.4) g += amp * (1 - u * u) * Math.max(0, 1 - Math.abs(dy) / 1.4);
    }
    const passo = (6 + nEsp[k] * 9) * PXMM;  // 6–15 mm
    const f = g / passo;
    const fr = f - Math.floor(f);
    const veio = Math.exp(-((fr - 0.5) ** 2) / 0.012) * (0.6 + nFino[k] * 0.8);
    const tom = Math.max(0, Math.min(1, 0.5 + (nTom[k] - 0.5) * 1.6));
    let L = 1 - veio * 0.25 + (nFino[k] - 0.5) * 0.08; // RODADA 12: veio com ~25% de contraste
    // RODADA 12: MDF ESCURO de verdade #33241a (51,36,26) → #4e3726 (78,55,38)
    d[k * 4] = (51 + tom * 27) * L; d[k * 4 + 1] = (36 + tom * 19) * L; d[k * 4 + 2] = (26 + tom * 12) * L; d[k * 4 + 3] = 255;
    if ((i & 1) === 0 && (j & 1) === 0) hmM[(j >> 1) * 512 + (i >> 1)] = 1 - veio * 0.5 + nFino[k] * 0.2;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 5000; i++) {
    x.globalAlpha = 0.04 + r() * 0.07;
    x.fillStyle = r() < 0.7 ? '#2a1c12' : '#7a5838';
    x.fillRect(r() * W, r() * H, 3 + r() * 12, 0.8);
  }
  x.globalAlpha = 1;
  const rc = grayCanvas(256, 256, (i, j) => 0.52 + 0.04 * Math.sin(j * 1.6 + Math.sin(i * 0.02) * 0.6));
  return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: normalFromHeight(hmM, 512, 512, 0.8), tile: [0.8, 0.8] };
}

// ---------- INOX ESCOVADO (canvas = 1,0 m) — RODADA 11: 1 m sem repetição visível, escovado com intensidade que
// varia por faixa/chapa (manchas de baixa frequência, marcas de pano, faixas de laminação) — cada painel lê diferente
export function inox(seed = 55) {
  const W = 1024, H = 1024;
  const r = rng(seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#c9cccf'; x.fillRect(0, 0, W, H);
  // faixas de laminação (tom levemente diferente por faixa horizontal de 8–30 cm)
  for (let y = 0; y < H;) { const hh = 80 + r() * 220, L = 190 + r() * 26; x.globalAlpha = 0.10 + r() * 0.10; x.fillStyle = `rgb(${L},${L + 2},${L + 4})`; x.fillRect(0, y, W, hh); y += hh; }
  x.globalAlpha = 1;
  blotch(x, W, H, r, 26, ['rgb(150,154,158)', 'rgb(236,238,240)'], 80, 260, 0.10);
  for (let i = 0; i < 21000; i++) {
    const L = 175 + r() * 80;
    x.globalAlpha = 0.03 + r() * 0.09;
    x.fillStyle = `rgb(${L},${L + 2},${L + 4})`;
    const y = r() * H, len = 60 + r() * 700;
    const x0 = r() * W;
    x.fillRect(x0, y, len, 0.6 + r());
    if (x0 + len > W) x.fillRect(x0 - W, y, len, 0.6 + r());
  }
  // marcas de pano (arcos muito suaves)
  x.lineCap = 'round';
  for (let k = 0; k < 10; k++) { x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,124,128'},0.05)`; x.lineWidth = 20 + r() * 40; x.beginPath(); x.arc(r() * W, r() * H, 80 + r() * 200, r() * 6, r() * 6 + 1.0); x.stroke(); }
  x.globalAlpha = 1;
  const [rc, rx] = cv(W, H);
  rx.fillStyle = 'rgb(120,120,120)'; rx.fillRect(0, 0, W, H);
  blotch(rx, W, H, r, 22, ['rgb(90,90,90)', 'rgb(160,160,160)'], 80, 240, 0.25);
  for (let i = 0; i < 8000; i++) {
    const L = 85 + r() * 80;
    rx.globalAlpha = 0.1 + r() * 0.15;
    rx.fillStyle = `rgb(${L},${L},${L})`;
    const y = r() * H, len = 50 + r() * 500, x0 = r() * W;
    rx.fillRect(x0, y, len, 0.6 + r() * 1.2);
    if (x0 + len > W) rx.fillRect(x0 - W, y, len, 1);
  }
  rx.globalAlpha = 1;
  return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), tile: [1.0, 1.0] };
}

// ---------- CONCRETO CALÇADA / ASFALTO
export function calcada() {
  const W = 1024, r = rng(66);
  const [c, x] = cv(W, W);
  // calçada de concreto desempenado em placas de 1,00 m com junta de dilatação escura (canvas = 2,00 m)
  x.fillStyle = '#55524d'; x.fillRect(0, 0, W, W);
  const T = 512, J = 5;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const L = 150 + r() * 16;
    x.fillStyle = `rgb(${L},${L - 1},${L - 5})`;
    x.fillRect(a * T + J, b * T + J, T - J * 2, T - J * 2);
    // marcas da desempenadeira (arcos suaves)
    x.save(); x.beginPath(); x.rect(a * T + J, b * T + J, T - J * 2, T - J * 2); x.clip();
    for (let k = 0; k < 40; k++) {
      x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,250' : '70,66,60'},0.05)`; x.lineWidth = 3 + r() * 8;
      x.beginPath(); x.arc(a * T + r() * T, b * T + r() * T, 30 + r() * 90, r() * 6, r() * 6 + 1.2); x.stroke();
    }
    x.restore();
  }
  speckle(x, W, W, 70000, ['#5d5a56', '#d0cdc6', '#8a867f'], r, 0.6, 2.2, 0.08, 0.35);
  // manchas de uso/umidade (mais escuras perto das juntas)
  for (let k = 0; k < 26; k++) {
    const cx = r() * W, cy = r() * W, rad = 30 + r() * 110;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(60,56,50,0.13)'); g.addColorStop(1, 'rgba(60,56,50,0)');
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // fissuras finas
  x.strokeStyle = 'rgba(40,38,35,0.35)'; x.lineWidth = 1;
  for (let k = 0; k < 4; k++) { x.beginPath(); let px = r() * W, py = r() * W; x.moveTo(px, py); for (let s = 0; s < 14; s++) { px += (r() - 0.5) * 22; py += 6 + r() * 8; x.lineTo(px, py); } x.stroke(); }
  return { map: tex(c), tile: [2.0, 2.0] };
}
export function asfalto() {
  const W = 512, r = rng(77);
  const [c, x] = cv(W, W);
  x.fillStyle = '#4a4a4c'; x.fillRect(0, 0, W, W);
  speckle(x, W, W, 40000, ['#2e2e30', '#6b6b6b', '#5a5a5c', '#3c3c3e'], r, 0.6, 2.2, 0.2, 0.6);
  return { map: tex(c), tile: [3, 3] };
}
export function reboco(base = '#d9cfbf', seed = 88) {
  const W = 512, r = rng(seed);
  const [c, x] = cv(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  speckle(x, W, W, 30000, ['#000', '#fff'], r, 0.6, 2, 0.02, 0.07);
  for (let k = 0; k < 20; k++) {
    const cx = r() * W, cy = r() * W, rad = 40 + r() * 140;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  return { map: tex(c), tile: [2, 2] };
}

// ---------- CARNES
function marbling(x, W, H, r, n, color, wmin, wmax, alpha) {
  x.strokeStyle = color; x.lineCap = 'round'; x.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    x.globalAlpha = alpha * (0.4 + r() * 0.6);
    x.lineWidth = wmin + r() * (wmax - wmin);
    x.beginPath();
    let px = r() * W, py = r() * H, ang = r() * Math.PI * 2;
    x.moveTo(px, py);
    const steps = 6 + r() * 20;
    for (let s = 0; s < steps; s++) {
      ang += (r() - 0.5) * 1.3;
      px += Math.cos(ang) * 9; py += Math.sin(ang) * 9;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
}
function blotch(x, W, H, r, n, colors, rmin, rmax, a) {
  for (let k = 0; k < n; k++) {
    const cx = r() * W, cy = r() * H, rad = rmin + r() * (rmax - rmin);
    const col = colors[(r() * colors.length) | 0];
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, col.replace(')', `,${a})`).replace('rgb', 'rgba'));
    g.addColorStop(1, col.replace(')', ',0)').replace('rgb', 'rgba'));
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
}
export function carneBovina(seed = 1) {
  const W = 512, r = rng(100 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = '#9e1c24'; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 90, ['rgb(120,14,22)', 'rgb(190,52,52)', 'rgb(150,24,30)'], 20, 90, 0.35);
  marbling(x, W, W, r, 45, '#e9b9ad', 0.5, 2, 0.55);
  marbling(x, W, W, r, 12, '#f6e4dc', 1.5, 3.5, 0.4);
  speckle(x, W, W, 6000, ['#6e0c14', '#d8605a'], r, 0.6, 2, 0.1, 0.35);
  return tex(c);
}
export function costela() {
  const W = 512, r = rng(120);
  const [c, x] = cv(W, W);
  x.fillStyle = '#a5232a'; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 80, ['rgb(125,16,24)', 'rgb(196,62,60)'], 20, 70, 0.4);
  // faixas de osso/gordura no comprimento (v)
  for (let i = 0; i < 6; i++) {
    const cx = i * (W / 6) + r() * 30;
    x.fillStyle = 'rgba(214,150,136,0.32)';
    x.beginPath();
    x.moveTo(cx, 0);
    for (let y = 0; y <= W; y += 16) x.lineTo(cx + (r() - 0.5) * 8 + 4, y);
    for (let y = W; y >= 0; y -= 16) x.lineTo(cx + 8 + r() * 6, y);
    x.fill();
  }
  marbling(x, W, W, r, 18, '#e8b8aa', 0.5, 2, 0.5);
  speckle(x, W, W, 5000, ['#6b0b12', '#e07a70'], r, 0.6, 2, 0.1, 0.3);
  return tex(c);
}
export function frangoCru(seed = 1) {
  const W = 256, r = rng(140 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = '#e8b49c'; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 60, ['rgb(246,210,192)', 'rgb(214,140,118)', 'rgb(240,190,160)'], 10, 40, 0.5);
  speckle(x, W, W, 3000, ['#f8dccc', '#c98a74'], r, 0.6, 2, 0.1, 0.3);
  return tex(c);
}
export function dourado(seed = 1, base = '#c47a2a') {
  const W = 256, r = rng(160 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 70, ['rgb(140,70,20)', 'rgb(226,160,72)', 'rgb(190,100,36)', 'rgb(232,196,150)'], 6, 26, 0.6);
  speckle(x, W, W, 1600, ['#2d1d0c', '#3f5a22', '#5b3a12'], r, 0.8, 2.4, 0.4, 0.9);
  return tex(c);
}
export function linguica(base = '#bf4a3a', fat = '#efc0aa', dark = '#8a2a22', seed = 1) {
  const W = 256, r = rng(180 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 40, ['rgb(150,50,40)', 'rgb(210,100,80)'], 8, 30, 0.5);
  speckle(x, W, W, 2600, [fat, dark], r, 1, 3.2, 0.4, 0.9);
  return tex(c);
}
export function moida() {
  const W = 256, r = rng(200);
  const [c, x] = cv(W, W);
  x.fillStyle = '#9a2027'; x.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = ['#c24a4c', '#6e1218', '#e9a7a0', '#a92a30'][(r() * 4) | 0];
    x.globalAlpha = 0.6;
    const s = 1 + r() * 2.5;
    x.fillRect(r() * W, r() * W, s, s);
  }
  x.globalAlpha = 1;
  return tex(c);
}
export function sacoFrango(seed = 1) {
  const W = 256, H = 256, r = rng(220 + seed);
  const [c, x] = cv(W, H);
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#f2a12a'); g.addColorStop(0.5, '#ffc23a'); g.addColorStop(1, '#ee8f1f');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#d8261c'; x.fillRect(0, H * 0.38, W, H * 0.18);
  x.fillStyle = '#fff'; x.font = 'bold 30px Arial'; x.textAlign = 'center';
  x.fillText('FRANGO', W / 2, H * 0.52);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 12; i++) x.fillRect(r() * W, r() * H, 3 + r() * 5, 20 + r() * 50);
  return tex(c);
}
export function bandejaFrango(seed = 1) {
  // bandeja de isopor vista de cima: pedaços rosados + etiqueta amarela
  const W = 256, H = 192, r = rng(240 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#f4f2ee'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 14; i++) {
    const cx = 20 + r() * (W - 40), cy = 20 + r() * (H - 40), rx = 18 + r() * 22, ry = 12 + r() * 14;
    const g = x.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, rx);
    g.addColorStop(0, '#f7d3c2'); g.addColorStop(0.7, '#e5a68c'); g.addColorStop(1, '#c9846c');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, rx, ry, r() * 3, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 6; i++) x.fillRect(r() * W, r() * H, 40 + r() * 60, 3);
  x.fillStyle = '#ffd400'; x.fillRect(W * 0.55, H * 0.12, W * 0.32, H * 0.26);
  x.fillStyle = '#222'; x.font = 'bold 15px Arial'; x.fillText('FRANGO', W * 0.58, H * 0.25);
  x.font = '12px Arial'; x.fillText('R$ 19,98/kg', W * 0.58, H * 0.34);
  return tex(c);
}
export function pacoteVacuo(seed = 1, nome = null) {
  const W = 256, H = 256, r = rng(260 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#8f1820'; x.fillRect(0, 0, W, H);
  blotch(x, W, H, r, 40, ['rgb(170,40,46)', 'rgb(110,14,22)'], 15, 60, 0.6);
  marbling(x, W, H, r, 25, '#f0c8bf', 1, 4, 0.7);
  // etiqueta
  x.fillStyle = '#fff'; x.fillRect(W * 0.08, H * 0.62, W * 0.5, H * 0.26);
  x.fillStyle = '#c4161c'; x.fillRect(W * 0.08, H * 0.62, W * 0.5, H * 0.07);
  x.fillStyle = '#222'; x.font = 'bold 18px Arial';
  x.fillText(nome || ['CUPIM', 'ACÉM', 'PEITO', 'PALETA'][seed % 4], W * 0.11, H * 0.8);
  // brilho plástico
  x.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(r() * W, r() * H); x.rotate(-0.6); x.fillRect(0, 0, 70 + r() * 80, 4 + r() * 6); x.restore(); }
  return tex(c);
}
export function pacoteLinguica(seed = 1) {
  const W = 256, H = 160, r = rng(280 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#f7f5f0'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) {
    const y = 18 + i * 26;
    const g = x.createLinearGradient(0, y - 10, 0, y + 10);
    g.addColorStop(0, '#d9734e'); g.addColorStop(0.5, '#f0a07a'); g.addColorStop(1, '#a8452e');
    x.fillStyle = g; x.beginPath(); x.roundRect(12, y - 10, W - 24, 20, 10); x.fill();
  }
  x.fillStyle = seed % 2 ? '#e11d24' : '#ff7a00'; x.fillRect(0, H - 34, W, 34);
  x.fillStyle = '#fff'; x.font = 'bold 20px Arial'; x.fillText(seed % 2 ? 'LINGUIÇA TOSCANA' : 'LINGUIÇA FRANGO', 10, H - 11);
  return tex(c);
}

// ---------- ETIQUETAS (atlas 4 x 16)
export const ITENS = [
  ['PICANHA', '89,90'], ['CONTRA-FILÉ', '54,90'], ['ALCATRA', '49,90'], ['COXÃO MOLE', '42,90'],
  ['FRALDINHA', '46,90'], ['MAMINHA', '44,90'], ['ACÉM', '32,90'], ['PATINHO MOÍDO', '39,90'],
  ['LING. TOSCANA', '22,90'], ['LING. FINA', '26,90'], ['CALABRESA', '29,90'], ['KAFTA', '34,90'],
  ['FRANGO PASSARINHO', '18,90'], ['FILÉ DE FRANGO', '24,90'], ['COXA E SOBRECOXA', '15,98'], ['FRANGO TEMPERADO', '19,90'],
  ['CARNE TEMPERADA', '42,90'], ['CUPIM', '39,90'], ['COSTELA', '17,99'], ['MIOLO DE ACÉM', '24,99'],
  ['FRANGO INTEIRO', '12,99'], ['CORAÇÃO', '29,90'], ['BISTECA SUÍNA', '24,90'], ['PANCETA', '29,90'],
  ['ASA DE FRANGO', '16,90'], ['FILÉ MIGNON', '79,90'], ['LAGARTO', '44,90'], ['MÚSCULO', '34,90'],
  ['COXINHA DA ASA', '21,90'], ['PEITO DE FRANGO', '19,90'], ['LINGUIÇA DE FRANGO', '19,90'], ['FRALDINHA TEMP.', '49,90'],
];
let _atlas = null;
export function atlasEtiquetas() {
  if (_atlas) return _atlas;
  const W = 2048, H = 2048, cw = 512, ch = 128;
  const [c, x] = cv(W, H);
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  ITENS.forEach(([nome, preco], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const px = col * cw, py = row * ch;
    const amarelo = /FRANGO|ASA|CORAÇÃO/.test(nome);
    x.fillStyle = amarelo ? '#ffd21c' : '#ffffff';
    x.fillRect(px + 4, py + 4, cw - 8, ch - 8);
    x.strokeStyle = '#222'; x.lineWidth = 4; x.strokeRect(px + 6, py + 6, cw - 12, ch - 12);
    x.fillStyle = '#1a1a1a'; x.textAlign = 'center';
    // fonte em negrito grande (nome ≥ 48 px quando cabe, preço 78 px): legível a 1-2 m com anisotropia
    let fs = 54; x.font = `900 ${fs}px Arial`; while (x.measureText(nome).width > cw - 20 && fs > 34) { fs -= 2; x.font = `900 ${fs}px Arial`; }
    x.fillText(nome, px + cw / 2, py + 52);
    x.fillStyle = "#b80f15"; x.font = "900 74px Arial";
    x.fillText('R$ ' + preco, px + cw / 2, py + 118);
  });
  // células 32..: placas grandes de gancheira (2 linhas cada, 512x128 = 2 colunas)
  _atlas = tex(c, { repeat: false });
  return _atlas;
}
// RODADA 6 — etiqueta de preço individual 512×256 (nome ≥ 64 px, preço 110 px), branca ou amarela (aves)
export function etiquetaPreco(nome, preco) {
  const W = 512, H = 256;
  const [c, x] = cv(W, H);
  const amarelo = /FRANGO|ASA|CORAÇÃO/.test(nome);
  x.fillStyle = amarelo ? '#ffd21c' : '#ffffff'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 8; x.strokeRect(6, 6, W - 12, H - 12);
  x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  let fs = 76; x.font = `900 ${fs}px Arial`; while (x.measureText(nome).width > W - 36 && fs > 64) { fs -= 2; x.font = `900 ${fs}px Arial`; }
  if (x.measureText(nome).width > W - 36) { x.save(); x.translate(W / 2, 92); x.scale((W - 36) / x.measureText(nome).width, 1); x.fillText(nome, 0, 0); x.restore(); }
  else x.fillText(nome, W / 2, 92);
  x.fillStyle = '#b80f15'; x.font = '900 112px Arial';
  let pw = x.measureText('R$ ' + preco).width; const k = Math.min(1, (W - 36) / pw);
  x.save(); x.translate(W / 2, 222); x.scale(k, 1); x.fillText('R$ ' + preco, 0, 0); x.restore();
  return tex(c, { repeat: false });
}
// RODADA 12 — etiqueta de TRILHO da vitrine alta 1024×256: nome à esquerda (≥ 90 px) e preço à direita (130 px)
export function etiquetaTrilho(nome, preco) {
  const W = 1024, H = 256;
  const [c, x] = cv(W, H);
  const amarelo = /FRANGO|ASA|CORAÇÃO|COXA|PEITO/.test(nome);
  x.fillStyle = amarelo ? '#ffd21c' : '#ffffff'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
  x.textBaseline = 'middle';
  x.fillStyle = '#b80f15'; x.font = '900 130px Arial'; x.textAlign = 'right';
  const pr = 'R$ ' + preco, pw = x.measureText(pr).width; x.fillText(pr, W - 28, H / 2 + 6);
  x.fillStyle = '#111'; x.textAlign = 'left';
  const maxW = W - pw - 80; let fs = 100; x.font = `900 ${fs}px Arial`;
  const linhas = x.measureText(nome).width > maxW && nome.includes(' ') ? [nome.slice(0, nome.lastIndexOf(' ')), nome.slice(nome.lastIndexOf(' ') + 1)] : [nome];
  const larg = () => Math.max(...linhas.map(l => x.measureText(l).width));
  while (larg() > maxW && fs > 60) { fs -= 4; x.font = `900 ${fs}px Arial`; }
  if (linhas.length === 1) x.fillText(nome, 28, H / 2 + 4);
  else { x.fillText(linhas[0], 28, H / 2 - fs * 0.5); x.fillText(linhas[1], 28, H / 2 + fs * 0.55); }
  return tex(c, { repeat: false });
}
export function uvEtiqueta(i) {
  const col = i % 4, row = Math.floor(i / 4);
  return [col / 4, 1 - (row + 1) / 16, (col + 1) / 4, 1 - row / 16];
}

export function placa(nome, preco) {
  const W = 512, H = 256;
  const [c, x] = cv(W, H);
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(4, 4, W - 8, H - 8, 18); x.fill();
  x.fillStyle = '#c4161c'; x.beginPath(); x.roundRect(4, 4, W - 8, 70, [18, 18, 0, 0]); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  let fs = 50; x.font = `bold ${fs}px Arial`; while (x.measureText(nome).width > W - 40 && fs > 30) { fs -= 2; x.font = `bold ${fs}px Arial`; }
  x.fillText(nome, W / 2, 56);
  // valor: cabe à direita da coluna "R$ / o kg" (margem fixa de 130 px)
  let fv = 128; x.font = `900 ${fv}px "Arial Black", Arial`;
  while (x.measureText(preco).width > W - 150 && fv > 70) { fv -= 4; x.font = `900 ${fv}px "Arial Black", Arial`; }
  x.fillStyle = '#c4161c'; x.textAlign = 'right'; x.fillText(preco, W - 22, 206);
  x.textAlign = 'left';
  x.fillStyle = '#111'; x.font = 'bold 46px Arial'; x.fillText('R$', 24, 140);
  x.fillStyle = '#444'; x.font = 'bold 28px Arial'; x.fillText('o kg', 26, 204);
  return tex(c, { repeat: false });
}

// ---------- LETREIRO
export function letreiro({ cor = '#e8c788', glow = false, W = 2048, H = 560 } = {}) {
  const [c, x] = cv(W, H);
  x.clearRect(0, 0, W, H);
  const fam = '"Bahnschrift SemiCondensed","Bahnschrift","Avenir Next Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // glow = só a SOMBRA borrada (o texto em si fica fora do canvas): sem letra nítida, não duplica em ângulo
  let dx = 0;
  if (glow) { dx = W * 3; x.shadowColor = cor; x.shadowBlur = 70; x.shadowOffsetX = dx; x.translate(-dx, 0); }
  x.fillStyle = cor;
  x.font = `600 120px ${fam}`;
  if (x.letterSpacing !== undefined) x.letterSpacing = '28px';
  x.fillText('CASA DE CARNES', W / 2, 150);
  x.font = `700 260px ${fam}`;
  if (x.letterSpacing !== undefined) x.letterSpacing = '10px';
  x.fillText('NOVO AMANHECER', W / 2, 440);
  // linhas decorativas

  return tex(c, { repeat: false });
}
export function textoSimples(txt, { W = 512, H = 128, cor = '#fff', font = 'italic bold 80px Georgia', bg = null, align = 'center' } = {}) {
  const [c, x] = cv(W, H);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
  x.fillStyle = cor; x.font = font; x.textAlign = align; x.textBaseline = 'middle';
  x.fillText(txt, align === 'center' ? W / 2 : 10, H / 2 + 4);
  return tex(c, { repeat: false });
}
export function setaPiso(txt, sentido) {
  const W = 512, H = 512;
  const [c, x] = cv(W, H);
  x.fillStyle = 'rgba(30,30,30,0.85)';
  x.save(); x.translate(W / 2, 200); if (sentido < 0) x.rotate(Math.PI);
  x.beginPath();
  x.moveTo(0, -150); x.lineTo(110, -30); x.lineTo(40, -30); x.lineTo(40, 140); x.lineTo(-40, 140); x.lineTo(-40, -30); x.lineTo(-110, -30); x.closePath();
  x.fill(); x.restore();
  x.font = 'bold 84px Arial'; x.textAlign = 'center';
  x.fillText(txt, W / 2, 460);
  return tex(c, { repeat: false });
}
export function telaBalanca() {
  const [c, x] = cv(512, 256);
  x.fillStyle = '#071a30'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#6fd8ff'; x.font = 'bold 150px Consolas, monospace'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  x.fillText('0,000', 440, 160);
  x.font = 'bold 44px Arial'; x.fillText('kg', 500, 160);
  x.fillStyle = '#9fe6ff'; x.font = 'bold 40px Arial'; x.textAlign = 'left';
  x.fillText('R$/kg 54,90', 20, 228);
  x.textAlign = 'right'; x.fillText('R$ 0,00', 500, 228);
  return tex(c, { repeat: false });
}
export function telaPDV() {
  const [c, x] = cv(512, 384);
  const g = x.createLinearGradient(0, 0, 0, 384);
  g.addColorStop(0, '#12345a'); g.addColorStop(1, '#0a1a2e');
  x.fillStyle = g; x.fillRect(0, 0, 512, 384);
  x.fillStyle = '#1e88e5'; x.fillRect(0, 0, 512, 40);
  x.fillStyle = '#fff'; x.font = 'bold 22px Arial'; x.fillText('VENDA EM ANDAMENTO', 16, 28);
  x.textAlign = 'right'; x.fillText('CUPOM 000123', 496, 28); x.textAlign = 'left';
  x.font = '18px monospace';
  ['ALCATRA      1,250kg  62,38', 'LING.TOSCANA 0,800kg  18,32', 'FRANGO INT.  2,100kg  27,28'].forEach((l, i) => { x.fillText(l, 16, 80 + i * 30); });
  x.fillStyle = '#4caf50'; x.fillRect(16, 300, 480, 64);
  x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.fillText('TOTAL R$ 107,98', 40, 344);
  return tex(c, { repeat: false });
}
export function ceuGradiente() {
  // RODADA 9: céu de dia levemente nublado (equirect 1024×512): degradê + nuvens cúmulo suaves perto do horizonte
  const W = 1024, H = 512, r = rng(77);
  const [c, x] = cv(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4f74a3'); g.addColorStop(0.28, '#8aa6c8'); g.addColorStop(0.42, '#c9c6c4'); g.addColorStop(0.5, '#e6d2bc'); g.addColorStop(0.56, '#b9b2a8'); g.addColorStop(1, '#7a766f'); // RODADA 10: fim de tarde (horizonte quente)
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 70; k++) {
    const cx = r() * W, cy = H * (0.18 + r() * 0.29), base = 18 + r() * 46;
    for (let b = 0; b < 9; b++) {
      const px = cx + (r() - 0.5) * base * 3.2, py = cy + (r() - 0.5) * base * 0.45, rad = base * (0.5 + r() * 0.7);
      for (const dx of [0, -W, W]) {
        const gr = x.createRadialGradient(px + dx, py, 0, px + dx, py, rad);
        const a = 0.20 + r() * 0.18 * (1 - (cy / H - 0.18) * 1.5);
        gr.addColorStop(0, `rgba(250,251,252,${a})`); gr.addColorStop(0.6, `rgba(236,240,244,${a * 0.5})`); gr.addColorStop(1, 'rgba(230,236,242,0)');
        x.fillStyle = gr; x.beginPath(); x.ellipse(px + dx, py, rad * 1.6, rad * 0.55, 0, 0, Math.PI * 2); x.fill();
      }
    }
  }
  const t = tex(c, { repeat: false });
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
export function fachadaVizinha(cor, seed, tipo = 0) {
  const W = 512, H = 512, r = rng(seed);
  const [c, x] = cv(W, H);
  // reboco pintado com nuvens de tom, escorrimentos verticais de sujeira e textura grossa (canvas = 2 m)
  x.fillStyle = cor; x.fillRect(0, 0, W, H);
  for (let k = 0; k < 30; k++) {
    const cx = r() * W, cy = r() * H, rad = 40 + r() * 160;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const t = r() < 0.5 ? '255,255,255' : '60,55,50';
    g.addColorStop(0, `rgba(${t},0.07)`); g.addColorStop(1, `rgba(${t},0)`);
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  // RODADA 10: sem escorrimentos verticais (liam como textura esticada); reboco fino + friso de laje a cada 2 m
  speckle(x, W, H, 30000, ['#000', '#fff'], r, 0.5, 1.6, 0.03, 0.08);
  x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, H - 6, W, 4);
  x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, H - 10, W, 4);
  return tex(c, { repeat: true });
}
// RODADA 11 — fachada de prédio residencial (canvas = 3 m × 3 m = 1 pavimento, 2 janelas): reboco + janelas com caixilho,
// peitoril, persiana em parte delas e reflexo do céu no vidro
export function predio(cor, seed) {
  const W = 512, r = rng(seed);
  const [c, x] = cv(W, W);
  x.fillStyle = cor; x.fillRect(0, 0, W, W);
  speckle(x, W, W, 20000, ['#000', '#fff'], r, 0.5, 1.6, 0.03, 0.07);
  for (let k = 0; k < 12; k++) { const cx = r() * W, cy = r() * W, rad = 60 + r() * 160; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, 'rgba(40,36,32,0.07)'); g.addColorStop(1, 'rgba(40,36,32,0)'); x.fillStyle = g; x.fillRect(0, 0, W, W); }
  x.fillStyle = 'rgba(0,0,0,0.10)'; x.fillRect(0, W - 14, W, 6); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, W - 20, W, 6);
  for (const jx of [48, 300]) {
    const jw = 170, jh = 210, jy = 130;
    x.fillStyle = '#e6e2da'; x.fillRect(jx - 8, jy - 8, jw + 16, jh + 16);
    const g = x.createLinearGradient(0, jy, 0, jy + jh); g.addColorStop(0, '#9fb0bf'); g.addColorStop(0.5, '#56636e'); g.addColorStop(1, '#3a434b');
    x.fillStyle = g; x.fillRect(jx, jy, jw, jh);
    if (r() < 0.5) { x.fillStyle = '#d8d2c6'; x.fillRect(jx, jy, jw, jh * (0.25 + r() * 0.6)); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = jy; y < jy + jh * 0.8; y += 7) x.fillRect(jx, y, jw, 1); }
    x.fillStyle = '#d9d5cc'; x.fillRect(jx + jw / 2 - 3, jy, 6, jh);
    x.fillStyle = '#cfcac0'; x.fillRect(jx - 14, jy + jh + 8, jw + 28, 12); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(jx - 14, jy + jh + 20, jw + 28, 8);
  }
  return tex(c);
}
export function placaExtintor() {
  // RODADA 8: placa quadrada 0,20 × 0,20 (NBR 13434)
  const [c, x] = cv(192, 192);
  x.fillStyle = '#d4161c'; x.fillRect(0, 0, 192, 192);
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(8, 8, 176, 176);
  x.fillStyle = '#fff';
  x.beginPath(); x.roundRect(78, 56, 36, 104, 10); x.fill();
  x.fillRect(86, 38, 20, 20); x.fillRect(106, 42, 28, 6);
  return tex(c, { repeat: false });
}
export function rotuloBebida(cor1, cor2, txt) {
  // RODADA 5: a marca aparece INTEIRA 2x na volta (nunca cortada na frente)
  const W = 256, H = 128;
  const [c, x] = cv(W, H);
  x.fillStyle = cor1; x.fillRect(0, 0, W, H);
  x.fillStyle = cor2; x.fillRect(0, 44, W, 40);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, 10, W, 4); x.fillRect(0, H - 14, W, 4);
  x.fillStyle = cor1; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = 22; x.font = `900 ${fs}px Arial`; while (x.measureText(txt).width > W / 2 - 16 && fs > 10) { fs -= 1; x.font = `900 ${fs}px Arial`; }
  // RODADA 10: emblema genérico (círculo + onda) e nome do produto, 2x na volta
  for (const cx of [W * 0.25, W * 0.75]) {
    x.fillStyle = cor1; x.beginPath(); x.arc(cx, 30, 15, 0, Math.PI * 2); x.fill();
    x.strokeStyle = cor2; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 10, 32); x.quadraticCurveTo(cx, 20, cx + 10, 32); x.stroke();
    x.fillStyle = cor1; x.fillText(txt, cx, 65);
    x.fillStyle = cor2; x.font = `600 11px Arial`; x.fillText(txt === 'ÁGUA' ? 'MINERAL 500 ml' : '350 ml', cx, 100); x.font = `900 ${fs}px Arial`;
  }
  return tex(c);
}
// ---------- PLACA DE CORTE (polietileno): riscos de faca leves + manchas rosadas
export function placaCorte(seed = 1) {
  const W = 512, H = 512, r = rng(1700 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#dcdad3'; x.fillRect(0, 0, W, H);
  blotch(x, W, H, r, 20, ['rgb(214,210,200)', 'rgb(228,226,220)'], 30, 90, 0.4);
  x.lineCap = 'round';
  for (let i = 0; i < 380; i++) {
    const px = r() * W, py = r() * H, a = (r() < 0.6 ? 0.3 : 1.9) + (r() - 0.5) * 0.7, l = 10 + r() * 70;
    x.strokeStyle = r() < 0.75 ? `rgba(150,146,138,${0.12 + r() * 0.2})` : `rgba(170,90,90,${0.08 + r() * 0.12})`;
    x.lineWidth = 0.6 + r() * 0.9;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(180,90,90,${0.05 + r() * 0.06})`; x.beginPath(); x.ellipse(r() * W, r() * H, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, Math.PI * 2); x.fill(); }
  return tex(c, { repeat: false });
}
// ---------- RÓTULO DO EXTINTOR (pequeno, branco com borda vermelha)
export function rotuloExtintor() {
  const W = 256, H = 300;
  const [c, x] = cv(W, H);
  x.fillStyle = '#c8141b'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f6f6f2'; x.fillRect(14, 14, W - 28, H - 28);
  x.fillStyle = '#c8141b'; x.fillRect(14, 14, W - 28, 50);
  x.fillStyle = '#fff'; x.font = '900 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EXTINTOR', W / 2, 40);
  x.fillStyle = '#222'; x.font = '900 46px Arial'; x.fillText('PQS', W / 2, 108);
  x.font = 'bold 30px Arial'; x.fillText('6 kg  ABC', W / 2, 156);
  x.fillStyle = '#555'; for (let i = 0; i < 6; i++) x.fillRect(36, 190 + i * 14, W - 72 - (i % 3) * 30, 5);
  return tex(c, { repeat: false });
}
// ---------- TELA DA BALANÇA PRIX (grande, 2 linhas)
export function telaPrix() {
  const W = 512, H = 300;
  const [c, x] = cv(W, H);
  x.fillStyle = '#0b1a14'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#7dffb0'; x.textAlign = 'right'; x.textBaseline = 'middle';
  x.font = 'bold 26px Arial'; x.textAlign = 'left';
  x.fillText('PESO kg', 24, 36); x.fillText('R$/kg', 24, 132); x.fillText('TOTAL R$', 24, 226);
  x.textAlign = 'right'; x.font = '900 72px "Courier New", monospace';
  x.fillText('0,000', W - 24, 64); x.fillText('0,00', W - 24, 158); x.fillText('0,00', W - 24, 252);
  return tex(c, { repeat: false });
}
let _visor = null;
export function visorJateado() {
  if (_visor) return _visor;
  const W = 256, H = 256, r = rng(321);
  const [c, x] = cv(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#b9c1c3'); g.addColorStop(0.5, '#a2aaad'); g.addColorStop(1, '#8e9699');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // vultos difusos da área de preparação atrás do vidro
  for (const [cx, cy, rx, ry, col] of [[70, 170, 90, 110, 'rgba(80,86,90,0.22)'], [190, 180, 100, 80, 'rgba(84,90,94,0.2)'], [128, 230, 160, 40, 'rgba(70,76,80,0.18)'], [128, 30, 150, 22, 'rgba(255,255,255,0.25)']]) {
    const rg = x.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.translate(cx, cy); x.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); x.translate(-cx, -cy);
    x.fillStyle = rg; x.fillRect(0, 0, W, H); x.restore();
  }
  speckle(x, W, H, 6000, ['#fff', '#8a9295'], r, 0.6, 1.5, 0.03, 0.08);
  _visor = tex(c, { repeat: false });
  return _visor;
}

// ruído de valor 2D (fBm) com wrap — base das manchas de gordura irregulares
function ruido(W, H, r, cel = 16, oct = 4, asp = 1) {
  const out = new Float32Array(W * H);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const gw = Math.max(2, Math.round(W / cel)), gh = Math.max(2, Math.round(H / (cel * asp)));
    const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = r();
    for (let j = 0; j < H; j++) {
      const fy = j / H * gh, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const a0 = (y0 % gh) * gw, a1 = ((y0 + 1) % gh) * gw;
      for (let i = 0; i < W; i++) {
        const fx = i / W * gw, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % gw;
        const v = (g[a0 + x0] * (1 - sx) + g[a0 + x1] * sx) * (1 - sy) + (g[a1 + x0] * (1 - sx) + g[a1 + x1] * sx) * sy;
        out[j * W + i] += v * amp;
      }
    }
    tot += amp; amp *= 0.5; cel /= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
// ---------- CARNE PENDURADA (manta/costela): vermelho-escuro, gordura irregular por fBm, fibras no comprimento + normal map
// u = largura, v = comprimento. Bordas escurecidas (carne cortada, sangue oxidado).
export function carnePendurada(seed = 1) {
  const W = 256, H = 512, r = rng(700 + seed);
  const nGord = ruido(W, H, r, 40, 5, 3), nTom = ruido(W, H, r, 96, 3), nFib = ruido(W, H, r, 6, 2);
  const [c, x] = cv(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const hm = new Float32Array(W * H);
  // tom base por peça (#8e1f1f .. #c0453a)
  const k0 = r() * 0.8;
  const base = [0x8e + (0xc0 - 0x8e) * k0, 0x1f + (0x45 - 0x1f) * k0, 0x1f + (0x3a - 0x1f) * k0];
  const lim = 0.64 + r() * 0.05; // limiar da gordura (≈ 10-20% da área)
  const ladoG = r() < 0.5 ? 0 : 1, capa = 0.06 + r() * 0.10; // capa de gordura irregular numa borda
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, u = i / W;
    // fibras longitudinais (alongadas em v)
    const fib = nFib[(((j >> 2) * 3) % H) * W + i];
    let R = base[0] * (0.78 + nTom[k] * 0.45) * (0.9 + fib * 0.2);
    let G = base[1] * (0.7 + nTom[k] * 0.5);
    let Bc = base[2] * (0.7 + nTom[k] * 0.5);
    // borda escurecida
    const bd = Math.min(u, 1 - u); const esc = bd < 0.12 ? 0.62 + bd / 0.12 * 0.38 : 1;
    R *= esc; G *= esc; Bc *= esc;
    // gordura: manchas irregulares (fBm) + capa numa borda com contorno rasgado
    let gf = Math.max(0, (nGord[k] - lim) / 0.05) * 0.85;
    const dB = ladoG ? 1 - u : u;
    const capaLoc = capa * (0.6 + nTom[k] * 0.9);
    if (dB < capaLoc) gf = Math.max(gf, Math.min(1, (capaLoc - dB) / 0.03));
    gf = Math.min(1, gf);
    const gR = 236 - nTom[k] * 20, gG = 214 - nTom[k] * 30, gB = 196 - nTom[k] * 30;
    d[k * 4] = R + (gR - R) * gf; d[k * 4 + 1] = G + (gG - G) * gf; d[k * 4 + 2] = Bc + (gB - Bc) * gf; d[k * 4 + 3] = 255;
    hm[k] = 0.5 + gf * 0.25 + (fib - 0.5) * 0.35 + nTom[k] * 0.2;
  }
  x.putImageData(img, 0, 0);
  // filetes de gordura finos (marmoreio)
  marbling(x, W, H, r, 22, '#ecd2c4', 0.5, 1.6, 0.4);
  speckle(x, W, H, 2500, ['#5a0a10', '#e8b0a0'], r, 0.6, 2, 0.08, 0.25);
  return { map: tex(c), normalMap: normalFromHeight(hm, W, H, 3.5) };
}
// ---------- COSTELA / MANTA PENDURADA (antiga, mantida p/ compatibilidade)
export function costelaPendurada(seed = 1) {
  const W = 256, H = 512, r = rng(500 + seed);
  const [c, x] = cv(W, H);
  const tons = ['#9a2c29', '#a9393a', '#b4473f', '#c4574c', '#a33634'];
  const base = tons[seed % tons.length];
  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, base); g.addColorStop(0.5, tons[(seed + 2) % tons.length]); g.addColorStop(1, base);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  blotch(x, W, H, r, 70, ['rgb(120,24,26)', 'rgb(200,96,86)', 'rgb(150,40,38)'], 15, 60, 0.35);
  // fibras longitudinais
  x.globalAlpha = 0.18;
  for (let i = 0; i < 160; i++) { x.fillStyle = r() < 0.5 ? '#6e1716' : '#d77d70'; x.fillRect(r() * W, r() * H, 1 + r() * 1.5, 30 + r() * 120); }
  x.globalAlpha = 1;
  marbling(x, W, H, r, 30, '#efd2c4', 0.6, 2.2, 0.55);
  // faixa de gordura/osso numa das bordas
  const lado = seed % 2, bw = W * (0.08 + r() * 0.1);
  x.fillStyle = '#e9d0bd';
  x.beginPath(); x.moveTo(lado ? W : 0, 0);
  for (let y = 0; y <= H; y += 12) x.lineTo((lado ? W - bw : bw) + (r() - 0.5) * 14, y);
  x.lineTo(lado ? W : 0, H); x.closePath(); x.fill();
  blotch(x, W, H, r, 20, ['rgb(226,180,160)'], 6, 20, 0.25);
  // ossos de costela (segmentos brancos)
  if (seed % 3 === 0) for (let y = 40 + r() * 40; y < H - 40; y += 110 + r() * 50) {
    const gg = x.createLinearGradient(0, y - 9, 0, y + 9);
    gg.addColorStop(0, 'rgba(236,214,198,0)'); gg.addColorStop(0.5, 'rgba(236,218,204,0.28)'); gg.addColorStop(1, 'rgba(236,214,198,0)');
    x.fillStyle = gg; x.fillRect(lado ? W * 0.3 : bw * 0.6, y - 9, W * 0.35, 18);
  }
  speckle(x, W, H, 2500, ['#6b0b12', '#f1d5c8'], r, 0.6, 2, 0.1, 0.3);
  return tex(c);
}
// ---------- SACO DE FRANGO INTEIRO (lathe em pé: u = volta, v = altura; frente em u = 0,5)
export function sacoFrangoInteiro(seed = 1) {
  // RODADA 5 — saco laranja (#f08a1c) ou amarelo (#f2c21a) do frango congelado, EM PÉ (lathe: u = volta,
  // v = perfil de baixo p/ cima; frente em u = 0,5): frango aparecendo pelo plástico, rótulo vermelho/branco
  // com marca genérica, vincos e lacre torcido no topo.
  const W = 512, H = 256, r = rng(540 + seed);
  const [c, x] = cv(W, H);
  const laranja = seed % 2 === 1;
  const g = x.createLinearGradient(0, 0, 0, H);
  if (laranja) { g.addColorStop(0, '#d77a1e'); g.addColorStop(0.5, '#e98a2a'); g.addColorStop(1, '#f0a04a'); }
  else { g.addColorStop(0, '#e0ac2c'); g.addColorStop(0.5, '#f2c23a'); g.addColorStop(1, '#f6d468'); }
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  blotch(x, W, H, r, 34, laranja ? ['rgb(244,176,120)', 'rgb(232,150,96)'] : ['rgb(246,214,150)', 'rgb(236,196,128)'], 16, 50, 0.45);
  // RODADA 9: a carne rosada aparece pelo plástico nas áreas sem impressão (dobras/coxas)
  blotch(x, W, H, r, 14, ['rgb(232,170,140)', 'rgb(236,184,150)'], 12, 30, 0.22); // RODADA 10: menos 'carne' pelo plástico
  // canvas: y=0 é o topo da imagem = v=1 (alto do saco). Rótulo no meio-alto do saco.
  const y0 = H * 0.15, hh = H * 0.25; // RODADA 10: rótulo no TERÇO DE CIMA do saco em pé
  if (seed === 3) {
    // RODADA 12: 3ª versão do rótulo — faixa larga verde-escura com selo amarelo (não é tudo igual)
    x.fillStyle = '#1f5a2e'; x.fillRect(W * 0.22, y0 + hh * 0.15, W * 0.56, hh * 0.7);
    x.fillStyle = '#ffd21c'; x.beginPath(); x.arc(W * 0.5, y0 + hh * 0.5, hh * 0.32, 0, 7); x.fill();
    x.fillStyle = '#1f5a2e'; x.font = '900 22px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FRANGO', W / 2, y0 + hh * 0.5);
  } else {
  x.fillStyle = '#c71f1a'; x.fillRect(W * 0.30, y0, W * 0.40, hh);
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(W * 0.32, y0 + hh * 0.12, W * 0.36, hh * 0.62, 12); x.fill();
  x.fillStyle = '#c71f1a'; x.font = '900 30px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('FRANGO', W / 2, y0 + hh * 0.34);
  x.fillStyle = '#333'; x.font = 'bold 13px Arial'; x.fillText('INTEIRO CONGELADO', W / 2, y0 + hh * 0.62);
  x.fillStyle = '#fff'; x.font = 'bold 13px Arial'; x.fillText('RESFRIADO  ·  kg', W / 2, y0 + hh * 0.88); // RODADA 9: sem marca inventada
  }
  x.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const px = r() * W, py = r() * H, a = (r() - 0.5) * 0.9 + Math.PI / 2, l = 14 + r() * 50;
    x.strokeStyle = r() < 0.5 ? 'rgba(255,250,230,0.40)' : 'rgba(120,60,10,0.22)';
    x.lineWidth = 1 + r() * 2.5;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (r() - 0.5) * 10, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,240,200,0.55)' : 'rgba(140,70,10,0.3)'; x.fillRect(r() * W, 0, 2 + r() * 4, H * 0.16); }
  return tex(c);
}
// ---------- SACO DE PEDAÇOS DE FRANGO (visto de cima)
export function sacoPedacos(seed = 1) {
  const W = 256, H = 256, r = rng(560 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#c98670'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) {
    const cx = r() * W, cy = r() * H, rx = 18 + r() * 22, ry = 11 + r() * 12;
    const gg = x.createRadialGradient(cx, cy, 2, cx, cy, rx);
    gg.addColorStop(0, '#dfa08a'); gg.addColorStop(0.7, '#d1907a'); gg.addColorStop(0.95, '#9c5442'); gg.addColorStop(1, 'rgba(150,80,62,0)');
    x.fillStyle = gg; x.beginPath(); x.ellipse(cx, cy, rx, ry, r() * 3, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#ffd400'; x.fillRect(W * 0.08, H * 0.62, W * 0.5, H * 0.26);
  x.fillStyle = '#c4161c'; x.fillRect(W * 0.08, H * 0.62, W * 0.5, H * 0.07);
  x.fillStyle = '#222'; x.font = 'bold 20px Arial'; x.fillText(['COXA', 'ASA', 'SOBRECOXA', 'PEITO'][seed % 4], W * 0.11, H * 0.79);
  x.font = 'bold 16px Arial'; x.fillText('R$ 15,98', W * 0.11, H * 0.86);
  x.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 7; i++) { x.save(); x.translate(r() * W, r() * H); x.rotate(-0.5); x.fillRect(0, 0, 50 + r() * 70, 3 + r() * 4); x.restore(); }
  return tex(c);
}
// ---------- REFLEXO DAS LUMINÁRIAS NO VIDRO (riscos diagonais, p/ blending aditivo)
export function reflexoVidro(seed = 1, n = 6) {
  // RODADA 6 — reflexo das calhas de LED como na foto-vitrine-alta: 2–3 riscos DIAGONAIS finos e nítidos (núcleo
  // de 2–3 px) com halo largo bem fraco; somem para baixo. Plano aditivo (preto = nada).
  const W = 1024, H = 1024, r = rng(600 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  const nn = Math.min(4, Math.max(2, Math.round(n / 2.5)));
  for (let i = 0; i < nn; i++) {
    const cx = W * (0.15 + (i + 0.5) / nn * 0.72 + (r() - 0.5) * 0.06);
    const ang = 0.55 + (r() - 0.5) * 0.08;
    const L = H * (1.0 + r() * 0.3);
    x.save(); x.translate(cx, H * 0.40); x.rotate(ang);
    // halo largo e fraco
    // RODADA 8: cada risco com largura, intensidade e desfoque próprios (não "decalque" repetido)
    const hw = 30 + r() * 70, ha = 0.04 + r() * 0.08;
    const g = x.createLinearGradient(-hw, 0, hw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${ha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(-hw, -L / 2, hw * 2, L);
    const cw = 1.5 + r() * 5, ca = 0.35 + r() * 0.65;
    x.filter = `blur(${(0.8 + r() * 2.2).toFixed(1)}px)`;
    const g2 = x.createLinearGradient(-cw * 3, 0, cw * 3, 0);
    g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.35, `rgba(255,255,255,${ca * 0.3})`); g2.addColorStop(0.5, `rgba(255,255,255,${ca})`);
    g2.addColorStop(0.65, `rgba(255,255,255,${ca * 0.3})`); g2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g2; x.fillRect(-cw * 3, -L / 2, cw * 6, L);
    x.filter = 'none';
    x.restore();
  }
  x.globalCompositeOperation = 'destination-in';
  const m = x.createLinearGradient(0, 0, 0, H);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.5, 'rgba(0,0,0,0.85)'); m.addColorStop(1, 'rgba(0,0,0,0.0)');
  x.fillStyle = m; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  return tex(c, { repeat: false });
}
// ---------- COPA DE ÁRVORE (billboard com alpha)
export function copaArvore(seed = 1) {
  const W = 512, H = 512, r = rng(640 + seed);
  const [c, x] = cv(W, H);
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#4a3a2c'; x.fillRect(W / 2 - 9, H * 0.6, 18, H * 0.4);
  for (let i = 0; i < 1400; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 190;
    const cx = W / 2 + Math.cos(a) * d * 1.1, cy = H * 0.40 + Math.sin(a) * d * 0.8;
    const k = 1 - cy / H;
    const gg = 55 + k * 70 + r() * 30;
    x.fillStyle = `rgba(${gg * 0.5 | 0},${gg | 0},${gg * 0.38 | 0},${0.6 + r() * 0.4})`;
    x.beginPath(); x.ellipse(cx, cy, 5 + r() * 10, 3 + r() * 7, r() * 3, 0, Math.PI * 2); x.fill();
  }
  return tex(c, { repeat: false });
}

// =====================================================================================================
// RODADA 4
// ---------- TIRA DE COSTELA / MANTA PENDURADA (u = largura, v = comprimento; v=1 no gancho)
// vermelho escuro arroxeado (#8a1f22..#b0353a), camadas de gordura branco-amareladas CONTÍNUAS no
// comprimento (não bolinhas), fibras, bordas mais escuras; tipo 1 = manta de costela com faixas de osso
export function carneTira(seed = 1, tipo = 0) {
  // RODADA 11 — refeita do zero (juízes: "bacon estampado"). Escala de mundo: 512 px = 0,95 m (1 cm ≈ 5,4 px),
  // u = largura da ripa. Carne VINHO → VERMELHO (#7a1c22 → #b8404a) com tom próprio por ripa e variação de baixa
  // frequência; gordura em MASSAS ORGÂNICAS por ruído (limiar suave, sem retângulo) + 1–3 veios ondulados oblíquos;
  // osso de costela só como RELEVO (normal map) em bandas transversais finas e suaves (cor quase nada); bordas de corte
  // escurecidas (sangue oxidado). tipo 0 = costela; 1 = fraldinha (mais gordura, sem osso); 2 = acém (entremeado).
  const W = 128, H = 512, r = rng(900 + seed * 7 + tipo * 101);
  const nTom = ruido(W, H, r, 56, 4), nFib = ruido(W, H, r, 4, 2, 0.12), nG = ruido(W, H, r, 22, 3, 1.6);
  const nBig = ruido(W, H, r, 44, 4, 1.3), nE = ruido(W, H, r, 9, 3, 0.6);
  const k0 = r();
  const A = [0x62, 0x14, 0x1a], Bc0 = [0xa2, 0x34, 0x36]; // RODADA 12: vinho opaco, menos saturado
  const base = A.map((v, i) => v + (Bc0[i] - v) * k0);
  const gord = [0xe6, 0xc6, 0xb8];
  const ossos = [];
  if (tipo !== 1) for (let v = 6 + r() * 14; v < H - 6; v += 16 + r() * 6) { if (r() > (tipo === 0 ? 0.95 : 0.4)) continue; ossos.push([v, 1.3 + r() * 1.0, (r() - 0.5) * 8, r() * 6, r() < 0.5 ? 0 : 1, r() < 0.45]); }
  const veios = [];
  const nV = tipo === 1 ? 2 : tipo === 2 ? 1 + (r() < 0.5 ? 1 : 0) : (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < nV; i++) veios.push([r() * H, 0.8 + r() * 1.4, r() * 6, (r() - 0.5) * 80, 2 + r() * 5, 3 + r() * 6]);
  const limG = tipo === 1 ? 0.63 : tipo === 2 ? 0.645 : 0.68;
  const capaLado = r() < 0.5 ? 0 : 1, capa = tipo === 1 ? 0.07 + r() * 0.08 : 0.02 + r() * 0.05;
  const sst = (a, b, v) => { const q = Math.max(0, Math.min(1, (v - a) / (b - a))); return q * q * (3 - 2 * q); };
  const [c, x] = cv(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const hm = new Float32Array(W * H), rgh = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, u = i / W;
    const t = nTom[k], fib = nFib[k];
    const lum = (0.74 + t * 0.52) * (0.93 + fib * 0.14); // RODADA 12: mais variação
    // matiz: partes escuras puxam p/ o vinho (menos verde), claras p/ o vermelho-rosado
    let R = base[0] * lum, G = base[1] * lum * (0.85 + t * 0.3), B2 = base[2] * lum * (0.9 + t * 0.2);
    let gf = sst(limG, limG + 0.07, nBig[k]) * (0.55 + nE[k] * 0.45);
    for (const [lv, lh, ph, inc, amp, fq] of veios) {
      const vc = lv + (u - 0.5) * inc + Math.sin(u * fq + ph) * amp + (nG[k] - 0.5) * 10;
      const dv = Math.abs(j - vc) / (lh * (0.5 + nE[k]));
      if (dv < 2) gf = Math.max(gf, Math.exp(-dv * dv * 1.6) * (0.35 + nE[k] * 0.4));
    }
    const dB = capaLado ? 1 - u : u, cl = capa * (0.4 + nG[k] * 1.2);
    if (dB < cl) gf = Math.max(gf, sst(0, 0.05, cl - dB) * 0.92);
    gf = Math.min(1, gf);
    let os = 0, osH = 0;
    for (const [ov, oh, incl, ph, lado, ponta] of ossos) {
      const vc = ov + (u - 0.5) * incl + Math.sin(u * 5 + ph) * 1.2 + (nG[k] - 0.5) * 2;
      const dv = (j - vc) / oh;
      const g = Math.exp(-dv * dv);
      osH = Math.max(osH, g);
      // ponta do osso aparece só junto da borda de corte (seção oval pequena), suave
      if (ponta) { const ub = lado ? 1 - u : u; if (ub < 0.10) os = Math.max(os, g * sst(0.10, 0.02, ub)); }
      else os = Math.max(os, g * 0.12);
    }
    let rr = R + (gord[0] - R) * gf, gg = G + (gord[1] - G) * gf, bb = B2 + (gord[2] - B2) * gf;
    // osso: rosado-marfim discreto (película de carne por cima)
    rr += (226 - rr) * os * 0.55; gg += (196 - gg) * os * 0.55; bb += (186 - bb) * os * 0.55;
    // leve escurecimento entre ossos (músculo intercostal mais fundo)
    const ent = ossos.length ? 1 - 0.06 * (1 - osH) : 1;
    const bd = Math.min(u, 1 - u);
    const e2 = (bd < 0.14 ? 0.62 + (bd / 0.14) * 0.38 : 1) * ent;
    rr *= e2; gg *= e2 * 0.94; bb *= e2 * 0.96;
    d[k * 4] = Math.min(255, rr); d[k * 4 + 1] = Math.min(255, gg); d[k * 4 + 2] = Math.min(255, bb); d[k * 4 + 3] = 255;
    hm[k] = 0.42 + gf * 0.10 + osH * 0.85 + (fib - 0.5) * 0.22 + t * 0.10 + (nE[k] - 0.5) * 0.08;
    rgh[k] = 0.34 + gf * 0.12 + (bd < 0.1 ? -0.06 : 0) + (1 - t) * 0.05;
  }
  x.putImageData(img, 0, 0);
  const [rc, rx] = cv(W, H);
  const ri = rx.createImageData(W, H);
  for (let k = 0; k < W * H; k++) { const vv = Math.max(0, Math.min(255, rgh[k] * 255)); ri.data[k * 4] = ri.data[k * 4 + 1] = ri.data[k * 4 + 2] = vv; ri.data[k * 4 + 3] = 255; }
  rx.putImageData(ri, 0, 0);
  return { map: tex(c, { repeat: false }), normalMap: normalFromHeight(hm, W, H, 3.2), roughnessMap: tex(rc, { srgb: false, repeat: false }) };
}

// ---------- PELE DE FRANGO CRU (pálida, poros, leve rosado) + normal
export function peleFrango(seed = 1) {
  const W = 256, r = rng(1200 + seed);
  const n = ruido(W, W, r, 40, 4), p = ruido(W, W, r, 5, 2);
  const [c, x] = cv(W, W);
  const img = x.createImageData(W, W), d = img.data, hm = new Float32Array(W * W);
  for (let k = 0; k < W * W; k++) {
    const t = n[k];
    if (seed > 4) { d[k * 4] = 232 + t * 16 - p[k] * 10; d[k * 4 + 1] = 176 + t * 26 - p[k] * 18; d[k * 4 + 2] = 166 + t * 22 - p[k] * 16; }   // frango cru em pedaços: rosado
    else { d[k * 4] = 236 + t * 14 - p[k] * 10; d[k * 4 + 1] = 200 + t * 22 - p[k] * 16; d[k * 4 + 2] = 160 + t * 26 - p[k] * 14; }
    d[k * 4 + 3] = 255;
    hm[k] = t * 0.6 + p[k] * 0.4;
  }
  x.putImageData(img, 0, 0);
  blotch(x, W, W, r, 18, ['rgb(232,170,150)', 'rgb(246,226,196)'], 10, 40, 0.35);
  return { map: tex(c), normalMap: normalFromHeight(hm, W, W, 3) };
}

// ---------- RÓTULO DO FRANGO CONGELADO (faixa impressa legível)
export function rotuloFrango(seed = 1) {
  const W = 512, H = 256;
  const [c, x] = cv(W, H);
  const cor = seed % 2 ? '#c8261c' : '#e0681a';
  x.fillStyle = '#ffd21c'; x.beginPath(); x.roundRect(0, 0, W, H, 26); x.fill();
  x.fillStyle = cor; x.fillRect(0, 70, W, 110);
  x.fillStyle = '#fff'; x.font = '900 86px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('FRANGO', W / 2, 128);
  x.fillStyle = '#5a2a06'; x.font = 'bold 44px Arial'; x.fillText('INTEIRO CONGELADO', W / 2, 36);
  x.fillStyle = '#1a1a1a'; x.font = '900 52px Arial'; x.fillText('R$ 12,99 /kg', W / 2, 218);
  return tex(c, { repeat: false });
}
// ---------- ETIQUETA AMARELA DE BALANÇA (pacotes de pedaços)
export function etiquetaPacote(nome, preco) {
  const W = 512, H = 256;
  const [c, x] = cv(W, H);
  x.fillStyle = '#ffd21c'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#c4161c'; x.fillRect(0, 0, W, 60);
  x.fillStyle = '#fff'; x.font = '900 46px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('FRIGORÍFICO', W / 2, 32);
  x.fillStyle = '#1a1a1a';
  let fs = 72; x.font = `900 ${fs}px Arial`; while (x.measureText(nome).width > W - 30 && fs > 40) { fs -= 4; x.font = `900 ${fs}px Arial`; }
  x.fillText(nome, W / 2, 118);
  x.fillStyle = '#b80f15'; x.font = '900 70px Arial'; x.fillText('R$ ' + preco, W / 2, 205);
  return tex(c, { repeat: false });
}

// ---------- CARNE MOÍDA: grão "minhoca" + normal
export function moidaGrao(seed = 1) {
  const W = 256, r = rng(1300 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = '#7e1a20'; x.fillRect(0, 0, W, W);
  const hm = new Float32Array(W * W);
  x.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const px = r() * W, py = r() * W, a = r() * 6.28, l = 3 + r() * 6;
    const t = r();
    x.strokeStyle = t < 0.15 ? '#e8b6a8' : t < 0.55 ? '#a32a30' : t < 0.85 ? '#8c1f26' : '#5e1015';
    x.lineWidth = 2 + r() * 1.6;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 1) * l, py + Math.sin(a + 1) * l, px + Math.cos(a) * l * 1.6, py + Math.sin(a) * l * 1.6); x.stroke();
  }
  const id = x.getImageData(0, 0, W, W).data;
  for (let k = 0; k < W * W; k++) hm[k] = (id[k * 4] + id[k * 4 + 1]) / 510;
  return { map: tex(c), normalMap: normalFromHeight(hm, W, W, 5) };
}
// ---------- EMPANADO/TEMPERADO: crosta granulada + normal
// RODADA 8: frango cru temperado — pele rosada, manchas de colorau/páprica, pimenta e salsinha
export function temperoCru(seed = 1) {
  const W = 256, r = rng(1450 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = '#d99a7e'; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 40, ['rgb(233,185,160)', 'rgb(200,128,100)', 'rgb(226,170,140)'], 10, 40, 0.5);
  blotch(x, W, W, r, 70, ['rgb(214,106,36)', 'rgb(196,86,28)', 'rgb(226,150,52)'], 6, 24, 0.75);
  speckle(x, W, W, 2600, ['#c8501c', '#e0902c', '#a83c14'], r, 0.8, 2.2, 0.35, 0.8);
  speckle(x, W, W, 700, ['#2d1d0c', '#3f6a22', '#4f7a2a'], r, 0.8, 2.0, 0.5, 0.9);
  const id = x.getImageData(0, 0, W, W).data, hm = new Float32Array(W * W);
  for (let k = 0; k < W * W; k++) hm[k] = (id[k * 4] + id[k * 4 + 1] + id[k * 4 + 2]) / 765;
  return { map: tex(c), normalMap: normalFromHeight(hm, W, W, 2.5) };
}
export function crosta(seed = 1, base = '#c47a2a') {
  const W = 256, r = rng(1400 + seed);
  const [c, x] = cv(W, W);
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  blotch(x, W, W, r, 60, ['rgb(140,70,20)', 'rgb(226,160,72)', 'rgb(190,100,36)'], 6, 26, 0.55);
  for (let i = 0; i < 5000; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,220,150,0.5)' : 'rgba(90,40,10,0.5)'; const s = 1 + r() * 2.4; x.fillRect(r() * W, r() * W, s, s); }
  speckle(x, W, W, 1200, ['#2d1d0c', '#3f5a22'], r, 0.8, 2.2, 0.5, 0.9);
  const id = x.getImageData(0, 0, W, W).data, hm = new Float32Array(W * W);
  for (let k = 0; k < W * W; k++) hm[k] = (id[k * 4] + id[k * 4 + 1] + id[k * 4 + 2]) / 765;
  return { map: tex(c), normalMap: normalFromHeight(hm, W, W, 4) };
}

// ---------- FUNDO URBANO DESFOCADO (calçada oposta) — pintado e desfocado, baixa saturação
// ---------- PLÁSTICO AMASSADO (normal map): vincos retos aleatórios + ruído fino
export function plasticoAmassado(seed = 1) {
  const W = 256, r = rng(1700 + seed);
  const n = ruido(W, W, r, 24, 4);
  const hm = new Float32Array(W * W);
  const vincos = [];
  for (let k = 0; k < 34; k++) { const a = r() * Math.PI; vincos.push([r() * W, r() * W, Math.cos(a), Math.sin(a), 1.5 + r() * 4, (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.5), 30 + r() * 120]); }
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    let h = n[j * W + i] * 0.6;
    for (const [px, py, cx, cy, wd, amp, len] of vincos) {
      let dx = i - px, dy = j - py; dx -= Math.round(dx / W) * W; dy -= Math.round(dy / W) * W;
      const t = dx * cx + dy * cy; if (Math.abs(t) > len) continue;
      const dd = Math.abs(-dx * cy + dy * cx) / wd; if (dd < 3) h += amp * Math.exp(-dd * dd) * (1 - Math.abs(t) / len);
    }
    hm[j * W + i] = h;
  }
  return normalFromHeight(hm, W, W, 3);
}
export function fundoUrbano() {
  // RODADA 8: 3840 px = 120 m de largura (16 m de altura), sem carros, desfoque 7 px e saturação 40% (profundidade de campo)
  // RODADA 10: canvas em 2× (7680 × 1024 = 64 px/m) — o mesmo desenho com metade do desfoque relativo (fundo nítido)
  const W = 3840, H = 512, r = rng(1500);
  const [c, x] = cv(W * 2, H * 2); x.scale(2, 2);
  const ceu = x.createLinearGradient(0, 0, 0, H);
  ceu.addColorStop(0, '#a9bccd'); ceu.addColorStop(0.5, '#d3dbe0'); ceu.addColorStop(1, '#d9dad6');
  x.fillStyle = ceu; x.fillRect(0, 0, W, H);
  // RODADA 7: rua de bairro com mais detalhe e pouco desfoque (2 px): sobrados e prédios baixos de cores variadas,
  // janelas de tamanhos diferentes com caixilho/persiana, sacadas, ar-condicionado, toldos, letreiros, árvores, carros
  // estacionados, postes e fiação. Tons médios (nada estourado).
  x.filter = 'blur(9px) saturate(50%) contrast(72%) brightness(106%)'; // RODADA 11: fundo em 'bokeh' (desfoque forte, contraste baixo)
  let px = -20;
  const cores = ['#a89c8a', '#97928a', '#b8ae9c', '#8c857a', '#b0a28e', '#7f7c77', '#c2b8a6', '#939a98', '#a7846a', '#8b9a8a', '#c9b48e'];
  const toldos = ['#7a3b2e', '#2f5470', '#6a6a3a', '#8a2a2a', '#2e6a4a', '#c08a2a'];
  while (px < W) {
    const w = 110 + r() * 200, h = H * (0.38 + r() * 0.50);
    const top = H - h;
    x.fillStyle = cores[(r() * cores.length) | 0]; x.fillRect(px, top, w, h);
    // textura de reboco/pastilha
    for (let k = 0; k < w * h / 60; k++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; x.fillRect(px + r() * w, top + r() * h, 2 + r() * 3, 2 + r() * 3); }
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px, top, w, 6); // platibanda
    const jw = 18 + r() * 22, jh = 22 + r() * 22, passoX = jw + 14 + r() * 18, passoY = jh + 20 + r() * 14;
    const sacada = r() < 0.4;
    for (let fy = top + 18; fy < H - 120; fy += passoY) for (let fx = px + 10; fx < px + w - jw - 6; fx += passoX) {
      if (r() < 0.08) continue;
      x.fillStyle = 'rgba(240,238,230,0.55)'; x.fillRect(fx - 2, fy - 2, jw + 4, jh + 4);
      const vidro = 60 + r() * 40; x.fillStyle = `rgb(${vidro},${vidro + 8},${vidro + 14})`; x.fillRect(fx, fy, jw, jh);
      if (r() < 0.4) { x.fillStyle = 'rgba(210,205,195,0.85)'; x.fillRect(fx, fy, jw, jh * (0.3 + r() * 0.6)); }
      x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(fx, fy, jw * 0.45, jh);
      if (sacada) { x.fillStyle = 'rgba(40,40,40,0.55)'; x.fillRect(fx - 4, fy + jh + 2, jw + 8, 3); for (let g = fx - 4; g < fx + jw + 4; g += 4) x.fillRect(g, fy + jh - 8, 1, 10); }
      if (r() < 0.12) { x.fillStyle = '#e4e2dc'; x.fillRect(fx + jw + 2, fy + jh - 12, 12, 9); }
    }
    // térreo: loja com porta de enrolar / vitrine + toldo/letreiro
    const lojaY = H - 96;
    x.fillStyle = r() < 0.5 ? '#6d7071' : '#3e4448'; x.fillRect(px + 8, lojaY, w - 16, 96);
    if (r() < 0.6) { x.fillStyle = 'rgba(255,255,255,0.10)'; for (let g = lojaY + 4; g < H; g += 5) x.fillRect(px + 8, g, w - 16, 1); }
    else { x.fillStyle = 'rgba(200,215,220,0.25)'; x.fillRect(px + 14, lojaY + 10, w - 28, 70); }
    if (r() < 0.7) { x.fillStyle = toldos[(r() * toldos.length) | 0]; x.fillRect(px + 4, lojaY - 22, w - 8, 18); x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(px + w * 0.25, lojaY - 16, w * 0.5, 5); }
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px + w - 5, top, 5, h);
    px += w + 3 + r() * 6;
  }
  // RODADA 11: sem árvores em bolha
  // postes e fiação
  x.strokeStyle = 'rgba(30,30,30,0.55)'; x.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) { const y0 = 70 + k * 9; x.beginPath(); x.moveTo(0, y0); for (let s = 0; s <= 15; s++) x.quadraticCurveTo(s * 256 - 128, y0 + 18, s * 256, y0); x.stroke(); }
  for (let s = 0; s <= 15; s++) { x.fillStyle = '#8f8c86'; x.fillRect(s * 256 - 4, 60, 8, H - 60); x.fillRect(s * 256 - 22, 66, 44, 4); }
  x.filter = 'none';
  return tex(c, { repeat: false });
}

// RODADA 9 — porta de aço de comércio (enrolar), lâminas horizontais de 8 cm, canvas = 1 m de altura
export function portaAco(cor = '#8f9396', seed = 1) {
  const W = 256, H = 256, r = rng(1900 + seed);
  const [c, x] = cv(W, H);
  x.fillStyle = cor; x.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 20) {
    const g = x.createLinearGradient(0, y, 0, y + 20);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0.02)'); g.addColorStop(0.85, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    x.fillStyle = g; x.fillRect(0, y, W, 20);
  }
  for (let k = 0; k < 18; k++) { const px = r() * W, l = 40 + r() * 160; const g = x.createLinearGradient(0, 0, 0, l); g.addColorStop(0, 'rgba(60,50,40,0.18)'); g.addColorStop(1, 'rgba(60,50,40,0)'); x.save(); x.translate(px, r() * H * 0.5); x.fillStyle = g; x.fillRect(0, 0, 3 + r() * 10, l); x.restore(); }
  speckle(x, W, H, 5000, ['#000', '#fff'], r, 0.6, 1.8, 0.03, 0.1);
  return tex(c);
}
// RODADA 9 — filé de peito de frango: rosado claro com FIBRA longitudinal (u = comprimento) + normal + brilho úmido
export function fibraFrango(seed = 1) {
  const W = 256, H = 128, r = rng(2100 + seed);
  const nF = ruido(W, H, r, 3, 2, 0.08), nT = ruido(W, H, r, 32, 3);
  const [c, x] = cv(W, H);
  const img = x.createImageData(W, H), d = img.data, hm = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, f = nF[k], t = nT[k];
    const R = 222 + (t - 0.5) * 24 + (f - 0.5) * 16, G = 166 + (t - 0.5) * 26 + (f - 0.5) * 18, B = 148 + (t - 0.5) * 22 + (f - 0.5) * 14;
    d[k * 4] = R; d[k * 4 + 1] = G; d[k * 4 + 2] = B; d[k * 4 + 3] = 255;
    hm[k] = f * 0.7 + t * 0.3;
  }
  x.putImageData(img, 0, 0);
  blotch(x, W, H, r, 14, ['rgb(214,150,138)', 'rgb(246,214,200)'], 8, 26, 0.25);
  return { map: tex(c), normalMap: normalFromHeight(hm, W, H, 3) };
}
