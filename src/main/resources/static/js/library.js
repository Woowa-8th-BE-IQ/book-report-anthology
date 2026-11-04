// 꼬깃 서고: 문집마다 하나 있는 넓은 서고(2.5D 손그림). 걷고, 앉고, 몸짓하고, 한마디를 말풍선으로 띄운다.
// 공간은 높은 책장 탑 두 개, 가운데 펼친 책 조형물, 긴 열람 테이블, 창가 벤치로 이뤄진다.
// (큰 서점 광장의 분위기만 빌린 원래 그림이다. 실제 장소의 이름·로고·사진은 쓰지 않는다)
// 좌표는 세계 픽셀(2400×1450)이고, 서버에는 0~1 비율로 보낸다. 사람의 발끝이 그 좌표에 놓인다.
(() => {
  // 3D 서고(library3d.js)가 뜨는 화면이면 기다린다. 3D가 실패하면 그쪽에서 startLibrary2D()를 부른다.
  const start = () => {
  const root = document.getElementById('library');
  if (!root) return;

  const W = 2400;
  const H = 1450; // 바닥 아래쪽은 걸을 수 없는 여백(도구 막대 뒤로 사람이 숨지 않게 카메라가 더 내려간다)
  const FLOOR = { top: 540, bottom: 1262, left: 110, right: 2290 };
  const SPEED = 290; // 세계 픽셀/초
  const INK = '#2E241C';
  const meId = Number(root.dataset.me);
  const stage = root.querySelector('.lib-stage');
  const world = root.querySelector('.lib-world');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 씨앗이 있는 난수: 매번 같은 서고가 그려진다
  const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const svgEl = (w, h, body, extra = '') =>
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" ${extra}>${body}</svg>`;
  const BOOK_COLORS = ['#C9604A', '#E3A857', '#6E8B74', '#4F6D8A', '#B98DB5', '#D9C7A7', '#8C5A3C', '#2F4858',
    '#E4572E', '#9BB7D4', '#F2D16B', '#7A9E7E', '#D98C6C', '#5B7F95'];

  // ───────── 자리(앉을 수 있는 곳)와 장애물 ─────────
  const SEATS = [
    // 벤치는 앉는 판이 높다: 발끝 좌표는 벤치 바로 앞, 몸은 rise(세계 픽셀)만큼 올라가 판 위에 앉는다
    ...[860, 990, 1410, 1540].map((x, i) => ({ id: `bench-${i + 1}`, x, y: 556, rise: 18, kind: 'bench', from: [x, 600] })),
    ...[430, 570, 710, 850].map((x, i) => ({ id: `tl-${i + 1}`, x, y: 950, kind: 'chair', from: [x, 915] })),
    ...[1550, 1690, 1830, 1970].map((x, i) => ({ id: `tr-${i + 1}`, x, y: 950, kind: 'chair', from: [x, 915] })),
    { id: 'nook-l', x: 330, y: 690, kind: 'beanbag', from: [330, 740] },
    { id: 'nook-r', x: 2070, y: 690, kind: 'beanbag', from: [2070, 740] },
    { id: 'rug-1', x: 1010, y: 830, kind: 'cushion', from: [1010, 870] },
    { id: 'rug-2', x: 1390, y: 830, kind: 'cushion', from: [1390, 870] },
  ];
  const OBSTACLES = [
    { e: [1200, 724, 190, 60] }, // 펼친 책 조형물 받침
    { r: [350, 962, 950, 1042] }, { r: [1470, 962, 2070, 1042] }, // 열람 테이블
    { r: [170, 878, 320, 916] }, // 게시판
    { r: [1872, 812, 2048, 852] }, // 북 카트
    { c: [160, 650, 46] }, { c: [2240, 650, 46] }, { c: [150, 1215, 50] }, { c: [2250, 1215, 50] }, // 화분
  ];
  const HOTSPOTS = {
    book: { at: [1200, 820], card: 'book' },
    board: { at: [245, 950], card: 'board' },
    shelf: { at: [1960, 890], card: 'shelf' },
  };
  const free = (x, y) => {
    if (x < FLOOR.left || x > FLOOR.right || y < FLOOR.top || y > FLOOR.bottom) return false;
    return !OBSTACLES.some((o) => {
      if (o.r) return x > o.r[0] && x < o.r[2] && y > o.r[1] && y < o.r[3];
      if (o.e) return ((x - o.e[0]) / o.e[2]) ** 2 + ((y - o.e[1]) / o.e[3]) ** 2 < 1;
      return (x - o.c[0]) ** 2 + (y - o.c[1]) ** 2 < o.c[2] ** 2;
    });
  };
  const lineFree = (a, b) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12);
    for (let i = 1; i <= steps; i++) {
      if (!free(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps)) return false;
    }
    return true;
  };

  // 길 찾기: 30px 격자에서 A*, 그다음 직선으로 갈 수 있는 점은 건너뛴다
  const CELL = 30;
  const GW = Math.ceil(W / CELL);
  const GH = Math.ceil(H / CELL);
  const passable = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) passable[gy * GW + gx] = free(gx * CELL + CELL / 2, gy * CELL + CELL / 2) ? 1 : 0;
  }
  const findPath = (from, to) => {
    if (lineFree(from, to)) return [to];
    const cell = (p) => [clamp(Math.floor(p[0] / CELL), 0, GW - 1), clamp(Math.floor(p[1] / CELL), 0, GH - 1)];
    const [sx, sy] = cell(from);
    const [tx, ty] = cell(to);
    const start = sy * GW + sx;
    const goal = ty * GW + tx;
    const g = new Float32Array(GW * GH).fill(Infinity);
    const came = new Int32Array(GW * GH).fill(-1);
    const open = [start];
    const inOpen = new Uint8Array(GW * GH);
    const f = new Float32Array(GW * GH).fill(Infinity);
    const h = (i) => { const dx = Math.abs((i % GW) - tx); const dy = Math.abs(Math.floor(i / GW) - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
    g[start] = 0; f[start] = h(start); inOpen[start] = 1;
    let guard = 0;
    while (open.length && guard++ < 6000) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[best]]) best = i;
      const current = open.splice(best, 1)[0];
      inOpen[current] = 0;
      if (current === goal) break;
      const cx = current % GW;
      const cy = Math.floor(current / GW);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx; const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const next = ny * GW + nx;
          if (!passable[next] && next !== goal) continue;
          if (dx && dy && (!passable[cy * GW + nx] || !passable[ny * GW + cx])) continue; // 모서리를 가로지르지 않는다
          const cost = g[current] + (dx && dy ? 1.41 : 1);
          if (cost < g[next]) {
            g[next] = cost; f[next] = cost + h(next); came[next] = current;
            if (!inOpen[next]) { open.push(next); inOpen[next] = 1; }
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.unshift([(i % GW) * CELL + CELL / 2, Math.floor(i / GW) * CELL + CELL / 2]);
    cells.push(to);
    const smooth = [];
    let anchor = from;
    for (let i = 0; i < cells.length; i++) {
      const ahead = cells[i + 1];
      if (ahead && lineFree(anchor, ahead)) continue;
      smooth.push(cells[i]);
      anchor = cells[i];
    }
    return smooth;
  };
  // 막힌 곳을 누르면 가장 가까운 걸을 수 있는 곳으로
  const nearestFree = (x, y) => {
    if (free(x, y)) return [x, y];
    for (let r = 20; r < 400; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r;
        if (free(px, py)) return [px, py];
      }
    }
    return null;
  };

  // ───────── 그림: 벽·창·책장 탑·바닥 ─────────
  const drawBooks = (rand, x0, x1, ledgeY) => {
    let out = '';
    let x = x0 + 4;
    while (x < x1 - 8) {
      if (rand() < 0.07) { x += 14 + rand() * 24; continue; } // 빈칸
      const w = 7 + Math.round(rand() * 9);
      if (x + w > x1 - 4) break;
      const h = 30 + Math.round(rand() * 22);
      const color = BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)];
      const lean = rand() < 0.06 ? (rand() < 0.5 ? -9 : 9) : 0;
      const tf = lean ? ` transform="rotate(${lean} ${x + (lean > 0 ? w : 0)} ${ledgeY})"` : '';
      out += `<g${tf}><rect x="${x}" y="${ledgeY - h}" width="${w}" height="${h}" rx="1.5" fill="${color}" stroke="${INK}" stroke-width="1.4"/>`;
      if (w > 9 && rand() < 0.6) out += `<path d="M${x + 2} ${ledgeY - h + 7}h${w - 4}M${x + 2} ${ledgeY - 9}h${w - 4}" stroke="#FFF6E6" stroke-width="1.2" opacity=".55"/>`;
      out += '</g>';
      x += w + (lean ? 6 : 1);
    }
    return out;
  };
  const drawTower = (rand, x0, x1, sideRight) => {
    const top = -80; const base = 560;
    let out = '';
    // 가운데 쪽 옆면(깊이)
    out += sideRight
      ? `<path d="M${x1} ${top}h40v${base - top - 26}l-40 26z" fill="#4A2F20" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
      : `<path d="M${x0} ${top}h-40v${base - top - 26}l40 26z" fill="#4A2F20" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    out += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${base - top}" fill="#7A4E33" stroke="${INK}" stroke-width="6"/>`;
    out += `<rect x="${x0 + 18}" y="${top}" width="${x1 - x0 - 36}" height="${base - top - 18}" fill="#55361F"/>`;
    const cols = 4;
    const colW = (x1 - x0 - 36) / cols;
    for (let ledge = base - 46; ledge > top + 20; ledge -= 68) {
      for (let c = 0; c < cols; c++) out += drawBooks(rand, x0 + 18 + c * colW + 6, x0 + 18 + (c + 1) * colW - 6, ledge);
      out += `<rect x="${x0 + 14}" y="${ledge}" width="${x1 - x0 - 28}" height="11" fill="#A4734F" stroke="${INK}" stroke-width="2.4"/>`;
    }
    for (let c = 1; c < cols; c++) out += `<rect x="${x0 + 18 + c * colW - 6}" y="${top}" width="12" height="${base - top - 18}" fill="#8A5A3B" stroke="${INK}" stroke-width="2.4"/>`;
    out += `<rect x="${x0 - 12}" y="${base - 14}" width="${x1 - x0 + 24}" height="34" rx="4" fill="#6B4430" stroke="${INK}" stroke-width="5"/>`;
    return out;
  };
  const drawBackdrop = () => {
    const rand = seeded(23);
    let s = `<defs>
      <linearGradient id="lib-sky" x1="0" y1="0" x2="0" y2="1"><stop class="sky-top" offset="0"/><stop class="sky-bottom" offset="1"/></linearGradient>
      <linearGradient id="lib-fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B1C12" stop-opacity=".85"/><stop offset="1" stop-color="#2B1C12" stop-opacity="0"/></linearGradient>
      <linearGradient id="lib-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="beam-top"/><stop offset="1" class="beam-bottom" stop-opacity="0"/></linearGradient>
      <filter id="lib-wob" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>
    </defs><g filter="url(#lib-wob)">`;
    // 벽
    s += `<rect class="wall" x="0" y="0" width="${W}" height="560"/>`;
    for (let x = 60; x < W; x += 120) s += `<path d="M${x} 40V540" stroke="#D9C5A6" stroke-width="2" opacity=".55"/>`;
    // 큰 아치 창과 하늘
    const arch = 'M770 540V230A430 200 0 0 1 1630 230V540Z';
    s += `<path d="${arch}" fill="url(#lib-sky)"/>`;
    s += '<g class="lib-sky-stars">';
    for (let i = 0; i < 46; i++) s += `<circle cx="${800 + rand() * 800}" cy="${60 + rand() * 300}" r="${1 + rand() * 1.8}" fill="#FFF6D8"/>`;
    s += '</g>';
    s += '<circle class="lib-sun" cx="1470" cy="200" r="46"/>';
    // 먼 도시 지붕(밤에는 창에 불이 켜진다)
    let city = '';
    let lights = '';
    for (let x = 770; x < 1630;) {
      const w = 40 + rand() * 70; const h = 40 + rand() * 120;
      city += `<rect x="${x}" y="${540 - h}" width="${w}" height="${h}"/>`;
      for (let wy = 540 - h + 14; wy < 520; wy += 20) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (rand() < 0.35) lights += `<rect x="${wx}" y="${wy}" width="6" height="8"/>`;
      x += w + 6;
    }
    s += `<g class="lib-city">${city}</g><g class="lib-city-lights">${lights}</g>`;
    s += `<path d="${arch}" fill="none" stroke="#5E3B27" stroke-width="22"/><path d="${arch}" fill="none" stroke="${INK}" stroke-width="5"/>`;
    s += `<path d="M985 252V540M1200 214V540M1415 252V540M778 380H1622" stroke="#5E3B27" stroke-width="12"/><path d="M985 252V540M1200 214V540M1415 252V540M778 380H1622" stroke="${INK}" stroke-width="2.5" opacity=".7"/>`;
    s += `<rect x="760" y="526" width="880" height="22" rx="4" fill="#8A5A3B" stroke="${INK}" stroke-width="4"/>`;
    // 천장 들보와 높이를 느끼게 하는 그늘
    s += `<rect x="0" y="0" width="${W}" height="210" fill="url(#lib-fog)"/>`;
    s += `<rect x="0" y="0" width="${W}" height="34" fill="#3B2618"/>`;
    for (let x = 0; x < W; x += 200) s += `<path d="M${x} 0L${x + 60} 34" stroke="#22150D" stroke-width="10"/>`;
    // 책장 탑 두 개
    s += drawTower(rand, 40, 740, true);
    s += drawTower(rand, 1660, 2360, false);
    // 왼쪽 탑에 기댄 사다리
    s += `<g stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M610 90L560 560M680 90L640 560" stroke="#B98A5E" stroke-width="11"/><path d="M610 90L560 560M680 90L640 560"/>`;
    for (let i = 1; i < 10; i++) { const t = i / 10; s += `<path d="M${610 - 50 * t + 2} ${90 + 470 * t}H${680 - 40 * t - 2}" stroke="#B98A5E" stroke-width="7"/><path d="M${610 - 50 * t + 2} ${90 + 470 * t}H${680 - 40 * t - 2}" stroke-width="2"/>`; }
    s += '</g>';
    // 아치 위 이름판
    s += `<g transform="translate(1200 66)"><rect x="-150" y="-30" width="300" height="60" rx="10" fill="#8A5A3B" stroke="${INK}" stroke-width="5"/><text x="0" y="13" text-anchor="middle" font-family="'Nanum Pen Script', cursive" font-size="44" fill="#FFF3DC">꼬깃 서고</text></g>`;
    // 바닥: 뒤로 갈수록 좁아지는 마루
    s += `<rect class="floor" x="0" y="540" width="${W}" height="${H - 540}"/>`;
    let y = 548; let step = 20;
    while (y < H) {
      s += `<path d="M0 ${y}H${W}" stroke="#A97C50" stroke-width="2.4"/>`;
      for (let k = 0; k < 7; k++) { const x = rand() * W; s += `<path d="M${x} ${y}v${step}" stroke="#A97C50" stroke-width="2"/>`; }
      y += step; step *= 1.11;
    }
    s += `<rect x="0" y="536" width="${W}" height="16" fill="#6B4430" stroke="${INK}" stroke-width="4"/>`;
    // 창에서 드는 빛
    s += '<path class="lib-beam" d="M800 552H1600L1960 1180H440Z" fill="url(#lib-beam)"/>';
    // 조형물 아래 둥근 러그
    s += `<ellipse cx="1200" cy="780" rx="540" ry="150" fill="#B5563F" stroke="${INK}" stroke-width="5"/><ellipse cx="1200" cy="780" rx="500" ry="128" fill="none" stroke="#E8C07A" stroke-width="6" stroke-dasharray="18 12"/><ellipse cx="1200" cy="780" rx="440" ry="104" fill="#C66A4F"/>`;
    // 입구 매트
    s += `<rect x="1060" y="1222" width="280" height="64" rx="14" fill="#6E8B74" stroke="${INK}" stroke-width="4"/><text x="1200" y="1266" text-anchor="middle" font-family="'Nanum Pen Script', cursive" font-size="36" fill="#FFF6E6">어서 와요</text>`;
    s += '</g>';
    return svgEl(W, H, s, 'class="lib-backdrop" aria-hidden="true"');
  };

  // 천장에 매단 책갈피 별, 빛 속 먼지, 조형물 위 종이새(움직이는 것들은 흔들림 필터 밖에 둔다)
  const drawAir = (stars) => {
    const rand = seeded(91);
    let s = '';
    const count = Math.min(stars, 40);
    for (let i = 0; i < count; i++) {
      const x = 760 + rand() * 880;
      const len = 70 + rand() * 230;
      const color = ['#F2D16B', '#E3A857', '#FFF3C4', '#9BB7D4'][i % 4];
      s += `<g class="lib-star" style="transform-origin:${x}px 30px;animation-delay:${(-rand() * 6).toFixed(2)}s">`
        + `<path d="M${x} 30V${30 + len}" stroke="#E8DCC6" stroke-width="1.6" opacity=".8"/>`
        + `<path transform="translate(${x} ${40 + len})" d="M0 -13l3.8 8.2 9 1-6.7 6.1 1.9 8.8L0 6.6l-8 4.5 1.9-8.8-6.7-6.1 9-1z" fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`;
    }
    for (let i = 0; i < 26; i++) {
      s += `<circle class="lib-dust" cx="${820 + rand() * 900}" cy="${640 + rand() * 480}" r="${1.6 + rand() * 2.2}" style="animation-delay:${(-rand() * 12).toFixed(2)}s;animation-duration:${(9 + rand() * 8).toFixed(1)}s"/>`;
    }
    for (let i = 0; i < 3; i++) {
      s += `<g class="lib-bird" style="animation-delay:${-i * 3.1}s"><path d="M0 0q9-9 18 0q9-9 18 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M5 1q13 5 26 0" fill="#FFFDF8" stroke="${INK}" stroke-width="2"/></g>`;
    }
    return svgEl(W, H, s, 'class="lib-air" aria-hidden="true"');
  };

  // ───────── 가구(사람과 깊이 순서를 다투는 것들) ─────────
  // 스탠드: 그 테이블 의자에 누가 앉으면 딸깍 켜진다
  const lamp = (x, y, id) => `<g class="lib-lamp" data-lamp="${id}"><rect x="${x - 4}" y="${y - 38}" width="8" height="38" fill="#C9A15E" stroke="${INK}" stroke-width="2.5"/>`
    + `<ellipse class="lib-lamp-glow" cx="${x}" cy="${y - 20}" rx="70" ry="34"/>`
    + `<path d="M${x - 36} ${y - 34}q0-22 36-22t36 22z" fill="#3F6B4F" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`
    + `<ellipse class="lib-bulb" cx="${x}" cy="${y - 33}" rx="15" ry="4.5"/>`
    + `<ellipse cx="${x}" cy="${y + 2}" rx="20" ry="6" fill="#C9A15E" stroke="${INK}" stroke-width="2.5"/></g>`;
  const props = [];
  const prop = (x, y, w, h, base, body, attrs = {}) => props.push({ x, y, w, h, base, body, attrs });

  // 펼친 책 조형물: 받침 위에서 책장이 날개처럼 솟는다
  prop(930, 360, 540, 420, 776, `<g transform="translate(270 400) scale(.8) translate(-270 -400)">
    <path d="M60 330v42a210 42 0 0 0 420 0v-42" fill="#CDBEA6" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="270" cy="330" rx="210" ry="42" fill="#EDE3D2" stroke="${INK}" stroke-width="5"/>
    <path d="M150 356q120 18 240 0" stroke="#A8977E" stroke-width="3" fill="none"/>
    <g stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
      <path d="M270 326C210 312 120 300 70 210C120 214 170 196 196 110C226 186 252 260 270 326z" fill="#E4572E"/>
      <path d="M270 326C330 312 420 300 470 210C420 214 370 196 344 110C314 186 288 260 270 326z" fill="#E4572E"/>
      <path d="M270 318C216 300 140 286 98 214C140 214 184 196 206 126C232 194 254 254 270 318z" fill="#FFF6E6"/>
      <path d="M270 318C324 300 400 286 442 214C400 214 356 196 334 126C308 194 286 254 270 318z" fill="#FFF6E6"/>
      <path d="M270 312C232 290 196 250 186 168C214 206 246 232 270 312z" fill="#FFFDF8"/>
      <path d="M270 312C308 290 344 250 354 168C326 206 294 232 270 312z" fill="#FFFDF8"/>
      <path d="M270 312C254 250 252 150 270 40C288 150 286 250 270 312z" fill="#FFFDF8"/>
    </g>
    <path d="M140 236q40 6 70-14M150 262q46 6 82-14M400 236q-40 6-70-14M390 262q-46 6-82-14M262 120v120M278 120v120" stroke="#D8C9B4" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="216" y="366" width="108" height="30" rx="6" fill="#8A5A3B" stroke="${INK}" stroke-width="3"/>
    <text x="270" y="388" text-anchor="middle" font-family="'Nanum Pen Script', cursive" font-size="24" fill="#FFF3DC">펼친 책</text></g>`, { 'data-hot': 'book', 'aria-label': '펼친 책 조형물' });

  // 열람 테이블 두 개와 그 뒤 의자
  const table = (x0) => {
    prop(x0, 880, 620, 200, 1046, `
      <path d="M22 82H598L612 112H8Z" fill="#B07A4E" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <rect x="8" y="112" width="604" height="18" fill="#8C5A3B" stroke="${INK}" stroke-width="4"/>
      <rect x="34" y="130" width="20" height="64" fill="#8C5A3B" stroke="${INK}" stroke-width="4"/>
      <rect x="566" y="130" width="20" height="64" fill="#8C5A3B" stroke="${INK}" stroke-width="4"/>
      ${lamp(160, 92, `${x0}-a`)}${lamp(460, 92, `${x0}-b`)}
      <g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round">
        <path d="M262 96l38-7 38 7-38 6z" fill="#FFF6E6"/><path d="M300 89v13" />
        <rect x="360" y="84" width="42" height="12" rx="2" fill="#4F6D8A"/><rect x="364" y="74" width="34" height="10" rx="2" fill="#E3A857"/>
        <path d="M528 78h18v18h-18z" fill="#FFFDF8"/><path d="M546 82q8 0 8 6t-8 6" fill="none"/>
      </g>`);
    SEATS.filter((seat) => seat.kind === 'chair' && seat.x > x0 && seat.x < x0 + 620).forEach((seat) => {
      seat.lamp = seat.x - x0 < 310 ? `${x0}-a` : `${x0}-b`;
      prop(seat.x - 46, seat.y - 124, 92, 130, seat.y - 1, `
        <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
          <rect x="10" y="8" width="72" height="22" rx="10" fill="#8C5A3B"/>
          <path d="M20 30v86M72 30v86M36 30v60M56 30v60" stroke-width="9" stroke="#8C5A3B"/>
          <path d="M20 30v86M72 30v86M36 30v60M56 30v60" stroke-width="2.5"/>
        </g>`, { 'data-seat': seat.id, 'aria-label': '의자' });
    });
  };
  table(340);
  table(1460);

  // 창가 벤치(방석 네 개)
  prop(800, 470, 800, 110, 550, `
    <rect x="20" y="40" width="760" height="34" rx="14" fill="#C9684D" stroke="${INK}" stroke-width="4.5"/>
    <rect x="20" y="72" width="760" height="22" fill="#8C5A3B" stroke="${INK}" stroke-width="4"/>
    ${[60, 190, 610, 740].map((x, i) => `<path d="M${x - 46} 44q4-26 46-26t46 26z" fill="${['#E3A857', '#6E8B74', '#9BB7D4', '#B98DB5'][i]}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" data-seat="bench-${i + 1}"/>`).join('')}`);

  // 빈백 두 개와 책 더미
  const beanbag = (x, color, seat) => prop(x - 80, 600, 170, 110, 686, `
    <path d="M20 96C6 70 18 30 62 22C96 16 140 28 152 60C162 88 150 104 120 106H44C34 106 26 104 20 96Z" fill="${color}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M48 44q30-14 70 0" stroke="#FFF6E6" stroke-width="3" fill="none" opacity=".6" stroke-linecap="round"/>
    <g stroke="${INK}" stroke-width="2.5"><rect x="140" y="84" width="28" height="9" fill="#4F6D8A"/><rect x="144" y="75" width="22" height="9" fill="#F2D16B"/></g>`, { 'data-seat': seat, 'aria-label': '빈백' });
  beanbag(330, '#E3A857', 'nook-l');
  beanbag(2070, '#7A9E7E', 'nook-r');
  // 러그 위 방석 두 개
  ['rug-1', 'rug-2'].forEach((id) => {
    const seat = SEATS.find((s) => s.id === id);
    prop(seat.x - 50, seat.y - 34, 100, 50, seat.y - 30, `<ellipse cx="50" cy="26" rx="44" ry="17" fill="#F2D16B" stroke="${INK}" stroke-width="4"/><path d="M20 26q30 10 60 0" stroke="#C9A15E" stroke-width="3" fill="none"/>`, { 'data-seat': id, 'aria-label': '방석' });
  });

  // 게시판(글감 질문)
  prop(160, 730, 170, 190, 912, `
    <g stroke="${INK}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M40 60L18 182M130 60L152 182" stroke="#8C5A3B" stroke-width="10"/><path d="M40 60L18 182M130 60L152 182"/>
      <rect x="8" y="14" width="154" height="110" rx="6" fill="#C99B6B"/>
      <rect x="22" y="40" width="50" height="38" fill="#FFFDF8" stroke-width="2.5" transform="rotate(-4 47 59)"/>
      <rect x="84" y="46" width="60" height="44" fill="#FFF3C4" stroke-width="2.5" transform="rotate(3 114 68)"/>
      <rect x="36" y="88" width="56" height="28" fill="#DCEBF5" stroke-width="2.5"/>
    </g>
    <circle cx="47" cy="44" r="4" fill="#E4572E"/><circle cx="114" cy="50" r="4" fill="#4F6D8A"/>
    <text x="85" y="34" text-anchor="middle" font-family="'Nanum Pen Script', cursive" font-size="22" fill="#2E241C">글감 질문</text>`, { 'data-hot': 'board', 'aria-label': '게시판' });

  // 북 카트(우리 책장)
  prop(1868, 700, 184, 156, 850, `
    <g stroke="${INK}" stroke-width="4" stroke-linejoin="round">
      <rect x="10" y="60" width="164" height="66" rx="6" fill="#8C5A3B"/>
      <path d="M10 92H174" stroke-width="3"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${18 + i * 19}" y="${30 + (i % 3) * 4}" width="15" height="${30 - (i % 3) * 4}" fill="${BOOK_COLORS[(i * 3) % BOOK_COLORS.length]}" stroke-width="2"/>`).join('')}
      <circle cx="34" cy="138" r="12" fill="#5E3B27"/><circle cx="150" cy="138" r="12" fill="#5E3B27"/>
      <path d="M174 70l8-30" stroke-width="5"/>
    </g>
    <rect x="44" y="98" width="96" height="22" rx="4" fill="#FFF6E6" stroke="${INK}" stroke-width="2"/>
    <text x="92" y="115" text-anchor="middle" font-family="'Nanum Pen Script', cursive" font-size="20" fill="#2E241C">우리 책장</text>`, { 'data-hot': 'shelf', 'aria-label': '북 카트, 우리 책장' });

  // 화분
  const plant = (x, y, big) => prop(x - 70, y - (big ? 190 : 150), 140, big ? 200 : 160, y + 4, `
    <g stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
      ${[[-50, 30], [-20, 6], [20, 4], [52, 28], [0, 18]].map(([dx, top]) => `<path d="M70 ${big ? 150 : 112}Q${70 + dx * 0.4} ${top + 60} ${70 + dx} ${top}Q${70 + dx * 0.9} ${top + 40} 70 ${big ? 150 : 112}z" fill="${dx % 3 ? '#6E8B74' : '#7A9E7E'}"/>`).join('')}
      <path d="M36 ${big ? 140 : 102}h68l-10 ${big ? 54 : 50}H46z" fill="#C9604A"/>
    </g>`);
  plant(160, 652, false);
  plant(2240, 652, false);
  plant(150, 1220, true);
  plant(2250, 1220, true);

  // ───────── 세계 조립 ─────────
  world.innerHTML = drawBackdrop() + drawAir(Number(root.dataset.stars) || 0);
  props.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'lib-prop';
    Object.entries(p.attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (p.attrs['data-hot']) el.tabIndex = 0;
    el.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;z-index:${Math.round(p.base)}`;
    el.innerHTML = svgEl(p.w, p.h, p.body);
    world.appendChild(el);
  });

  // ───────── 사람 ─────────
  const people = new Map(); // id → { el, x, y, tx, ty, seat, status, face }
  const faceOf = (id) => root.querySelector(`template[data-person="${id}"]`);
  const STATUS = { read: '읽는 중', write: '쓰는 중', rest: '쉬는 중' };
  const depth = (y) => 0.7 + (0.46 * (y - FLOOR.top)) / (FLOOR.bottom - FLOOR.top);

  const critterOf = (el) => ((el.querySelector('.avatar svg') || { getAttribute: () => '' }).getAttribute('class') || '').match(/critter-([a-z]+)/)?.[1] || 'wood';
  // 앉아 있을 때 손에 든 것: 읽는 중이면 책장이 넘어가고, 쓰는 중이면 연필이 움직이고, 쉬는 중이면 김이 오른다
  const HOLD = {
    read: `<svg viewBox="0 0 48 34"><path d="M24 8C18 4 10 3 3 5v24c7-2 15-1 21 3 6-4 14-5 21-3V5c-7-2-15-1-21 3z" fill="#FFFDF8" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 12h11M8 17h11M8 22h8" stroke="#C9B9A0" stroke-width="1.8"/><path class="hold-page" d="M24 8c4-3 10-4 17-3v22c-7-1-13 0-17 3z" fill="#F4EBDD" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M24 8v24" stroke="${INK}" stroke-width="2"/></svg>`,
    write: `<svg viewBox="0 0 48 34"><rect x="5" y="6" width="30" height="25" rx="2" fill="#FFFDF8" stroke="${INK}" stroke-width="2.4"/><path d="M10 13h20M10 18h20M10 23h12" stroke="#9BB7D4" stroke-width="1.8"/><g class="hold-pencil"><path d="M28 27l12-17 5 3.4-12 17-5.6 1.4z" fill="#F2D16B" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M40 10l5 3.4" stroke="#E4572E" stroke-width="3.2"/></g></svg>`,
    rest: `<svg viewBox="0 0 48 40"><g class="hold-steam" fill="none" stroke="#B5A28C" stroke-width="2.6" stroke-linecap="round"><path d="M17 13c-3-3 3-5 0-9"/><path d="M25 13c-3-3 3-5 0-9"/></g><path d="M9 16h24v14a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6z" fill="#C9604A" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M33 19h3a5 5 0 0 1 0 10h-3" fill="none" stroke="${INK}" stroke-width="2.4"/><path d="M13 21v8" stroke="#FFF6E6" stroke-width="2.4" stroke-linecap="round" opacity=".6"/></svg>`,
  };
  const seatOf = (id) => SEATS.find((s) => s.id === id) || null;

  const createPerson = (id) => {
    const template = faceOf(id);
    if (!template) return null;
    const el = document.createElement('div');
    el.className = 'member online lib-who' + (id === meId ? ' me' : '');
    el.dataset.id = id;
    el.style.setProperty('--d', String(id % 7));
    el.innerHTML = '<span class="lib-bubble" hidden></span><span class="lib-tag"><b></b><small></small></span><span class="lib-body"><span class="lib-hold" aria-hidden="true"></span></span>';
    el.querySelector('.lib-tag b').textContent = template.dataset.name;
    el.querySelector('.lib-body').prepend(template.content.firstElementChild.cloneNode(true));
    world.appendChild(el);
    const person = { id, el, x: 1200, y: 1200, tx: 1200, ty: 1200, seat: null, seated: null, status: 'read', walking: false, critter: critterOf(el) };
    people.set(id, person);
    return person;
  };
  const place = (person) => {
    const { el } = person;
    el.style.setProperty('--x', String(person.x / W));
    el.style.setProperty('--y', String(person.y / H));
    el.style.setProperty('--s', depth(person.y).toFixed(3));
    el.style.zIndex = String(Math.round(person.y));
  };
  // seat는 잡은 자리(서버와 같다), seated는 실제로 엉덩이를 붙인 자리(뛰어올라 내려앉은 뒤)
  const label = (person) => {
    person.el.querySelector('.lib-tag small').textContent = STATUS[person.status] || STATUS.read;
    const seat = person.seated ? seatOf(person.seated) : null;
    person.el.classList.toggle('sitting', Boolean(seat));
    ['chair', 'bench', 'beanbag', 'cushion'].forEach((kind) => person.el.classList.toggle(`seat-${kind}`, Boolean(seat) && seat.kind === kind));
    const hold = person.el.querySelector('.lib-hold');
    if (hold.dataset.status !== person.status) { hold.dataset.status = person.status; hold.innerHTML = HOLD[person.status] || HOLD.read; }
  };
  const setWalking = (person, walking) => {
    if (person.walking === walking) return;
    person.walking = walking;
    person.el.classList.toggle('walking', walking);
    if (walking) {
      person.clock = cadence(person.critter) * 0.7; // 첫 발소리는 곧바로
      if (!reduceMotion) puff(person.x, person.y, 'dust', person.y - 1, 2, 1.6);
    } else {
      person.el.classList.add('arrived');
      setTimeout(() => person.el.classList.remove('arrived'), 450);
    }
  };
  const face = (person, dx) => {
    if (Math.abs(dx) > 0.6) person.el.classList.toggle('facing-left', dx < 0);
  };

  // ───────── 효과: 소리·먼지·발자국 ─────────
  const sound = window.LibSound;
  const sfx = (name, ...args) => { if (sound && sound.on) sound[name](...args); };
  const cadence = (kind) => (sound ? sound.cadence(kind) : 0.3);
  const onRug = (x, y) => ((x - 1200) / 540) ** 2 + ((y - 780) / 150) ** 2 < 1 || (x > 1060 && x < 1340 && y > 1222 && y < 1292);
  const restart = (el, cls, ms) => {
    el.classList.remove(cls);
    void el.getBoundingClientRect(); // 같은 효과를 처음부터 다시
    el.classList.add(cls);
    clearTimeout(el[`_${cls}`]);
    el[`_${cls}`] = setTimeout(() => el.classList.remove(cls), ms);
  };
  // 발밑에서 피어오르는 먼지(러그 위에서는 보풀)
  const puff = (x, y, type, z, count = 3, spread = 1) => {
    const el = document.createElement('span');
    el.className = `lib-puff ${type}`;
    el.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;z-index:${Math.round(z)};scale:${depth(y).toFixed(2)}`;
    for (let k = 0; k < count; k++) {
      const bit = document.createElement('i');
      bit.style.setProperty('--a', ((k - (count - 1) / 2) * spread).toFixed(2));
      bit.style.setProperty('--k', String(k));
      el.appendChild(bit);
    }
    world.appendChild(el);
    setTimeout(() => el.remove(), 900);
  };
  // 발자국: 마루에 찍혔다가 천천히 사라진다(느릿은 반짝이는 점액 자국)
  const marks = [];
  const mark = (person, ux, uy) => {
    const kind = person.critter;
    const rug = onRug(person.x, person.y);
    const s = depth(person.y);
    if (!rug) {
      const el = document.createElement('span');
      el.className = kind === 'snail' ? 'lib-slime' : 'lib-print';
      const off = kind === 'snail' ? 0 : (person.foot ? 7 : -7) * s;
      el.style.cssText = `left:${(person.x - uy * off).toFixed(1)}px;top:${(person.y + ux * off * 0.6).toFixed(1)}px;rotate:${Math.atan2(uy * 0.6, ux).toFixed(3)}rad;scale:${s.toFixed(2)}`;
      world.appendChild(el);
      marks.push(el);
      if (marks.length > 110) marks.shift().remove();
      setTimeout(() => { el.remove(); const i = marks.indexOf(el); if (i >= 0) marks.splice(i, 1); }, kind === 'snail' ? 4200 : 2600);
    }
    person.steps = (person.steps || 0) + 1;
    if (!reduceMotion && kind !== 'snail' && person.steps % 3 === 0) puff(person.x - ux * 16, person.y, rug ? 'fluff' : 'dust', person.y - 1);
  };
  // 한 프레임 걸은 만큼: 일정 거리마다 발자국, 꼬깃단마다 다른 박자로 발소리
  const stride = (person, mx, my, dt) => {
    const d = Math.hypot(mx, my);
    if (d < 0.05) return;
    const kind = person.critter;
    person.trail = (person.trail || 0) + d;
    if (person.trail >= (kind === 'snail' ? 24 : kind === 'frog' ? 72 : 44)) {
      person.trail = 0;
      person.foot = !person.foot;
      mark(person, mx / d, my / d);
    }
    person.clock = (person.clock || 0) + dt;
    if (person.clock >= cadence(kind)) {
      person.clock = 0;
      const sp = hear(person);
      sp.soft = onRug(person.x, person.y);
      sfx('step', kind, sp);
    }
  };
  const popWord = (person, word) => {
    if (!word) return;
    const pop = document.createElement('span');
    pop.className = 'lib-pop';
    pop.textContent = word;
    person.el.appendChild(pop);
    setTimeout(() => pop.remove(), 1300);
  };

  // ───────── 앉는 순간·일어서는 순간 ─────────
  const HOP_HEIGHT = { chair: 46, bench: 34, beanbag: 30, cushion: 26 };
  const SIT_WORD = { chair: '털썩', bench: '털썩', beanbag: '폭신', cushion: '폭신' };
  const lit = new Set();
  const updateLamps = (by) => {
    const now = new Set();
    people.forEach((p) => { const seat = p.seated && seatOf(p.seated); if (seat && seat.lamp) now.add(seat.lamp); });
    world.querySelectorAll('.lib-lamp').forEach((el) => {
      const on = now.has(el.dataset.lamp);
      if (on !== lit.has(el.dataset.lamp) && by) sfx('lamp', hear(by));
      el.classList.toggle('on', on);
    });
    lit.clear();
    now.forEach((id) => lit.add(id));
  };
  // 깡충 뛰어 자리로(또는 자리에서 내려와): 발끝 좌표는 미끄러지고, 몸은 포물선으로 뜬다
  // r0·r1: 뛰기 시작할 때와 내려앉을 때 몸이 바닥에서 떠 있는 높이(벤치처럼 높은 자리)
  const startHop = (person, to, height, done, r0 = 0, r1 = 0) => {
    const dist = Math.hypot(to[0] - person.x, to[1] - person.y);
    person.hop = { fx: person.x, fy: person.y, tx: to[0], ty: to[1], t0: performance.now(), dur: reduceMotion ? 1 : 300 + Math.min(260, dist * 0.8), h: reduceMotion ? 0 : height, r0, r1, done };
  };
  const stepHop = (person, now) => {
    const h = person.hop;
    const t = Math.min(1, (now - h.t0) / h.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    person.x = h.fx + (h.tx - h.fx) * e;
    person.y = h.fy + (h.ty - h.fy) * e;
    const lift = Math.sin(Math.PI * t) * h.h + h.r0 + (h.r1 - h.r0) * e;
    person.el.style.setProperty('--lift', `${(-lift).toFixed(1)}px`);
    person.el.style.setProperty('--liftk', (lift / 60).toFixed(3));
    place(person);
    if (t < 0.85) person.el.style.zIndex = String(Math.round(Math.max(h.fy, h.ty))); // 뛰는 동안은 의자 등받이 앞으로
    if (t >= 1) {
      person.hop = null;
      person.el.style.removeProperty('--lift');
      person.el.style.removeProperty('--liftk');
      place(person);
      const next = person.queued;
      person.queued = null;
      if (h.done) h.done();
      if (next) next();
    }
  };
  // 내려앉는 순간: 몸이 납작 눌렸다 튀어 오르고, 의자는 삐걱 흔들리고, 방석은 꺼졌다 부푼다
  const snap = (person) => { // 자리 높이가 바뀌는 순간에는 미끄러지지 않고 딱 맞게
    person.el.classList.add('snap');
    requestAnimationFrame(() => requestAnimationFrame(() => person.el.classList.remove('snap')));
  };
  const land = (person, seat) => {
    person.seated = seat.id;
    snap(person);
    label(person);
    restart(person.el, 'plop', 650);
    const target = world.querySelector(`[data-seat="${seat.id}"]`);
    if (target) restart(target, seat.kind === 'chair' ? 'bump' : 'squish', 700);
    if (!reduceMotion) puff(seat.x, seat.y - (seat.kind === 'chair' ? 4 : 12), seat.kind === 'chair' ? 'dust' : 'fluff', seat.y + 1, 6, 1.4);
    popWord(person, SIT_WORD[seat.kind]);
    sfx('sit', seat.kind, hear(person));
    updateLamps(person);
  };
  const getUp = (person, seat) => {
    person.seated = null;
    snap(person);
    label(person);
    updateLamps(person);
    if (!seat) return;
    const target = world.querySelector(`[data-seat="${seat.id}"]`);
    if (target) restart(target, seat.kind === 'chair' ? 'bump' : 'squish', 700);
    sfx('stand', seat.kind, hear(person));
  };

  // ───────── 나 ─────────
  let me = null;
  let path = null;
  let pending = null; // 도착하면 할 일: { seat } 또는 { hot }
  const keys = new Set();
  let entered = false;
  let greeted = false; // 처음 받은 명단으로는 종을 울리지 않는다

  // ───────── 카메라 ─────────
  let scale = 1;
  let cam = { x: 0, y: 0 };
  const view = () => ({ w: stage.clientWidth / scale, h: stage.clientHeight / scale });
  const resize = () => {
    scale = clamp(Math.min(stage.clientHeight / 1100, stage.clientWidth / 760), 0.38, 0.95);
    if (stage.clientWidth / scale > W) scale = stage.clientWidth / W;
  };
  const camTarget = () => {
    const v = view();
    const fx = me ? me.x : 1200;
    const fy = me ? me.y : 900;
    return { x: clamp(fx - v.w / 2, 0, Math.max(0, W - v.w)), y: clamp(fy - v.h * 0.62, 0, Math.max(0, H - v.h)) };
  };
  const applyCam = () => {
    world.style.transform = `translate3d(${(-cam.x * scale).toFixed(1)}px, ${(-cam.y * scale).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  };
  resize();
  cam = camTarget();
  applyCam();
  window.addEventListener('resize', () => { resize(); cam = camTarget(); applyCam(); });

  // 소리가 나는 자리: 내 화면 가운데서 멀수록 작게, 왼쪽·오른쪽으로 나눠 들린다
  const hear = (person) => {
    if (!person || person === me) return { gain: 1, pan: 0 };
    const v = view();
    const dx = person.x - (cam.x + v.w / 2);
    const dy = person.y - (cam.y + v.h / 2);
    const d = Math.hypot(dx, dy * 1.4);
    return { gain: Math.max(0, 1 - d / 1200) ** 1.5, pan: clamp(dx / (v.w * 0.6), -0.85, 0.85) };
  };

  // ───────── 서버로 보내기 ─────────
  const post = (url, data) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' },
    body: new URLSearchParams(data),
    credentials: 'same-origin',
  });
  let lastSent = 0;
  let sendTimer = null;
  const sendSpot = (now) => {
    if (!me || !entered) return Promise.resolve(null);
    clearTimeout(sendTimer);
    const at = performance.now();
    if (!now && at - lastSent < 180) {
      sendTimer = setTimeout(() => sendSpot(true), 190);
      return Promise.resolve(null);
    }
    lastSent = at;
    const [x, y] = me.hop ? [me.hop.tx, me.hop.ty] : [me.x, me.y];
    const data = { x: (x / W).toFixed(4), y: (y / H).toFixed(4), status: me.status };
    if (me.seat) data.seat = me.seat;
    return post(root.dataset.spot, data).catch(() => null);
  };

  const toast = root.querySelector('.lib-toast');
  let toastTimer = null;
  const say = (text) => {
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('on'), 2600);
  };

  // ───────── 앉기·일어서기 ─────────
  const seatTaken = (id) => [...people.values()].some((p) => p !== me && p.seat === id);
  const nope = (text) => { say(text); sfx('nope'); };
  const sit = (seat) => {
    if (seatTaken(seat.id)) { nope('누가 앉아 있어요'); return; }
    me.seat = seat.id; // 자리부터 잡고(서버에도 바로) 깡충 뛰어오른다
    if (seat.kind === 'bench' || seat.kind === 'chair') me.el.classList.remove('facing-left');
    startHop(me, [seat.x, seat.y], HOP_HEIGHT[seat.kind], () => land(me, seat), 0, seat.rise || 0);
    sendSpot(true).then((response) => {
      if (!response || response.status !== 409 || me.seat !== seat.id) return;
      me.seat = null;
      const back = () => { const up = me.seated ? seat.rise || 0 : 0; if (me.seated) getUp(me, seat); startHop(me, seat.from, 26, () => sendSpot(true), up); };
      if (me.hop) me.hop.done = back; else back();
      nope('한발 늦었어요. 누가 먼저 앉았어요');
    });
  };
  const stand = (then = null) => {
    if (!me.seat) { if (then) then(); return; }
    const seat = seatOf(me.seat);
    const up = me.seated && seat ? seat.rise || 0 : 0;
    me.seat = null;
    getUp(me, seat);
    startHop(me, seat ? seat.from : [me.x, me.y + 30], 24, () => { sendSpot(true); if (then) then(); }, up);
    sendSpot(true);
  };
  const goTo = (target, then = null) => {
    if (!me) return null;
    if (me.hop) { me.queued = () => goTo(target, then); return null; }
    if (me.seat) { stand(() => goTo(target, then)); return null; }
    const spot = nearestFree(target[0], target[1]);
    if (!spot) return null;
    path = findPath([me.x, me.y], spot);
    pending = then;
    if (!path) { pending = null; nope('거기는 갈 수 없어요'); return null; }
    return spot;
  };
  const goSit = (seat) => {
    if (me.seat === seat.id) return;
    if (seatTaken(seat.id)) { nope('누가 앉아 있어요'); return; }
    clearGoal();
    goTo(seat.from, { seat });
  };
  // 바닥을 누른 곳에 꽂히는 작은 깃발: 도착하면 사라진다
  let goal = null;
  const clearGoal = () => {
    if (!goal) return;
    const old = goal;
    goal = null;
    old.classList.add('done');
    setTimeout(() => old.remove(), 300);
  };
  const showGoal = (x, y) => {
    clearGoal();
    goal = document.createElement('span');
    goal.className = 'lib-goal';
    goal.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;scale:${depth(y).toFixed(2)}`;
    world.appendChild(goal);
  };
  const nearestSeat = () => {
    let best = null;
    SEATS.forEach((seat) => {
      const d = Math.hypot(seat.x - me.x, seat.y - me.y);
      if (!seatTaken(seat.id) && d < 260 && (!best || d < best.d)) best = { seat, d };
    });
    return best && best.seat;
  };

  // ───────── 쪽지(가구를 눌렀을 때) ─────────
  const card = root.querySelector('.lib-card');
  const openCard = (name) => {
    const template = root.querySelector(`template[data-card="${name}"]`);
    if (!template) return;
    const body = card.querySelector('.lib-card-body');
    body.replaceChildren(template.content.cloneNode(true));
    card.hidden = false;
    sfx('paper', true);
    card.querySelector('.lib-card-close').focus({ preventScroll: true });
  };
  const closeCard = () => { if (!card.hidden) sfx('paper', false); card.hidden = true; stage.focus({ preventScroll: true }); };
  card.querySelector('.lib-card-close').addEventListener('click', closeCard);

  // ───────── 몸짓 ─────────
  const ACT_LABEL = { bow: '꾸벅', stretch: '으쌰', flip: '사락', jump: '폴짝' };
  const play = (person, act) => {
    if (!person) return;
    const el = person.el;
    el.classList.remove('act-bow', 'act-stretch', 'act-flip', 'act-jump');
    void el.offsetWidth;
    el.classList.add(`act-${act}`);
    sfx('act', act, hear(person));
    const pop = document.createElement('span');
    pop.className = 'lib-pop';
    pop.textContent = ACT_LABEL[act] || '';
    el.appendChild(pop);
    if (act === 'flip') {
      for (let i = 0; i < 4; i++) {
        const paper = document.createElement('span');
        paper.className = 'lib-paper';
        paper.style.setProperty('--i', String(i));
        el.appendChild(paper);
        setTimeout(() => paper.remove(), 1400);
      }
    }
    setTimeout(() => { el.classList.remove(`act-${act}`); pop.remove(); }, 1300);
  };
  const act = (name) => {
    if (!me) return;
    play(me, name);
    post(root.dataset.act, { act: name }).catch(() => {});
  };

  // ───────── 말풍선 ─────────
  const bubble = (person, text) => {
    const b = person.el.querySelector('.lib-bubble');
    b.textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    b.hidden = false;
    sfx('pop', hear(person));
    b.classList.remove('fade');
    clearTimeout(b._timer);
    b._timer = setTimeout(() => { b.classList.add('fade'); setTimeout(() => { b.hidden = true; }, 400); }, 7000);
  };

  // ───────── 함께 있는 사람 목록 ─────────
  const list = root.querySelector('.lib-people-list');
  const renderPeople = () => {
    const rows = [...people.values()].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
    list.replaceChildren(...rows.map((person) => {
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = faceOf(person.id)?.dataset.name || '';
      const what = document.createElement('small');
      what.textContent = (person === me ? '나 · ' : '') + (STATUS[person.status] || STATUS.read);
      li.append(name, what);
      return li;
    }));
    root.querySelector('.lib-count').textContent = String(people.size);
    document.title = `${people.size}명 머무는 중 · 꼬깃 서고`;
  };
  if (window.innerWidth < 720) { // 좁은 화면에서는 접어 둔다
    root.querySelector('.lib-people-toggle').setAttribute('aria-expanded', 'false');
    list.hidden = true;
  }
  root.querySelector('.lib-people-toggle').addEventListener('click', (event) => {
    const open = event.currentTarget.getAttribute('aria-expanded') !== 'true';
    event.currentTarget.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  });

  // ───────── 실시간 ─────────
  const applySpot = (data, snap) => {
    const id = Number(data.contributorId);
    if (id === meId) return;
    const person = people.get(id) || createPerson(id);
    if (!person) return;
    // 3D 서고의 다른 장소(옥상)나 다락에 있는 사람은 2D 바닥에 없다
    person.el.hidden = Boolean((data.place && data.place !== 'hall') || Number(data.level) > 0);
    if (person.el.hidden) return;
    const before = person.seat;
    person.tx = data.x * W; person.ty = data.y * H;
    person.seat = data.seat || null;
    person.status = data.status || 'read';
    if (snap || !person.placed) {
      person.hop = null;
      person.x = person.tx; person.y = person.ty; person.placed = true; person.seated = person.seat;
      place(person);
    } else if (before !== person.seat) { // 앉거나 일어섰다: 나와 똑같이 깡충
      const seat = seatOf(person.seat);
      const old = person.seated ? seatOf(person.seated) : null;
      if (old) getUp(person, old);
      startHop(person, [person.tx, person.ty], seat ? HOP_HEIGHT[seat.kind] : 24, seat ? () => land(person, seat) : null, (old && old.rise) || 0, (seat && seat.rise) || 0);
    }
    label(person);
  };
  const applyLibrary = (library) => {
    const here = new Set((library.here || []).map(Number));
    [...people.keys()].forEach((id) => {
      if (id !== meId && !here.has(id)) { // 나간 사람은 먼지 한 줌 남기고 사라진다
        const gone = people.get(id);
        people.delete(id);
        if (!reduceMotion) puff(gone.x, gone.y, 'dust', gone.y + 1, 5, 1.2);
        gone.el.classList.add('leaving');
        setTimeout(() => gone.el.remove(), 400);
        updateLamps();
      }
    });
    here.forEach((id) => {
      if (id === meId || people.has(id)) return;
      const person = createPerson(id);
      if (person) { // 아직 걷지 않은 사람은 입구 매트 근처에 선다
        person.x = person.tx = 1120 + (id % 9) * 20; person.y = person.ty = 1190; person.placed = true;
        place(person); label(person);
        if (greeted) { sfx('bell', { gain: 0.4 }); if (!reduceMotion) puff(person.x, person.y, 'fluff', person.y + 1, 5, 1.2); }
      }
    });
    Object.values(library.spots || {}).forEach((spot) => applySpot(spot, true));
    greeted = true;
    updateLamps();
    renderPeople();
  };
  const connect = () => {
    const source = new EventSource(root.dataset.stream);
    const parse = (event) => { try { return JSON.parse(event.data); } catch (e) { return null; } };
    source.addEventListener('hello', (event) => {
      const data = parse(event);
      if (data && data.library) applyLibrary(data.library);
      sendSpot(true);
    });
    source.addEventListener('library', (event) => { const data = parse(event); if (data) applyLibrary(data); });
    source.addEventListener('library-move', (event) => { const data = parse(event); if (data) { applySpot(data, false); renderPeople(); } });
    source.addEventListener('library-act', (event) => {
      const data = parse(event);
      if (data && Number(data.contributorId) !== meId) play(people.get(Number(data.contributorId)), data.act);
    });
    source.addEventListener('message', (event) => {
      const data = parse(event);
      if (!data) return;
      const person = people.get(Number(data.contributorId));
      if (person) bubble(person, data.body || '');
      else say(`모임방 · ${faceOf(data.contributorId)?.dataset.name || '누군가'}: ${(data.body || '').slice(0, 40)}`);
    });
    source.addEventListener('avatar', (event) => {
      const data = parse(event);
      const person = data && people.get(Number(data.contributorId));
      if (person) { person.el.querySelector('.avatar').innerHTML = data.svg; person.critter = critterOf(person.el); }
      const template = data && faceOf(data.contributorId);
      if (template) template.content.firstElementChild.innerHTML = data.svg;
    });
  };

  // ───────── 움직임(매 프레임) ─────────
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (me && me.hop) {
      setWalking(me, false);
      stepHop(me, now);
    } else if (me) {
      let dx = 0; let dy = 0;
      if (keys.has('left')) dx -= 1;
      if (keys.has('right')) dx += 1;
      if (keys.has('up')) dy -= 1;
      if (keys.has('down')) dy += 1;
      let moved = false;
      const ox = me.x; const oy = me.y;
      // 처음 몇 걸음은 천천히, 금방 제 속도로
      me.v = dx || dy || (path && path.length) ? Math.min(1, (me.v || 0) + dt * 4) : 0;
      const speed = SPEED * (0.45 + 0.55 * (1 - (1 - me.v) ** 2));
      if ((dx || dy) && me.seat) {
        stand();
      } else if (dx || dy) {
        path = null; pending = null; clearGoal();
        const len = Math.hypot(dx, dy);
        const nx = me.x + (dx / len) * speed * dt;
        const ny = me.y + (dy / len) * speed * 0.8 * dt;
        if (free(nx, ny)) { me.x = nx; me.y = ny; moved = true; }
        else if (free(nx, me.y)) { me.x = nx; moved = true; }
        else if (free(me.x, ny)) { me.y = ny; moved = true; }
        face(me, dx);
      } else if (path && path.length) {
        const [tx, ty] = path[0];
        const ddx = tx - me.x; const ddy = ty - me.y;
        const dist = Math.hypot(ddx, ddy);
        const step = speed * dt;
        face(me, ddx); // 앉을 때 앞을 보게 돌려 놓으므로 그보다 먼저
        if (dist <= step) {
          me.x = tx; me.y = ty; path.shift();
          if (!path.length) {
            path = null;
            clearGoal();
            const todo = pending; pending = null;
            if (todo && todo.seat) sit(todo.seat);
            if (todo && todo.hot) openCard(HOTSPOTS[todo.hot].card);
          }
        } else {
          me.x += (ddx / dist) * step; me.y += (ddy / dist) * step;
        }
        moved = true;
      }
      if (moved) { place(me); stride(me, me.x - ox, me.y - oy, dt); sendSpot(false); }
      if (!moved && me.walking) sendSpot(true);
      setWalking(me, moved && !me.hop);
    }
    people.forEach((person) => {
      if (person === me) return;
      if (person.hop) { setWalking(person, false); stepHop(person, now); return; }
      const ddx = person.tx - person.x; const ddy = person.ty - person.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > 700) { person.x = person.tx; person.y = person.ty; place(person); setWalking(person, false); return; }
      if (dist > 1.5) {
        const step = Math.min(dist, SPEED * 1.15 * dt);
        person.x += (ddx / dist) * step; person.y += (ddy / dist) * step;
        face(person, ddx);
        place(person);
        setWalking(person, !person.seat);
        if (!person.seat) stride(person, (ddx / dist) * step, (ddy / dist) * step, dt);
      } else {
        setWalking(person, false);
      }
    });
    const target = camTarget();
    const k = reduceMotion ? 1 : 1 - Math.pow(0.0025, dt);
    cam.x += (target.x - cam.x) * k; cam.y += (target.y - cam.y) * k;
    applyCam();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // ───────── 입력 ─────────
  const toWorld = (event) => {
    const rect = stage.getBoundingClientRect();
    return [cam.x + (event.clientX - rect.left) / scale, cam.y + (event.clientY - rect.top) / scale];
  };
  stage.addEventListener('click', (event) => {
    if (!me) return;
    const seatEl = event.target.closest('[data-seat]');
    if (seatEl) { const seat = SEATS.find((s) => s.id === seatEl.dataset.seat); if (seat) { goSit(seat); return; } }
    const hot = event.target.closest('[data-hot]');
    if (hot) { goTo(HOTSPOTS[hot.dataset.hot].at, { hot: hot.dataset.hot }); return; }
    const [x, y] = toWorld(event);
    const spot = goTo([x, y]);
    if (spot) showGoal(spot[0], spot[1]);
    else if (me.seat || me.hop) showGoal(...(nearestFree(x, y) || [x, y]));
    sfx('tick');
    const ring = document.createElement('span');
    ring.className = 'lib-click';
    ring.style.cssText = `left:${x}px;top:${y}px`;
    world.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  });
  stage.addEventListener('keydown', (event) => {
    const hot = event.target.closest && event.target.closest('[data-hot]');
    if (hot && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); goTo(HOTSPOTS[hot.dataset.hot].at, { hot: hot.dataset.hot }); }
  });
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const typing = (event) => event.target.closest('input, textarea, select');
  document.addEventListener('keydown', (event) => {
    if (!me || typing(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && !card.hidden) { closeCard(); return; }
    const dir = KEYMAP[event.key];
    if (dir) { keys.add(dir); event.preventDefault(); return; }
    const k = event.key.toLowerCase();
    if (k === 'z') { if (me.seat) stand(); else { const seat = nearestSeat(); if (seat) goSit(seat); else nope('가까운 빈자리가 없어요'); } }
    else if (k === 'e') act('bow');
    else if (k === 'q') act('stretch');
    else if (k === 'r') act('flip');
    else if (event.key === 'Enter') { event.preventDefault(); root.querySelector('.lib-say input').focus(); }
  });
  document.addEventListener('keyup', (event) => { const dir = KEYMAP[event.key]; if (dir) keys.delete(dir); });
  window.addEventListener('blur', () => keys.clear());

  root.querySelector('.lib-bar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-do]');
    if (!button || !me) return;
    const what = button.dataset.do;
    if (what === 'sit') { if (me.seat) stand(); else { const seat = nearestSeat(); if (seat) goSit(seat); else nope('가까운 빈자리가 없어요. 의자나 방석을 눌러 보세요'); } }
    else if (what === 'music') { setMusic(!music); keep('music', music); }
    else if (what === 'sfx') { setSfx(!(sound && sound.on)); keep('sfx', Boolean(sound && sound.on)); sfx('pop', {}); }
    else if (what === 'gait') toggleGait(button);
    else act(what);
  });
  root.querySelector('.lib-status select').addEventListener('change', (event) => {
    if (!me) return;
    me.status = event.target.value;
    label(me); renderPeople(); sendSpot(true);
    sfx('scribble');
    stage.focus({ preventScroll: true });
  });

  // 한마디: 모임방 대화로 보낸다(서고 사람에겐 말풍선, 모임방·펫엔 대화로)
  const sayForm = root.querySelector('.lib-say');
  sayForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = sayForm.querySelector('input');
    const body = input.value.trim();
    if (!body) { stage.focus({ preventScroll: true }); return; }
    input.value = '';
    try {
      const response = await post(root.dataset.say, { body });
      if (!response.ok) { const result = await response.json().catch(() => ({})); say(result.message || '보내지 못했어요'); input.value = body; }
    } catch (error) { say('연결이 끊겨 보내지 못했어요'); input.value = body; }
  });

  // ───────── 소리·걸음 효과·시간 ─────────
  // 배경음은 시간대마다 다르게 섞고, 멀리서 책장 넘기는 소리가 가끔 들린다. 효과음은 따로 켜고 끈다.
  // 고른 것은 이 브라우저에 기억한다(끈 것만 적어 둔다).
  const MIX = {
    dawn: { grass: 0.28, piano: 0.4, writing: 0.15 },
    day: { piano: 0.42, writing: 0.24, grass: 0.16, noise: 0.08 },
    dusk: { piano: 0.4, city: 0.18, writing: 0.2 },
    night: { rain: 0.42, piano: 0.34, writing: 0.14 },
  };
  const wants = (what) => { try { return localStorage.getItem(`lib-${what}`) !== 'off'; } catch (e) { return true; } };
  const keep = (what, on) => { try { if (on) localStorage.removeItem(`lib-${what}`); else localStorage.setItem(`lib-${what}`, 'off'); } catch (e) { /* 이번만 */ } };
  let music = false;
  let tod = 'day';
  let murmur = null;
  const paintSound = () => {
    root.querySelector('[data-do="music"]').setAttribute('aria-pressed', String(music));
    root.querySelector('[data-do="sfx"]').setAttribute('aria-pressed', String(Boolean(sound && sound.on)));
  };
  const setMusic = (on) => {
    const ambience = window.Ambience;
    if (on && !ambience) { say('이 브라우저에서는 소리를 낼 수 없어요'); on = false; }
    music = on;
    if (ambience) { if (on) ambience.scene(MIX[tod]); else ambience.clear(); }
    clearTimeout(murmur);
    const again = () => { murmur = setTimeout(() => { if (music) { sfx('distant'); again(); } }, 6000 + Math.random() * 9000); };
    if (on) again();
    paintSound();
  };
  const setSfx = (on) => {
    if (on && !sound) { say('이 브라우저에서는 소리를 낼 수 없어요'); on = false; }
    if (sound) sound.enable(on);
    paintSound();
  };
  const gaitButton = root.querySelector('[data-do="gait"]');
  const paintGait = () => gaitButton.setAttribute('aria-pressed', String(document.documentElement.dataset.gait === 'on'));
  const toggleGait = () => {
    const on = document.documentElement.dataset.gait !== 'on';
    if (on) document.documentElement.dataset.gait = 'on'; else delete document.documentElement.dataset.gait;
    try { if (on) localStorage.setItem('gait', 'on'); else localStorage.removeItem('gait'); } catch (e) { /* 이번만 */ }
    paintGait();
  };
  paintGait();
  const timeOfDay = () => {
    const hour = new Date().getHours();
    const next = hour >= 5 && hour < 8 ? 'dawn' : hour < 17 && hour >= 8 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
    root.classList.remove('tod-dawn', 'tod-day', 'tod-dusk', 'tod-night');
    root.classList.add(`tod-${next}`);
    if (next !== tod) { tod = next; if (music && window.Ambience) window.Ambience.scene(MIX[tod]); }
  };
  timeOfDay();
  setInterval(timeOfDay, 5 * 60 * 1000);

  root.querySelector('[data-lib="stars"]').addEventListener('click', () => { sfx('twinkle'); openCard('stars'); });

  // ───────── 들어가기 ─────────
  const gate = root.querySelector('.lib-gate');
  const gateSound = root.querySelector('[data-lib="sound"]');
  if (gateSound) gateSound.checked = wants('music') || wants('sfx');
  root.querySelector('[data-lib="enter"]').addEventListener('click', () => {
    if (entered) return;
    entered = true;
    // 소리: 문 앞에서 고른 대로(들어가기를 누르는 순간이라 브라우저가 소리를 허락한다)
    const withSound = !gateSound || gateSound.checked;
    if (!withSound) { keep('music', false); keep('sfx', false); }
    else if (!wants('music') && !wants('sfx')) { keep('music', true); keep('sfx', true); }
    setSfx(withSound && wants('sfx'));
    setMusic(withSound && wants('music'));
    sfx('bell', {});
    me = createPerson(meId);
    me.x = 1140 + Math.random() * 120; me.y = 1185; me.placed = true;
    place(me); label(me);
    if (!reduceMotion) puff(me.x, me.y, 'fluff', me.y + 1, 5, 1.2);
    cam = camTarget(); applyCam();
    gate.classList.add('gone');
    setTimeout(() => { gate.hidden = true; }, 500);
    root.classList.add('entered');
    renderPeople();
    connect();
    stage.focus({ preventScroll: true });
    setTimeout(() => root.querySelector('.lib-hint').classList.add('fade'), 9000);
  });
  };
  if (document.documentElement.dataset.lib === '3d') { window.startLibrary2D = start; return; }
  start();
})();
