// 꼬깃 서고 3D: 종이 디오라마.
// 서고는 three.js로 짓는다(앞이 트인 장난감 상자 같은 방). 꼬깃단은 지금 그림 그대로 종이 인형으로 세운다.
// 인형은 아래쪽(다리)이 접혀서 의자에 앉고, 이불·해먹에는 눕는다. 카메라는 끌어서 돌리고 굴려서 당긴다.
// 장소(place)는 여럿이고 문으로 오간다(큰 서고 ↔ 옥상 정원, 오른쪽 벽 문은 모임방).
// 서버에는 장소마다 바닥 0~1 비율 좌표와 층(level)·자세(pose)를 보낸다. 큰 서고 바닥 좌표·자리 이름은 2D 서고와 같다.
// (큰 서점 광장의 분위기만 빌린 원래 그림이다. 실제 장소의 이름·로고·사진은 쓰지 않는다)
import * as THREE from './vendor/three-0.170.0.module.min.js';

const root = document.getElementById('library');
if (root && document.documentElement.dataset.lib === '3d') {
  try {
    start();
  } catch (error) {
    console.error(error); // 3D를 못 띄우면 2D 서고로
    document.documentElement.dataset.lib = '2d';
    root.querySelector('.lib-canvas')?.remove();
    root.querySelector('.lib3-labels')?.remove();
    window.startLibrary2D?.();
  }
}

function start() {
  // ───────── 기본값 ─────────
  const INK = 0x2e241c;
  const LOFT_Y = 3.0; // 다락 바닥 높이(m)
  const DOLL = 1.7; // 종이 인형 판 크기(그림은 정사각형)
  const HINGE = 0.2; // 아래 20%가 다리: 앉으면 앞으로 접힌다
  const SPEED = 3.3; // 걷는 빠르기(m/초)
  const meId = Number(root.dataset.me);
  const stage = root.querySelector('.lib-stage');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
  const turn = (from, to) => { let d = (to - from) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const seeded = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const HAND = "'Nanum Pen Script', cursive";
  const BOOK_COLORS = ['#C9604A', '#E3A857', '#6E8B74', '#4F6D8A', '#B98DB5', '#D9C7A7', '#8C5A3C', '#2F4858', '#E4572E', '#9BB7D4', '#F2D16B', '#7A9E7E', '#D98C6C', '#5B7F95'];

  // ───────── 그리기 재료: 캔버스 무늬 ─────────
  const canvasTex = (w, h, draw, { repeat = null, srgb = true } = {}) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    t.userData.draw = (fn) => { fn(c.getContext('2d'), w, h); t.needsUpdate = true; };
    return t;
  };
  // 종이 결: 모든 색 위에 아주 옅게 깔린다
  const grain = canvasTex(128, 128, (g, w, h) => {
    const img = g.createImageData(w, h);
    const rand = seeded(5);
    for (let i = 0; i < img.data.length; i += 4) { const v = 228 + rand() * 27; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 4; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, { repeat: [3, 3] });
  const gradient = new THREE.DataTexture(new Uint8Array([105, 180, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const glowTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const blobTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(46,28,14,.55)'); r.addColorStop(0.6, 'rgba(46,28,14,.25)'); r.addColorStop(1, 'rgba(46,28,14,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const pawTex = canvasTex(64, 48, (g) => {
    g.fillStyle = 'rgba(86,54,30,.5)';
    g.beginPath(); g.ellipse(22, 24, 11, 13, 0, 0, Math.PI * 2); g.fill();
    [[44, 10], [50, 24], [44, 38]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); });
  });
  const slimeTex = canvasTex(128, 32, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 32);
    r.addColorStop(0, 'rgba(225,242,255,.75)'); r.addColorStop(1, 'rgba(150,196,226,.25)');
    g.fillStyle = r; g.beginPath(); g.ellipse(64, 16, 60, 11, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 11); g.lineTo(90, 11); g.stroke();
  });
  const puffTex = canvasTex(64, 64, (g) => {
    g.fillStyle = 'rgba(255,250,240,1)'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(46,36,28,.25)'; g.lineWidth = 3; g.stroke();
  });
  const signs = []; // 글씨가 든 무늬(손글씨 글꼴이 늦게 오면 다시 그린다)
  const signTex = (text, { w = 512, h = 160, bg = '#8A5A3B', fg = '#FFF3DC', size = 92 } = {}) => {
    const draw = (g) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = bg; g.beginPath(); if (g.roundRect) g.roundRect(6, 6, w - 12, h - 12, 22); else g.rect(6, 6, w - 12, h - 12); g.fill();
      g.strokeStyle = '#2E241C'; g.lineWidth = 9; g.stroke();
      g.fillStyle = fg; g.font = `${size}px ${HAND}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 6);
    };
    const t = canvasTex(w, h, draw);
    signs.push(() => t.userData.draw(draw));
    return t;
  };
  document.fonts?.ready.then(() => signs.forEach((redraw) => redraw()));

  // ───────── 재료와 모양 ─────────
  const mats = new Map();
  const toon = (color, extra = {}) => {
    const key = `${color}|${extra.map ? extra.map.uuid : ''}|${extra.side || ''}|${extra.emissive || ''}`;
    if (!extra.unique && mats.has(key)) return mats.get(key);
    const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, map: extra.map || grain, side: extra.side || THREE.FrontSide });
    if (extra.emissive) { m.emissive = new THREE.Color(extra.emissive); m.emissiveIntensity = extra.emissiveIntensity ?? 1; }
    if (!extra.unique) mats.set(key, m);
    return m;
  };
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  // 손그림 윤곽: 같은 모양을 조금 키워 뒷면만 먹색으로 그린다
  const solid = (geo, color, { line = 0.03, cast = true, receive = true, mat = null } = {}) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, mat || toon(color));
    m.castShadow = cast; m.receiveShadow = receive;
    g.add(m);
    if (line) {
      geo.computeBoundingBox();
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      const o = new THREE.Mesh(geo, inkMat);
      o.scale.set(size.x > 0.001 ? (size.x + line * 2) / size.x : 1, size.y > 0.001 ? (size.y + line * 2) / size.y : 1, size.z > 0.001 ? (size.z + line * 2) / size.z : 1);
      g.add(o);
    }
    return g;
  };
  const box = (parent, w, h, d, color, x, y, z, o = {}) => {
    const s = solid(new THREE.BoxGeometry(w, h, d), color, o);
    s.position.set(x, y + h / 2, z);
    if (o.ry) s.rotation.y = o.ry;
    parent.add(s);
    return s;
  };
  const cyl = (parent, rt, rb, h, color, x, y, z, o = {}) => {
    const s = solid(new THREE.CylinderGeometry(rt, rb, h, o.seg || 22), color, o);
    s.position.set(x, y + h / 2, z);
    parent.add(s);
    return s;
  };
  const plane = (parent, w, h, mat, x, y, z, o = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    if (o.rx !== undefined) m.rotation.x = o.rx;
    if (o.ry !== undefined) m.rotation.y = o.ry;
    m.receiveShadow = o.receive !== false;
    parent.add(m);
    return m;
  };
  const glow = (parent, color, size, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(size, size, 1); s.position.set(x, y, z);
    parent.add(s);
    return s;
  };
  // 눌러서 쓰는 것들(바닥·자리·가구·문)에 표시를 단다
  const mark = (P, obj, data) => {
    obj.traverse((child) => { if (child.isMesh && child.material !== inkMat) { child.userData = { ...child.userData, ...data }; P.pick.push(child); } });
    return obj;
  };
  const block = (P, obj) => { obj.traverse((child) => { if (child.isMesh && child.material !== inkMat) P.blockers.push(child); }); return obj; };

  // 책장 앞면: 책등을 그린 무늬
  const booksTexture = (wm, hm, rows, seed) => canvasTex(Math.min(2048, Math.round(wm * 120)), Math.min(2048, Math.round(hm * 120)), (g, w, h) => {
    const rand = seeded(seed);
    g.fillStyle = '#3B2618'; g.fillRect(0, 0, w, h);
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      const base = (r + 1) * rowH - 12;
      let x = 8;
      while (x < w - 12) {
        if (rand() < 0.06) { x += 14 + rand() * 30; continue; }
        const bw = 9 + Math.round(rand() * 13);
        const bh = rowH * (0.5 + rand() * 0.36);
        const lean = rand() < 0.05 ? (rand() < 0.5 ? -0.16 : 0.16) : 0;
        g.save();
        g.translate(x + (lean > 0 ? bw : 0), base);
        g.rotate(lean);
        g.fillStyle = BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)];
        g.fillRect(lean > 0 ? -bw : 0, -bh, bw, bh);
        g.strokeStyle = '#2E241C'; g.lineWidth = 2; g.strokeRect(lean > 0 ? -bw : 0, -bh, bw, bh);
        if (bw > 12 && rand() < 0.6) { g.fillStyle = 'rgba(255,246,230,.55)'; g.fillRect((lean > 0 ? -bw : 0) + 2, -bh + 8, bw - 4, 2); g.fillRect((lean > 0 ? -bw : 0) + 2, -12, bw - 4, 2); }
        g.restore();
        x += bw + (lean ? 8 : 1.5);
      }
      g.fillStyle = '#A4734F'; g.fillRect(0, base, w, 12);
      g.strokeStyle = '#2E241C'; g.lineWidth = 3; g.strokeRect(-2, base, w + 4, 12);
    }
    const cols = Math.max(1, Math.round(w / 260));
    for (let c = 1; c < cols; c++) { const cx = (w / cols) * c; g.fillStyle = '#8A5A3B'; g.fillRect(cx - 6, 0, 12, h); g.strokeStyle = '#2E241C'; g.lineWidth = 3; g.strokeRect(cx - 6, -2, 12, h + 4); }
    g.strokeStyle = '#2E241C'; g.lineWidth = 8; g.strokeRect(0, 0, w, h);
  });
  const shelfFace = (P, parent, wm, hm, rows, seed, x, y, z, ry = 0) => {
    const m = plane(parent, wm, hm, toon(0xffffff, { map: booksTexture(wm, hm, rows, seed) }), x, y + hm / 2, z, { ry });
    block(P, m);
    return m;
  };

  // 하늘: 시간대마다 다시 그린다(창 밖, 옥상 하늘)
  const TOD_SKY = {
    dawn: ['#E9B7C4', '#FBE3C2'], day: ['#8CC4EA', '#F4EFDC'], dusk: ['#7C68A6', '#F4A26B'], night: ['#121A33', '#33406A'],
  };
  const skyDraw = (tod, withCity) => (g, w, h) => {
    const [top, bottom] = TOD_SKY[tod];
    const r = g.createLinearGradient(0, 0, 0, h);
    r.addColorStop(0, top); r.addColorStop(1, bottom);
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    const rand = seeded(17);
    if (tod === 'night') { g.fillStyle = '#FFF6D8'; for (let i = 0; i < 90; i++) { g.globalAlpha = 0.4 + rand() * 0.6; g.fillRect(rand() * w, rand() * h * 0.7, 2, 2); } g.globalAlpha = 1; }
    else { g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 6; i++) { const cx = rand() * w; const cy = 40 + rand() * h * 0.4; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + k * 22 - 44, cy + Math.sin(k) * 6, 30, 16, 0, 0, Math.PI * 2); g.fill(); } } }
    if (withCity) {
      let x = 0;
      while (x < w) {
        const bw = 30 + rand() * 60; const bh = 40 + rand() * 120;
        g.fillStyle = tod === 'night' ? '#1E2640' : tod === 'dusk' ? '#5E4E6E' : '#C5D2DA';
        g.fillRect(x, h - bh, bw, bh);
        if (tod === 'night' || tod === 'dusk') { g.fillStyle = '#FFD27A'; for (let wy = h - bh + 10; wy < h - 8; wy += 16) for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (rand() < 0.35) g.fillRect(wx, wy, 5, 7); }
        x += bw + 4;
      }
    }
  };

  // ───────── 장소(Multiverse식: 장소마다 장면·길·자리·문·시간대를 따로 둔다) ─────────
  const STAIR = { x0: -11.95, x1: -10.75, zBottom: 0.85, zTop: -5.6 }; // 왼쪽 벽 계단: 앞(z 큰 쪽)에서 올라가 다락에 닿는다
  const PLACES = {};
  const newPlace = (id, name, def) => {
    const scene = new THREE.Scene();
    const P = { id, name, scene, pick: [], blockers: [], walls: [], seats: [], hots: {}, portals: [], lamps: {}, tick: [], ...def };
    P.seatById = (sid) => P.seats.find((s) => s.id === sid) || null;
    PLACES[id] = P;
    return P;
  };

  // 큰 서고: 24m×16m. 바닥 좌표는 2D 서고(2400×1450 그림의 바닥 540~1262)와 같은 자리로 바뀐다.
  const hall = newPlace('hall', '큰 서고', {
    toRatio: (x, z) => [(x + 12) / 24, (540 + ((z + 8) / 16) * 722) / 1450],
    fromRatio: (rx, ry) => [rx * 24 - 12, ((ry * 1450 - 540) / 722) * 16 - 8],
    bounds: [-12, -8, 12, 8],
    spawn: () => [-0.6 + Math.random() * 1.2, 7.1],
    stairs: STAIR,
    layers: {
      0: {
        rect: [-11.85, -7.0, 10.9, 7.75], // 왼쪽 끝은 계단 앞 층계참까지
        blocks: [
          { r: [-12, -8, -4.6, -5.6] }, { r: [4.6, -8, 12, -7.0] }, { r: [-4.4, -8, 4.4, -7.25] }, // 다락 밑 책장, 오른쪽 책장, 창가 벤치
          { r: [STAIR.x0 - 0.1, STAIR.zTop - 0.1, STAIR.x1 + 0.12, STAIR.zBottom], tight: true }, // 계단 옆·밑은 못 지나간다(앞에서만 오른다)
          { r: [5.8, -7.0, 6.6, -6.35] }, // 사다리
          { r: [-12, 2.6, -11.4, 7.7] }, // 왼쪽 벽 책장(계단 앞은 비워 둔다)
          { e: [0, -3.92, 1.95, 1.3] }, // 펼친 책 조형물
          { r: [-8.5, 1.35, -2.5, 2.75] }, { r: [2.5, 1.35, 8.5, 2.75] }, // 열람 테이블
          { r: [-9.95, -1.85, -8.45, -1.35] }, { r: [6.7, -1.95, 8.5, -1.1] }, // 게시판, 북 카트
          { c: [-10.4, 6.9, 0.45] }, { c: [10.4, 6.9, 0.45] }, { c: [10.3, -6.4, 0.45] }, // 화분
          ...[-7.7, -6.3, -4.9, -3.5, 3.5, 4.9, 6.3, 7.7].map((x) => ({ c: [x, 1.086, 0.3] })), // 의자
          { c: [-8.7, -4.68, 0.75] }, { c: [8.7, -4.68, 0.75] }, { c: [-1.9, -1.57, 0.42] }, { c: [1.9, -1.57, 0.42] }, // 빈백, 러그 방석
        ],
      },
      1: { rect: [-11.85, -7.42, -4.75, -5.62], blocks: [{ r: [-10.35, -7.42, -8.05, -6.2] }, { c: [-5.1, -7.2, 0.28] }, { c: [-6.9, -6.7, 0.38] }, { c: [-5.7, -6.7, 0.38] }] }, // 다락: 이불, 스탠드, 방석
    },
  });
  // 옥상 정원: 16m×10m
  const roof = newPlace('roof', '옥상 정원', {
    toRatio: (x, z) => [(x + 8) / 16, (z + 5) / 10],
    fromRatio: (rx, ry) => [rx * 16 - 8, ry * 10 - 5],
    bounds: [-8, -5, 8, 5],
    spawn: () => [-6.2, -2.3],
    stairs: null,
    layers: {
      0: {
        rect: [-7.5, -4.55, 7.5, 4.55],
        blocks: [
          { r: [-7.8, -5.2, -4.65, -3.15] }, // 계단 집
          { r: [0.05, -3.95, 3.15, -2.85] }, { r: [3.85, -3.95, 6.95, -2.85] }, // 해먹
          { r: [-3.4, 3.15, -0.6, 3.7] }, // 벤치
          { c: [6.05, 3.25, 0.35] }, { r: [7.0, -2.0, 7.9, 2.6] }, { c: [-7.1, 4.1, 0.4] }, // 망원경, 화단, 화분
          { c: [-1.0, 1.0, 0.45] }, // 작은 탁자
        ],
      },
    },
  });

  // 자리: kind(chair·bench·beanbag·cushion은 앉기, futon·hammock은 눕기), top(앉는 면 높이), yaw(바라보는 쪽), from(다가가 서는 곳)
  const seat = (P, s) => { P.seats.push({ level: 0, lie: s.kind === 'futon' || s.kind === 'hammock', ...s }); };
  [-3.4, -2.1, 2.1, 3.4].forEach((x, i) => seat(hall, { id: `bench-${i + 1}`, kind: 'bench', x, z: -7.6, top: 0.47, yaw: 0, from: [x, -6.7] }));
  [-7.7, -6.3, -4.9, -3.5].forEach((x, i) => seat(hall, { id: `tl-${i + 1}`, kind: 'chair', x, z: 1.086, top: 0.47, yaw: 0, from: [x - 0.7, 0.8], lamp: i < 2 ? 'L-a' : 'L-b' }));
  [3.5, 4.9, 6.3, 7.7].forEach((x, i) => seat(hall, { id: `tr-${i + 1}`, kind: 'chair', x, z: 1.086, top: 0.47, yaw: 0, from: [x + 0.7, 0.8], lamp: i < 2 ? 'R-a' : 'R-b' }));
  seat(hall, { id: 'nook-l', kind: 'beanbag', x: -8.7, z: -4.68, top: 0.5, yaw: 0.6, from: [-7.6, -3.7] });
  seat(hall, { id: 'nook-r', kind: 'beanbag', x: 8.7, z: -4.68, top: 0.5, yaw: -0.6, from: [7.6, -3.7] });
  seat(hall, { id: 'rug-1', kind: 'cushion', x: -1.9, z: -1.57, top: 0.17, yaw: 0, from: [-1.9, -0.7] });
  seat(hall, { id: 'rug-2', kind: 'cushion', x: 1.9, z: -1.57, top: 0.17, yaw: 0, from: [1.9, -0.7] });
  seat(hall, { id: 'loft-futon', kind: 'futon', x: -9.2, z: -6.8, top: LOFT_Y + 0.2, yaw: Math.PI / 2, level: 1, from: [-9.2, -5.95] });
  seat(hall, { id: 'loft-1', kind: 'cushion', x: -6.9, z: -6.7, top: LOFT_Y + 0.17, yaw: 0, level: 1, from: [-6.9, -5.95] });
  seat(hall, { id: 'loft-2', kind: 'cushion', x: -5.7, z: -6.7, top: LOFT_Y + 0.17, yaw: 0, level: 1, from: [-5.7, -5.95] });
  seat(roof, { id: 'roof-ham-1', kind: 'hammock', x: 1.6, z: -3.4, top: 0.62, yaw: Math.PI / 2, from: [1.6, -2.4] });
  seat(roof, { id: 'roof-ham-2', kind: 'hammock', x: 5.4, z: -3.4, top: 0.62, yaw: Math.PI / 2, from: [5.4, -2.4] });
  seat(roof, { id: 'roof-bench-1', kind: 'bench', x: -2.6, z: 3.42, top: 0.47, yaw: 0, from: [-2.6, 2.6] });
  seat(roof, { id: 'roof-bench-2', kind: 'bench', x: -1.4, z: 3.42, top: 0.47, yaw: 0, from: [-1.4, 2.6] });
  hall.hots = { book: { at: [0, -2.3], level: 0, card: 'book', tip: '펼친 책' }, board: { at: [-9.2, -0.9], level: 0, card: 'board', tip: '글감 질문' }, shelf: { at: [7.6, -0.6], level: 0, card: 'shelf', tip: '우리 책장' } };
  roof.hots = { stars: { at: [5.4, 3.0], level: 0, card: 'stars', tip: '별 보는 망원경' } };
  hall.portals = [
    { id: 'roof', to: 'roof', level: 1, zone: (x, z) => x < -11.62 && z > -7.4 && z < -6.4, at: [-11.4, -6.9], tip: '옥상 정원으로', arrive: { x: -6.2, z: -2.3, layer: 0 } },
    { id: 'room', href: true, level: 0, zone: (x, z) => x > 10.6 && z > 2.85 && z < 4.15, at: [10.5, 3.5], tip: '모임방으로' },
  ];
  roof.portals = [
    { id: 'hall', to: 'hall', level: 0, zone: (x, z) => x > -6.75 && x < -5.65 && z < -2.88, at: [-6.2, -2.75], tip: '큰 서고로', arrive: { x: -11.0, z: -6.9, layer: 1 } },
  ];

  // ───────── 길 찾기: 층마다 20cm 격자. 계단은 따로 한 층(S)으로 두고 앞·뒤 끝에서만 이어진다 ─────────
  const CELL = 0.2;
  const R = 0.22; // 인형 몸 반지름(가구에서 이만큼 떨어져 걷는다)
  const inStairs = (P, x, z) => P.stairs && x >= P.stairs.x0 && x <= P.stairs.x1 && z >= P.stairs.zTop && z <= P.stairs.zBottom;
  const blocked = (b, x, z) => {
    const m = b.tight ? 0 : R;
    if (b.r) return x > b.r[0] - m && x < b.r[2] + m && z > b.r[1] - m && z < b.r[3] + m;
    if (b.e) return ((x - b.e[0]) / (b.e[2] + R)) ** 2 + ((z - b.e[1]) / (b.e[3] + R)) ** 2 < 1;
    return (x - b.c[0]) ** 2 + (z - b.c[1]) ** 2 < (b.c[2] + R) ** 2;
  };
  const free = (P, layer, x, z) => {
    if (layer === 'S') { const s = P.stairs; return Boolean(s) && x > s.x0 + 0.2 && x < s.x1 - 0.2 && z >= s.zTop - 0.02 && z <= s.zBottom + 0.02; }
    const L = P.layers[layer];
    if (!L) return false;
    const [x0, z0, x1, z1] = L.rect;
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    return !L.blocks.some((b) => blocked(b, x, z));
  };
  // 한 걸음 옮길 때 층이 바뀌는가: 바닥 → 계단(앞 끝으로만), 계단 → 바닥·다락, 다락 → 계단(위 끝으로만)
  const stepTo = (P, layer, x, z, nx, nz) => {
    const s = P.stairs;
    const band = s && nx > s.x0 + 0.2 && nx < s.x1 - 0.2;
    if (layer === 0) {
      if (s && band && nz <= s.zBottom && nz > s.zBottom - 0.4 && z > s.zBottom - 0.05) return 'S';
      return free(P, 0, nx, nz) ? 0 : null;
    }
    if (layer === 'S') {
      if (nz > s.zBottom) return free(P, 0, nx, nz) ? 0 : null;
      if (nz < s.zTop) return free(P, 1, nx, nz) ? 1 : null;
      return free(P, 'S', nx, nz) ? 'S' : null;
    }
    if (layer === 1 && s && band && nz > s.zTop - 0.05 && nz >= z) return free(P, 'S', nx, Math.max(nz, s.zTop)) ? 'S' : null;
    return free(P, layer, nx, nz) ? layer : null;
  };
  const heightAt = (P, layer, x, z) => {
    if (layer === 'S' || (layer !== 1 && inStairs(P, x, z)) || (layer === 1 && inStairs(P, x, z))) {
      const s = P.stairs;
      return clamp((s.zBottom - z) / (s.zBottom - s.zTop), 0, 1) * LOFT_Y;
    }
    return layer === 1 ? LOFT_Y : 0;
  };
  const levelOf = (P, layer, x, z) => (layer === 'S' ? (heightAt(P, 'S', x, z) > LOFT_Y / 2 ? 1 : 0) : layer);
  const LAYERS = [0, 1, 'S'];
  const findPath = (P, from, to) => { // from·to: { layer, x, z }
    const [bx0, bz0, bx1, bz1] = P.bounds;
    const GW = Math.ceil((bx1 - bx0) / CELL); const GH = Math.ceil((bz1 - bz0) / CELL); const N = GW * GH;
    const cx = (i) => bx0 + (i % GW) * CELL + CELL / 2;
    const cz = (i) => bz0 + Math.floor(i / GW) * CELL + CELL / 2;
    const cellOf = (x, z) => clamp(Math.floor((z - bz0) / CELL), 0, GH - 1) * GW + clamp(Math.floor((x - bx0) / CELL), 0, GW - 1);
    const li = (layer) => LAYERS.indexOf(layer);
    const start = li(from.layer) * N + cellOf(from.x, from.z);
    const goal = li(to.layer) * N + cellOf(to.x, to.z);
    const g = new Float32Array(N * 3).fill(Infinity);
    const came = new Int32Array(N * 3).fill(-1);
    const closed = new Uint8Array(N * 3);
    const heap = []; // [f, node]
    const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1; const r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const gx = to.x; const gz = to.z;
    g[start] = 0; push(0, start);
    let guard = 0;
    while (heap.length && guard++ < 60000) {
      const [, node] = pop();
      if (closed[node]) continue;
      closed[node] = 1;
      if (node === goal) break;
      const layer = LAYERS[Math.floor(node / N)];
      const cell = node % N;
      const x = cx(cell); const z = cz(cell);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx * CELL; const nz = z + dz * CELL;
          if (nx < bx0 || nz < bz0 || nx > bx1 || nz > bz1) continue;
          const nl = stepTo(P, layer, x, z, nx, nz);
          if (nl === null) continue;
          if (dx && dz && (stepTo(P, layer, x, z, nx, z) === null || stepTo(P, layer, x, z, x, nz) === null)) continue;
          const next = li(nl) * N + cellOf(nx, nz);
          if (closed[next]) continue;
          const cost = g[node] + (dx && dz ? 1.414 : 1) * CELL + (nl !== layer ? 0.05 : 0);
          if (cost < g[next]) { g[next] = cost; came[next] = node; push(cost + Math.hypot(nx - gx, nz - gz), next); }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const pts = [];
    for (let n = goal; n !== -1 && n !== start; n = came[n]) pts.unshift({ layer: LAYERS[Math.floor(n / N)], x: cx(n % N), z: cz(n % N) });
    pts.push({ ...to });
    // 같은 층에서 곧게 갈 수 있는 점은 건너뛴다
    const lineFree = (a, b) => { const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1); for (let i = 1; i <= steps; i++) if (!free(P, a.layer, a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps)) return false; return true; };
    const out = [];
    let anchor = from;
    for (let i = 0; i < pts.length; i++) {
      const ahead = pts[i + 1];
      if (ahead && ahead.layer === anchor.layer && pts[i].layer === anchor.layer && anchor.layer !== 'S' && lineFree(anchor, ahead)) continue;
      out.push(pts[i]);
      anchor = pts[i];
    }
    return out;
  };
  const nearestFree = (P, layer, x, z) => {
    if (free(P, layer, x, z)) return [x, z];
    for (let r = 0.15; r < 4; r += 0.15) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) { const px = x + Math.cos(a) * r; const pz = z + Math.sin(a) * r; if (free(P, layer, px, pz)) return [px, pz]; }
    }
    return null;
  };

  // ───────── 큰 서고 짓기 ─────────
  const lamp = (P, parent, id, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    cyl(g, 0.15, 0.17, 0.04, 0xC9A15E, 0, 0, 0, { line: 0.015 });
    cyl(g, 0.025, 0.025, 0.42, 0xC9A15E, 0, 0.04, 0, { line: 0.012, seg: 8 });
    const shade = solid(new THREE.CylinderGeometry(0.08, 0.27, 0.22, 22, 1, true), 0x3F6B4F, { line: 0.02, mat: toon(0x3F6B4F, { side: THREE.DoubleSide }) });
    shade.position.y = 0.52; g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6b5a3a }));
    bulb.position.y = 0.44; g.add(bulb);
    const halo = glow(g, 0xffd98a, 1.6, 0, 0.42, 0);
    halo.material.opacity = 0;
    const light = new THREE.PointLight(0xffc77a, 0, 5.5, 1.4);
    light.position.y = 0.4; g.add(light);
    parent.add(g);
    P.lamps[id] = { bulb, halo, light, on: false };
    return g;
  };
  const buildHall = (P) => {
    const S = P.scene;
    // 바닥판과 마루
    box(S, 24.6, 0.49, 16.6, 0x6B4430, 0, -0.5, 0, { line: 0.05, cast: false }); // 윗면을 마루보다 1cm 낮춘다(같은 높이면 번쩍인다)
    const planks = canvasTex(2048, 1366, (g, w, h) => {
      const rand = seeded(31);
      g.fillStyle = '#C89A6A'; g.fillRect(0, 0, w, h);
      const ph = 22;
      for (let y = 0; y < h; y += ph) {
        let x = -rand() * 200;
        while (x < w) {
          const len = 160 + rand() * 260;
          const tone = 190 + rand() * 30;
          g.fillStyle = `rgb(${tone + 10},${tone - 40},${tone - 92})`;
          g.fillRect(x, y, len, ph);
          g.strokeStyle = 'rgba(110,72,40,.55)'; g.lineWidth = 2; g.strokeRect(x, y, len, ph);
          if (rand() < 0.3) { g.strokeStyle = 'rgba(120,80,48,.25)'; g.beginPath(); g.moveTo(x + 20, y + ph / 2); g.bezierCurveTo(x + len / 3, y + 4, x + len / 2, y + ph - 4, x + len - 20, y + ph / 2); g.stroke(); }
          x += len;
        }
      }
    });
    const floor = plane(S, 24, 16, toon(0xffffff, { map: planks }), 0, 0, 0, { rx: -Math.PI / 2 });
    mark(P, floor, { floor: 0 });
    // 조형물 밑 둥근 러그
    const rug = canvasTex(1024, 1024, (g) => {
      g.fillStyle = '#B5563F'; g.beginPath(); g.arc(512, 512, 506, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2E241C'; g.lineWidth = 12; g.stroke();
      g.fillStyle = '#C66A4F'; g.beginPath(); g.arc(512, 512, 410, 0, Math.PI * 2); g.fill();
      g.setLineDash([46, 30]); g.strokeStyle = '#E8C07A'; g.lineWidth = 14; g.beginPath(); g.arc(512, 512, 460, 0, Math.PI * 2); g.stroke();
    });
    const rugMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshToonMaterial({ map: rug, gradientMap: gradient, transparent: true, alphaTest: 0.1 }));
    rugMesh.rotation.x = -Math.PI / 2; rugMesh.scale.set(5.4, 3.32, 1); rugMesh.position.set(0, 0.012, -2.68); rugMesh.receiveShadow = true;
    S.add(rugMesh);
    mark(P, rugMesh, { floor: 0 });
    const mat = plane(S, 2.8, 0.72, toon(0xffffff, { map: signTex('어서 와요', { bg: '#6E8B74', size: 100 }) }), 0, 0.014, 7.55, { rx: -Math.PI / 2 });
    mark(P, mat, { floor: 0 });

    // 뒷벽: 아치 창이 뚫린 벽, 창 밖 하늘
    const back = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(-12.3, 0); shape.lineTo(12.3, 0); shape.lineTo(12.3, 7.2); shape.lineTo(-12.3, 7.2); shape.lineTo(-12.3, 0);
    const hole = new THREE.Path();
    hole.moveTo(-3.6, 0.9); hole.lineTo(3.6, 0.9); hole.lineTo(3.6, 3.0); hole.absarc(0, 3.0, 3.6, 0, Math.PI, false); hole.lineTo(-3.6, 0.9);
    shape.holes.push(hole);
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    const wall = new THREE.Mesh(wallGeo, toon(0xEFE3CF));
    wall.position.z = -8.3; wall.receiveShadow = true;
    back.add(wall);
    for (let x = -11.4; x < 12; x += 1.2) if (Math.abs(x) > 3.9) box(back, 0.04, 6.8, 0.02, 0xD9C5A6, x, 0.2, -7.99, { line: 0, cast: false });
    const ring = new THREE.Shape();
    ring.absarc(0, 3.0, 3.85, 0, Math.PI, false); ring.lineTo(-3.85, 0.75); ring.lineTo(3.85, 0.75); ring.lineTo(3.85, 3.0);
    const ringHole = new THREE.Path(); ringHole.absarc(0, 3.0, 3.6, 0, Math.PI, false); ringHole.lineTo(-3.6, 0.9); ringHole.lineTo(3.6, 0.9); ringHole.lineTo(3.6, 3.0);
    ring.holes.push(ringHole);
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.42, bevelEnabled: false }), toon(0x5E3B27));
    frame.position.z = -8.36; frame.castShadow = true;
    back.add(frame);
    [-2.15, 0, 2.15].forEach((x) => box(back, 0.12, x === 0 ? 5.6 : 4.9, 0.14, 0x5E3B27, x, 0.9, -8.05, { line: 0.02 }));
    box(back, 7.2, 0.12, 0.14, 0x5E3B27, 0, 3.25, -8.05, { line: 0.02 });
    box(back, 7.9, 0.16, 0.6, 0x8A5A3B, 0, 0.78, -7.95, { line: 0.03 });
    P.sky = canvasTex(1024, 1024, skyDraw('day', true));
    plane(back, 9, 8, new THREE.MeshBasicMaterial({ map: P.sky }), 0, 3.6, -9.0, { receive: false });
    P.rainGlass = plane(back, 7.4, 5.8, new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => { g.strokeStyle = 'rgba(220,235,255,.55)'; g.lineWidth = 2; const rand = seeded(3); for (let i = 0; i < 70; i++) { const x = rand() * 256; const y = rand() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + rand() * 10); g.stroke(); } }, { repeat: [3, 2] }), transparent: true, depthWrite: false }), 0, 3.7, -8.12, { receive: false });
    P.rainGlass.visible = false;
    const plate = plane(back, 3.2, 0.62, toon(0xffffff, { map: signTex('꼬깃 서고') }), 0, 6.75, -7.97);
    plate.castShadow = false;
    box(back, 24.6, 0.3, 0.5, 0x3B2618, 0, 7.2, -8.1, { line: 0.04, cast: false });
    // 뒷벽 책장: 왼쪽은 다락을 받치는 낮은 책장 + 그 위 높은 책장, 오른쪽은 큰 책장 탑
    box(back, 7.4, 4.2, 0.45, 0x55361F, -8.3, LOFT_Y, -7.78, { line: 0.04, cast: false });
    shelfFace(P, back, 7.2, 4.0, 5, 41, -8.3, LOFT_Y + 0.1, -7.545);
    box(back, 7.4, 7.0, 1.0, 0x55361F, 8.3, 0, -7.5, { line: 0.04, cast: false });
    shelfFace(P, back, 7.2, 6.8, 9, 43, 8.3, 0.1, -6.995);
    // 오른쪽 책장 탑에 기댄 사다리
    const ladder = new THREE.Group();
    [-0.32, 0.32].forEach((x) => box(ladder, 0.08, 6.4, 0.08, 0xB98A5E, x, 0, 0, { line: 0.02 }));
    for (let i = 1; i < 13; i++) box(ladder, 0.64, 0.06, 0.06, 0xB98A5E, 0, i * 0.48, 0, { line: 0.015 });
    ladder.position.set(6.2, 0, -6.55); ladder.rotation.x = -0.12;
    back.add(ladder);
    block(P, back);
    S.add(back);
    P.walls.push({ group: back, nx: 0, nz: 1 });

    // 다락 밑 책장(다락을 받친다): 앞면이 책
    box(S, 7.4, LOFT_Y, 2.4, 0x55361F, -8.3, 0, -6.8, { line: 0.04, cast: false });
    shelfFace(P, S, 7.2, LOFT_Y - 0.15, 4, 47, -8.2, 0.05, -5.595);
    block(P, S.children[S.children.length - 2]);
    // 다락 바닥과 난간
    const loft = box(S, 7.45, 0.2, 2.45, 0x8C5A3B, -8.275, LOFT_Y - 0.2, -6.8, { line: 0.04, cast: false });
    const loftTop = plane(S, 7.4, 2.4, toon(0xffffff, { map: planks }), -8.3, LOFT_Y + 0.003, -6.8, { rx: -Math.PI / 2 });
    mark(P, loftTop, { floor: 1 });
    block(P, loft);
    const rail = new THREE.Group();
    for (let x = STAIR.x1 + 0.1; x <= -4.6; x += 0.55) cyl(rail, 0.035, 0.035, 0.95, 0xB98A5E, x, LOFT_Y, -5.62, { line: 0.012, seg: 8 });
    for (let z = -5.62; z >= -8; z -= 0.55) cyl(rail, 0.035, 0.035, 0.95, 0xB98A5E, -4.62, LOFT_Y, z, { line: 0.012, seg: 8 });
    box(rail, -4.6 - STAIR.x1, 0.08, 0.1, 0x8C5A3B, (STAIR.x1 - 4.6) / 2, LOFT_Y + 0.95, -5.62, { line: 0.02 });
    box(rail, 0.1, 0.08, 2.4, 0x8C5A3B, -4.62, LOFT_Y + 0.95, -6.8, { line: 0.02 });
    S.add(rail);
    // 계단: 앞에서 뒤로 올라가는 나무 계단 12단 + 난간
    const steps = 12;
    const run = (STAIR.zBottom - STAIR.zTop) / steps;
    const stairs = new THREE.Group();
    for (let i = 0; i < steps; i++) {
      const top = ((i + 1) / steps) * LOFT_Y;
      const zc = STAIR.zBottom - (i + 0.5) * run;
      const st = box(stairs, STAIR.x1 - STAIR.x0, top, run, i % 2 ? 0xA97C50 : 0xB58658, (STAIR.x0 + STAIR.x1) / 2, 0, zc, { line: 0.025 });
      mark(P, st, { floor: 'S' });
    }
    const slope = Math.atan2(LOFT_Y, STAIR.zBottom - STAIR.zTop);
    const len = Math.hypot(LOFT_Y, STAIR.zBottom - STAIR.zTop);
    for (let i = 0; i <= steps; i += 3) cyl(stairs, 0.035, 0.035, 0.95, 0xB98A5E, STAIR.x1 - 0.05, (i / steps) * LOFT_Y, STAIR.zBottom - i * run - 0.1, { line: 0.012, seg: 8 });
    const handrail = solid(new THREE.BoxGeometry(0.09, 0.07, len + 0.2), 0x8C5A3B, { line: 0.02 });
    handrail.position.set(STAIR.x1 - 0.05, LOFT_Y / 2 + 0.95, (STAIR.zBottom + STAIR.zTop) / 2);
    handrail.rotation.x = slope;
    stairs.add(handrail);
    S.add(stairs);
    // 다락: 이불(누우면 이불이 펼쳐진다), 방석 둘, 스탠드
    const futon = new THREE.Group();
    box(futon, 2.25, 0.18, 1.15, 0xF4EBDD, 0, 0, 0, { line: 0.03 });
    box(futon, 0.42, 0.09, 0.72, 0xFFFDF8, -0.9, 0.18, 0, { line: 0.02 });
    const folded = box(futon, 0.55, 0.12, 1.05, 0x9BB7D4, 0.78, 0.18, 0, { line: 0.02 });
    const spread = box(futon, 0.95, 0.16, 1.12, 0x9BB7D4, 0.62, 0.17, 0, { line: 0.025 }); // 발치에서 배까지 덮는다
    spread.visible = false;
    futon.position.set(-9.2, LOFT_Y, -6.8);
    mark(P, futon, { seat: 'loft-futon' });
    S.add(futon);
    P.futon = { folded, spread };
    ['loft-1', 'loft-2'].forEach((id, i) => { const s = P.seatById(id); const c = cyl(S, 0.38, 0.42, 0.16, i ? 0xB98DB5 : 0xE3A857, s.x, LOFT_Y, s.z, { line: 0.02 }); mark(P, c, { seat: id }); });
    const standing = new THREE.Group();
    cyl(standing, 0.18, 0.2, 0.05, 0x3B2618, 0, 0, 0, { line: 0.015 });
    cyl(standing, 0.03, 0.03, 1.5, 0x3B2618, 0, 0.05, 0, { line: 0.012, seg: 8 });
    const sshade = solid(new THREE.CylinderGeometry(0.16, 0.34, 0.32, 22, 1, true), 0xE3A857, { line: 0.02, mat: toon(0xE3A857, { side: THREE.DoubleSide }) });
    sshade.position.y = 1.6; standing.add(sshade);
    const loftHalo = glow(standing, 0xffd98a, 2.4, 0, 1.45, 0);
    const loftLight = new THREE.PointLight(0xffc77a, 3, 6, 1.3);
    loftLight.position.y = 1.4; standing.add(loftLight);
    standing.position.set(-5.1, LOFT_Y, -7.2);
    S.add(standing);
    P.loftLamp = { halo: loftHalo, light: loftLight };
    // 다락 왼쪽 벽의 옥상 문
    const roofDoor = new THREE.Group();
    box(roofDoor, 0.12, 2.2, 1.1, 0x6E8B74, 0, 0, 0, { line: 0.03 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(0xE3A857)); knob.position.set(0.09, 1.05, 0.38); roofDoor.add(knob);
    const roofSign = plane(roofDoor, 1.0, 0.3, toon(0xffffff, { map: signTex('옥상 정원', { bg: '#FFF6E6', fg: '#2E241C' }) }), 0.07, 2.45, 0, { ry: Math.PI / 2 });
    roofSign.castShadow = false;
    roofDoor.position.set(-11.95, LOFT_Y, -6.9);
    mark(P, roofDoor, { portal: 'roof' });
    // 왼쪽 벽: 계단 앞쪽 벽에 책장
    const left = new THREE.Group();
    box(left, 0.3, 7.2, 16.6, 0xE9DCC6, -12.15, 0, 0, { line: 0.04, cast: false });
    box(left, 0.6, 5.4, 5.05, 0x55361F, -11.7, 0, 5.125, { line: 0.04, cast: false });
    shelfFace(P, left, 4.85, 5.2, 7, 51, -11.395, 0.1, 5.125, Math.PI / 2);
    left.add(roofDoor);
    block(P, left);
    S.add(left);
    P.walls.push({ group: left, nx: 1, nz: 0 });
    // 오른쪽 벽: 책장 둘과 모임방 문
    const right = new THREE.Group();
    box(right, 0.3, 7.2, 16.6, 0xE9DCC6, 12.15, 0, 0, { line: 0.04, cast: false });
    box(right, 0.6, 5.4, 8.6, 0x55361F, 11.7, 0, -2.35, { line: 0.04, cast: false });
    shelfFace(P, right, 8.4, 5.2, 7, 53, 11.395, 0.1, -2.35, -Math.PI / 2);
    box(right, 0.6, 5.4, 2.9, 0x55361F, 11.7, 0, 6.1, { line: 0.04, cast: false });
    shelfFace(P, right, 2.7, 5.2, 7, 57, 11.395, 0.1, 6.1, -Math.PI / 2);
    const roomDoor = new THREE.Group();
    box(roomDoor, 0.14, 2.4, 1.2, 0xC9604A, 0, 0, 0, { line: 0.03 });
    const knob2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(0xE3A857)); knob2.position.set(-0.1, 1.1, -0.42); roomDoor.add(knob2);
    plane(roomDoor, 1.1, 0.33, toon(0xffffff, { map: signTex('모임방', { bg: '#FFF6E6', fg: '#2E241C' }) }), -0.08, 2.65, 0, { ry: -Math.PI / 2 });
    roomDoor.position.set(11.92, 0, 3.5);
    mark(P, roomDoor, { portal: 'room' });
    right.add(roomDoor);
    block(P, right);
    S.add(right);
    P.walls.push({ group: right, nx: -1, nz: 0 });

    // 창가 벤치와 방석 넷
    box(S, 8.8, 0.38, 0.72, 0x8C5A3B, 0, 0, -7.61, { line: 0.03 });
    ['#E3A857', '#6E8B74', '#9BB7D4', '#B98DB5'].forEach((c, i) => {
      const s = P.seats[i];
      const cushion = box(S, 1.1, 0.12, 0.62, new THREE.Color(c).getHex(), s.x, 0.37, s.z, { line: 0.02 });
      mark(P, cushion, { seat: s.id });
      s.mesh = cushion;
    });
    // 펼친 책 조형물: 받침 위에 책이 펼쳐지고 책장이 날개처럼 솟는다
    const sculpture = new THREE.Group();
    const pedestal = cyl(sculpture, 1.85, 1.9, 0.55, 0xEDE3D2, 0, 0, 0, { line: 0.04, seg: 48 });
    pedestal.scale.z = 0.66;
    const cover = (side) => { const c = box(sculpture, 1.5, 0.06, 1.15, 0xE4572E, side * 0.76, 0.55, 0, { line: 0.02 }); c.rotation.z = side * -0.12; };
    cover(-1); cover(1);
    const pageGeo = (() => {
      const leaf = new THREE.Shape();
      leaf.moveTo(0, 0); leaf.bezierCurveTo(0.55, 0.25, 0.75, 0.9, 0.5, 1.7); leaf.bezierCurveTo(0.3, 1.1, 0.12, 0.6, 0, 0);
      const geo = new THREE.ShapeGeometry(leaf, 16);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.18 * Math.sin((pos.getY(i) / 1.7) * Math.PI));
      geo.computeVertexNormals();
      return geo;
    })();
    const pageMat = toon(0xFFFDF8, { side: THREE.DoubleSide });
    const redPage = toon(0xE4572E, { side: THREE.DoubleSide });
    [[-1, 0.9, redPage], [-1, 0.5, pageMat], [-1, 0.15, pageMat], [1, 0.15, pageMat], [1, 0.5, pageMat], [1, 0.9, redPage]].forEach(([side, spread, m], i) => {
      const p = new THREE.Mesh(pageGeo, m);
      p.castShadow = true;
      const holder = new THREE.Group();
      holder.add(p);
      p.scale.set(side * (1.1 - spread * 0.25), 1.05 - spread * 0.25, 1);
      holder.position.set(0, 0.62, (i % 2 ? 0.08 : -0.08));
      holder.rotation.z = side * -spread * 0.9;
      sculpture.add(holder);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(pageGeo, 30), new THREE.LineBasicMaterial({ color: INK }));
      p.add(edge);
    });
    const centerPage = new THREE.Mesh(pageGeo, pageMat); centerPage.scale.set(0.5, 1.15, 1); centerPage.position.set(-0.12, 0.62, 0); centerPage.castShadow = true; sculpture.add(centerPage);
    const plaque = plane(sculpture, 0.9, 0.26, toon(0xffffff, { map: signTex('펼친 책', { size: 96 }) }), 0, 0.3, 1.27);
    plaque.castShadow = false;
    sculpture.position.set(0, 0, -3.92);
    mark(P, sculpture, { hot: 'book' });
    S.add(sculpture);
    // 열람 테이블 둘: 스탠드·책·찻잔, 그 뒤로 의자 넷씩
    const table = (cxT, prefix, lamps) => {
      const t = new THREE.Group();
      box(t, 6.0, 0.1, 1.4, 0xB07A4E, 0, 0.73, 0, { line: 0.03 });
      box(t, 5.8, 0.12, 1.2, 0x8C5A3B, 0, 0.61, 0, { line: 0.02 });
      [[-2.8, -0.55], [2.8, -0.55], [-2.8, 0.55], [2.8, 0.55]].forEach(([x, z]) => box(t, 0.12, 0.61, 0.12, 0x8C5A3B, x, 0, z, { line: 0.02 }));
      lamps.forEach(([x, id]) => lamp(P, t, id, x, 0.83, 0.1));
      box(t, 0.5, 0.05, 0.35, 0xFFF6E6, -0.4, 0.83, 0.15, { line: 0.012, ry: 0.2 });
      box(t, 0.35, 0.09, 0.26, 0x4F6D8A, 0.6, 0.83, -0.1, { line: 0.012 });
      box(t, 0.3, 0.08, 0.24, 0xE3A857, 0.6, 0.92, -0.1, { line: 0.012, ry: 0.15 });
      cyl(t, 0.07, 0.06, 0.13, 0xFFFDF8, 2.2, 0.83, 0.2, { line: 0.012, seg: 14 });
      t.position.set(cxT, 0, 2.05);
      S.add(t);
      block(P, t);
    };
    table(-5.5, 'L', [[-1.5, 'L-a'], [1.5, 'L-b']]);
    table(5.5, 'R', [[-1.3, 'R-a'], [1.7, 'R-b']]);
    P.seats.filter((s) => s.kind === 'chair').forEach((s) => {
      const ch = new THREE.Group();
      box(ch, 0.52, 0.07, 0.5, 0x8C5A3B, 0, 0.4, 0, { line: 0.02 });
      [[-0.22, -0.21], [0.22, -0.21], [-0.22, 0.21], [0.22, 0.21]].forEach(([x, z]) => box(ch, 0.05, 0.4, 0.05, 0x6B4430, x, 0, z, { line: 0.012 }));
      [-0.22, 0.22].forEach((x) => box(ch, 0.06, 0.72, 0.06, 0x8C5A3B, x, 0.47, -0.22, { line: 0.015 }));
      box(ch, 0.5, 0.16, 0.05, 0x8C5A3B, 0, 1.0, -0.22, { line: 0.015 });
      box(ch, 0.5, 0.06, 0.04, 0x8C5A3B, 0, 0.72, -0.22, { line: 0.012 });
      ch.position.set(s.x, 0, s.z);
      mark(P, ch, { seat: s.id });
      S.add(ch);
      s.mesh = ch;
    });
    // 빈백 둘(울퉁불퉁 공을 눌러 놓은 모양)
    const beanGeo = (() => {
      const geo = new THREE.SphereGeometry(1, 28, 18);
      const pos = geo.attributes.position;
      const rand = seeded(9);
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = 1 + (rand() - 0.5) * 0.06 - (y > 0.5 ? (y - 0.5) * 0.5 : 0); pos.setXYZ(i, pos.getX(i) * k, y * k, pos.getZ(i) * k); }
      geo.computeVertexNormals();
      return geo;
    })();
    [['nook-l', 0xE3A857], ['nook-r', 0x7A9E7E]].forEach(([id, color]) => {
      const s = P.seatById(id);
      const b = solid(beanGeo, color, { line: 0.04 });
      b.scale.set(0.88, 0.46, 0.88); b.position.set(s.x, 0.4, s.z);
      mark(P, b, { seat: id });
      S.add(b);
      s.mesh = b;
      box(S, 0.42, 0.12, 0.3, 0x4F6D8A, s.x + (s.x < 0 ? 0.95 : -0.95), 0, s.z + 0.3, { line: 0.012 });
      box(S, 0.36, 0.1, 0.26, 0xF2D16B, s.x + (s.x < 0 ? 0.95 : -0.95), 0.12, s.z + 0.3, { line: 0.012, ry: 0.3 });
    });
    ['rug-1', 'rug-2'].forEach((id) => { const s = P.seatById(id); const c = cyl(S, 0.42, 0.46, 0.16, 0xF2D16B, s.x, 0.012, s.z, { line: 0.02 }); mark(P, c, { seat: id }); s.mesh = c; });
    P.seats.filter((s) => s.kind === 'cushion' && s.level === 1).forEach((s) => { s.mesh = P.pick.find((m) => m.userData.seat === s.id)?.parent; });
    P.seatById('loft-futon').mesh = futon;
    // 게시판(글감 질문)
    const board = new THREE.Group();
    [-0.6, 0.6].forEach((x) => { const leg = box(board, 0.08, 1.8, 0.08, 0x8C5A3B, x, 0, 0, { line: 0.015 }); leg.rotation.z = x * 0.08; });
    box(board, 1.5, 1.05, 0.06, 0xC99B6B, 0, 0.6, 0.05, { line: 0.025 });
    [[-0.38, 1.25, 0xFFFDF8, -0.06], [0.3, 1.18, 0xFFF3C4, 0.05], [-0.15, 0.85, 0xDCEBF5, 0]].forEach(([x, y, c, r]) => { const n = box(board, 0.42, 0.32, 0.01, c, x, y - 0.16, 0.095, { line: 0.008, cast: false }); n.rotation.z = r; });
    plane(board, 1.1, 0.28, toon(0xffffff, { map: signTex('글감 질문', { bg: '#C99B6B', fg: '#2E241C' }) }), 0, 1.72, 0.1);
    board.position.set(-9.2, 0, -1.6);
    mark(P, board, { hot: 'board' });
    S.add(board);
    // 북 카트(우리 책장)
    const cart = new THREE.Group();
    box(cart, 1.7, 0.6, 0.55, 0x8C5A3B, 0, 0.2, 0, { line: 0.025 });
    for (let i = 0; i < 9; i++) box(cart, 0.15, 0.3 + (i % 3) * 0.05, 0.4, new THREE.Color(BOOK_COLORS[(i * 3) % BOOK_COLORS.length]).getHex(), -0.68 + i * 0.17, 0.8, 0, { line: 0.01 });
    [-0.65, 0.65].forEach((x) => [-0.2, 0.2].forEach((z) => cyl(cart, 0.1, 0.1, 0.06, 0x3B2618, x, 0.04, z, { line: 0.01, seg: 12 })));
    plane(cart, 1.0, 0.27, toon(0xffffff, { map: signTex('우리 책장', { bg: '#FFF6E6', fg: '#2E241C' }) }), 0, 0.5, 0.285);
    cart.position.set(7.6, 0, -1.52);
    mark(P, cart, { hot: 'shelf' });
    S.add(cart);
    // 화분
    const plantAt = (x, z, big) => {
      const p = new THREE.Group();
      cyl(p, 0.36, 0.28, 0.5, 0xC9604A, 0, 0, 0, { line: 0.025 });
      const leafGeo = new THREE.SphereGeometry(0.22, 10, 8);
      for (let i = 0; i < (big ? 8 : 6); i++) {
        const a = (i / (big ? 8 : 6)) * Math.PI * 2;
        const leaf = solid(leafGeo, i % 2 ? 0x6E8B74 : 0x7A9E7E, { line: 0.02 });
        leaf.scale.set(0.5, 2.6 + (i % 3) * 0.4, 0.5);
        leaf.position.set(Math.cos(a) * 0.16, 0.95 + (i % 3) * 0.12, Math.sin(a) * 0.16);
        leaf.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
        p.add(leaf);
      }
      p.position.set(x, 0, z);
      S.add(p);
    };
    plantAt(-10.4, 6.9, true); plantAt(10.4, 6.9, true); plantAt(10.3, -6.4, false);
    // 천장 들보와 매단 책갈피 별
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 0.07 : 0.17; const px = Math.cos(a) * r; const py = -Math.sin(a) * r; if (i) starShape.lineTo(px, py); else starShape.moveTo(px, py); }
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.04, bevelEnabled: false }); starGeo.center();
    const rand = seeded(91);
    const count = Math.min(Number(root.dataset.stars) || 0, 40);
    P.stars = [];
    for (let i = 0; i < count; i++) {
      const hang = new THREE.Group();
      const z = rand() < 0.5 ? -3.4 : 0.6;
      hang.position.set(-6 + rand() * 12, 7.6, z);
      const len = 1.2 + rand() * 2.4;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), new THREE.MeshBasicMaterial({ color: 0xE8DCC6 }));
      string.position.y = -len / 2; hang.add(string);
      const st = solid(starGeo, new THREE.Color(['#F2D16B', '#E3A857', '#FFF3C4', '#9BB7D4'][i % 4]).getHex(), { line: 0.015 });
      st.position.y = -len - 0.15; hang.add(st);
      hang.userData.phase = rand() * Math.PI * 2;
      S.add(hang);
      P.stars.push(hang);
    }
    // 창에서 드는 빛줄기와 그 속 먼지
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([-3.4, 6.2, -8.0, 3.4, 6.2, -8.0, 6.2, 0.02, 2.5, -6.2, 0.02, 2.5], 3));
    beamGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    beamGeo.setIndex([0, 2, 1, 0, 3, 2]);
    const beamTex = canvasTex(4, 128, (g) => { const r = g.createLinearGradient(0, 0, 0, 128); r.addColorStop(0, 'rgba(255,246,213,.5)'); r.addColorStop(1, 'rgba(255,246,213,0)'); g.fillStyle = r; g.fillRect(0, 0, 4, 128); });
    P.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.5 }));
    S.add(P.beam);
    const dustGeo = new THREE.BufferGeometry();
    const dust = [];
    for (let i = 0; i < 70; i++) dust.push(-4 + rand() * 8, 0.3 + rand() * 5.5, -7.5 + rand() * 7);
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dust, 3));
    P.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.06, map: glowTex, color: 0xfff3d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    S.add(P.dust);
    // 종이새 둘
    P.birds = [0, 1].map((i) => {
      const bird = new THREE.Group();
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.35, 0.02, 0.18, 0.25, 0, 0, 0, 0, 0, 0.25, 0, 0, -0.35, 0.02, -0.18], 3));
      wingGeo.computeVertexNormals();
      const wing = new THREE.Mesh(wingGeo, toon(0xFFFDF8, { side: THREE.DoubleSide }));
      bird.add(wing);
      bird.add(new THREE.LineSegments(new THREE.EdgesGeometry(wingGeo), new THREE.LineBasicMaterial({ color: INK })));
      bird.userData.phase = i * Math.PI;
      S.add(bird);
      return bird;
    });
    // 빛: 하늘빛, 창으로 드는 해(그림자를 드리운다)
    P.hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a6a4a, 1.6);
    S.add(P.hemi);
    P.sun = new THREE.DirectionalLight(0xfff1d0, 2.2);
    P.sun.position.set(3, 13, -15);
    P.sun.target.position.set(0, 0, 2);
    P.sun.castShadow = true;
    P.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(P.sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 2, far: 45 });
    P.sun.shadow.bias = -0.0006;
    P.sun.shadow.normalBias = 0.03;
    S.add(P.sun, P.sun.target);
    S.background = new THREE.Color(0x2B1C12);
  };

  // ───────── 옥상 정원 짓기 ─────────
  const buildRoof = (P) => {
    const S = P.scene;
    box(S, 16.6, 0.59, 10.6, 0x8A7E70, 0, -0.6, 0, { line: 0.05, cast: false });
    const deck = canvasTex(1536, 960, (g, w, h) => {
      const rand = seeded(61);
      g.fillStyle = '#B98A5E'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 30) { const tone = 170 + rand() * 30; g.fillStyle = `rgb(${tone + 15},${tone - 25},${tone - 70})`; g.fillRect(x, 0, 30, h); g.strokeStyle = 'rgba(90,60,36,.55)'; g.lineWidth = 3; g.strokeRect(x, -2, 30, h + 4); }
    });
    const floor = plane(S, 16, 10, toon(0xffffff, { map: deck }), 0, 0, 0, { rx: -Math.PI / 2 });
    mark(P, floor, { floor: 0 });
    // 난간
    const rail = new THREE.Group();
    const posts = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8); for (let i = 0; i <= n; i++) cyl(rail, 0.04, 0.04, 1.0, 0xFFFDF8, lerp(x0, x1, i / n), 0, lerp(z0, z1, i / n), { line: 0.012, seg: 8 }); const r = box(rail, Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.08, 0.1, 0xFFFDF8, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, { line: 0.02 }); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); };
    posts(-7.9, 4.9, 7.9, 4.9); posts(-7.9, -3.1, -7.9, 4.9); posts(7.9, -4.9, 7.9, 4.9); posts(-4.6, -4.9, 7.9, -4.9);
    S.add(rail);
    // 계단 집과 서고로 내려가는 문
    const hut = new THREE.Group();
    box(hut, 3.0, 2.6, 2.0, 0xEFE3CF, -6.2, 0, -4.15, { line: 0.04 });
    box(hut, 3.3, 0.18, 2.3, 0x6B4430, -6.2, 2.6, -4.15, { line: 0.03 });
    box(hut, 1.0, 2.05, 0.1, 0x6E8B74, -6.2, 0, -3.13, { line: 0.025 });
    plane(hut, 1.0, 0.3, toon(0xffffff, { map: signTex('큰 서고', { bg: '#FFF6E6', fg: '#2E241C' }) }), -6.2, 2.32, -3.07);
    mark(P, hut.children[hut.children.length - 2], { portal: 'hall' });
    block(P, hut);
    S.add(hut);
    // 해먹 둘: 기둥 사이에 늘어진 천
    const hammockGeo = (() => {
      const geo = new THREE.PlaneGeometry(2.4, 0.95, 18, 4);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); const y = pos.getY(i); pos.setXYZ(i, x, -0.38 * (1 - (x / 1.2) ** 2) - 0.06 * (1 - (y / 0.475) ** 2), y); }
      geo.computeVertexNormals();
      return geo;
    })();
    const stripes = canvasTex(256, 64, (g) => { ['#E4572E', '#FFF6E6', '#F2D16B', '#FFF6E6'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 16, 256, 16); }); });
    P.hammocks = {};
    P.seats.filter((s) => s.kind === 'hammock').forEach((s) => {
      [-1.4, 1.4].forEach((dx) => cyl(S, 0.07, 0.08, 1.5, 0x8C5A3B, s.x + dx, 0, s.z, { line: 0.015, seg: 10 }));
      const swing = new THREE.Group();
      swing.position.set(s.x, 1.35, s.z);
      const cloth = new THREE.Mesh(hammockGeo, toon(0xffffff, { map: stripes, side: THREE.DoubleSide }));
      cloth.position.y = -0.38 - 0.0; cloth.castShadow = true;
      swing.add(cloth);
      cloth.add(new THREE.LineSegments(new THREE.EdgesGeometry(hammockGeo, 40), new THREE.LineBasicMaterial({ color: INK })));
      [-1.2, 1.2].forEach((dx) => { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0x8C5A3B })); rope.position.set(dx * 1.08, -0.18, 0); rope.rotation.z = dx > 0 ? 0.35 : -0.35; swing.add(rope); });
      mark(P, swing, { seat: s.id });
      S.add(swing);
      s.mesh = swing;
      P.hammocks[s.id] = swing;
    });
    // 벤치, 작은 탁자, 망원경, 화단, 화분
    box(S, 2.8, 0.36, 0.55, 0x8C5A3B, -2.0, 0, 3.42, { line: 0.03 });
    box(S, 2.8, 0.55, 0.08, 0x8C5A3B, -2.0, 0.4, 3.66, { line: 0.02 });
    P.seats.filter((s) => s.kind === 'bench').forEach((s, i) => { const c = box(S, 1.1, 0.1, 0.5, i ? 0x9BB7D4 : 0xE3A857, s.x, 0.36, s.z, { line: 0.02 }); mark(P, c, { seat: s.id }); s.mesh = c; });
    cyl(S, 0.45, 0.4, 0.06, 0xFFFDF8, -1.0, 0.55, 1.0, { line: 0.015 });
    cyl(S, 0.05, 0.05, 0.55, 0x3B2618, -1.0, 0, 1.0, { line: 0.012, seg: 8 });
    cyl(S, 0.07, 0.06, 0.12, 0xC9604A, -0.9, 0.61, 0.95, { line: 0.01, seg: 12 });
    const scope = new THREE.Group();
    [0, 2.1, 4.2].forEach((a) => { const leg = box(scope, 0.05, 1.2, 0.05, 0x3B2618, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, { line: 0.01 }); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); });
    const tube = solid(new THREE.CylinderGeometry(0.09, 0.13, 1.1, 16), 0x4F6D8A, { line: 0.02 });
    tube.position.set(0, 1.35, 0); tube.rotation.set(-0.9, 0.4, 0);
    scope.add(tube);
    scope.position.set(6.05, 0, 3.25);
    mark(P, scope, { hot: 'stars' });
    S.add(scope);
    box(S, 0.8, 0.55, 4.5, 0x8C5A3B, 7.45, 0, 0.3, { line: 0.03 });
    const rand = seeded(73);
    for (let i = 0; i < 22; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(new THREE.Color(['#E4572E', '#F2D16B', '#B98DB5', '#FFFDF8'][i % 4]).getHex())); f.position.set(7.3 + rand() * 0.3, 0.62 + rand() * 0.2, -1.8 + rand() * 4.2); S.add(f); }
    const pot = new THREE.Group(); cyl(pot, 0.35, 0.28, 0.5, 0xC9604A, 0, 0, 0, { line: 0.025 }); const bush = solid(new THREE.SphereGeometry(0.5, 12, 10), 0x6E8B74, { line: 0.03 }); bush.position.y = 0.85; pot.add(bush); pot.position.set(-7.1, 0, 4.1); S.add(pot);
    // 줄 전구: 해 지면 켜진다
    P.bulbs = [];
    const strand = (a, b, n) => { for (let i = 1; i < n; i++) { const t = i / n; const x = lerp(a[0], b[0], t); const z = lerp(a[2], b[2], t); const y = lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 0.5; const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b5 })); bulb.position.set(x, y, z); S.add(bulb); P.bulbs.push(bulb); } };
    [[-7.9, 2.4, 4.9], [7.9, 2.4, 4.9]].forEach((p) => cyl(S, 0.05, 0.05, 2.4, 0x3B2618, p[0], 0, p[2], { line: 0.012, seg: 8 }));
    strand([-7.9, 2.4, 4.9], [-4.7, 2.6, -3.15], 14);
    strand([-7.9, 2.4, 4.9], [7.9, 2.4, 4.9], 22);
    // 둘레의 건물들과 하늘
    const towers = new THREE.Group();
    // 건물 벽(창은 조금 어둡게)과, 밤에 불 켜진 창만 빛나는 무늬
    const windows = canvasTex(64, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#9aa6b0'; for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) g.fillRect(x, y, 7, 9); });
    const litWindows = canvasTex(64, 128, (g) => { g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 128); const r = seeded(77); g.fillStyle = '#ffd27a'; for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) if (r() < 0.4) g.fillRect(x, y, 7, 9); });
    P.towerMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: windows, emissive: 0x000000, emissiveMap: litWindows });
    P.towerTints = [];
    const tints = [0xD9C7A7, 0xC5D2DA, 0xE8C9B8, 0xB9C8B4, 0xD8D2E6, 0xEFE3CF];
    for (let i = 0; i < 54; i++) {
      const a = rand() * Math.PI * 2; const r = 22 + rand() * 50;
      const h = 6 + rand() * 18; const w = 4 + rand() * 7;
      const m = P.towerMat.clone(); m.color.setHex(tints[i % tints.length]);
      P.towerTints.push([m, tints[i % tints.length]]);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.7 + rand() * 0.6)), m);
      t.position.set(Math.cos(a) * r, h / 2 - 16 + rand() * 6, Math.sin(a) * r - 4);
      towers.add(t);
    }
    S.add(towers);
    P.sky = canvasTex(32, 512, (g, w, h) => g.fillRect(0, 0, w, h));
    P.dome = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.MeshBasicMaterial({ map: P.sky, side: THREE.BackSide, depthWrite: false, fog: false }));
    S.add(P.dome);
    const nightStars = [];
    for (let i = 0; i < 400; i++) { const a = rand() * Math.PI * 2; const e = 0.15 + rand() * 1.3; nightStars.push(Math.cos(a) * Math.cos(e) * 120, Math.sin(e) * 120, Math.sin(a) * Math.cos(e) * 120); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(nightStars, 3));
    P.nightStars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.1, color: 0xfff6d8, map: glowTex, transparent: true, depthWrite: false, fog: false }));
    S.add(P.nightStars);
    // 책갈피 별자리: 이 문집에 꽂힌 책갈피만큼
    const marks = [];
    const count = Math.min(Number(root.dataset.stars) || 0, 60);
    for (let i = 0; i < count; i++) { const t = i / Math.max(1, count - 1); marks.push(-30 + t * 60 + (rand() - 0.5) * 8, 22 + Math.sin(t * Math.PI * 2) * 6 + rand() * 4, -70 + (rand() - 0.5) * 10); }
    const markGeo = new THREE.BufferGeometry(); markGeo.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
    P.constellation = new THREE.Points(markGeo, new THREE.PointsMaterial({ size: 3.2, color: 0xF2D16B, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    S.add(P.constellation);
    P.hemi = new THREE.HemisphereLight(0xdfefff, 0x8a7a68, 1.8);
    S.add(P.hemi);
    P.sun = new THREE.DirectionalLight(0xfff1d0, 2.4);
    P.sun.position.set(-8, 16, 10);
    P.sun.castShadow = true;
    P.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(P.sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 2, far: 50 });
    P.sun.shadow.bias = -0.0006; P.sun.shadow.normalBias = 0.03;
    S.add(P.sun, P.sun.target);
    S.fog = new THREE.Fog(0xcfe3f2, 30, 110);
    // 날씨: 그날 날짜로 정해서 모두에게 같다(비·눈·맑음)
    const drops = [];
    for (let i = 0; i < 700; i++) { const x = -14 + rand() * 28; const y = rand() * 16; const z = -12 + rand() * 24; drops.push(x, y, z, x - 0.04, y - 0.4, z); }
    const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.Float32BufferAttribute(drops, 3));
    P.rain = new THREE.LineSegments(dropGeo, new THREE.LineBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.7, depthWrite: false }));
    const flakes = [];
    for (let i = 0; i < 500; i++) flakes.push(-14 + rand() * 28, rand() * 16, -12 + rand() * 24);
    const flakeGeo = new THREE.BufferGeometry(); flakeGeo.setAttribute('position', new THREE.Float32BufferAttribute(flakes, 3));
    P.snow = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ size: 0.16, color: 0xffffff, map: glowTex, transparent: true, depthWrite: false }));
    P.rain.visible = false; P.snow.visible = false;
    S.add(P.rain, P.snow);
  };

  buildHall(hall);
  buildRoof(roof);

  // ───────── 시간대·날씨 ─────────
  const today = new Date();
  const weather = (() => {
    const forced = new URLSearchParams(location.search).get('weather');
    if (['clear', 'rain', 'snow'].includes(forced)) return forced;
    const rand = seeded(today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate());
    const roll = rand();
    const winter = [11, 0, 1].includes(today.getMonth());
    if (winter && roll < 0.3) return 'snow';
    return roll > 0.7 ? 'rain' : 'clear';
  })();
  let tod = 'day';
  const TOD = {
    dawn: { hemi: [0xffe0d0, 0x8a6a5a, 1.4], sun: [0xffc9a0, 1.6], bg: 0x3a2a24, beam: 0.35, lamps: false, fog: 0xf0cfc0 },
    day: { hemi: [0xfff4e0, 0x8a6a4a, 1.7], sun: [0xfff1d0, 2.3], bg: 0x2B1C12, beam: 0.55, lamps: false, fog: 0xcfe3f2 },
    dusk: { hemi: [0xf0c8b0, 0x6a4a5a, 1.2], sun: [0xff9e5e, 1.5], bg: 0x2a1a22, beam: 0.35, lamps: true, fog: 0xc89a9a },
    night: { hemi: [0x8090c8, 0x302838, 0.75], sun: [0x9ab0ff, 0.55], bg: 0x120e18, beam: 0.12, lamps: true, fog: 0x1a2038 },
  };
  const paintSkyDome = (P) => P.sky.userData.draw((g, w, h) => {
    const [top, bottom] = TOD_SKY[tod];
    const r = g.createLinearGradient(0, 0, 0, h);
    r.addColorStop(0, top); r.addColorStop(0.5, bottom); r.addColorStop(1, bottom);
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const applyTod = () => {
    const hour = new Date().getHours();
    const next = hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night';
    const changed = next !== tod;
    tod = next;
    const T = TOD[tod];
    Object.values(PLACES).forEach((P) => {
      P.hemi.color.setHex(T.hemi[0]); P.hemi.groundColor.setHex(T.hemi[1]); P.hemi.intensity = T.hemi[2] * (weather === 'clear' || P.id === 'hall' ? 1 : 0.8);
      P.sun.color.setHex(T.sun[0]); P.sun.intensity = T.sun[1] * (weather === 'clear' ? 1 : 0.55);
    });
    hall.scene.background = new THREE.Color(T.bg);
    hall.sky.userData.draw(skyDraw(tod, true));
    hall.beam.material.opacity = T.beam * (weather === 'clear' ? 1 : 0.4);
    hall.rainGlass.visible = weather === 'rain';
    paintSkyDome(roof);
    roof.nightStars.visible = tod === 'night' && weather === 'clear';
    roof.constellation.material.opacity = tod === 'night' ? 1 : tod === 'dusk' ? 0.7 : 0.35;
    roof.scene.fog.color.setHex(T.fog);
    roof.towerTints.forEach(([m, tint]) => {
      m.emissive.setHex(tod === 'night' || tod === 'dusk' ? 0xffd27a : 0x000000);
      m.color.setHex(tod === 'night' ? 0x2a3048 : tod === 'dusk' ? new THREE.Color(tint).multiplyScalar(0.55).getHex() : tint);
    });
    roof.bulbs.forEach((b) => b.material.color.setHex(T.lamps ? 0xfff1b5 : 0xb8ad90));
    roof.rain.visible = weather === 'rain';
    roof.snow.visible = weather === 'snow';
    updateLamps();
    return changed;
  };

  // ───────── 렌더러·카메라 ─────────
  const canvas = document.createElement('canvas');
  canvas.className = 'lib-canvas';
  stage.prepend(canvas);
  const labels = document.createElement('div');
  labels.className = 'lib3-labels';
  stage.appendChild(labels);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  const narrow = () => stage.clientWidth < 720;
  if (narrow()) Object.values(PLACES).forEach((P) => P.sun.shadow.mapSize.set(1024, 1024)); // 휴대폰은 그림자를 가볍게
  // 들어가기 전에는 방 전체를 멀리서 보여 주고, 들어가면 내 인형 쪽으로 다가간다
  const cam = { yaw: -0.18, pitch: 0.8, dist: narrow() ? 30 : 25, yawT: 0, pitchT: 0.84, distT: narrow() ? 30 : 25, target: new THREE.Vector3(0, 0.5, -0.5) };
  const resize = () => {
    const w = stage.clientWidth; const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  const placeCamera = () => {
    const c = Math.cos(cam.pitch);
    camera.position.set(cam.target.x + Math.sin(cam.yaw) * c * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * c * cam.dist);
    camera.lookAt(cam.target);
  };
  const camRight = () => [Math.cos(cam.yaw), -Math.sin(cam.yaw)];

  // ───────── 종이 인형 ─────────
  const upperGeo = (() => { const g = new THREE.PlaneGeometry(DOLL, DOLL * (1 - HINGE)); g.translate(0, DOLL * HINGE + (DOLL * (1 - HINGE)) / 2, 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, HINGE + uv.getY(i) * (1 - HINGE)); return g; })();
  const lowerGeo = (() => { const g = new THREE.PlaneGeometry(DOLL, DOLL * HINGE); g.translate(0, (-DOLL * HINGE) / 2, 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * HINGE); return g; })();
  const blobGeo = new THREE.CircleGeometry(0.42, 24); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  // 꼬깃단 그림(SVG)을 종이에 오려 붙인 모양으로: 앞은 흰 테두리를 두른 그림, 뒤는 같은 모양의 누런 종이
  const paperOf = (svgText) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const N = 384; const B = 8;
      const sil = document.createElement('canvas'); sil.width = sil.height = N;
      const sg = sil.getContext('2d');
      sg.drawImage(img, 0, 0, N, N);
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, N, N);
      const stamp = (g, color, r) => {
        const tint = document.createElement('canvas'); tint.width = tint.height = N;
        const tg = tint.getContext('2d'); tg.drawImage(sil, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = color; tg.fillRect(0, 0, N, N);
        for (let a = 0; a < 16; a++) g.drawImage(tint, Math.cos((a / 16) * Math.PI * 2) * r, Math.sin((a / 16) * Math.PI * 2) * r);
      };
      const front = document.createElement('canvas'); front.width = front.height = N;
      const fg = front.getContext('2d');
      stamp(fg, 'rgba(46,36,28,.55)', B + 2.5);
      stamp(fg, '#FFFDF8', B);
      fg.drawImage(img, 0, 0, N, N);
      const back = document.createElement('canvas'); back.width = back.height = N;
      const bg = back.getContext('2d');
      stamp(bg, 'rgba(46,36,28,.9)', B + 3);
      stamp(bg, '#F6EEDF', B);
      bg.globalCompositeOperation = 'source-atop';
      bg.globalAlpha = 0.28; bg.drawImage(img, 0, 0, N, N); bg.globalAlpha = 1; // 종이 뒤로 비치는 그림
      bg.strokeStyle = 'rgba(140,110,80,.45)'; bg.lineWidth = 3;
      [[60, 90, 300, 140], [90, 300, 310, 230], [180, 40, 200, 340]].forEach(([a, b, c, d]) => { bg.beginPath(); bg.moveTo(a, b); bg.lineTo(c, d); bg.stroke(); });
      const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
      resolve({ front: tex(front), back: tex(back) });
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
  const dollMats = (paper) => {
    const front = new THREE.MeshLambertMaterial({ map: paper.front, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: paper.front, emissiveIntensity: 0.32 });
    const back = new THREE.MeshLambertMaterial({ map: paper.back, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: paper.back, emissiveIntensity: 0.2 });
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: paper.front, alphaTest: 0.5 });
    return { front, back, depth };
  };
  const placeholder = { front: new THREE.MeshLambertMaterial({ color: 0xE9DCC6, transparent: true, opacity: 0 }), back: new THREE.MeshLambertMaterial({ color: 0xE9DCC6, transparent: true, opacity: 0 }), depth: null };
  const makeDoll = () => {
    const rootG = new THREE.Group();
    const yaw = new THREE.Group(); rootG.add(yaw);
    const body = new THREE.Group(); yaw.add(body);
    const hinge = new THREE.Group(); hinge.position.y = DOLL * HINGE; body.add(hinge);
    const parts = {
      upper: new THREE.Mesh(upperGeo, placeholder.front), upperBack: new THREE.Mesh(upperGeo, placeholder.back),
      lower: new THREE.Mesh(lowerGeo, placeholder.front), lowerBack: new THREE.Mesh(lowerGeo, placeholder.back),
    };
    parts.upper.position.z = 0.004; parts.upperBack.position.z = -0.004; parts.upperBack.rotation.y = Math.PI;
    parts.lower.position.z = 0.004; parts.lowerBack.position.z = -0.004; parts.lowerBack.rotation.y = Math.PI;
    body.add(parts.upper, parts.upperBack);
    hinge.add(parts.lower, parts.lowerBack);
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.renderOrder = 1;
    return { root: rootG, yaw, body, hinge, parts, blob, hingeY: DOLL * HINGE, len: DOLL, head: DOLL * 0.92 };
  };
  // ───────── 꼬깃 종이 인형(입체): 색종이를 접고 꾸겨 만든 꼬깃단. 몸은 각진 접힌 면, 얼굴은 원래 그림을 오려 붙인다 ─────────
  // 구김 무늬: 종이 결 위에 접힌 자국(밝은 줄·어두운 줄)이 엇갈린다
  const crumple = canvasTex(256, 256, (g, w, h) => {
    const rand = seeded(13);
    const img = g.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) { const v = 236 + rand() * 19; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 3; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 26; i++) {
      let x = rand() * w; let y = rand() * h; const a = rand() * Math.PI;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += Math.cos(a + (rand() - 0.5) * 0.9) * 40; y += Math.sin(a + (rand() - 0.5) * 0.9) * 40; g.lineTo(x, y); }
      g.strokeStyle = rand() < 0.5 ? 'rgba(120,100,80,.22)' : 'rgba(255,255,255,.7)'; g.lineWidth = 1.5 + rand() * 1.5; g.stroke();
    }
  }, { repeat: [1, 1] });
  const paperMats = new Map();
  const paperMat = (color, side = THREE.FrontSide) => {
    const key = `${color}|${side}`;
    if (!paperMats.has(key)) paperMats.set(key, new THREE.MeshToonMaterial({ color, map: crumple, gradientMap: gradient, flatShading: true, side }));
    return paperMats.get(key);
  };
  const foldInk = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.85 });
  // 접힌 종이 한 조각: 각진 면 + 접힌 선(먹선)
  const fold = (parent, geo, color, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, side = THREE.FrontSide, crease = 25 } = {}) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(geo, paperMat(color, side)); m.castShadow = true; g.add(m);
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, crease), foldInk));
    g.position.set(x, y, z); g.scale.set(sx, sy, sz); g.rotation.set(rx, ry, rz);
    parent.add(g);
    return g;
  };
  // 꾸김: 꼭짓점을 자리마다 조금씩 밀어 낸다(같은 자리의 꼭짓점은 같이 움직여 틈이 나지 않는다)
  const crumpleGeo = (geo, amount, seed) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const h = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + seed) * 43758.5453;
      const n = (h - Math.floor(h)) - 0.5;
      const len = Math.hypot(x, z) || 1;
      pos.setXYZ(i, x + (x / len) * n * amount, y + n * amount * 0.5, z + (z / len) * n * amount);
    }
    geo.computeVertexNormals();
    return geo;
  };
  // 돌림판 몸통: 옆모습(반지름·높이)을 몇 번만 돌려 각지게
  const lathe = (profile, segments, seed, amount = 0.025) => crumpleGeo(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), amount, seed);
  const tri = (pts) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); return new THREE.ShapeGeometry(sh); };
  // 얼굴 스티커: 원래 그림에서 얼굴 부분만 모양대로 오려 낸다(눈 감은 판도 함께)
  const faceSticker = (svgText, { cx, cy, rx, ry }, eyes) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const S = 40; const pad = 0.8;
      const w = Math.round((rx + pad) * 2 * S); const h = Math.round((ry + pad) * 2 * S);
      const draw = (closed) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, (rx + 0.35) * S, (ry + 0.35) * S, 0, 0, Math.PI * 2); g.clip();
        g.drawImage(img, -(cx - rx - pad) * S, -(cy - ry - pad) * S, 64 * S, 64 * S);
        g.restore();
        if (closed) eyes.forEach(([ex, ey, er]) => {
          const px = (ex - cx + rx + pad) * S; const py = (ey - cy + ry + pad) * S;
          g.fillStyle = '#FFFDF8'; g.beginPath(); g.arc(px, py, er * S * 1.45, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#2E241C'; g.lineWidth = S * 0.42; g.lineCap = 'round'; g.beginPath(); g.arc(px, py - er * S * 0.5, er * S * 1.1, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
        });
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        return t;
      };
      resolve({ open: draw(false), closed: draw(true), aspect: w / h });
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
  // 얼굴만 고른 스티커: 그림(SVG)에서 keep에 맞는 것만 남기고 box(그림 좌표) 부분을 투명 바탕으로 오린다.
  // 눈 감은 판은 hide(보통 .blink 눈동자)를 숨기고 eyes 자리에 감은 눈(∪)을 그린다
  const sticker = (parent, svgText, { keep, hide = '.blink', box, eyes = [], w, y, z, x = 0, bend = 0.8, rx = 0 }) => {
    const [bx0, by0, bx1, by1] = box;
    const h = (w * (by1 - by0)) / (bx1 - bx0);
    const geo = new THREE.PlaneGeometry(w, h, 10, 1);
    { const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const px = pos.getX(i); pos.setZ(i, -px * px * bend); } }
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.25, emissive: 0xffffff, emissiveIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.visible = false; parent.add(mesh);
    const render = (closed) => new Promise((resolve) => {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svg = doc.documentElement;
      const kept = [...svg.querySelectorAll(keep)];
      const lift = new Set(); kept.forEach((k) => { for (let a = k.parentNode; a && a !== svg; a = a.parentNode) lift.add(a); });
      svg.querySelectorAll('*').forEach((el) => { if (el.closest('defs') || lift.has(el) || kept.some((k) => k.contains(el))) return; el.setAttribute('display', 'none'); });
      if (closed && hide) svg.querySelectorAll(hide).forEach((el) => el.setAttribute('display', 'none'));
      const img = new Image();
      img.onload = () => {
        const S = 40; const c = document.createElement('canvas'); c.width = Math.round((bx1 - bx0) * S); c.height = Math.round((by1 - by0) * S);
        const g = c.getContext('2d');
        g.drawImage(img, -bx0 * S, -by0 * S, 64 * S, 64 * S);
        if (closed) eyes.forEach(([ex, ey, er]) => { g.strokeStyle = '#2E241C'; g.lineWidth = S * 0.45; g.lineCap = 'round'; g.beginPath(); g.arc((ex - bx0) * S, (ey - by0) * S - er * S * 0.4, er * S * 1.05, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); });
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resolve(t);
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
    });
    let open = null; let shut = null; let state = false;
    Promise.all([render(false), eyes.length ? render(true) : Promise.resolve(null)]).then(([a, b]) => { if (!a) return; open = a; shut = b; mat.map = mat.emissiveMap = a; mat.needsUpdate = true; mesh.visible = true; });
    return { mesh, setShut(v) { if (!open || !shut || v === state) return; state = v; mat.map = mat.emissiveMap = v ? shut : open; mat.needsUpdate = true; } };
  };
  const ico = (r, detail = 1, seed = 5, amt = 0.02) => crumpleGeo(new THREE.IcosahedronGeometry(r, detail), amt, seed);
  const PAGE = 0xFFF6E6; const INKC = 0x2E241C;
  // 펼친 종이책(V자): 여러 친구가 품에 든다
  const openBook = (parent, { x = 0, y = 0.4, z = 0.4, w = 0.5, h = 0.32, tilt = -0.5, cover = 0xEE7A52 } = {}) => {
    const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.x = tilt; parent.add(b);
    [-1, 1].forEach((k) => {
      const half = new THREE.Group(); half.rotation.y = k * -0.35; b.add(half);
      fold(half, new THREE.BoxGeometry(w / 2, h, 0.012), cover, { x: k * w / 4, z: -0.012 });
      fold(half, new THREE.BoxGeometry(w / 2 - 0.03, h - 0.03, 0.01), PAGE, { x: k * (w / 4 - 0.005), z: 0.002 });
    });
    return b;
  };
  const flapGeo = (len = 0.36, wid = 0.24) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.04, -len, wid * 0.4, 0.02, -len * 0.7, -wid * 0.5, 0, 0, 0, 0.02, -len * 0.7, -wid * 0.5, 0.04, -len, wid * 0.4], 3)); g.computeVertexNormals(); return g; };
  const flaps = (B, color, { x, y, z = 0.02, len, wid }) => [-1, 1].map((k) => { const w = new THREE.Group(); w.position.set(k * x, y, z); w.scale.x = k; B.add(w); fold(w, flapGeo(len, wid), color, { side: THREE.DoubleSide, crease: 1 }); return w; });
  const paperFeet = (H, color, { x = 0.15, z = 0.08, r = 0.1, len = 0.22 } = {}) => [-1, 1].map((k) => { const f = new THREE.Group(); f.position.set(k * x, -0.1, z); H.add(f); fold(f, new THREE.ConeGeometry(r, len, 3), color, { rx: Math.PI / 2, sz: 0.35 }); return f; });
  // 걷기·깜빡임 공통 움직임
  const motion = (d, { wings = [], feet = [], face = null, eyes3d = [], extra = null }) => {
    let blinkAt = 2 + Math.random() * 3;
    d.update = (person, dt, t, walking, phase) => {
      const w = walking ? Math.sin(phase) : 0;
      wings.forEach((g, i) => { g.rotation.z = walking ? 0.2 + Math.abs(w) * 0.5 : 0.06 + Math.sin(t * 1.5 + i) * 0.04; g.rotation.x = walking ? w * 0.2 : 0; });
      feet.forEach((f, i) => { const s2 = i ? -w : w; f.position.y = -0.1 + Math.max(0, s2) * 0.07; f.position.z = (f.userData.z ?? (f.userData.z = f.position.z)) + s2 * 0.06; });
      blinkAt -= dt; const blink = blinkAt < 0.12; if (blinkAt < 0) blinkAt = 2.5 + Math.random() * 3.5;
      const shut = blink || person.pose !== 'up';
      if (face) face.setShut(shut);
      eyes3d.forEach((e) => { e.scale.y = shut ? 0.15 : 1; });
      if (extra) extra(person, dt, t, walking, w);
    };
  };
  const eyeBall = (parent, x, y, z, r = 0.05) => { const e = new THREE.Group(); e.position.set(x, y, z); const p2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshBasicMaterial({ color: INKC })); e.add(p2); const hi = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.32, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); hi.position.set(r * 0.3, r * 0.35, r * 0.8); e.add(hi); parent.add(e); return e; };
  const MODELS = {
    // 뒤뚱(펭귄): 남색 색종이를 접은 달걀 몸, 흰 종이 배, 노란 볏 두 가닥, 주황 부리·발, 품에 안은 종이책.
    // 얼굴은 그림에서 오려 붙인 흰 얼굴띠(굳은 눈썹·눈·볼터치·부리)
    penguin(d, svgText) {
      const NAVY = 0x46536A; const WHITE = 0xFFFDF8; const ORANGE = 0xFF9E3D; const YELLOW = 0xF5C531;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.1], [0.3, 0.14], [0.43, 0.38], [0.42, 0.66], [0.34, 0.96], [0.2, 1.15], [0, 1.22]], 8, 1), NAVY, { sz: 0.9, ry: Math.PI / 8 });
      // 배: 앞에 덧댄 흰 종이(마름모로 접혀 있다)
      fold(B, crumpleGeo(new THREE.IcosahedronGeometry(0.3, 1), 0.02, 3), WHITE, { y: 0.5, z: 0.2, sx: 0.95, sy: 1.15, sz: 0.5 });
      // 얼굴: 오려 붙인 스티커를 몸에 맞게 살짝 휜다
      const faceGeo = new THREE.PlaneGeometry(0.56, 0.33, 8, 1);
      { const pos = faceGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, -x * x * 0.75); } }
      const faceMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.3, emissive: 0xffffff, emissiveIntensity: 0.25 });
      const face = new THREE.Mesh(faceGeo, faceMat); face.position.set(0, 0.92, 0.37); face.rotation.x = -0.12; face.visible = false; B.add(face);
      let faces = null;
      faceSticker(svgText, { cx: 32, cy: 30.4, rx: 8.6, ry: 4.9 }, [[28, 28.6, 1.6], [36, 28.6, 1.6]]).then((f) => { if (!f) return; faces = f; faceMat.map = f.open; faceMat.emissiveMap = f.open; faceMat.needsUpdate = true; face.visible = true; });
      // 볏: 노란 종이 두 장을 옆으로 뻗게 접어 꽂았다
      [-1, 1].forEach((k) => {
        [[0.42, 0.17], [0.0, 0.13]].forEach(([a, len]) => {
          const crest = fold(B, tri([[0, -0.03], [len, 0.02], [0, 0.04]]), YELLOW, { x: k * 0.25, y: 1.02, z: 0.2, side: THREE.DoubleSide });
          crest.rotation.set(0, k > 0 ? -0.5 : Math.PI + 0.5, a);
        });
      });
      // 날개: 남색 세모를 반으로 접은 것
      const wingGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.05, -0.42, 0.1, 0.02, -0.3, -0.12, 0, 0, 0, 0.02, -0.3, -0.12, 0.05, -0.42, 0.1], 3)); g.computeVertexNormals(); return g; })();
      const wings = [-1, 1].map((k) => { const w = new THREE.Group(); w.position.set(k * 0.37, 0.78, 0.02); w.scale.x = k; B.add(w); fold(w, wingGeo, NAVY, { side: THREE.DoubleSide, crease: 1 }); return w; });
      // 꼬리: 등 아래 작은 세모
      fold(B, tri([[-0.12, 0], [0.12, 0], [0, -0.16]]), NAVY, { y: 0.2, z: -0.36, rx: -0.6, side: THREE.DoubleSide });
      // 등: 배달할 편지 봉투를 멨다(덮개 세모, 빨간 봉랍, 어깨끈)
      const env = new THREE.Group(); env.position.set(0, 0.6, -0.395); env.rotation.x = 0.06; B.add(env);
      fold(env, new THREE.BoxGeometry(0.36, 0.25, 0.05), 0xFFF6E6);
      fold(env, tri([[-0.18, 0], [0.18, 0], [0, -0.14]]), 0xF2E6CF, { y: 0.125, z: -0.027, ry: Math.PI, side: THREE.DoubleSide });
      fold(env, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), 0xE4572E, { y: -0.01, z: -0.034, rx: Math.PI / 2 });
      [-1, 1].forEach((k) => fold(env, new THREE.BoxGeometry(0.04, 0.26, 0.02), 0xEE7A52, { x: k * 0.13, y: 0.2, z: 0.03, rx: -0.45, rz: k * 0.08 }));
      // 부리는 스티커에 그려져 있고, 옆에서 보이게 작은 종이 세모를 하나 더 붙인다
      fold(B, new THREE.ConeGeometry(0.05, 0.11, 4), ORANGE, { y: 0.885, z: 0.37, rx: Math.PI / 2, sz: 0.7 });
      // 책: 빨간 종이 표지를 반으로 접고 속지를 끼웠다
      const book = new THREE.Group(); book.position.set(0, 0.5, 0.36); book.rotation.set(-0.12, 0, -0.08); B.add(book);
      fold(book, new THREE.BoxGeometry(0.42, 0.29, 0.075), 0xEE7A52);
      fold(book, new THREE.BoxGeometry(0.38, 0.03, 0.08), 0xFFD9C2, { y: 0.07 });
      fold(book, new THREE.BoxGeometry(0.38, 0.03, 0.08), 0xFFD9C2, { y: -0.07 });
      fold(book, new THREE.BoxGeometry(0.02, 0.26, 0.065), 0xFFF6E6, { x: 0.205 }); // 책장 끝(흰 종이)
      const feet = [-1, 1].map((k) => { const f = new THREE.Group(); f.position.set(k * 0.15, -0.1, 0.08); H.add(f); fold(f, new THREE.ConeGeometry(0.11, 0.24, 3), ORANGE, { rx: Math.PI / 2, sy: 1, sx: 1, sz: 0.35, ry: 0 }); return f; });
      const sweat = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), new THREE.MeshToonMaterial({ color: 0xBFE3F5, gradientMap: gradient, transparent: true, flatShading: true }));
      sweat.scale.y = 1.5; sweat.position.set(0.36, 1.18, 0.12); B.add(sweat);
      d.hinge.position.y = 0.12; d.hingeY = 0.12; d.len = 1.4; d.head = 1.34;
      let blinkAt = 2 + Math.random() * 3;
      let shut = false;
      d.update = (person, dt, t, walking, phase) => {
        const w = walking ? Math.sin(phase) : 0;
        wings.forEach((g, i) => { g.rotation.z = (walking ? 0.2 + Math.abs(w) * 0.5 : 0.06 + Math.sin(t * 1.5 + i) * 0.04) * (i ? 1 : 1); g.rotation.x = walking ? w * 0.2 : 0; });
        feet.forEach((f, i) => { const s2 = i ? -w : w; f.position.y = -0.1 + Math.max(0, s2) * 0.07; f.position.z = 0.08 + s2 * 0.06; });
        book.rotation.z = -0.08 + w * 0.12;
        blinkAt -= dt; const blink = blinkAt < 0.12; if (blinkAt < 0) blinkAt = 2.5 + Math.random() * 3.5;
        const want = blink || person.pose !== 'up';
        if (faces && want !== shut) { shut = want; faceMat.map = faceMat.emissiveMap = shut ? faces.closed : faces.open; faceMat.needsUpdate = true; }
        const drip = walking ? (t * 0.7) % 2.6 : 9;
        sweat.visible = drip < 0.9; sweat.position.y = 1.18 - drip * 0.12; sweat.material.opacity = 1 - drip / 0.9;
      };
    },
    // 꽥(오리): 노란 종이 몸, 머리에 빨간 종이 지붕(안쪽은 크림색), 걸으면 처마에서 빗방울이 똑
    duck(d, svgText) {
      const YEL = 0xFFEB9E; const ORANGE = 0xFF9E3D;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.1], [0.34, 0.14], [0.47, 0.36], [0.46, 0.62], [0.37, 0.86], [0.2, 1.0], [0, 1.04]], 8, 2), YEL, { sz: 0.92, ry: Math.PI / 8 });
      const face = sticker(B, svgText, { keep: '.face, ellipse[fill="#F49A93"]', box: [20.5, 34.5, 43.5, 46.5], eyes: [[28.6, 37.4, 1.3], [38, 37.4, 1.3]], w: 0.66, y: 0.7, z: 0.425, bend: 0.75 });
      // 지붕: 펼친 책을 엎어 머리에 얹었다(책등이 정수리에 닿고, 표지 아래로 책장이 비친다)
      const roof = new THREE.Group(); roof.position.set(0, 1.15, 0.02); B.add(roof);
      fold(roof, new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), 0xEE7A52, { rx: Math.PI / 2 });
      [-1, 1].forEach((k) => {
        const half = new THREE.Group(); half.rotation.z = -k * 0.62; roof.add(half);
        fold(half, new THREE.BoxGeometry(0.5, 0.026, 0.6), 0xEE7A52, { x: k * 0.26, y: 0.012 });
        fold(half, new THREE.BoxGeometry(0.46, 0.045, 0.55), PAGE, { x: k * 0.24, y: -0.024 });
        [-0.1, 0, 0.1].forEach((zz) => fold(half, new THREE.BoxGeometry(0.3, 0.004, 0.012), 0xD8C9B4, { x: k * 0.25, y: -0.048, z: zz }));
      });
      const wings = flaps(B, YEL, { x: 0.47, y: 0.62, len: 0.32, wid: 0.24 });
      // 꽁지: 뒤로 살짝 들린 노란 세모
      const tail = fold(B, new THREE.ConeGeometry(0.12, 0.22, 4), YEL, { y: 0.32, z: -0.42, rx: -1.15 });
      const feet = paperFeet(H, ORANGE, { x: 0.16, r: 0.11 });
      const drops = [-1, 1].map((k) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshToonMaterial({ color: 0x9FD3EE, gradientMap: gradient, transparent: true, flatShading: true })); m.scale.y = 1.5; m.position.set(k * 0.46, 0.84, 0.2); B.add(m); return m; });
      d.hinge.position.y = 0.1; d.hingeY = 0.1; d.len = 1.3; d.head = 1.42;
      motion(d, { wings, feet, face, extra: (person, dt, t, walking, w) => { drops.forEach((m, i) => { const k = walking ? (t * 1.4 + i * 0.5) % 1.2 : 9; m.visible = k < 0.6; m.position.y = 0.84 - k * 0.5; m.material.opacity = 1 - k / 0.6; }); roof.rotation.z = walking ? Math.sin(t * 9) * 0.04 : 0; tail.rotation.z = walking ? w * 0.4 : Math.sin(t * 1.6) * 0.1; } });
    },
    // 꼼지(두더지): 갈색 종이 몸, 노란 안전모와 이마 등불, 분홍 앞발로 펼친 책을 든다
    mole(d, svgText) {
      const BROWN = 0xB6A190; const PINK = 0xF3C6B8;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.1], [0.36, 0.14], [0.48, 0.38], [0.46, 0.62], [0.36, 0.84], [0.18, 0.96], [0, 0.99]], 8, 3), BROWN, { sz: 0.92, ry: Math.PI / 8 });
      const face = sticker(B, svgText, { keep: '.face, ellipse[fill="#F49A93"]', box: [21, 32.5, 43, 46], eyes: [[26.6, 35.6, 1.3], [37.4, 35.6, 1.3]], w: 0.64, y: 0.66, z: 0.43, bend: 0.75 });
      const hat = new THREE.Group(); hat.position.y = 0.82; B.add(hat);
      fold(hat, crumpleGeo(new THREE.SphereGeometry(0.41, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.015, 4), 0xFFC93C, { sz: 0.94, ry: Math.PI / 8 });
      fold(hat, new THREE.CylinderGeometry(0.5, 0.5, 0.035, 8), 0xFFC93C, { ry: Math.PI / 8 });
      fold(hat, new THREE.BoxGeometry(0.13, 0.12, 0.08), 0xFFF6D6, { x: 0.12, y: 0.28, z: 0.3, rx: -0.5 });
      const lampGlow = glow(hat, 0xFFF2B3, 0.5, 0.12, 0.3, 0.38);
      openBook(B, { y: 0.4, z: 0.44, w: 0.5, h: 0.3, tilt: -0.55, cover: 0xD8C9B4 });
      [-1, 1].forEach((k) => fold(B, ico(0.06), PINK, { x: k * 0.27, y: 0.42, z: 0.43, sz: 0.8 }));
      const feet = paperFeet(H, PINK, { x: 0.17, r: 0.1 });
      d.hinge.position.y = 0.1; d.hingeY = 0.1; d.len = 1.3; d.head = 1.36;
      // 헤드램프 불빛: 앞쪽 아래로 퍼지는 빛 고깔(밤일수록 진하게)
      const beamPivot = new THREE.Group(); beamPivot.position.set(0.12, 0.3, 0.36); beamPivot.rotation.x = -1.2; hat.add(beamPivot);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFF2B3, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.95, 16, 1, true), beamMat); beam.position.y = -0.475; beamPivot.add(beam);
      // 등: 책 파는 삽을 비스듬히 멨다(나무 자루, T 손잡이, 은빛 삽날)
      const shovel = new THREE.Group(); shovel.position.set(0.02, 0.5, -0.43); shovel.rotation.set(0.12, 0, 0.55); B.add(shovel);
      fold(shovel, new THREE.CylinderGeometry(0.024, 0.024, 0.66, 6), 0xC08A55);
      fold(shovel, new THREE.BoxGeometry(0.16, 0.035, 0.035), 0xC08A55, { y: 0.34 });
      const blade = new THREE.Shape(); blade.moveTo(-0.1, 0); blade.lineTo(0.1, 0); blade.lineTo(0.1, -0.15); blade.quadraticCurveTo(0.05, -0.24, 0, -0.27); blade.quadraticCurveTo(-0.05, -0.24, -0.1, -0.15); blade.lineTo(-0.1, 0);
      fold(shovel, new THREE.ExtrudeGeometry(blade, { depth: 0.02, bevelEnabled: false }), 0xA9B2BA, { y: -0.31, z: -0.01 });
      fold(shovel, new THREE.CylinderGeometry(0.034, 0.03, 0.06, 6), 0x8E969E, { y: -0.31 });
      // 코: 분홍 종이 코를 도톰하게
      fold(B, ico(0.06, 0, 77), 0xF08F96, { y: 0.645, z: 0.445, sx: 1.2, sz: 0.75 });
      motion(d, { feet, face, extra: (person, dt, t, walking) => {
        lampGlow.material.opacity = 0.7 + Math.sin(t * 3) * 0.2;
        const h = new Date().getHours(); const night = h >= 18 || h < 6;
        beamMat.opacity = (night ? 0.2 : 0.09) + Math.sin(t * 3) * 0.02;
        beamPivot.rotation.x = -1.2 + (walking ? Math.sin(t * 9) * 0.05 : Math.sin(t * 0.7) * 0.15);
        shovel.rotation.z = 0.55 + (walking ? Math.sin(t * 9) * 0.05 : 0);
      } });
    },
    // 개굴(개구리): 납작한 초록 종이 몸, 머리 위 툭 튀어나온 두 눈, 펼친 책을 깔고 앉는다
    frog(d, svgText) {
      const GREEN = 0xBFE5A6;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.12], [0.42, 0.16], [0.52, 0.32], [0.48, 0.5], [0.34, 0.64], [0, 0.69]], 8, 6), GREEN, { sz: 0.92, ry: Math.PI / 8 });
      const eyes3d = [];
      [-1, 1].forEach((k) => {
        fold(B, ico(0.15, 1, 7 + k), GREEN, { x: k * 0.22, y: 0.7, z: 0.12 });
        fold(B, ico(0.1, 1, 9 + k), 0xFFFFFF, { x: k * 0.23, y: 0.74, z: 0.22, sz: 0.7 });
        eyes3d.push(eyeBall(B, k * 0.25, 0.77, 0.3, 0.045));
      });
      const face = sticker(B, svgText, { keep: '.face > path, ellipse[fill="#F49A93"]', box: [18, 38.5, 46, 43.5], w: 0.78, y: 0.47, z: 0.46, bend: 0.6 });
      const pad = new THREE.Group(); pad.position.set(0, -0.08, 0.05); H.add(pad);
      [-1, 1].forEach((k) => { const leaf = fold(pad, new THREE.BoxGeometry(0.42, 0.025, 0.5), PAGE, { x: k * 0.21 }); leaf.rotation.z = k * 0.12; });
      const feet = paperFeet(H, GREEN, { x: 0.32, r: 0.1, z: 0.18 });
      // 혀: 입에서 쭉 뻗어 빨간 책갈피를 낚아챘다(개굴의 생명)
      const tongue = new THREE.Group(); tongue.position.set(0.0, 0.45, 0.47); B.add(tongue);
      const tongueCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.14, -0.05, 0.12), new THREE.Vector3(0.34, 0.02, 0.14), new THREE.Vector3(0.44, 0.22, 0.08)]);
      fold(tongue, new THREE.TubeGeometry(tongueCurve, 16, 0.032, 6), 0xF49A93, { crease: 60 });
      const mark = new THREE.Group(); mark.position.set(0.45, 0.25, 0.08); mark.rotation.z = 0.25; tongue.add(mark);
      const ribbon = new THREE.Shape(); ribbon.moveTo(-0.07, 0.2); ribbon.lineTo(0.07, 0.2); ribbon.lineTo(0.07, -0.06); ribbon.lineTo(0, 0); ribbon.lineTo(-0.07, -0.06); ribbon.lineTo(-0.07, 0.2);
      fold(mark, new THREE.ExtrudeGeometry(ribbon, { depth: 0.015, bevelEnabled: false }), 0xEE7A52);
      fold(mark, new THREE.BoxGeometry(0.07, 0.012, 0.02), 0xFFD9C2, { y: 0.14, z: 0.008 });
      // 포인트: 두 눈 사이에 비스듬히 얹은 연잎 모자(갈라진 홈)와 분홍 연꽃 한 송이
      const lily = new THREE.Group(); lily.position.set(0, 0.79, -0.05); lily.rotation.set(-0.16, 0.5, 0.14); lily.scale.setScalar(1.3); B.add(lily);
      fold(lily, new THREE.CylinderGeometry(0.2, 0.2, 0.025, 12, 1, false, 0.35, Math.PI * 2 - 0.7), 0x7FBF62, { crease: 30 });
      [0.6, 1.6, 2.6, 3.6, 4.6].forEach((a) => fold(lily, new THREE.BoxGeometry(0.15, 0.004, 0.006), 0x5E9E48, { x: Math.sin(a) * 0.09, y: 0.015, z: Math.cos(a) * 0.09, ry: a + Math.PI / 2 }));
      const lotus = new THREE.Group(); lotus.position.set(-0.05, 0.02, 0.05); lotus.scale.setScalar(1.35); lily.add(lotus);
      for (let i = 0; i < 6; i++) { const p = new THREE.Group(); p.rotation.y = (i / 6) * Math.PI * 2; lotus.add(p); fold(p, new THREE.ConeGeometry(0.035, 0.11, 4), i % 2 ? 0xF7B6C2 : 0xF49AAE, { z: 0.03, y: 0.05, rx: 0.55 }); }
      for (let i = 0; i < 3; i++) { const p = new THREE.Group(); p.rotation.y = (i / 3) * Math.PI * 2 + 0.5; lotus.add(p); fold(p, new THREE.ConeGeometry(0.03, 0.1, 4), 0xFBD0D8, { z: 0.012, y: 0.06, rx: 0.2 }); }
      fold(lotus, ico(0.025, 0, 90), 0xF5C531, { y: 0.075 });
      // 등: 진초록 점무늬 종이를 군데군데 덧댔다
      const rAt = (y) => { const P = [[0, 0.12], [0.42, 0.16], [0.52, 0.32], [0.48, 0.5], [0.34, 0.64], [0, 0.69]]; for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const k = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k; } return 0; };
      [[0.2, 0.44, 0.075], [-0.22, 0.34, 0.09], [0.02, 0.56, 0.065], [-0.06, 0.25, 0.06], [0.36, 0.28, 0.055], [-0.36, 0.48, 0.05]].forEach(([x, y, s], i) => {
        const z = -Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x)) * 0.92;
        const sp = fold(B, ico(1, 0, 95 + i, 0.15), 0x8CC46F, { x: x * 1.02, y, z: z * 1.02, sx: s, sy: s * 0.85, sz: 0.02, crease: 40 });
        sp.rotation.y = Math.atan2(x, z);
      });
      d.hinge.position.y = 0.12; d.hingeY = 0.12; d.len = 1.0; d.head = 1.0;
      motion(d, { feet, face, eyes3d, extra: (person, dt, t, walking) => { tongue.rotation.z = Math.sin(t * (walking ? 7 : 1.8)) * 0.08; tongue.rotation.y = Math.sin(t * 1.3) * 0.12; mark.rotation.z = 0.25 + Math.sin(t * 2.4) * 0.15; } });
    },
    // 구름(너구리): 회색 종이 몸·머리, 눈 둘레 검은 가면, 빨간 털모자, 줄무늬 꼬리, 펼친 책
    raccoon(d, svgText) {
      const GRAY = 0xC8BFB5; const DARK = 0x7D736B;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.1], [0.3, 0.14], [0.4, 0.3], [0.37, 0.5], [0.24, 0.6], [0, 0.62]], 8, 8), GRAY, { sz: 0.9, ry: Math.PI / 8 });
      const head = new THREE.Group(); head.position.y = 0.95; B.add(head);
      fold(head, ico(0.42, 1, 11, 0.02), GRAY, { sx: 1.12, sy: 0.82, sz: 0.92 });
      [-1, 1].forEach((k) => { fold(head, new THREE.ConeGeometry(0.13, 0.26, 3), GRAY, { x: k * 0.32, y: 0.3, rz: -k * 0.35 }); fold(head, new THREE.ConeGeometry(0.06, 0.14, 3), DARK, { x: k * 0.32, y: 0.29, z: 0.04, rz: -k * 0.35 }); });
      fold(head, crumpleGeo(new THREE.SphereGeometry(0.36, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.015, 12), 0xEE7A52, { y: 0.14, sy: 0.75, ry: Math.PI / 8 });
      fold(head, ico(0.08, 0, 13), 0xEE7A52, { x: 0.14, y: 0.44 });
      const face = sticker(head, svgText, { keep: 'path[fill="#8F857C"], ellipse[fill="#FFFDF8"], .face', box: [16.5, 26, 47.5, 42], eyes: [[24.5, 31.4, 1.2], [39.3, 31.4, 1.2]], w: 0.84, y: -0.02, z: 0.37, bend: 0.75 });
      const tail = new THREE.Group(); tail.position.set(0, 0.22, -0.3); B.add(tail);
      for (let i = 0; i < 5; i++) fold(tail, new THREE.CylinderGeometry(0.1 - i * 0.012, 0.11 - i * 0.012, 0.13, 6), i % 2 ? DARK : GRAY, { y: i * 0.1, z: -i * 0.06, rx: -0.5 });
      openBook(B, { y: 0.36, z: 0.38, w: 0.48, h: 0.3, tilt: -0.6 });
      [-1, 1].forEach((k) => fold(B, ico(0.065), GRAY, { x: k * 0.25, y: 0.36, z: 0.38 }));
      const feet = paperFeet(H, GRAY, { x: 0.15, r: 0.09 });
      d.hinge.position.y = 0.1; d.hingeY = 0.1; d.len = 1.4; d.head = 1.55;
      // 그림 속 콧방울: 꾸벅꾸벅 졸거나 잠들었을 때만 코에서 부풀었다 톡 터진다
      const bubble = new THREE.Group(); bubble.position.set(0.12, -0.12, 0.41); head.add(bubble);
      const bubMat = new THREE.MeshLambertMaterial({ color: 0xCFEAF7, transparent: true, opacity: 0.55, emissive: 0x9FD3EE, emissiveIntensity: 0.25, depthWrite: false });
      const bub = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), bubMat); bubble.add(bub);
      const shine = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); shine.position.set(-0.4, 0.45, 0.6); bub.add(shine);
      let bubT = Math.random() * 4;
      motion(d, { feet, face, extra: (person, dt, t, walking, w) => {
        tail.rotation.z = Math.sin(t * (walking ? 6 : 1.4)) * 0.18; head.rotation.z = walking ? w * 0.05 : Math.sin(t * 0.8) * 0.02;
        if (walking || person.pose === 'up' || !person.pose) { bubT = 0; bubble.visible = false; return; }
        bubT += dt; const cyc = bubT % 5.2; // 4.6초 숨 쉬며 커지다 0.6초 쉬고 다시
        bubble.visible = cyc < 4.6;
        const grow = Math.min(1, cyc / 4.6); const s2 = 0.03 + grow * 0.09 + Math.sin(cyc * 2.6) * 0.008 * grow;
        bub.scale.setScalar(s2); bubMat.opacity = 0.5 - (cyc > 4.45 ? (cyc - 4.45) * 3 : 0);
      } });
    },
    // 꼼지(책벌레): 눕혀 둔 두꺼운 빨간 책을 갉아 구멍을 내고, 마디마디 초록 몸을 S자로 내민다. 앞으로 빨간 책갈피 끈
    bookworm(d, svgText) {
      const GREEN = 0xD6EDB8; const LEAF = 0xB9D99A; const RED = 0xEE7A52;
      const B = d.body;
      const book = new THREE.Group(); book.position.set(0, 0, -0.08); B.add(book);
      fold(book, new THREE.BoxGeometry(0.8, 0.035, 0.6), RED, { y: 0.02 });
      fold(book, new THREE.BoxGeometry(0.76, 0.17, 0.56), PAGE, { x: 0.01, y: 0.12 });
      fold(book, new THREE.BoxGeometry(0.8, 0.035, 0.6), RED, { y: 0.22 });
      fold(book, new THREE.BoxGeometry(0.04, 0.24, 0.6), RED, { x: -0.4, y: 0.12 });
      [0.07, 0.11, 0.15].forEach((yy) => fold(book, new THREE.BoxGeometry(0.7, 0.006, 0.004), 0xE2D3BB, { y: yy, z: 0.282 }));
      // 갉아 먹은 구멍(삐죽한 테두리)
      const bite = new THREE.Mesh(new THREE.CircleGeometry(0.17, 9), new THREE.MeshBasicMaterial({ color: 0x6B4A33, polygonOffset: true, polygonOffsetFactor: -2 }));
      bite.rotation.x = -Math.PI / 2; bite.position.set(0.04, 0.2385, 0.06); book.add(bite);
      fold(book, new THREE.BoxGeometry(0.06, 0.22, 0.012), 0xE4572E, { x: 0.26, y: 0.08, z: 0.306 });
      // 몸: 통통한 마디 둘 위에 큰 머리. 목 없이 동글동글, 정독 연구원이라 동그란 안경을 썼다
      const worm = new THREE.Group(); worm.position.set(0.04, 0.2, -0.02); B.add(worm);
      const SEG = [[0, 0.03, -0.03, 0.15], [0, 0.17, 0.04, 0.165]];
      const segs = SEG.map(([x, y, z, r], i) => { const s = fold(worm, ico(r, 1, 40 + i), i % 2 ? GREEN : 0xCDE8AA, { x, y, z, sy: 0.85 }); s.userData.base = [x, y, z]; return s; });
      [-1, 1].forEach((k) => fold(segs[1], ico(0.045, 0, 51), LEAF, { x: k * 0.14, y: -0.06, z: 0.07 }));
      const headW = new THREE.Group(); headW.position.set(0, 0.44, 0.1); worm.add(headW);
      fold(headW, ico(0.27, 1, 15), GREEN, { sz: 0.9 });
      [-1, 1].forEach((k) => { fold(headW, new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), INKC, { x: k * 0.1, y: 0.29, rz: -k * 0.35 }); eyeBall(headW, k * 0.127, 0.37, 0, 0.042); });
      const face = sticker(headW, svgText, { keep: '.face, ellipse[fill="#F49A93"]', hide: 'circle[cx="31.6"], circle[cx="36.4"]', box: [26.5, 19, 41.5, 26.5], eyes: [[31.6, 21.6, 1.25], [36.4, 21.6, 1.25]], w: 0.52, y: -0.02, z: 0.235, bend: 1.0 });
      const inkM = new THREE.MeshBasicMaterial({ color: INKC });
      [-1, 1].forEach((k) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.011, 5, 16), inkM); ring.position.set(k * 0.083, 0.02, 0.262); headW.add(ring); });
      { const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 4), inkM); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.03, 0.27); headW.add(bridge); }
      // 앞발 두 개로 책 가장자리를 붙잡았다
      [-1, 1].forEach((k) => fold(B, ico(0.055, 0, 60 + k), GREEN, { x: 0.04 + k * 0.15, y: 0.26, z: 0.17 }));
      d.hinge.position.y = 0.02; d.hingeY = 0.02; d.len = 1.0; d.head = 1.3;
      motion(d, { face, extra: (person, dt, t, walking, w) => {
        const amp = walking ? 0.03 : 0.01; const sp = walking ? 9 : 1.6;
        segs.forEach((s, i) => { const [x, y, z] = s.userData.base; s.position.set(x + Math.sin(t * sp - i * 0.9) * amp, y + (walking ? Math.abs(Math.sin(t * sp - i * 0.9)) * 0.02 : 0), z); });
        headW.position.x = Math.sin(t * sp - 1.8) * amp;
        headW.position.y = 0.44 + (walking ? Math.abs(w) * 0.03 : Math.sin(t * 1.6) * 0.008);
        headW.rotation.z = walking ? w * 0.1 : Math.sin(t * 1.2) * 0.06;
      } });
    },
    // 따끔(고슴도치): 크림색 종이 몸, 등을 덮은 꾸긴 종이 솜털, 노란 연필과 펼친 책
    hedgehog(d, svgText) {
      const CREAM = 0xF6E6CF; const SPIKE = 0xC9A783;
      const B = d.body; const H = d.hinge;
      fold(B, lathe([[0, 0.1], [0.34, 0.14], [0.45, 0.34], [0.43, 0.56], [0.33, 0.74], [0.16, 0.84], [0, 0.87]], 8, 16), CREAM, { sz: 0.92, ry: Math.PI / 8 });
      // 털: 꾸긴 종이 솜뭉치가 등·정수리·옆을 몽글몽글 덮는다(얼굴 둘레는 비운다)
      // 큼지막한 솜뭉치 스무 개 남짓(구름처럼 겹치게). 잔 동그라미가 모여 보이지 않도록 크기를 키우고 먹선은 굵은 접힘만
      const TUFT = [0xE6CDA6, 0xDCC096, 0xEBD6B4];
      const tuftGeos = [0, 1, 2].map((k) => ico(1, 1, 30 + k, 0.08));
      const N = 40;
      for (let i = 0; i < N; i++) {
        const yy = 1 - ((i + 0.5) / N) * 2; const r = Math.sqrt(1 - yy * yy); const th = i * 2.39996;
        const dir = new THREE.Vector3(Math.cos(th) * r, yy, Math.sin(th) * r);
        if (dir.y < -0.35 || (dir.z > 0.1 && dir.y < 0.6)) continue;
        const size = 0.19 + ((i * 37) % 3) * 0.02;
        fold(B, tuftGeos[i % 3], TUFT[i % 3], { x: dir.x * 0.36, y: 0.5 + dir.y * 0.32, z: dir.z * 0.33, sx: size, sy: size * 0.88, sz: size, crease: 60 });
      }
      // 앞머리: 이마에 큰 뭉치 둘
      [-0.09, 0.1].forEach((x, i) => fold(B, tuftGeos[i], TUFT[(i + 1) % 3], { x, y: 0.8, z: 0.2, sx: 0.15, sy: 0.12, sz: 0.12, crease: 60 }));
      const face = sticker(B, svgText, { keep: '.face, ellipse[fill="#F49A93"]', box: [21, 39, 43, 50.5], eyes: [[27.4, 42.8, 2.2], [36.6, 42.8, 2.2]], w: 0.64, y: 0.54, z: 0.42, bend: 0.8 });
      openBook(B, { y: 0.3, z: 0.42, w: 0.46, h: 0.28, tilt: -0.6 });
      [-1, 1].forEach((k) => fold(B, ico(0.06), CREAM, { x: k * 0.25, y: 0.3, z: 0.42 }));
      const pencil = new THREE.Group(); pencil.position.set(0.42, 0.5, 0.2); pencil.rotation.set(0.3, 0, -0.9); B.add(pencil);
      fold(pencil, new THREE.CylinderGeometry(0.035, 0.035, 0.42, 6), 0xFFD66B);
      fold(pencil, new THREE.ConeGeometry(0.035, 0.09, 6), 0xF3DDBF, { y: 0.255 });
      const feet = paperFeet(H, CREAM, { x: 0.15, r: 0.08 });
      d.hinge.position.y = 0.1; d.hingeY = 0.1; d.len = 1.2; d.head = 1.15;
      motion(d, { feet, face, extra: (person, dt, t, walking, w) => { pencil.rotation.z = -0.9 + (walking ? w * 0.15 : Math.sin(t * 2) * 0.05); } });
    },
    // 느릿(달팽이): 길쭉한 크림색 발, 우뚝 선 목과 더듬이 끝 눈, 등에 진 두루마리 집(문·창·굴뚝)
    snail(d, svgText) {
      const SKIN = 0xF3DDB8; const SHELL = 0xEFB585; const SHELL_IN = 0xD38E5B;
      const B = d.body;
      fold(B, crumpleGeo(new THREE.SphereGeometry(0.5, 8, 5), 0.02, 17), SKIN, { y: 0.17, sx: 0.55, sy: 0.32, sz: 1.3 });
      const neck = new THREE.Group(); neck.position.set(0, 0.15, 0.42); B.add(neck);
      fold(neck, lathe([[0, 0], [0.22, 0.04], [0.24, 0.36], [0.22, 0.6], [0.12, 0.72], [0, 0.75]], 7, 18), SKIN);
      const eyes3d = [];
      const stalks = [-1, 1].map((k) => { const st = new THREE.Group(); st.position.set(k * 0.09, 0.68, 0.02); st.rotation.z = -k * 0.3; neck.add(st); fold(st, new THREE.CylinderGeometry(0.018, 0.022, 0.32, 5), INKC, { y: 0.16 }); eyes3d.push(eyeBall(st, 0, 0.34, 0.02, 0.065)); return st; });
      const face = sticker(neck, svgText, { keep: '.face > path, ellipse[fill="#F49A93"]', box: [12, 35, 25, 42], w: 0.5, y: 0.44, z: 0.215, bend: 1.2 });
      // 껍데기: 종이 띠를 돌돌 만 두루마리 북. 옆면엔 감긴 결이 소용돌이로, 모서리는 둥글게 눌렀다
      const shell = new THREE.Group(); shell.position.set(0, 0.6, -0.17); B.add(shell);
      const R1 = 0.4; const W = 0.5; const TURNS = 2.6; const BEV = 0.035;
      const spiral = (u) => { const a = u * TURNS * Math.PI * 2; const r = 0.05 + (R1 - 0.05) * Math.pow(u, 0.8); return { y: Math.sin(a) * r, z: -Math.cos(a) * r }; };
      const outline = new THREE.Shape();
      for (let i = 0; i <= 60; i++) { const { y, z } = spiral(1 - 1 / TURNS + (i / 60) / TURNS); if (i) outline.lineTo(-z, y); else outline.moveTo(-z, y); }
      const drum = new THREE.ExtrudeGeometry(outline, { depth: W - BEV * 2, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 2, curveSegments: 4 });
      drum.rotateY(Math.PI / 2); drum.translate(-(W - BEV * 2) / 2, 0, 0);
      fold(shell, drum, SHELL, { crease: 35 });
      // 감긴 결: 양옆에 먹선 소용돌이
      const inkMat = new THREE.MeshBasicMaterial({ color: INKC });
      [-1, 1].forEach((k) => {
        const pts = []; for (let i = 0; i <= 180; i += 2) { const { y, z } = spiral(i / 180); pts.push(new THREE.Vector3(k * (W / 2 + 0.004), y, z)); }
        shell.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.012, 5), inkMat));
      });
      // 집: 껍데기가 곧 느릿의 집. 뒤에 나무 문과 섬돌, 소용돌이 한가운데 불 켜진 동그란 창, 지붕엔 굴뚝과 종이 연기
      const door = new THREE.Group(); door.position.set(0, -0.15, -0.365); door.rotation.y = Math.PI; shell.add(door);
      const arch = (w, h) => { const sh = new THREE.Shape(); sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, h); sh.absarc(0, h, w, 0, Math.PI, false); sh.lineTo(-w, 0); return sh; };
      fold(door, new THREE.ExtrudeGeometry(arch(0.095, 0.13), { depth: 0.04, bevelEnabled: false }), 0xFFF6E6, { y: -0.01 });
      fold(door, new THREE.ExtrudeGeometry(arch(0.07, 0.12), { depth: 0.055, bevelEnabled: false }), 0x9A643F);
      fold(door, new THREE.BoxGeometry(0.006, 0.17, 0.004), 0x6E4529, { y: 0.09, z: 0.057 });
      fold(door, ico(0.017, 0, 70), 0xF5C531, { x: 0.042, y: 0.09, z: 0.065 });
      fold(door, new THREE.BoxGeometry(0.22, 0.03, 0.07), 0xD8C9B4, { y: -0.015, z: 0.04 });
      const winMat = new THREE.MeshBasicMaterial({ color: 0xFFE08A });
      [-1, 1].forEach((k) => {
        const win = new THREE.Group(); win.position.x = k * (W / 2 + 0.01); win.rotation.y = k * Math.PI / 2; shell.add(win);
        win.add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), winMat));
        const fr = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.014, 5, 16), inkMat); fr.position.z = 0.004; win.add(fr);
        [0, Math.PI / 2].forEach((rz) => { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.006), inkMat); bar.rotation.z = rz; bar.position.z = 0.006; win.add(bar); });
      });
      const chim = new THREE.Group(); chim.position.set(0.07, 0.36, -0.08); chim.rotation.z = -0.12; shell.add(chim);
      fold(chim, new THREE.CylinderGeometry(0.045, 0.05, 0.2, 6), 0xC8643F, { y: 0.06 });
      fold(chim, new THREE.CylinderGeometry(0.06, 0.06, 0.035, 6), 0x8E4A30, { y: 0.17 });
      const puffs = [0, 1, 2].map((i) => { const m = new THREE.Mesh(ico(0.045, 0, 80 + i), new THREE.MeshBasicMaterial({ color: 0xF7F2EA, transparent: true, depthWrite: false })); chim.add(m); return m; });
      d.hinge.position.y = 0.05; d.hingeY = 0.05; d.len = 1.3; d.head = 1.4;
      motion(d, { face, eyes3d, extra: (person, dt, t, walking, w) => {
        stalks.forEach((st, i) => { st.rotation.x = Math.sin(t * 2 + i) * 0.12; }); neck.rotation.x = walking ? Math.sin(t * 3) * 0.06 : 0; shell.position.z = -0.17 + (walking ? Math.sin(t * 3 - 0.8) * 0.03 : 0);
        puffs.forEach((m, i) => { const k = ((t * (walking ? 0.6 : 0.35)) + i / 3) % 1; m.position.set(Math.sin(k * 5 + i) * 0.04 - k * 0.08, 0.2 + k * 0.42, 0); m.scale.setScalar(0.6 + k * 1.4); m.material.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; });
      } });
    },
  };
  const makeModel = (critter, svgText) => {
    const d = makeDoll();
    d.body.remove(d.parts.upper, d.parts.upperBack); d.hinge.remove(d.parts.lower, d.parts.lowerBack);
    d.parts = null;
    d.model = true;
    MODELS[critter](d, svgText);
    return d;
  };
  const dollFor = (critter, svgText) => (MODELS[critter] ? makeModel(critter, svgText) : makeDoll());
  const dress = (person, paper) => {
    if (!paper || !person.doll.parts) return;
    const m = dollMats(paper);
    const { upper, upperBack, lower, lowerBack } = person.doll.parts;
    upper.material = m.front; lower.material = m.front; upperBack.material = m.back; lowerBack.material = m.back;
    [upper, lower].forEach((mesh) => { mesh.castShadow = true; mesh.customDepthMaterial = m.depth; });
  };

  // ───────── 사람 ─────────
  const STATUS = { read: '읽는 중', write: '쓰는 중', rest: '쉬는 중' };
  const people = new Map();
  const faceOf = (id) => root.querySelector(`template[data-person="${id}"]`);
  const critterOf = (svgText) => (svgText.match(/critter-([a-z]+)/) || [])[1] || 'wood';
  let me = null;
  let current = hall;
  const createPerson = (id) => {
    const template = faceOf(id);
    if (!template) return null;
    const svg = template.content.querySelector('svg');
    const svgText = svg ? svg.outerHTML : '';
    const label = document.createElement('div');
    label.className = 'lib3-label' + (id === meId ? ' me' : '');
    label.innerHTML = '<span class="lib-bubble" hidden></span><span class="lib-tag"><b></b><small></small></span><span class="lib3-z" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>';
    label.querySelector('.lib-tag b').textContent = template.dataset.name;
    labels.appendChild(label);
    const person = {
      id, name: template.dataset.name, label, doll: dollFor(critterOf(svgText), svgText), critter: critterOf(svgText), heading: 0,
      place: 'hall', layer: 0, x: 0, z: 7, y: 0, tx: 0, tz: 7, tlevel: 0, seat: null, seated: null, status: 'read', pose: 'up',
      face: 1, flip: 1, walking: false, running: false, air: 0, jumpV: 0, phase: 0, lift: 0, hop: null, act: null, fold: 0, lie: 0, nod: 0, squash: 0, clock: 0, trail: 0, placed: false,
    };
    if (!person.doll.model) paperOf(svgText).then((paper) => dress(person, paper));
    hall.scene.add(person.doll.root); hall.scene.add(person.doll.blob);
    people.set(id, person);
    return person;
  };
  const moveToScene = (person, placeId) => {
    if (person.place === placeId && person.doll.root.parent === PLACES[placeId].scene) return;
    person.place = placeId;
    PLACES[placeId].scene.add(person.doll.root);
    PLACES[placeId].scene.add(person.doll.blob);
  };
  const seatOf = (person) => (person.seated ? PLACES[person.place].seatById(person.seated) : null);
  const label = (person) => {
    const sleeping = person.pose !== 'up';
    const where = person.place === 'roof' ? '옥상 · ' : levelOf(PLACES[person.place], person.layer, person.x, person.z) === 1 ? '다락 · ' : '';
    person.label.querySelector('.lib-tag small').textContent = person.pose === 'sleep' ? '자는 중' : person.pose === 'doze' ? '꾸벅꾸벅' : STATUS[person.status] || STATUS.read;
    person.label.classList.toggle('sleepy', sleeping);
    person.label.classList.toggle('deep', person.pose === 'sleep');
    person.whereText = where;
  };

  // ───────── 효과: 소리·먼지·발자국·솜 ─────────
  const sound = window.LibSound;
  const sfx = (name, ...args) => { if (sound && sound.on) sound[name](...args); };
  const cadence = (kind) => (sound ? sound.cadence(kind) : 0.3);
  const hear = (person) => {
    if (!person || person === me) return { gain: 1, pan: 0 };
    if (!me || person.place !== me.place) return { gain: 0, pan: 0 };
    const dx = person.x - me.x; const dz = person.z - me.z; const dy = person.y - me.y;
    const d = Math.hypot(dx, dz, dy * 1.5);
    const [rx, rz] = camRight();
    return { gain: Math.max(0, 1 - d / 16) ** 1.5, pan: clamp((dx * rx + dz * rz) / 8, -0.85, 0.85) };
  };
  const bits = []; // 솜·먼지·종잇조각
  const spawnBits = (P, x, y, z, { count = 5, color = 0xfffaf0, spread = 1, up = 1, size = 0.22, life = 0.8, paper = false } = {}) => {
    if (reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const sprite = paper
        ? new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), toon(0xFFFDF8, { side: THREE.DoubleSide }))
        : new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false }));
      sprite.position.set(x, y, z);
      if (!paper) sprite.scale.set(size, size, 1);
      const a = Math.random() * Math.PI * 2;
      P.scene.add(sprite);
      bits.push({ sprite, P, vx: Math.cos(a) * spread * (0.6 + Math.random() * 0.8), vy: up * (0.8 + Math.random()), vz: Math.sin(a) * spread * (0.6 + Math.random() * 0.8), t: 0, life, size, paper, spin: (Math.random() - 0.5) * 8 });
    }
  };
  const prints = [];
  const printGeo = new THREE.PlaneGeometry(0.26, 0.19); printGeo.rotateX(-Math.PI / 2);
  const slimeGeo = new THREE.PlaneGeometry(0.6, 0.15); slimeGeo.rotateX(-Math.PI / 2);
  const footprint = (person, ux, uz) => {
    const P = PLACES[person.place];
    const onRug = P === hall && ((person.x / 5.4) ** 2 + ((person.z + 2.68) / 3.32) ** 2 < 1);
    if (!onRug) {
      const snail = person.critter === 'snail';
      const m = new THREE.Mesh(snail ? slimeGeo : printGeo, new THREE.MeshBasicMaterial({ map: snail ? slimeTex : pawTex, transparent: true, depthWrite: false, opacity: 1 }));
      const side = snail ? 0 : (person.foot ? 0.1 : -0.1);
      m.position.set(person.x - uz * side, person.y + 0.016, person.z + ux * side);
      m.rotation.y = Math.atan2(-uz, ux);
      m.renderOrder = 1;
      P.scene.add(m);
      prints.push({ m, t: 0, life: snail ? 4.5 : 2.8 });
      if (prints.length > 120) { const old = prints.shift(); old.m.parent?.remove(old.m); old.m.material.dispose(); }
    }
    person.steps = (person.steps || 0) + 1;
    if (person.critter !== 'snail' && person.steps % (person.running ? 1 : 3) === 0) spawnBits(P, person.x - ux * 0.2, person.y + 0.08, person.z - uz * 0.2, { count: 2, color: onRug ? 0xfff2e6 : 0xe2c8a0, spread: 0.3, up: 0.25, size: 0.18, life: 0.6 });
  };
  const stride = (person, mx, mz, dt) => {
    const d = Math.hypot(mx, mz);
    if (d < 0.001) return;
    person.trail += d;
    if (person.trail >= (person.critter === 'snail' ? 0.3 : person.critter === 'frog' ? 0.8 : 0.45)) {
      person.trail = 0; person.foot = !person.foot;
      footprint(person, mx / d, mz / d);
    }
    person.clock += dt;
    if (person.clock >= cadence(person.critter) * (person.running ? 0.6 : 1)) {
      person.clock = 0;
      const sp = hear(person);
      const P = PLACES[person.place];
      sp.soft = P === hall && ((person.x / 5.4) ** 2 + ((person.z + 2.68) / 3.32) ** 2 < 1);
      sp.stairs = inStairs(P, person.x, person.z);
      sfx('step', person.critter, sp);
    }
  };
  const pops = [];
  const popWord = (person, word) => {
    if (!word) return;
    const pop = document.createElement('span');
    pop.className = 'lib3-pop';
    pop.textContent = word;
    person.label.appendChild(pop);
    setTimeout(() => pop.remove(), 1300);
  };
  const lit = new Set();
  function updateLamps(by) {
    const night = TOD[tod].lamps;
    const want = new Set();
    people.forEach((p) => { const s = seatOf(p); if (s && s.lamp && p.place === 'hall') want.add(s.lamp); });
    Object.entries(hall.lamps).forEach(([id, L]) => {
      const on = night || want.has(id);
      if (on !== L.on && by && !night) sfx('lamp', hear(by));
      L.on = on;
      L.light.intensity = on ? (want.has(id) ? 7 : 4) : 0;
      L.halo.material.opacity = on ? 0.9 : 0;
      L.bulb.material.color.setHex(on ? 0xfff1b5 : 0x6b5a3a);
    });
    lit.clear();
    want.forEach((id) => lit.add(id));
    // 다락에서 누가 자면 스탠드를 낮추고 이불을 펼친다
    const napping = [...people.values()].some((p) => p.place === 'hall' && p.seated === 'loft-futon');
    hall.loftLamp.light.intensity = napping ? 0.8 : night ? 4 : 2.5;
    hall.loftLamp.halo.material.opacity = napping ? 0.3 : 0.9;
    hall.futon.spread.visible = napping; hall.futon.folded.visible = !napping;
  }

  // ───────── 앉기·눕기(깡충 → 털썩/폭신) ─────────
  const HOP = { chair: 0.55, bench: 0.45, beanbag: 0.5, cushion: 0.4, futon: 0.5, hammock: 0.6 };
  const WORD = { chair: '털썩', bench: '털썩', beanbag: '폭신', cushion: '폭신', futon: '폭신', hammock: '흔들' };
  // 앉은(누운) 자리의 인형 발끝 좌표와 높이
  const seatPose = (s, person) => {
    const d = person ? person.doll : { len: DOLL, hingeY: DOLL * HINGE };
    if (s.lie) { // 머리가 베개 쪽으로 오게 눕는다: 발끝은 가운데에서 반대쪽으로 반 키
      const hx = -Math.sin(s.yaw); const hz = -Math.cos(s.yaw);
      return { x: s.x - hx * d.len * 0.5, z: s.z - hz * d.len * 0.5, y: s.top };
    }
    return { x: s.x, z: s.z, y: s.top - d.hingeY };
  };
  const startHop = (person, to, height, done) => {
    person.hop = { fx: person.x, fy: person.y, fz: person.z, tx: to.x, ty: to.y, tz: to.z, t0: performance.now(), dur: reduceMotion ? 1 : 360 + Math.min(240, Math.hypot(to.x - person.x, to.z - person.z) * 120), h: reduceMotion ? 0 : height, done };
  };
  const stepHop = (person, now) => {
    const h = person.hop;
    const t = Math.min(1, (now - h.t0) / h.dur);
    const e = ease(t);
    person.x = lerp(h.fx, h.tx, e); person.z = lerp(h.fz, h.tz, e); person.y = lerp(h.fy, h.ty, e);
    person.lift = Math.sin(Math.PI * t) * h.h;
    if (t >= 1) { person.hop = null; person.lift = 0; const next = person.queued; person.queued = null; if (h.done) h.done(); if (next) next(); }
  };
  const bump = (s) => { if (s && s.mesh) s.bumpT = performance.now(); };
  const land = (person, s) => {
    person.seated = s.id;
    person.squash = 1;
    bump(s);
    const P = PLACES[person.place];
    spawnBits(P, s.x, s.top + 0.1, s.z, { count: 7, color: s.kind === 'chair' ? 0xe2c8a0 : 0xfffaf0, spread: 1.1, up: 0.6, size: 0.24, life: 0.75 });
    popWord(person, WORD[s.kind]);
    sfx('sit', s.kind, hear(person));
    if (s.lie && person === me) { setTimeout(() => { if (me.seated === s.id && me.pose === 'up') setPose('sleep'); }, 600); }
    label(person);
    updateLamps(person);
  };
  const getUp = (person, s) => {
    person.seated = null;
    if (s) { bump(s); sfx('stand', s.kind, hear(person)); }
    label(person);
    updateLamps(person);
  };

  // ───────── 나: 걷기·앉기·자기 ─────────
  let path = null;
  let pending = null;
  let entered = false;
  let greeted = false;
  let idle = 0;
  const keys = new Set();
  const toast = root.querySelector('.lib-toast');
  let toastTimer = null;
  const say = (text) => { toast.textContent = text; toast.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 2600); };
  const nope = (text) => { say(text); sfx('nope'); };
  const post = (url, data) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' }, body: new URLSearchParams(data), credentials: 'same-origin' });
  let lastSent = 0;
  let sendTimer = null;
  const sendSpot = (now) => {
    if (!me || !entered) return Promise.resolve(null);
    clearTimeout(sendTimer);
    const at = performance.now();
    if (!now && at - lastSent < 180) { sendTimer = setTimeout(() => sendSpot(true), 190); return Promise.resolve(null); }
    lastSent = at;
    const P = PLACES[me.place];
    const s = me.seat ? P.seatById(me.seat) : null;
    const [x, z] = s ? [s.x, s.z] : me.hop ? [me.hop.tx, me.hop.tz] : [me.x, me.z];
    const [rx, ry] = P.toRatio(x, z);
    const data = { x: clamp(rx, 0, 1).toFixed(4), y: clamp(ry, 0, 1).toFixed(4), status: me.status, place: me.place, level: s ? s.level : levelOf(P, me.layer, me.x, me.z), pose: me.pose };
    if (me.seat) data.seat = me.seat;
    return post(root.dataset.spot, data).catch(() => null);
  };
  const seatTaken = (P, sid) => [...people.values()].some((p) => p !== me && p.place === P.id && p.seat === sid);
  const setPose = (pose) => {
    if (!me || me.pose === pose) return;
    const was = me.pose;
    me.pose = pose;
    if (pose === 'sleep' && was !== 'sleep') sfx('yawn', {});
    if (pose === 'up' && was === 'sleep') { sfx('wake', {}); popWord(me, '번쩍!'); }
    label(me); renderPeople(); sendSpot(true);
  };
  const wake = () => { idle = 0; if (me && me.pose !== 'up') setPose('up'); };
  const sit = (s) => {
    const P = PLACES[me.place];
    if (seatTaken(P, s.id)) { nope('누가 먼저 앉았어요'); return; }
    me.seat = s.id;
    me.layer = s.level;
    const to = seatPose(s, me);
    startHop(me, to, HOP[s.kind], () => land(me, s));
    sendSpot(true).then((response) => {
      if (!response || response.status !== 409 || me.seat !== s.id) return;
      me.seat = null;
      const back = () => { if (me.seated) getUp(me, s); startHop(me, { x: s.from[0], y: heightAt(P, s.level, s.from[0], s.from[1]), z: s.from[1] }, 0.35, () => sendSpot(true)); };
      if (me.hop) me.hop.done = back; else back();
      nope('한발 늦었어요. 누가 먼저 앉았어요');
    });
  };
  const stand = (then = null) => {
    if (!me.seat) { if (then) then(); return; }
    const P = PLACES[me.place];
    const s = P.seatById(me.seat);
    me.seat = null;
    if (me.pose !== 'up') { me.pose = 'up'; }
    getUp(me, s);
    const [fx, fz] = s ? s.from : [me.x, me.z + 0.4];
    me.layer = s ? s.level : me.layer;
    startHop(me, { x: fx, y: heightAt(P, me.layer, fx, fz), z: fz }, 0.4, () => { sendSpot(true); if (then) then(); });
    sendSpot(true);
  };
  const goTo = (target, then = null) => { // target: { layer, x, z }
    if (!me) return null;
    if (me.hop) { me.queued = () => goTo(target, then); return null; }
    if (me.seat) { stand(() => goTo(target, then)); return null; }
    if (me.pose === 'sleep') { wake(); }
    const P = PLACES[me.place];
    const spot = nearestFree(P, target.layer, target.x, target.z);
    if (!spot) { nope('거기는 갈 수 없어요'); return null; }
    path = findPath(P, { layer: me.layer, x: me.x, z: me.z }, { layer: target.layer, x: spot[0], z: spot[1] });
    pending = then;
    if (!path) { pending = null; nope('거기는 갈 수 없어요'); return null; }
    return { layer: target.layer, x: spot[0], z: spot[1] };
  };
  const goSit = (s) => {
    if (!me) return;
    if (me.seat === s.id) return;
    if (seatTaken(PLACES[me.place], s.id)) { nope('누가 먼저 앉았어요'); return; }
    goTo({ layer: s.level, x: s.from[0], z: s.from[1] }, { seat: s });
  };
  const nearestSeat = (lie = null) => {
    const P = PLACES[me.place];
    let best = null;
    P.seats.forEach((s) => {
      if (lie !== null && s.lie !== lie) return;
      const d = Math.hypot(s.x - me.x, s.z - me.z) + Math.abs(heightAt(P, s.level, s.x, s.z) - me.y) * 2;
      if (!seatTaken(P, s.id) && d < (lie ? 5 : 3.2) && (!best || d < best.d)) best = { s, d };
    });
    return best && best.s;
  };
  const nap = () => {
    if (!me) return;
    idle = 0;
    if (me.pose === 'sleep') { wake(); if (!me.seat) { me.squash = 1; } return; }
    const s = me.seat ? null : nearestSeat(true);
    if (s) { goSit(s); return; }
    setPose('sleep'); // 그 자리에서: 앉아 있으면 꾸벅 고개를 묻고, 서 있으면 바닥에 눕는다
  };

  // 장소 사이 문(Multiverse식 포털): 화면이 잠깐 어두워졌다가 다른 장소에서 밝아진다
  const fade = root.querySelector('.lib-fade');
  let travelling = false;
  const goPlace = (portal) => {
    if (travelling) return;
    if (portal.href) { openCard('leave'); return; }
    travelling = true;
    path = null; pending = null; keys.clear();
    sfx('door', {});
    fade.classList.add('on');
    setTimeout(() => {
      const to = PLACES[portal.to];
      moveToScene(me, to.id);
      me.layer = portal.arrive.layer; me.x = portal.arrive.x; me.z = portal.arrive.z;
      me.y = heightAt(to, me.layer, me.x, me.z);
      current = to;
      cam.target.set(me.x, me.y + 1, me.z);
      people.forEach((p) => { p.label.hidden = p.place !== current.id; });
      root.querySelector('.lib-place').textContent = to.name;
      label(me); renderPeople(); sendSpot(true);
      setMusic(music);
      setTimeout(() => { fade.classList.remove('on'); travelling = false; }, 120);
    }, 420);
  };
  const portalAt = (P, layer, x, z) => P.portals.find((p) => (p.level === levelOf(P, layer, x, z)) && p.zone(x, z));

  // ───────── 쪽지(가구를 눌렀을 때) ─────────
  const card = root.querySelector('.lib-card');
  const openCard = (name) => {
    const template = root.querySelector(`template[data-card="${name}"]`);
    if (!template) return;
    card.querySelector('.lib-card-body').replaceChildren(template.content.cloneNode(true));
    card.hidden = false;
    sfx('paper', true);
    card.querySelector('.lib-card-close').focus({ preventScroll: true });
  };
  const closeCard = () => { if (!card.hidden) sfx('paper', false); card.hidden = true; stage.focus({ preventScroll: true }); };
  card.querySelector('.lib-card-close').addEventListener('click', closeCard);

  // ───────── 몸짓 ─────────
  const ACT_WORD = { bow: '꾸벅', stretch: '으쌰', flip: '사락' };
  // 폴짝: 위로 튀었다가 중력에 내려앉는다(걷거나 달리면서도)
  const startJump = (person) => {
    if (person.air > 0 || person.jumpV > 0 || person.hop || person.seated) return false;
    person.jumpV = 4.9;
    person.squash = 0.5;
    sfx('jump', hear(person));
    return true;
  };
  const play = (person, act) => {
    if (!person) return;
    if (act === 'jump') { if (startJump(person)) popWord(person, '폴짝'); return; }
    person.act = { name: act, t: 0 };
    popWord(person, ACT_WORD[act]);
    sfx('act', act, hear(person));
    if (act === 'flip') spawnBits(PLACES[person.place], person.x, person.y + 1.1, person.z, { count: 5, spread: 0.9, up: 1.2, life: 1.2, paper: true });
  };
  const act = (name) => { if (!me) return; wake(); play(me, name); post(root.dataset.act, { act: name }).catch(() => {}); };
  const jump = () => {
    if (!me) return;
    wake();
    if (me.seat) { stand(); return; }
    if (me.air > 0 || me.hop) return;
    act('jump');
  };
  let runToggle = false;
  const paintRun = () => root.querySelector('[data-do="run"]')?.setAttribute('aria-pressed', String(runToggle));

  // ───────── 말풍선: 가까운 사람 말은 크게, 먼 사람 말은 작게(WorkAdventure식 거리감) ─────────
  const bubble = (person, text) => {
    const b = person.label.querySelector('.lib-bubble');
    b.textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    b.hidden = false;
    b.classList.remove('fade');
    sfx('pop', hear(person));
    clearTimeout(b._timer);
    b._timer = setTimeout(() => { b.classList.add('fade'); setTimeout(() => { b.hidden = true; }, 400); }, 7000);
  };

  // ───────── 함께 있는 사람 ─────────
  const list = root.querySelector('.lib-people-list');
  const renderPeople = () => {
    const rows = [...people.values()].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
    list.replaceChildren(...rows.map((person) => {
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = person.name;
      const what = document.createElement('small');
      what.textContent = (person === me ? '나 · ' : '') + (person.place === 'roof' ? '옥상 · ' : levelOf(PLACES[person.place], person.layer, person.x, person.z) === 1 ? '다락 · ' : '')
        + (person.pose === 'sleep' ? '자는 중' : person.pose === 'doze' ? '꾸벅꾸벅' : STATUS[person.status] || STATUS.read);
      li.append(name, what);
      return li;
    }));
    root.querySelector('.lib-count').textContent = String(people.size);
    document.title = `${people.size}명 머무는 중 · 꼬깃 서고`;
  };
  if (window.innerWidth < 720) { root.querySelector('.lib-people-toggle').setAttribute('aria-expanded', 'false'); list.hidden = true; }
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
    const placeId = PLACES[data.place] ? data.place : 'hall';
    const P = PLACES[placeId];
    const before = person.seat;
    const movedPlace = person.place !== placeId;
    moveToScene(person, placeId);
    const [x, z] = P.fromRatio(Number(data.x), Number(data.y));
    person.tlevel = Number(data.level) || 0;
    person.seat = data.seat && P.seatById(data.seat) ? data.seat : null;
    person.status = data.status || 'read';
    const posed = person.pose;
    person.pose = ['doze', 'sleep'].includes(data.pose) ? data.pose : 'up';
    const s = person.seat ? P.seatById(person.seat) : null;
    const to = s ? seatPose(s, person) : { x, z, y: heightAt(P, person.tlevel, x, z) };
    person.tx = to.x; person.tz = to.z;
    person.layer = s ? s.level : person.tlevel;
    if (snap || !person.placed || movedPlace) {
      person.hop = null;
      person.x = to.x; person.z = to.z; person.y = s ? to.y : heightAt(P, person.tlevel, to.x, to.z);
      person.placed = true; person.seated = person.seat;
    } else if (before !== person.seat) {
      const old = person.seated ? P.seatById(person.seated) : null;
      if (old) getUp(person, old);
      startHop(person, { x: to.x, y: s ? to.y : heightAt(P, person.tlevel, to.x, to.z), z: to.z }, s ? HOP[s.kind] : 0.4, s ? () => land(person, s) : null);
    }
    if (posed !== person.pose && person.pose === 'sleep' && P === current) sfx('yawn', hear(person));
    person.label.hidden = person.place !== current.id;
    label(person);
  };
  const applyLibrary = (library) => {
    const here = new Set((library.here || []).map(Number));
    [...people.keys()].forEach((id) => {
      if (id !== meId && !here.has(id)) {
        const gone = people.get(id);
        people.delete(id);
        spawnBits(PLACES[gone.place], gone.x, gone.y + 0.3, gone.z, { count: 6, color: 0xe2c8a0, spread: 0.8, up: 0.6 });
        gone.doll.root.parent?.remove(gone.doll.root); gone.doll.blob.parent?.remove(gone.doll.blob);
        gone.label.remove();
      }
    });
    here.forEach((id) => {
      if (id === meId || people.has(id)) return;
      const person = createPerson(id);
      if (person) {
        const [sx, sz] = hall.spawn();
        person.x = person.tx = sx; person.z = person.tz = sz; person.placed = true;
        person.label.hidden = current !== hall;
        label(person);
        if (greeted) { sfx('bell', { gain: 0.4 }); spawnBits(hall, sx, 0.3, sz, { count: 6, spread: 0.8, up: 0.6 }); }
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
    source.addEventListener('hello', (event) => { const data = parse(event); if (data && data.library) applyLibrary(data.library); sendSpot(true); });
    source.addEventListener('library', (event) => { const data = parse(event); if (data) applyLibrary(data); });
    source.addEventListener('library-move', (event) => { const data = parse(event); if (data) { applySpot(data, false); renderPeople(); } });
    source.addEventListener('library-act', (event) => {
      const data = parse(event);
      const person = data && people.get(Number(data.contributorId));
      if (person && person !== me && person.place === current.id) play(person, data.act);
    });
    source.addEventListener('message', (event) => {
      const data = parse(event);
      if (!data) return;
      const person = people.get(Number(data.contributorId));
      if (person && person.place === current.id) bubble(person, data.body || '');
      else say(`${person ? (person.place === 'roof' ? '옥상 · ' : '큰 서고 · ') : '모임방 · '}${faceOf(data.contributorId)?.dataset.name || '누군가'}: ${(data.body || '').slice(0, 40)}`);
    });
    source.addEventListener('avatar', (event) => {
      const data = parse(event);
      const person = data && people.get(Number(data.contributorId));
      const template = data && faceOf(data.contributorId);
      if (template) template.content.firstElementChild.innerHTML = data.svg;
      if (person) { // 캐릭터를 바꾸면 인형도 새로 만든다(입체 인형 ↔ 종이 인형)
        person.critter = critterOf(data.svg);
        const scene = person.doll.root.parent;
        person.doll.root.removeFromParent(); person.doll.blob.removeFromParent();
        person.doll = dollFor(person.critter, template ? template.content.querySelector('svg').outerHTML : data.svg);
        if (scene) scene.add(person.doll.root, person.doll.blob);
        if (!person.doll.model) paperOf(template ? template.content.querySelector('svg').outerHTML : data.svg).then((paper) => dress(person, paper));
      }
    });
  };

  // ───────── 고르기(눌렀을 때 무엇을 눌렀나) ─────────
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...current.pick, ...current.blockers], false).filter((h) => h.object.visible && visibleChain(h.object));
    return hits[0] || null;
  };
  const visibleChain = (obj) => { for (let o = obj; o; o = o.parent) if (!o.visible) return false; return true; };
  const tip = root.querySelector('.lib-tip');
  const SEAT_TIP = { chair: '앉기', bench: '앉기', beanbag: '푹 기대기', cushion: '앉기', futon: '낮잠 자기', hammock: '해먹에 눕기' };
  const describe = (hit) => {
    if (!hit) return null;
    const u = hit.object.userData;
    if (u.seat) { const s = current.seatById(u.seat); return s ? (seatTaken(current, s.id) ? '누가 있어요' : SEAT_TIP[s.kind]) : null; }
    if (u.hot) return current.hots[u.hot]?.tip;
    if (u.portal) return current.portals.find((p) => p.id === u.portal)?.tip;
    return null;
  };
  const act0 = (hit, clientX, clientY) => {
    if (!hit || !me) return;
    wake();
    const u = hit.object.userData;
    if (u.seat) { const s = current.seatById(u.seat); if (s) goSit(s); return; }
    if (u.hot) { const h = current.hots[u.hot]; if (h) goTo({ layer: h.level, x: h.at[0], z: h.at[1] }, { hot: u.hot }); return; }
    if (u.portal) { const p = current.portals.find((q) => q.id === u.portal); if (p) goTo({ layer: p.level, x: p.at[0], z: p.at[1] }, { portal: p }); return; }
    if (u.floor === undefined) return; // 벽·책장
    const layer = u.floor;
    const spot = goTo({ layer, x: hit.point.x, z: hit.point.z });
    if (spot || me.seat || me.hop) showGoal(spot || { layer, x: hit.point.x, z: hit.point.z });
    sfx('tick');
  };
  // 가려는 곳 깃발
  const goalPin = (() => {
    const g = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.32, 0.4, 28); ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff6d6, transparent: true, opacity: 0.9, depthWrite: false }));
    g.add(ring);
    const pin = solid(new THREE.ConeGeometry(0.13, 0.32, 14), 0xF2D16B, { line: 0.02 });
    pin.rotation.x = Math.PI; pin.position.y = 0.5;
    g.add(pin);
    g.visible = false;
    return { g, pin };
  })();
  let goalPlace = null;
  const showGoal = (spot) => {
    const P = current;
    goalPin.g.removeFromParent(); P.scene.add(goalPin.g);
    goalPin.g.position.set(spot.x, heightAt(P, spot.layer, spot.x, spot.z) + 0.02, spot.z);
    goalPin.g.visible = true; goalPlace = P;
  };
  const clearGoal = () => { goalPin.g.visible = false; goalPlace = null; };

  // ───────── 입력: 끌어서 둘러보기, 눌러서 걷기, 굴려서 당기기 ─────────
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: cam.distT }; drag = null; return; }
    drag = { x: event.clientX, y: event.clientY, moved: false, yaw: cam.yawT, pitch: cam.pitchT };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; cam.distT = clamp(pinch.dist * (pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))), 6, 26); return; }
    if (drag) {
      const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; root.classList.add('turning'); }
      if (drag.moved) { cam.yawT = drag.yaw - dx * 0.006; cam.pitchT = clamp(drag.pitch + dy * 0.004, 0.32, 1.28); }
      return;
    }
    hover(event.clientX, event.clientY);
  });
  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && event.type === 'pointerup') act0(pickAt(event.clientX, event.clientY), event.clientX, event.clientY);
    if (pointers.size === 0) { drag = null; root.classList.remove('turning'); }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); cam.distT = clamp(cam.distT * (1 + event.deltaY * 0.0012), 6, 26); }, { passive: false });
  let hoverAt = 0;
  const hover = (x, y) => {
    const now = performance.now();
    if (now - hoverAt < 70) return;
    hoverAt = now;
    const text = describe(pickAt(x, y));
    canvas.style.cursor = text ? 'pointer' : '';
    if (text) { tip.textContent = text; tip.style.transform = `translate(${x + 14}px, ${y + 10}px)`; tip.hidden = false; } else tip.hidden = true;
  };
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  root.querySelector('.lib-cam').addEventListener('click', (event) => {
    const b = event.target.closest('[data-cam]');
    if (!b) return;
    const what = b.dataset.cam;
    if (what === 'left') cam.yawT -= Math.PI / 4;
    else if (what === 'right') cam.yawT += Math.PI / 4;
    else if (what === 'in') cam.distT = clamp(cam.distT * 0.8, 6, 26);
    else if (what === 'out') cam.distT = clamp(cam.distT * 1.25, 6, 26);
  });
  const KEYMAP = { Shift: 'run', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const typing = (event) => event.target.closest('input, textarea, select');
  document.addEventListener('keydown', (event) => {
    if (!me || typing(event) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape' && !card.hidden) { closeCard(); return; }
    const dir = KEYMAP[event.key];
    if (dir) { keys.add(dir); if (dir !== 'run') wake(); if (dir !== 'run') event.preventDefault(); return; }
    if (event.key === ' ') { event.preventDefault(); jump(); return; }
    const k = event.key.toLowerCase();
    if (k === 'z') { wake(); if (me.seat) stand(); else { const s = nearestSeat(false); if (s) goSit(s); else nope('가까운 빈자리가 없어요'); } }
    else if (k === 'n') nap();
    else if (k === 'e') act('bow');
    else if (k === 'q') act('stretch');
    else if (k === 'r') act('flip');
    else if (event.key === '[') cam.yawT -= Math.PI / 4;
    else if (event.key === ']') cam.yawT += Math.PI / 4;
    else if (event.key === 'Enter') { event.preventDefault(); root.querySelector('.lib-say input').focus(); }
  });
  document.addEventListener('keyup', (event) => { const dir = KEYMAP[event.key]; if (dir) keys.delete(dir); });
  window.addEventListener('blur', () => keys.clear());
  root.querySelector('.lib-bar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-do]');
    if (!button || !me) return;
    const what = button.dataset.do;
    if (what === 'sit') { wake(); if (me.seat) stand(); else { const s = nearestSeat(false); if (s) goSit(s); else nope('가까운 빈자리가 없어요. 의자나 방석을 눌러 보세요'); } }
    else if (what === 'nap') nap();
    else if (what === 'jump') jump();
    else if (what === 'run') { runToggle = !runToggle; paintRun(); }
    else if (what === 'music') { setMusic(!music); keep('music', music); }
    else if (what === 'sfx') { setSfx(!(sound && sound.on)); keep('sfx', Boolean(sound && sound.on)); sfx('pop', {}); }
    else if (what === 'gait') toggleGait();
    else act(what);
  });
  root.querySelector('.lib-status select').addEventListener('change', (event) => {
    if (!me) return;
    wake();
    me.status = event.target.value;
    label(me); renderPeople(); sendSpot(true);
    sfx('scribble');
    stage.focus({ preventScroll: true });
  });
  const sayForm = root.querySelector('.lib-say');
  { const field = sayForm.querySelector('input'); field.addEventListener('compositionstart', () => { field.dataset.composing = '1'; }); field.addEventListener('compositionend', () => { field.dataset.composing = ''; }); }
  sayForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = sayForm.querySelector('input');
    if (event.isTrusted !== false && input.dataset.composing === '1') return; // 한글 조합 중 Enter는 보내지 않는다
    const body = input.value.trim();
    if (!body) { stage.focus({ preventScroll: true }); return; }
    wake();
    input.value = '';
    try {
      const response = await post(root.dataset.say, { body });
      if (!response.ok) { const result = await response.json().catch(() => ({})); say(result.message || '보내지 못했어요'); input.value = input.value.trim() ? `${body} ${input.value}` : body; }
    } catch (error) { say('연결이 끊겨 보내지 못했어요'); input.value = input.value.trim() ? `${body} ${input.value}` : body; }
  });
  root.querySelector('[data-lib="stars"]').addEventListener('click', () => { sfx('twinkle'); openCard('stars'); });

  // ───────── 소리·걸음 효과 ─────────
  const MIX = {
    hall: { dawn: { grass: 0.28, piano: 0.4, writing: 0.15 }, day: { piano: 0.42, writing: 0.24, grass: 0.16, noise: 0.08 }, dusk: { piano: 0.4, city: 0.18, writing: 0.2 }, night: { rain: 0.3, piano: 0.34, writing: 0.14 } },
    roof: { dawn: { grass: 0.45, piano: 0.25 }, day: { grass: 0.5, city: 0.2, piano: 0.22 }, dusk: { city: 0.3, grass: 0.3, piano: 0.25 }, night: { crickets: 0.45, city: 0.18, piano: 0.2 } },
  };
  const wants = (what) => { try { return localStorage.getItem(`lib-${what}`) !== 'off'; } catch (e) { return true; } };
  const keep = (what, on) => { try { if (on) localStorage.removeItem(`lib-${what}`); else localStorage.setItem(`lib-${what}`, 'off'); } catch (e) { /* 이번만 */ } };
  let music = false;
  let murmur = null;
  const paintSound = () => {
    root.querySelector('[data-do="music"]').setAttribute('aria-pressed', String(music));
    root.querySelector('[data-do="sfx"]').setAttribute('aria-pressed', String(Boolean(sound && sound.on)));
  };
  function setMusic(on) {
    const ambience = window.Ambience;
    if (on && !ambience) { say('이 브라우저에서는 소리를 낼 수 없어요'); on = false; }
    music = on;
    if (ambience) {
      if (on) { const mix = { ...MIX[current.id][tod] }; if (weather === 'rain') { mix.rain = current.id === 'roof' ? 0.6 : 0.35; } ambience.scene(mix); } else ambience.clear();
    }
    clearTimeout(murmur);
    const again = () => { murmur = setTimeout(() => { if (music && current === hall) sfx('distant'); if (music) again(); }, 6000 + Math.random() * 9000); };
    if (on) again();
    paintSound();
  }
  const setSfx = (on) => {
    if (on && !sound) { say('이 브라우저에서는 소리를 낼 수 없어요'); on = false; }
    if (sound) sound.enable(on);
    paintSound();
  };
  const gaitButton = root.querySelector('[data-do="gait"]');
  const gaitOn = () => document.documentElement.dataset.gait === 'on';
  const paintGait = () => gaitButton.setAttribute('aria-pressed', String(gaitOn()));
  const toggleGait = () => {
    const on = !gaitOn();
    if (on) document.documentElement.dataset.gait = 'on'; else delete document.documentElement.dataset.gait;
    try { if (on) localStorage.setItem('gait', 'on'); else localStorage.removeItem('gait'); } catch (e) { /* 이번만 */ }
    paintGait();
  };
  paintGait();
  // 꼬깃단 걸음: 걸음 효과를 켜면 캐릭터마다 성격대로(뒤뚱 크게 기우뚱, 개굴 폴짝, 느릿 미끄러지듯…)
  const GAIT = {
    penguin: { f: 3.7, bob: 0.06, tilt: 0.2, squash: 0.04 }, duck: { f: 3.4, bob: 0.07, tilt: 0.14, squash: 0.05 },
    mole: { f: 4.6, bob: 0.03, tilt: 0.05, squash: 0.03 }, frog: { f: 2.4, bob: 0.3, tilt: 0.03, squash: 0.14, hop: true },
    raccoon: { f: 3.9, bob: 0.09, tilt: 0.06, squash: 0.04 }, bookworm: { f: 2.6, bob: 0.01, tilt: 0.02, squash: 0.16, inch: true },
    hedgehog: { f: 6.0, bob: 0.04, tilt: 0.06, squash: 0.03 }, snail: { f: 1.6, bob: 0, tilt: 0.02, squash: 0.06, glide: true },
    wood: { f: 3.6, bob: 0.07, tilt: 0.08, squash: 0.04 },
  };
  const BASIC = { f: 3.6, bob: 0.07, tilt: 0.07, squash: 0.04 };

  // ───────── 인형 그리기(매 프레임) ─────────
  const anchor = new THREE.Vector3();
  const updateDoll = (person, dt, t) => {
    const d = person.doll;
    const P = PLACES[person.place];
    const s = seatOf(person);
    const lying = (s && s.lie) || (!s && person.pose === 'sleep' && !person.hop);
    const sitting = s && !s.lie;
    // 접힘·눕기·졸기는 부드럽게
    person.fold = lerp(person.fold, sitting ? 1 : 0, Math.min(1, dt * 10));
    person.lie = lerp(person.lie, lying ? 1 : 0, Math.min(1, dt * 7));
    const dozeTarget = person.pose === 'doze' ? 0.18 + Math.sin(t * 1.6 + person.id) * 0.14 : person.pose === 'sleep' && sitting ? 0.42 + Math.sin(t * 0.9 + person.id) * 0.04 : 0;
    person.nod = lerp(person.nod, dozeTarget, Math.min(1, dt * 3));
    // 바라보는 쪽: 서 있으면 카메라를 본다(종이 인형이 늘 앞을 보이게), 앉으면 자리 쪽을 보되 카메라 쪽으로 조금 튼다
    let yaw = d.model ? person.heading : cam.yaw;
    if (s && !s.lie && d.model) yaw = s.yaw;
    else if (s && !s.lie) { const rel = turn(s.yaw, cam.yaw); const face = Math.abs(rel) <= Math.PI / 2 ? rel : turn(s.yaw, cam.yaw + Math.PI); yaw = s.yaw + clamp(face, -0.8, 0.8); }
    else if (lying) yaw = s ? s.yaw : Math.PI / 2;
    d.yaw.rotation.y = yaw;
    // 걷기
    const g = gaitOn() ? (GAIT[person.critter] || GAIT.wood) : BASIC;
    let bob = 0; let tilt = 0; let sx = 1; let sy = 1;
    if (person.walking && !lying) {
      person.phase += dt * g.f * Math.PI * (person.running ? 1.7 : 1);
      const w = Math.sin(person.phase);
      bob = g.hop ? Math.abs(w) ** 0.6 * g.bob : Math.abs(w) * g.bob;
      tilt = w * g.tilt;
      if (g.inch) { sy = 1 + w * g.squash; sx = 1 - w * g.squash * 0.6; } else if (g.glide) { sx = 1 + Math.abs(w) * g.squash; } else { sy = 1 - Math.abs(Math.cos(person.phase)) * g.squash; sx = 1 + Math.abs(Math.cos(person.phase)) * g.squash * 0.6; }
    } else {
      person.phase = 0;
      if (!lying) { sy = 1 + Math.sin(t * 2 + person.id) * 0.012; } // 숨쉬기
    }
    // 몸짓
    let bow = 0;
    if (person.act) {
      person.act.t += dt;
      const k = person.act.t;
      if (person.act.name === 'bow') bow = Math.sin(clamp(k / 0.9, 0, 1) * Math.PI) * 0.55;
      else if (person.act.name === 'stretch') { const e = Math.sin(clamp(k / 1.0, 0, 1) * Math.PI); sy *= 1 + e * 0.18; sx *= 1 - e * 0.1; }
      else if (person.act.name === 'flip') bob += Math.sin(clamp(k / 0.5, 0, 1) * Math.PI) * 0.35;
      if (k > 1.2) person.act = null;
    }
    // 앉을 때 납작
    if (person.squash > 0) { person.squash = Math.max(0, person.squash - dt * 2.4); const q = Math.sin(person.squash * Math.PI) * person.squash; sy *= 1 - q * 0.22; sx *= 1 + q * 0.18; }
    // 종이 뒤집기(왼쪽·오른쪽을 바꿀 때 한 장이 휙 넘어간다)
    const wantFace = person.face * (person.critter === 'snail' ? -1 : 1);
    person.flip = lerp(person.flip, wantFace, Math.min(1, dt * 14));
    if (d.model) { d.body.scale.set(sx, sy, sx); d.update(person, dt, t, person.walking && !lying, person.phase); }
    else d.body.scale.set(sx * (Math.abs(person.flip) < 0.05 ? 0.05 * Math.sign(person.flip || 1) : person.flip), sy, 1);
    d.body.rotation.z = lying ? 0 : tilt;
    const lean = d.model && person.walking && person.running ? 0.22 : 0;
    d.body.rotation.x = lerp(bow + person.nod + lean, -Math.PI / 2 + (s && s.lie ? 0.2 : 0.08), person.lie);
    d.body.position.y = bob;
    d.hinge.rotation.x = -person.fold * (Math.PI / 2 - 0.12);
    // 자리: 의자는 흔들, 방석·빈백은 꺼졌다 부풀고, 해먹은 늘 살랑
    d.root.position.set(person.x, person.y + person.lift + person.air + (lying ? 0.02 : 0), person.z);
    d.blob.position.set(person.x, (s ? s.top - (s.lie ? 0 : 0) : heightAt(P, person.layer, person.x, person.z)) + 0.014, person.z);
    const blobScale = lying ? 1.6 : 1 - Math.min(0.55, (person.lift + person.air) * 0.5);
    d.blob.scale.set(blobScale, 1, lying ? 0.8 : blobScale);
    d.blob.visible = !(s && s.kind === 'hammock');
    // 이름표 위치: 인형 머리 위
    d.root.updateMatrixWorld(true);
    anchor.set(0, d.head, 0);
    d.body.localToWorld(anchor);
    if (lying) anchor.y += 0.6;
    return anchor;
  };

  // 이름표·말풍선을 화면에 붙인다(멀수록 작고 흐리게)
  const project = new THREE.Vector3();
  const placeLabel = (person, at) => {
    const el = person.label;
    if (el.hidden) return;
    project.copy(at).project(camera);
    if (project.z > 1) { el.style.opacity = '0'; return; }
    const x = (project.x * 0.5 + 0.5) * stage.clientWidth;
    const y = (-project.y * 0.5 + 0.5) * stage.clientHeight;
    const dist = me ? Math.hypot(person.x - me.x, person.z - me.z, (person.y - me.y) * 1.5) : 0;
    const near = person === me || dist < 5;
    const far = dist > 11;
    el.classList.toggle('near', near);
    el.classList.toggle('far', far);
    const scale = person === me ? 1 : clamp(1.05 - dist / 26, 0.62, 1);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    el.style.opacity = person === me ? '1' : String(clamp(1.15 - dist / 22, 0.45, 1));
    el.style.zIndex = String(1000 - Math.round(project.z * 1000));
  };

  // ───────── 매 프레임 ─────────
  let last = performance.now();
  let wallState = new Map();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (me && !travelling) {
      idle += dt;
      // 오래 가만히 있으면 저절로 꾸벅꾸벅, 더 오래면 잠든다
      if (me.pose === 'up' && idle > 45 && !me.hop && !path) setPose('doze');
      else if (me.pose === 'doze' && idle > 150) setPose('sleep');
      if (me.hop) {
        me.walking = false;
        stepHop(me, now);
      } else {
        const P = current;
        let dx = 0; let dz = 0;
        if (keys.has('left')) dx -= 1;
        if (keys.has('right')) dx += 1;
        if (keys.has('up')) dz -= 1;
        if (keys.has('down')) dz += 1;
        let moved = false;
        const ox = me.x; const oz = me.z;
        me.v = dx || dz || (path && path.length) ? Math.min(1, (me.v || 0) + dt * 4) : 0;
        me.running = keys.has('run') !== runToggle; // Shift를 누르거나 달리기를 켜 두면 달린다(켜 둔 채 Shift면 걷기)
        const speed = SPEED * (0.45 + 0.55 * (1 - (1 - me.v) ** 2)) * (me.layer === 'S' ? 0.75 : 1) * (me.running ? 1.85 : 1);
        if ((dx || dz) && me.seat) {
          stand();
        } else if (dx || dz) {
          path = null; pending = null; clearGoal();
          if (me.pose === 'sleep' && !me.seat) wake();
          // 카메라 기준 앞·옆
          const fx = -Math.sin(cam.yaw); const fz = -Math.cos(cam.yaw);
          const [rx, rz] = camRight();
          let mx = rx * dx + fx * -dz; let mz = rz * dx + fz * -dz;
          const len = Math.hypot(mx, mz); mx /= len; mz /= len;
          const step = speed * dt;
          const tryMove = (nx, nz) => { const nl = stepTo(P, me.layer, me.x, me.z, nx, nz); if (nl === null) return false; me.layer = nl; me.x = nx; me.z = nz; return true; };
          moved = tryMove(me.x + mx * step, me.z + mz * step) || tryMove(me.x + mx * step, me.z) || tryMove(me.x, me.z + mz * step);
        } else if (path && path.length) {
          const next = path[0];
          const ddx = next.x - me.x; const ddz = next.z - me.z;
          const dist = Math.hypot(ddx, ddz);
          const step = speed * dt;
          if (dist <= step) {
            me.x = next.x; me.z = next.z; me.layer = next.layer; path.shift();
            if (!path.length) {
              path = null; clearGoal();
              const todo = pending; pending = null;
              if (todo && todo.seat) sit(todo.seat);
              if (todo && todo.hot) openCard(current.hots[todo.hot].card);
              if (todo && todo.portal) goPlace(todo.portal);
            }
          } else {
            me.x += (ddx / dist) * step; me.z += (ddz / dist) * step;
            if (next.layer !== me.layer) { const nl = stepTo(P, me.layer, ox, oz, me.x, me.z); if (nl !== null) me.layer = nl; }
          }
          moved = true;
        }
        if (moved) {
          me.y = heightAt(P, me.layer, me.x, me.z);
          const mx = me.x - ox; const mz = me.z - oz;
          const [rx, rz] = camRight();
          const side = mx * rx + mz * rz;
          if (Math.abs(side) > 0.002) me.face = side < 0 ? -1 : 1;
          if (Math.hypot(mx, mz) > 0.001) me.heading = me.heading + turn(me.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
          stride(me, mx, mz, dt);
          sendSpot(false);
          const portal = portalAt(P, me.layer, me.x, me.z);
          if (portal && !travelling) { if (portal.href) { if (!me.atDoor) { me.atDoor = true; openCard('leave'); } } else goPlace(portal); }
          else me.atDoor = false;
        }
        if (!moved && me.walking) sendSpot(true);
        if (moved && !me.walking) me.clock = cadence(me.critter) * 0.7;
        me.walking = moved;
      }
      // 내 인형이 화면 아래쪽 가운데에 오게: 바라보는 쪽으로 조금 앞을 본다(방 밖 허공은 보지 않게)
      const [bx0, bz0, bx1, bz1] = current.bounds;
      const ahead = clamp((cam.dist - 4) * 0.25, 0, 1.8 + cam.dist * 0.06); // 가까이 당기면 내 인형을 가운데에
      project.set(clamp(me.x - Math.sin(cam.yaw) * ahead, bx0 + 3, bx1 - 3), me.y + 0.9, clamp(me.z - Math.cos(cam.yaw) * ahead, bz0 + 2.5, bz1 - 2.5));
      cam.target.lerp(project, reduceMotion ? 1 : 1 - Math.pow(0.004, dt));
    }
    people.forEach((person) => {
      if (person === me) return;
      if (person.hop) { person.walking = false; stepHop(person, now); return; }
      const P = PLACES[person.place];
      const ddx = person.tx - person.x; const ddz = person.tz - person.z;
      const dist = Math.hypot(ddx, ddz);
      if (dist > 8) { person.x = person.tx; person.z = person.tz; person.walking = false; }
      else if (dist > 0.02) {
        const pace = Math.max(SPEED * 1.15, dist * 3.2);
        person.running = dist > 0.9;
        const step = Math.min(dist, pace * dt);
        const mx = (ddx / dist) * step; const mz = (ddz / dist) * step;
        person.x += mx; person.z += mz;
        const [rx, rz] = camRight();
        const side = mx * rx + mz * rz;
        if (Math.abs(side) > 0.002) person.face = side < 0 ? -1 : 1;
        person.heading = person.heading + turn(person.heading, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
        if (!person.walking) person.clock = cadence(person.critter) * 0.7;
        person.walking = !person.seat;
        if (person.walking && person.place === current.id) stride(person, mx, mz, dt);
      } else person.walking = false;
      const s = seatOf(person);
      person.y = s ? seatPose(s, person).y : heightAt(P, person.tlevel, person.x, person.z);
    });
    // 점프 중인 사람은 중력으로 내려온다
    people.forEach((person) => {
      if (!(person.jumpV || person.air > 0)) return;
      person.air += person.jumpV * dt;
      person.jumpV -= 15 * dt;
      if (person.air <= 0) {
        person.air = 0; person.jumpV = 0; person.squash = 1;
        if (person.place === current.id) { spawnBits(PLACES[person.place], person.x, person.y + 0.08, person.z, { count: 5, color: 0xe2c8a0, spread: 0.7, up: 0.3, size: 0.2, life: 0.6 }); sfx('land', hear(person)); }
      }
    });
    // 카메라
    const k = reduceMotion ? 1 : 1 - Math.pow(0.002, dt);
    cam.yaw += (cam.yawT - cam.yaw) * k; cam.pitch += (cam.pitchT - cam.pitch) * k; cam.dist += (cam.distT - cam.dist) * k;
    placeCamera();
    // 카메라와 방 사이에 낀 벽은 치운다(디오라마 단면처럼)
    const cx = Math.sin(cam.yaw); const cz = Math.cos(cam.yaw);
    current.walls.forEach((w) => {
      const dot = cx * w.nx + cz * w.nz;
      const hidden = wallState.get(w) ? dot < -0.12 : dot < -0.3;
      wallState.set(w, hidden);
      w.group.visible = !hidden;
    });
    // 인형·이름표
    people.forEach((person) => {
      const shown = person.place === current.id;
      person.doll.root.visible = shown; person.doll.blob.visible = shown && person.doll.blob.visible;
      if (!shown) { person.label.hidden = true; return; }
      person.label.hidden = false;
      placeLabel(person, updateDoll(person, dt, t));
    });
    // 가구가 출렁이는 것
    const P = current;
    P.seats.forEach((s) => {
      if (!s.mesh) return;
      const k2 = s.bumpT ? (now - s.bumpT) / 600 : 2;
      if (s.kind === 'hammock') { const sway = Math.sin(t * (people.size ? 1.1 : 0.7) + s.x) * 0.06 + (k2 < 1 ? Math.sin(k2 * Math.PI * 3) * (1 - k2) * 0.2 : 0); s.mesh.rotation.x = sway; return; }
      if (k2 >= 1) { if (s.base) { s.mesh.scale.copy(s.base); s.mesh.rotation.z = 0; } return; }
      if (!s.base) s.base = s.mesh.scale.clone();
      const e = Math.sin(k2 * Math.PI * 2.5) * (1 - k2);
      if (s.kind === 'chair') s.mesh.rotation.z = e * 0.07;
      else s.mesh.scale.set(s.base.x * (1 + e * 0.12), s.base.y * (1 - e * 0.28), s.base.z * (1 + e * 0.12));
    });
    // 해먹에 누운 사람은 해먹과 함께 흔들린다
    people.forEach((person) => { const s = seatOf(person); if (s && s.kind === 'hammock' && s.mesh) { person.doll.root.rotation.x = s.mesh.rotation.x * 0.8; } else person.doll.root.rotation.x = 0; });
    // 날리는 것들
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.t += dt;
      const k3 = b.t / b.life;
      if (k3 >= 1) { b.sprite.parent?.remove(b.sprite); if (b.sprite.material.dispose && b.paper) { b.sprite.geometry.dispose(); } else b.sprite.material.dispose(); bits.splice(i, 1); continue; }
      b.vy -= dt * (b.paper ? 1.2 : 1.6);
      b.sprite.position.x += b.vx * dt; b.sprite.position.y += b.vy * dt; b.sprite.position.z += b.vz * dt;
      if (b.paper) { b.sprite.rotation.x += b.spin * dt; b.sprite.rotation.y += b.spin * 0.7 * dt; } else { const sz = b.size * (0.6 + k3 * 1.2); b.sprite.scale.set(sz, sz, 1); b.sprite.material.opacity = 1 - k3; }
    }
    for (let i = prints.length - 1; i >= 0; i--) {
      const p = prints[i];
      p.t += dt;
      const k4 = p.t / p.life;
      if (k4 >= 1) { p.m.parent?.remove(p.m); p.m.material.dispose(); prints.splice(i, 1); continue; }
      p.m.material.opacity = k4 < 0.4 ? 1 : 1 - (k4 - 0.4) / 0.6;
    }
    if (goalPin.g.visible) goalPin.pin.position.y = 0.5 + Math.abs(Math.sin(t * 5)) * 0.18;
    // 서고의 작은 움직임: 별이 흔들리고, 먼지가 떠오르고, 종이새가 난다
    if (current === hall && !reduceMotion) {
      hall.stars.forEach((st) => { st.rotation.z = Math.sin(t * 0.9 + st.userData.phase) * 0.06; st.children[1].rotation.y = t * 0.6 + st.userData.phase; });
      const pos = hall.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) + dt * 0.12; if (y > 6) y = 0.3; pos.setY(i, y); pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 0.05); }
      pos.needsUpdate = true;
      hall.birds.forEach((b, i) => { const a = t * 0.35 + b.userData.phase; b.position.set(Math.cos(a) * 4.5, 5.6 + Math.sin(a * 2) * 0.4, -4.5 + Math.sin(a) * 2.2); b.rotation.y = -a; b.children[0].scale.y = 1 + Math.sin(t * 9 + i) * 0.6; });
    }
    if (current === roof && weather === 'rain' && !reduceMotion) {
      const pos = roof.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) { let y = pos.getY(i) - dt * 12; if (y < 0) y += 16; pos.setY(i, y); pos.setY(i + 1, y - 0.4); }
      pos.needsUpdate = true;
    }
    if (current === roof && weather === 'snow' && !reduceMotion) {
      const pos = roof.snow.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - dt * 1.2; if (y < 0) y = 16; pos.setY(i, y); pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 0.3); }
      pos.needsUpdate = true;
    }
    renderer.render(current.scene, camera);
    requestAnimationFrame(tick);
  };

  // ───────── 시간·들어가기 ─────────
  applyTod();
  setInterval(() => { if (applyTod() && music) setMusic(true); }, 5 * 60 * 1000);
  root.querySelector('.lib-place').textContent = current.name;
  const gate = root.querySelector('.lib-gate');
  const gateSound = root.querySelector('[data-lib="sound"]');
  if (gateSound) gateSound.checked = wants('music') || wants('sfx');
  root.querySelector('[data-lib="enter"]').addEventListener('click', () => {
    if (entered) return;
    entered = true;
    const withSound = !gateSound || gateSound.checked;
    if (!withSound) { keep('music', false); keep('sfx', false); }
    else if (!wants('music') && !wants('sfx')) { keep('music', true); keep('sfx', true); }
    setSfx(withSound && wants('sfx'));
    setMusic(withSound && wants('music'));
    sfx('bell', {});
    me = createPerson(meId);
    const [sx, sz] = hall.spawn();
    me.x = sx; me.z = sz; me.placed = true;
    label(me);
    spawnBits(hall, sx, 0.3, sz, { count: 6, spread: 0.8, up: 0.6 });
    gate.classList.add('gone');
    setTimeout(() => { gate.hidden = true; }, 500);
    root.classList.add('entered');
    cam.distT = narrow() ? 19 : 15.5; cam.pitchT = 0.82; cam.yawT = 0;
    renderPeople();
    connect();
    stage.focus({ preventScroll: true });
    setTimeout(() => root.querySelector('.lib-hint').classList.add('fade'), 12000);
  });
  window.__lib3 = { people, PLACES, cam, me: () => me, goTo, goSit, nap, goPlace, current: () => current, findPath, free, stepTo };
  requestAnimationFrame(tick);
}
