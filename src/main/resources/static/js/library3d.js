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
    label: '1층 큰 서고', short: '1층',
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
          { r: [-10.75, 3.7, -10.55, 5.05], tight: true }, { r: [-9.25, 3.7, -9.05, 5.05], tight: true }, { r: [-10.75, 3.6, -9.05, 3.8], tight: true }, // 지하로 내려가는 구멍 난간
        ],
      },
      1: { rect: [-11.85, -7.42, -4.75, -5.62], blocks: [{ r: [-10.35, -7.42, -8.05, -6.2] }, { c: [-5.1, -7.2, 0.28] }, { c: [-6.9, -6.7, 0.38] }, { c: [-5.7, -6.7, 0.38] }] }, // 다락: 이불, 스탠드, 방석
    },
  });
  // (x, z)에 yaw만큼 돌려 놓은 가구의 안쪽 좌표 (lx, lz)를 바닥 좌표로. yaw 0이면 +z를 바라본다
  const turnAt = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const boxAt = (x, z, yaw, w, d) => { const side = Math.abs(Math.sin(yaw)) > 0.5; const a = (side ? d : w) / 2; const b = (side ? w : d) / 2; return { r: [x - a, z - b, x + a, z + b] }; };
  // 옥상 정원: 24m×16m 루프탑. 건물 지붕 전체를 쓴다. 뒤에 퍼걸러 아래 별빛 바, 오른쪽 수영장과 선베드,
  // 가운데 불멍 라운지, 왼쪽 앞 온실·화단·해먹, 왼쪽 뒤 옥상 책장, 오른쪽 앞 망원경과 별 보는 벤치
  const ROOF = { w: 24, d: 16 };
  const ROOF_BAR = [-2.8, -1.4, 0, 1.4, 2.8];
  const LOUNGERS = [-5.0, -2.6, -0.2, 2.2]; // 선베드 z(x 6.6), 2.4m 간격
  const PIT_X = -1.2; // 불멍 라운지 가운데 x
  const FIRE_SOFAS = [
    { id: 'rsofa-n', x: -1.2, z: -2.15, yaw: 0, color: 0xE3A857, pillow: 0x4F8F8A },
    { id: 'rsofa-w', x: -3.35, z: 0, yaw: Math.PI / 2, color: 0x4F8F8A, pillow: 0xF2D16B },
    { id: 'rsofa-e', x: 0.95, z: 0, yaw: -Math.PI / 2, color: 0x4F8F8A, pillow: 0xD9654B },
  ];
  const HAMMOCKS = [3.0, 6.0]; // z(x -5.6), 3m 간격
  const roof = newPlace('roof', '옥상 정원', {
    label: '옥상 정원', short: '옥상', tag: '옥상',
    maxDist: 70, sink: 13, // 멀리 당기면 건물 아래 길까지 보이게 눈높이를 내린다
    toRatio: (x, z) => [(x + ROOF.w / 2) / ROOF.w, (z + ROOF.d / 2) / ROOF.d],
    fromRatio: (rx, ry) => [rx * ROOF.w - ROOF.w / 2, ry * ROOF.d - ROOF.d / 2],
    bounds: [-ROOF.w / 2, -ROOF.d / 2, ROOF.w / 2, ROOF.d / 2],
    spawn: () => [-10.2, -5.0],
    stairs: null,
    layers: {
      0: {
        rect: [-11.6, -7.6, 11.6, 7.6],
        blocks: [
          { r: [-11.8, -8, -8.6, -5.9] }, // 계단 집
          { r: [-7.85, -8, -6.15, -6.8] }, // 책 엘리베이터
          { r: [-3.7, -8, 3.7, -6.0] }, ...ROOF_BAR.map((x) => ({ c: [x, -5.45, 0.2] })), // 바와 높은 의자
          ...[[-4.2, -7.6], [4.2, -7.6], [-4.2, -4.6], [4.2, -4.6]].map(([x, z]) => ({ c: [x, z, 0.14] })), // 퍼걸러 기둥
          { r: [8.2, -5.75, 12, 3.75] }, // 수영장
          ...LOUNGERS.map((z) => ({ r: [5.65, z - 0.35, 7.55, z + 0.35] })), { c: [4.6, -3.8, 0.25] }, { c: [4.6, 1.0, 0.25] }, // 선베드, 파라솔
          { c: [-1.2, 0, 0.66] }, ...FIRE_SOFAS.map((s) => boxAt(s.x, s.z, s.yaw, 2.3, 0.95)), // 화로와 소파
          ...HAMMOCKS.map((z) => ({ r: [-7.15, z - 0.55, -4.05, z + 0.55] })), // 해먹
          { r: [-11.5, 4.65, -8.9, 7.35] }, { r: [-11.6, -2.0, -10.45, 2.4] }, { r: [-11.6, -5.25, -10.9, -3.35] }, // 온실, 화단, 옥상 책장
          { c: [9.6, 6.0, 0.35] }, { r: [4.3, 6.7, 6.9, 7.35] }, // 망원경, 벤치
          { c: [11.0, 6.9, 0.42] }, { c: [-3.2, 7.0, 0.42] }, { c: [3.4, -4.0, 0.42] }, { c: [-1.6, 7.3, 0.1] }, { c: [1.6, 7.3, 0.1] }, // 야자 화분, 전구 기둥
        ],
      },
    },
  });
  // 지하 서고 굴: 28m×18m 큰 동굴 서고. 뒤에 두 층 책 굴 벽과 위 회랑, 가운데 이 문집이 떠 있는 받침과 그루터기 여섯,
  // 양옆 천장까지 닿는 뿌리 기둥, 왼쪽 벽 폭포에서 흐르는 물길과 아치 다리, 오른쪽 광차 길, 오른쪽 앞 수정 웅덩이,
  // 물길 건너 거대 버섯 숲과 굴방 셋, 둥근 독서 자리
  const CAVE = { w: 28, d: 18, h: 6.5 };
  const PED = [0, -1.5]; // 받침
  const STUMPS = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [PED[0] + Math.sin(a) * 2.1, PED[1] + Math.cos(a) * 2.1, a + Math.PI, a]; });
  const STREAM = { z0: 4.6, z1: 5.8, x1: 5.8, bridge: [-3.8, -2.2] }; // 물길(왼쪽 벽에서 수정 웅덩이까지), 다리 자리
  const BURROWS = [-11.5, -9.0, -6.5]; // 굴방 x(z 7.6)
  const PIT = [1.8, 7.3]; // 둥근 독서 자리 가운데
  const cave = newPlace('cave', '지하 서고 굴', {
    label: '지하 서고 굴', short: '지하', tag: '지하 굴',
    toRatio: (x, z) => [(x + CAVE.w / 2) / CAVE.w, (z + CAVE.d / 2) / CAVE.d],
    fromRatio: (rx, ry) => [rx * CAVE.w - CAVE.w / 2, ry * CAVE.d - CAVE.d / 2],
    bounds: [-CAVE.w / 2, -CAVE.d / 2, CAVE.w / 2, CAVE.d / 2],
    spawn: () => [-12.85, -3.2],
    stairs: null,
    fixedLight: true,
    layers: {
      0: {
        rect: [-13.75, -8.0, 13.75, 8.75],
        blocks: [
          { c: [PED[0], PED[1], 0.85] }, ...STUMPS.map(([x, z]) => ({ c: [x, z, 0.24] })), // 받침과 그루터기
          { c: [-7.5, -5.0, 0.95] }, { c: [7.5, -5.0, 0.95] }, // 뿌리 기둥
          { r: [-14, STREAM.z0, STREAM.bridge[0], STREAM.z1] }, { r: [STREAM.bridge[1], STREAM.z0, STREAM.x1, STREAM.z1] }, { c: [6.8, 5.2, 1.25] }, // 물길(다리만 건넌다), 웅덩이
          { c: [8.7, 6.9, 0.9] }, { c: [8.4, 3.5, 0.6] }, { c: [5.6, 7.6, 0.45] }, // 수정
          { r: [10.6, -8.6, 12.1, 8.6] }, { r: [12.5, -6.2, 14, -2.8] }, { r: [12.5, 2.8, 14, 6.2] }, // 광차 길, 책 상자
          ...BURROWS.map((x) => ({ c: [x, 7.6, 0.95] })), // 굴방
          { c: [-1.6, 7.9, 0.45] }, { c: [-13.0, 7.9, 0.45] }, { c: [4.2, 8.3, 0.4] }, // 거대 버섯
          ...[0, 1, 2, 3, 4].map((k) => { const a = (k * 2 * Math.PI) / 5; return { c: [PIT[0] + Math.sin(a) * 1.5, PIT[1] + Math.cos(a) * 1.5, 0.42] }; }), // 독서 방석
          ...[[-4.5, -3.0], [4.5, -3.0], [-9.0, 2.0], [9.0, 2.0]].map(([x, z]) => ({ c: [x, z, 0.12] })), // 등불 기둥
        ],
      },
    },
  });
  // 4층 필사실 꾹꾹: 24m×14m 조용한 필사 서재. 칸막이 1인 책상 두 줄(앉으면 '쓰는 중', 타자 소리)과 위에 샹들리에,
  // 오른쪽 필사 벽, 뒤 창가 긴 의자, 오른쪽 앞 벨벳 의자 쉼터, 왼쪽 앞 책장 벽, 천장에 종이학
  const SCRIBE = { w: 24, d: 14, h: 6.0 };
  const DESKS = [-4.5, -2.6, -0.7, 1.2];
  const DESK_ROWS = [-4.4, -1.4];
  const NOOK = [[6.0, Math.PI / 2], [9.2, -Math.PI / 2]]; // 쉼터 안락의자 x, 바라보는 쪽(z 4.6)
  const scribe = newPlace('scribe', '필사실 꾹꾹', {
    label: '4층 필사실 꾹꾹', short: '4층', tag: '4층 꾹꾹',
    toRatio: (x, z) => [(x + SCRIBE.w / 2) / SCRIBE.w, (z + SCRIBE.d / 2) / SCRIBE.d],
    fromRatio: (rx, ry) => [rx * SCRIBE.w - SCRIBE.w / 2, ry * SCRIBE.d - SCRIBE.d / 2],
    bounds: [-SCRIBE.w / 2, -SCRIBE.d / 2, SCRIBE.w / 2, SCRIBE.d / 2],
    spawn: () => [-10.9, -3.2],
    stairs: null,
    indoor: true,
    quiet: true,
    layers: {
      0: {
        rect: [-11.75, -6.75, 11.75, 6.75],
        blocks: [
          ...DESK_ROWS.map((z) => ({ r: [-5.35, z - 0.4, 2.05, z + 0.4] })),
          ...DESK_ROWS.flatMap((z) => DESKS.map((x) => ({ c: [x, z + 0.8, 0.26] }))),
          { r: [11.5, -4.2, 12, 2.4] }, // 필사 벽
          { r: [6.3, -6.8, 8.7, -6.2] }, // 창가 긴 의자
          ...NOOK.map(([x]) => ({ c: [x, 4.6, 0.5] })), { c: [7.6, 4.6, 0.35] }, { c: [10.6, 6.0, 0.2] }, // 안락의자 둘, 작은 탁자, 스탠드
          { r: [-5.6, 6.0, -1.4, 6.6] }, { r: [-12, 1.8, -11.38, 6.9] }, // 앞 낮은 책장, 왼쪽 책장 벽
          { c: [-11.1, -6.2, 0.42] }, { c: [11.0, -6.2, 0.42] }, { c: [11.0, 6.2, 0.42] }, // 야자 화분
        ],
      },
    },
  });
  // 3층 토론방 맞불: 24m×14m 토론 살롱. 뒤에 연단과 발제 칠판, 가운데 찬(왼쪽)·반(오른쪽) 타원 탁자와 샹들리에,
  // 오른쪽 벽난로(맞불)와 안락의자, 왼쪽 앞 벨벳 소파 쉼터, 앞에 구경꾼 벤치
  const FORUM = { w: 24, d: 14, h: 6.2 };
  const FORUM_WINDOWS = [-8.5, -4.5, 4.5, 8.5];
  const STAGE = { x0: -3.0, x1: 3.0, z0: -6.75, z1: -5.0, h: 0.18 };
  const FORUM_CHAIRS = [
    ['pro-1', -1.4, -1.45, 0], ['pro-2', -0.5, -1.45, 0], ['pro-3', -1.4, 1.85, Math.PI], ['pro-4', -0.5, 1.85, Math.PI], ['pro-5', -3.0, 0.2, Math.PI / 2],
    ['con-1', 0.5, -1.45, 0], ['con-2', 1.4, -1.45, 0], ['con-3', 0.5, 1.85, Math.PI], ['con-4', 1.4, 1.85, Math.PI], ['con-5', 3.0, 0.2, -Math.PI / 2],
  ];
  const FIRE_X = 10.1; // 벽난로 앞 안락의자 x
  const FORUM_SOFA = { id: 'fsofa', x: -9.0, z: 4.2, yaw: Math.PI / 2, color: 0x8E3E3A, pillow: 0xE8C07A };
  const FORUM_ARM = { id: 'farm', x: -5.6, z: 4.2, yaw: -Math.PI / 2, color: 0x3E6B58 };
  const forum = newPlace('forum', '토론방 맞불', {
    label: '3층 토론방 맞불', short: '3층', tag: '3층 맞불',
    toRatio: (x, z) => [(x + FORUM.w / 2) / FORUM.w, (z + FORUM.d / 2) / FORUM.d],
    fromRatio: (rx, ry) => [rx * FORUM.w - FORUM.w / 2, ry * FORUM.d - FORUM.d / 2],
    bounds: [-FORUM.w / 2, -FORUM.d / 2, FORUM.w / 2, FORUM.d / 2],
    spawn: () => [-10.9, -3.2],
    stairs: null,
    indoor: true,
    raised: (x, z) => (x > STAGE.x0 && x < STAGE.x1 && z > STAGE.z0 && z < STAGE.z1 ? STAGE.h : 0),
    layers: {
      0: {
        rect: [-11.75, -6.75, 11.75, 6.75],
        blocks: [
          { c: [0, -5.95, 0.3] }, // 연단 탁자
          { e: [0, 0.2, 2.2, 0.9] }, // 토론 탁자
          ...FORUM_CHAIRS.map(([, x, z]) => ({ c: [x, z, 0.27] })),
          { r: [11.3, -0.8, 12, 1.8] }, { c: [FIRE_X, -0.75, 0.42] }, { c: [FIRE_X, 1.95, 0.42] }, // 벽난로, 안락의자
          { r: [11.35, -6.4, 12, -3.2] }, // 책장
          { r: [-3.3, 5.65, -0.9, 6.2] }, { r: [0.9, 5.65, 3.3, 6.2] }, // 구경꾼 벤치
          { c: [-4.0, -1.3, 0.25] }, { c: [4.0, -1.3, 0.25] }, // 깃발
          boxAt(FORUM_SOFA.x, FORUM_SOFA.z, FORUM_SOFA.yaw, 2.3, 0.95), { r: [-7.5, 3.75, -6.9, 4.65] }, { c: [FORUM_ARM.x, FORUM_ARM.z, 0.5] }, { c: [-9.7, 5.9, 0.2] }, // 소파 쉼터
          { c: [-11.1, -6.2, 0.42] }, { c: [-11.0, 6.2, 0.42] }, { c: [11.0, 6.2, 0.42] }, // 야자 화분
        ],
      },
    },
  });
  // 2층 북카페 사락: 24m×14m 호텔 라운지. 뒤에 높은 아치 창 넷과 창가 둥근 탁자, 가운데 꽃 섬과 샹들리에,
  // 왼쪽 초록 소파 자리, 앞에 마주 보는 남색 소파 자리, 왼쪽 앞 책장 벽과 날개 의자, 오른쪽 벽을 따라 긴 바, 뒤 오른쪽 그랜드 피아노
  const LOUNGE = { w: 24, d: 14, h: 6.4 };
  const CAFE_WINDOWS = [-7.5, -2.5, 2.5, 7.5];
  const CAFE_TABLES = [[-7.5, -5.0], [-2.5, -5.0], [2.5, -5.0]];
  const BAR = { x: 9.4, z0: -3.6, z1: 3.6 }; // 바 앞면 x, 앞뒤 끝
  const STOOLS = [-2.9, -1.95, -1.0, 1.0, 1.95, 2.9]; // 바 의자 z. 가운데는 주문하는 곳이라 비운다
  const PIANO = { x: 8.0, z: -5.2 }; // 건반 쪽 가운데. 몸통은 왼쪽(x 작은 쪽)으로 2m
  const SOFAS = [
    { id: 'sofa', x: -6.5, z: 0, yaw: 0, color: 0x3E6B58, pillow: 0xD8A24A },
    { id: 'sofb', x: 0.4, z: 4.6, yaw: Math.PI / 2, color: 0x3D4F73, pillow: 0xE8C07A },
    { id: 'sofc', x: 4.6, z: 4.6, yaw: -Math.PI / 2, color: 0x3D4F73, pillow: 0xD98C6C },
  ];
  const ARMS = [
    { id: 'arm-1', x: -8.75, z: 1.6, yaw: Math.PI / 2, color: 0xD8A24A },
    { id: 'arm-2', x: -4.25, z: 1.6, yaw: -Math.PI / 2, color: 0xD8A24A },
    { id: 'arm-3', x: -9.6, z: 5.2, yaw: Math.PI / 2 - 0.45, color: 0x8E3E3A, wing: true },
  ];
  const cafe = newPlace('cafe', '북카페 사락', {
    label: '2층 북카페 사락', short: '2층', tag: '2층 사락',
    toRatio: (x, z) => [(x + LOUNGE.w / 2) / LOUNGE.w, (z + LOUNGE.d / 2) / LOUNGE.d],
    fromRatio: (rx, ry) => [rx * LOUNGE.w - LOUNGE.w / 2, ry * LOUNGE.d - LOUNGE.d / 2],
    bounds: [-LOUNGE.w / 2, -LOUNGE.d / 2, LOUNGE.w / 2, LOUNGE.d / 2],
    spawn: () => [-10.9, -3.2],
    stairs: null,
    indoor: true,
    alwaysLit: true,
    layers: {
      0: {
        rect: [-11.75, -6.75, 11.75, 6.75],
        blocks: [
          { r: [BAR.x, BAR.z0 - 0.05, 12.1, BAR.z1 + 0.05] }, // 바와 뒤 선반
          ...STOOLS.map((z) => ({ c: [8.75, z, 0.2] })),
          ...CAFE_TABLES.flatMap(([x, z]) => [{ c: [x, z, 0.52] }, { c: [x - 0.85, z, 0.3] }, { c: [x + 0.85, z, 0.3] }]),
          { r: [PIANO.x - 2.0, PIANO.z - 0.75, PIANO.x + 0.3, PIANO.z + 0.75] }, { c: [PIANO.x + 0.75, PIANO.z, 0.35] }, // 피아노와 의자
          { c: [0, 0.4, 1.05] }, // 꽃 섬
          ...SOFAS.map((s) => boxAt(s.x, s.z, s.yaw, 2.3, 0.95)),
          ...ARMS.map((a) => ({ c: [a.x, a.z, 0.5] })),
          { r: [-7.2, 1.55, -5.8, 2.25] }, { r: [2.1, 3.85, 2.9, 5.35] }, // 낮은 탁자 둘
          { r: [-12.1, 1.8, -11.38, 6.9] }, { r: [-11.3, 2.7, -10.8, 3.3] }, // 왼쪽 앞 책장 벽, 기댄 사다리
          { c: [-8.3, -0.55, 0.2] }, { c: [-10.85, 6.35, 0.2] }, { c: [-9.95, 6.35, 0.24] }, // 스탠드 둘, 곁탁자
          { c: [-11.1, -6.2, 0.42] }, { c: [11.0, -6.2, 0.42] }, { c: [11.0, 6.2, 0.42] }, // 야자 화분
        ],
      },
    },
  });

  // 자리: kind(chair·bench·beanbag·cushion은 앉기, futon·hammock은 눕기), top(앉는 면 높이), yaw(바라보는 쪽), from(다가가 서는 곳)
  const seat = (P, s) => { P.seats.push({ level: 0, lie: s.kind === 'futon' || s.kind === 'hammock' || s.kind === 'lounger', ...s }); };
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
  HAMMOCKS.forEach((z, i) => seat(roof, { id: `roof-ham-${i + 1}`, kind: 'hammock', x: -5.6, z, top: 0.62, yaw: Math.PI / 2, from: [-6.2, z + 1.0] }));
  [5.0, 6.2].forEach((x, i) => seat(roof, { id: `roof-bench-${i + 1}`, kind: 'bench', x, z: 7.0, top: 0.47, yaw: 0, from: [x, 6.2] }));
  ROOF_BAR.forEach((x, i) => seat(roof, { id: `roof-bar-${i + 1}`, kind: 'stool', x, z: -5.45, top: 0.78, yaw: Math.PI, from: [x, -4.7] }));
  LOUNGERS.forEach((z, i) => seat(roof, { id: `roof-lounge-${i + 1}`, kind: 'lounger', x: 6.6, z, top: 0.42, yaw: Math.PI / 2, from: [6.6, z + 0.75] }));
  FIRE_SOFAS.forEach((f) => [-0.53, 0.53].forEach((lx, i) => { const [x, z] = turnAt(f.x, f.z, f.yaw, lx, 0.08); seat(roof, { id: `${f.id}-${i + 1}`, kind: 'sofa', x, z, top: 0.5, yaw: f.yaw, from: turnAt(f.x, f.z, f.yaw, lx, 1.0) }); }));
  STOOLS.forEach((z, i) => seat(cafe, { id: `bar-${i + 1}`, kind: 'stool', x: 8.75, z, top: 0.78, yaw: Math.PI / 2, from: [8.0, z] }));
  CAFE_TABLES.forEach(([x, z], i) => {
    seat(cafe, { id: `ct${i + 1}-l`, kind: 'chair', x: x - 0.85, z, top: 0.47, yaw: Math.PI / 2, from: [x - 0.85, z + 0.8], lamp: `C-${i + 1}` });
    seat(cafe, { id: `ct${i + 1}-r`, kind: 'chair', x: x + 0.85, z, top: 0.47, yaw: -Math.PI / 2, from: [x + 0.85, z + 0.8], lamp: `C-${i + 1}` });
  });
  SOFAS.forEach((s) => [-0.53, 0.53].forEach((lx, i) => {
    const [x, z] = turnAt(s.x, s.z, s.yaw, lx, 0.08);
    seat(cafe, { id: `${s.id}-${i + 1}`, kind: 'sofa', x, z, top: 0.5, yaw: s.yaw, from: turnAt(s.x, s.z, s.yaw, lx, 1.0) });
  }));
  ARMS.forEach((a) => seat(cafe, { id: a.id, kind: 'sofa', x: a.x, z: a.z, top: 0.5, yaw: a.yaw, from: turnAt(a.x, a.z, a.yaw, 0, 0.95) }));
  STUMPS.forEach(([x, z, yaw, a], i) => seat(cave, { id: `stump-${i + 1}`, kind: 'stool', x, z, top: 0.45, yaw, from: [PED[0] + Math.sin(a) * 2.9, PED[1] + Math.cos(a) * 2.9] }));
  BURROWS.forEach((x, i) => seat(cave, { id: `burrow-${i + 1}`, kind: 'cushion', x, z: 7.6, top: 0.17, yaw: 0, from: [x, 6.3] }));
  [0, 1, 2, 3, 4].forEach((k) => { const a = (k * 2 * Math.PI) / 5; seat(cave, { id: `pit-${k + 1}`, kind: 'cushion', x: PIT[0] + Math.sin(a) * 1.5, z: PIT[1] + Math.cos(a) * 1.5, top: 0.18, yaw: a + Math.PI, from: [PIT[0] + Math.sin(a) * 0.55, PIT[1] + Math.cos(a) * 0.55] }); });
  DESK_ROWS.forEach((z, r) => DESKS.forEach((x, i) => seat(scribe, { id: `desk-${r * 4 + i + 1}`, kind: 'chair', desk: true, x, z: z + 0.8, top: 0.47, yaw: Math.PI, from: [x + 0.65, z + 1.15], lamp: `S-${r * 4 + i + 1}` })));
  [6.8, 8.2].forEach((x, i) => seat(scribe, { id: `window-${i + 1}`, kind: 'bench', x, z: -6.45, top: 0.45, yaw: 0, from: [x, -5.65] }));
  NOOK.forEach(([x, yaw], i) => seat(scribe, { id: `nook-${i + 1}`, kind: 'sofa', x, z: 4.6, top: 0.5, yaw, from: turnAt(x, 4.6, yaw, 0, 0.95) }));
  FORUM_CHAIRS.forEach(([id, x, z, yaw]) => seat(forum, { id, kind: 'chair', x, z, top: 0.47, yaw, side: id.slice(0, 3), from: [x + (Math.abs(yaw) === Math.PI / 2 ? 0 : 0), z + (yaw === 0 ? -0.75 : yaw === Math.PI ? 0.75 : -0.8)] }));
  seat(forum, { id: 'fire-1', kind: 'sofa', x: FIRE_X, z: -0.75, top: 0.5, yaw: -Math.PI / 2 - 0.35, from: [FIRE_X - 0.95, -0.75] });
  seat(forum, { id: 'fire-2', kind: 'sofa', x: FIRE_X, z: 1.95, top: 0.5, yaw: -Math.PI / 2 + 0.35, from: [FIRE_X - 0.95, 1.95] });
  [-0.53, 0.53].forEach((lx, i) => { const [x, z] = turnAt(FORUM_SOFA.x, FORUM_SOFA.z, FORUM_SOFA.yaw, lx, 0.08); seat(forum, { id: `fsofa-${i + 1}`, kind: 'sofa', x, z, top: 0.5, yaw: FORUM_SOFA.yaw, from: turnAt(FORUM_SOFA.x, FORUM_SOFA.z, FORUM_SOFA.yaw, lx, 1.0) }); });
  seat(forum, { id: 'farm', kind: 'sofa', x: FORUM_ARM.x, z: FORUM_ARM.z, top: 0.5, yaw: FORUM_ARM.yaw, from: turnAt(FORUM_ARM.x, FORUM_ARM.z, FORUM_ARM.yaw, 0, 0.95) });
  [-2.6, -1.6, 1.6, 2.6].forEach((x, i) => seat(forum, { id: `gallery-${i + 1}`, kind: 'bench', x, z: 5.92, top: 0.45, yaw: Math.PI, from: [x, 5.1] }));
  hall.hots = { book: { at: [0, -2.3], level: 0, card: 'book', tip: '펼친 책' }, board: { at: [-9.2, -0.9], level: 0, card: 'board', tip: '글감 질문' }, shelf: { at: [7.6, -0.6], level: 0, card: 'shelf', tip: '우리 책장' } };
  roof.hots = { stars: { at: [8.8, 5.4], level: 0, card: 'stars', tip: '별 보는 망원경' }, bar: { at: [0.7, -4.6], level: 0, card: 'cafe', tip: '별빛 바' }, shelf: { at: [-10.3, -4.3], level: 0, card: 'shelf', tip: '옥상 책장' } };
  cave.hots = { archive: { at: [0, 0.9], level: 0, card: 'book', tip: '이 문집' }, cart: { at: [10.2, 0], level: 0, card: 'shelf', tip: '책 광차' } };
  scribe.hots = { wall: { at: [10.9, -0.9], level: 0, card: 'wall', tip: '필사 벽' }, shelf: { at: [-3.5, 5.4], level: 0, card: 'shelf', tip: '필사실 책장' } };
  forum.hots = { topic: { at: [0, -4.4], level: 0, card: 'topic', tip: '발제 칠판' }, shelf: { at: [10.8, -4.8], level: 0, card: 'shelf', tip: '토론 책장' } };
  cafe.hots = { counter: { at: [8.55, 0], level: 0, card: 'cafe', tip: '사락 카운터' }, shelf: { at: [-10.8, 3.75], level: 0, card: 'shelf', tip: '카페 책장' } };
  hall.portals = [
    { id: 'up', dir: 'up', level: 1, zone: (x, z) => x < -11.62 && z > -7.4 && z < -6.4, at: [-11.4, -6.9] },
    { id: 'room', href: true, level: 0, zone: (x, z) => x > 10.6 && z > 2.85 && z < 4.15, at: [10.5, 3.5], tip: '모임방으로' },
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x < -11.62 && z > 1.3 && z < 2.2, at: [-11.5, 1.75], tip: '책 엘리베이터' },
    { id: 'down', dir: 'down', level: 0, zone: (x, z) => x > -10.45 && x < -9.35 && z > 3.95 && z < 4.75, at: [-9.9, 4.4] },
  ];
  roof.portals = [
    { id: 'down', dir: 'down', level: 0, zone: (x, z) => x > -10.75 && x < -9.65 && z < -5.63, at: [-10.2, -5.5] },
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x > -7.4 && x < -6.6 && z < -6.35, at: [-7.0, -6.3], tip: '책 엘리베이터' },
  ];
  cafe.portals = [
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x < -11.5 && z > -3.7 && z < -2.7, at: [-11.45, -3.2], tip: '책 엘리베이터' },
    { id: 'up', dir: 'up', level: 0, zone: (x, z) => x < -11.5 && z > -1.7 && z < -0.7, at: [-11.45, -1.2] },
    { id: 'down', dir: 'down', level: 0, zone: (x, z) => x < -11.5 && z > 0.3 && z < 1.3, at: [-11.45, 0.8] },
  ];
  cave.portals = [
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x < -13.5 && z > -3.7 && z < -2.7, at: [-13.45, -3.2], tip: '책 엘리베이터' },
    { id: 'up', dir: 'up', level: 0, zone: (x, z) => x < -13.5 && z > -1.7 && z < -0.7, at: [-13.45, -1.2] },
  ];
  cave.arriveFromAbove = { x: -12.85, z: -1.2, layer: 0 }; cave.liftArrive = { x: -12.85, z: -3.2, layer: 0 };
  scribe.portals = [
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x < -11.5 && z > -3.7 && z < -2.7, at: [-11.45, -3.2], tip: '책 엘리베이터' },
    { id: 'up', dir: 'up', level: 0, zone: (x, z) => x < -11.5 && z > -1.7 && z < -0.7, at: [-11.45, -1.2] },
    { id: 'down', dir: 'down', level: 0, zone: (x, z) => x < -11.5 && z > 0.3 && z < 1.3, at: [-11.45, 0.8] },
  ];
  scribe.arriveFromBelow = { x: -10.85, z: 0.8, layer: 0 }; scribe.arriveFromAbove = { x: -10.85, z: -1.2, layer: 0 }; scribe.liftArrive = { x: -10.85, z: -3.2, layer: 0 };
  forum.portals = [
    { id: 'lift', lift: true, level: 0, zone: (x, z) => x < -11.5 && z > -3.7 && z < -2.7, at: [-11.45, -3.2], tip: '책 엘리베이터' },
    { id: 'up', dir: 'up', level: 0, zone: (x, z) => x < -11.5 && z > -1.7 && z < -0.7, at: [-11.45, -1.2] },
    { id: 'down', dir: 'down', level: 0, zone: (x, z) => x < -11.5 && z > 0.3 && z < 1.3, at: [-11.45, 0.8] },
  ];
  forum.arriveFromBelow = { x: -10.85, z: 0.8, layer: 0 }; forum.arriveFromAbove = { x: -10.85, z: -1.2, layer: 0 }; forum.liftArrive = { x: -10.85, z: -3.2, layer: 0 };
  // 층 잇기: 아래에서 위로 놓인 순서. 계단 문은 바로 위·아래 층으로, 엘리베이터는 어느 층으로든
  hall.arriveFromAbove = { x: -11.0, z: -6.9, layer: 1 }; hall.arriveFromBelow = { x: -9.9, z: 5.7, layer: 0 }; hall.liftArrive = { x: -10.95, z: 1.75, layer: 0 };
  roof.arriveFromBelow = { x: -10.2, z: -5.0, layer: 0 }; roof.liftArrive = { x: -7.0, z: -5.7, layer: 0 };
  cafe.arriveFromBelow = { x: -10.85, z: 0.8, layer: 0 }; cafe.arriveFromAbove = { x: -10.85, z: -1.2, layer: 0 }; cafe.liftArrive = { x: -10.85, z: -3.2, layer: 0 };
  const FLOORS = ['cave', 'hall', 'cafe', 'forum', 'scribe', 'roof'].filter((id) => PLACES[id]);
  FLOORS.forEach((id, i) => PLACES[id].portals.forEach((q) => {
    if (!q.dir) return;
    const next = PLACES[FLOORS[q.dir === 'up' ? i + 1 : i - 1]];
    if (!next) { q.off = true; return; }
    q.to = next.id; q.arrive = q.dir === 'up' ? next.arriveFromBelow : next.arriveFromAbove;
    q.tip = `${q.dir === 'up' ? '↑' : '↓'} ${next.label}`;
  }));

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
    if (layer === 0 && P.raised) { const h = P.raised(x, z); if (h) return h; }
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
    const roofSign = plane(roofDoor, 1.0, 0.3, toon(0xffffff, { map: signTex('↑ 위층', { bg: '#FFF6E6', fg: '#2E241C' }) }), 0.07, 2.45, 0, { ry: Math.PI / 2 });
    roofSign.castShadow = false;
    roofDoor.position.set(-11.95, LOFT_Y, -6.9);
    mark(P, roofDoor, { portal: 'up' });
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
    const { w: W, d: D } = ROOF; const hw = W / 2; const hd = D / 2;
    const rand = seeded(73);
    // 지붕 전체를 덮는 나무 데크, 가장자리 돌 띠
    box(S, W + 0.6, 0.59, D + 0.6, 0x8A7E70, 0, -0.6, 0, { line: 0.05, cast: false });
    const deck = canvasTex(2048, 1365, (g, w, h) => {
      const rand = seeded(61); const px = w / W; const band = 0.35 * px;
      g.fillStyle = '#B9B2A6'; g.fillRect(0, 0, w, h);
      for (let x = band; x < w - band; x += 30) { const tone = 170 + rand() * 30; g.fillStyle = `rgb(${tone + 15},${tone - 25},${tone - 70})`; g.fillRect(x, band, Math.min(30, w - band - x), h - band * 2); g.strokeStyle = 'rgba(90,60,36,.55)'; g.lineWidth = 3; g.strokeRect(x, band, 30, h - band * 2); }
      g.strokeStyle = '#8A7E70'; g.lineWidth = 4; g.strokeRect(band, band, w - band * 2, h - band * 2);
    });
    const floor = plane(S, W, D, toon(0xffffff, { map: deck }), 0, 0, 0, { rx: -Math.PI / 2 });
    mark(P, floor, { floor: 0 });
    // 난간: 놋쇠 윗대, 흰 기둥
    const rail = new THREE.Group();
    const posts = (x0, z0, x1, z1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8); for (let i = 0; i <= n; i++) cyl(rail, 0.04, 0.04, 1.0, 0xFFFDF8, lerp(x0, x1, i / n), 0, lerp(z0, z1, i / n), { line: 0.012, seg: 8 }); const r = box(rail, Math.hypot(x1 - x0, z1 - z0) + 0.1, 0.08, 0.1, BRASS, (x0 + x1) / 2, 1.0, (z0 + z1) / 2, { line: 0.02 }); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); };
    posts(-hw + 0.1, hd - 0.1, hw - 0.1, hd - 0.1); posts(-hw + 0.1, -hd + 0.1, -hw + 0.1, hd - 0.1); posts(hw - 0.1, -hd + 0.1, hw - 0.1, hd - 0.1); posts(-hw + 0.1, -hd + 0.1, hw - 0.1, -hd + 0.1);
    S.add(rail);
    // 계단 집과 서고로 내려가는 문
    const hut = new THREE.Group();
    box(hut, 3.0, 2.6, 2.0, 0xEFE3CF, -10.2, 0, -6.9, { line: 0.04 });
    box(hut, 3.3, 0.18, 2.3, 0x6B4430, -10.2, 2.6, -6.9, { line: 0.03 });
    box(hut, 1.0, 2.05, 0.1, 0x6E8B74, -10.2, 0, -5.88, { line: 0.025 });
    plane(hut, 1.0, 0.3, toon(0xffffff, { map: signTex('↓ 아래층', { bg: '#FFF6E6', fg: '#2E241C' }) }), -10.2, 2.32, -5.82);
    mark(P, hut.children[hut.children.length - 2], { portal: 'down' });
    block(P, hut); S.add(hut);

    // 뒤: 퍼걸러 아래 별빛 바(눌러서 주문), 높은 의자 다섯, 뒤 선반과 간판
    const bar = new THREE.Group();
    box(bar, 7.2, 1.05, 0.7, 0x5A3825, 0, 0, -6.45, { line: 0.03 });
    for (let x = -3.3; x < 3.4; x += 0.6) box(bar, 0.44, 0.7, 0.03, 0x6E4630, x + 0.3, 0.17, -6.09, { line: 0.006, cast: false });
    box(bar, 7.4, 0.07, 0.86, MARBLE, 0, 1.05, -6.45, { line: 0.02 });
    const brail = solid(new THREE.CylinderGeometry(0.028, 0.028, 7.0, 10), BRASS, { line: 0.008 }); brail.rotation.z = Math.PI / 2; brail.position.set(0, 0.2, -5.9); bar.add(brail);
    box(bar, 7.2, 1.0, 0.5, WALNUT, 0, 0, -7.55, { line: 0.03 });
    [1.55, 2.2].forEach((y, r) => { box(bar, 7.0, 0.04, 0.3, BRASS, 0, y, -7.6, { line: 0.006 }); for (let i = 0; i < 16; i++) { const c = [0x8C5A3B, 0x3E6B58, 0xDDE9EC, 0xC9604A, 0xE3A857, 0x6E4A7A][(i + r * 2) % 6]; const tall = 0.26 + ((i * 5 + r) % 3) * 0.05; cyl(bar, 0.055, 0.06, tall, c, -3.2 + i * 0.42 + r * 0.15, y + 0.04, -7.6, { line: 0.006, seg: 10 }); } });
    const barSign = plane(bar, 3.2, 0.7, toon(0xffffff, { map: signTex('별빛 바', { bg: '#2F3B33', fg: '#F2D16B', size: 110 }) }), 0, 3.0, -7.78);
    barSign.castShadow = false;
    [-3.0, 0, 3.0].forEach((x) => { const g = new THREE.Group(); cyl(g, 0.1, 0.12, 0.03, BRASS, 0, 0, 0, { line: 0.006 }); cyl(g, 0.015, 0.015, 0.28, BRASS, 0, 0.03, 0, { line: 0.004, seg: 6 }); glow(g, 0xffd98a, 0.8, 0, 0.3, 0); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 14, 1, false, 0, Math.PI), toon(EMERALD, { side: THREE.DoubleSide })); sh.rotation.z = Math.PI / 2; sh.position.y = 0.33; g.add(sh); g.position.set(x, 1.12, -6.6); bar.add(g); });
    mark(P, bar, { hot: 'bar' }); block(P, bar); S.add(bar);
    P.seats.filter((st) => st.id.startsWith('roof-bar')).forEach((st, i) => {
      const g = new THREE.Group(); const c = i % 2 ? 0xD8A24A : EMERALD;
      cyl(g, 0.2, 0.22, 0.03, BRASS, 0, 0, 0, { line: 0.008 }); cyl(g, 0.03, 0.03, 0.66, BRASS, 0, 0.03, 0, { line: 0.006, seg: 8 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 5, 18), toon(BRASS)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
      cyl(g, 0.21, 0.19, 0.09, c, 0, 0.69, 0, { line: 0.012 });
      g.position.set(st.x, 0, st.z); g.rotation.y = st.yaw; mark(P, g, { seat: st.id }); S.add(g); st.mesh = g;
    });
    const pergola = new THREE.Group();
    [[-4.2, -7.6], [4.2, -7.6], [-4.2, -4.6], [4.2, -4.6]].forEach(([x, z]) => box(pergola, 0.18, 3.2, 0.18, 0x6B4430, x, 0, z, { line: 0.015 }));
    [-7.6, -4.6].forEach((z) => box(pergola, 8.8, 0.2, 0.2, 0x6B4430, 0, 3.2, z, { line: 0.015 }));
    for (let x = -4.0; x <= 4.0; x += 0.5) box(pergola, 0.1, 0.12, 3.4, 0x8C5A3B, x, 3.4, -6.1, { line: 0.01, cast: false });
    for (let i = 0; i < 9; i++) { const v = new THREE.Group(); v.position.set(-3.8 + i * 0.95, 3.2, -6.1 + Math.sin(i * 1.7) * 1.1); for (let k = 0; k < 5; k++) { const leaf = solid(new THREE.SphereGeometry(0.08, 6, 5), k % 2 ? 0x6E8B74 : 0x7A9E7E, { line: 0.006 }); leaf.scale.set(1, 2.4, 1); leaf.position.set(Math.sin(k * 2.1) * 0.08, -0.15 - k * 0.17, Math.cos(k * 2.1) * 0.08); v.add(leaf); } pergola.add(v); }
    block(P, pergola); S.add(pergola);
    // 오른쪽: 수영장(가장자리 유리, 물결이 흐른다)과 선베드 넷, 파라솔 둘
    const pool = new THREE.Group();
    const px0 = 8.2; const px1 = hw - 0.25; const pz0 = -5.75; const pz1 = 3.75; const pcx = (px0 + px1) / 2; const pcz = (pz0 + pz1) / 2;
    box(pool, px1 - px0, 0.12, pz1 - pz0, 0xE8E2D6, pcx, 0, pcz, { line: 0.02, cast: false });
    P.water = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5FC4D0'; g.fillRect(0, 0, w, h); const rr = seeded(7);
      g.strokeStyle = 'rgba(230,255,255,.55)'; g.lineWidth = 3;
      for (let i = 0; i < 26; i++) { const x = rr() * w; const y = rr() * h; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 14, y - 8, x + 28, y + 8, x + 44, y); g.stroke(); }
    }, { repeat: [2, 4] });
    const waterMesh = plane(pool, px1 - px0 - 0.4, pz1 - pz0 - 0.4, new THREE.MeshLambertMaterial({ map: P.water, emissive: 0x1a5560, emissiveIntensity: 0.6 }), pcx, 0.125, pcz, { rx: -Math.PI / 2, receive: false });
    P.poolLight = new THREE.PointLight(0x7fe0ea, 0, 9, 1.4); P.poolLight.position.set(pcx, 0.6, pcz); pool.add(P.poolLight);
    const glassEdge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, pz1 - pz0), new THREE.MeshLambertMaterial({ color: 0xDDF0F7, transparent: true, opacity: 0.35, depthWrite: false })); glassEdge.position.set(px1 - 0.03, 0.37, pcz); pool.add(glassEdge);
    [[-0.3, 0], [0.3, 0]].forEach(([dx]) => { const ladder = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16, Math.PI), toon(0xA9B2BA)); ladder.position.set(px0 + 0.3 + dx * 0, 0.35, pz1 - 0.6 + dx); ladder.rotation.y = Math.PI / 2; pool.add(ladder); });
    mark(P, pool, { floor: 0 }); block(P, pool); S.add(pool);
    P.seats.filter((st) => st.kind === 'lounger').forEach((st, i) => {
      const g = new THREE.Group(); const c = i % 2 ? 0xFFFDF8 : 0xF2D16B;
      [[-0.8, -0.28], [-0.8, 0.28], [0.8, -0.28], [0.8, 0.28]].forEach(([a, b]) => box(g, 0.05, 0.25, 0.05, 0xFFFDF8, a, 0, b, { line: 0.006 }));
      box(g, 1.9, 0.08, 0.66, 0xB98A5E, 0, 0.25, 0, { line: 0.015 });
      box(g, 1.3, 0.08, 0.6, c, 0.25, 0.33, 0, { line: 0.012 });
      const backrest = box(g, 0.62, 0.08, 0.6, c, 0, 0, 0, { line: 0.012 }); backrest.position.set(-0.62, 0.48, 0); backrest.rotation.z = -0.55;
      box(g, 0.3, 0.12, 0.42, 0xFFFDF8, -0.78, 0.6, 0, { line: 0.008 });
      g.position.set(st.x, 0, st.z); mark(P, g, { seat: st.id }); S.add(g); st.mesh = g;
    });
    const parasol = (x, z, c) => {
      const g = new THREE.Group(); cyl(g, 0.22, 0.25, 0.08, 0xFFFDF8, 0, 0, 0, { line: 0.01 }); cyl(g, 0.03, 0.03, 2.5, 0xFFFDF8, 0, 0.08, 0, { line: 0.006, seg: 8 });
      const cone = solid(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true), c, { line: 0.02, mat: toon(c, { side: THREE.DoubleSide }) }); cone.position.y = 2.45; g.add(cone);
      g.position.set(x, 0, z); S.add(g);
    };
    parasol(4.6, -3.8, 0xD9654B); parasol(4.6, 1.0, 0x4F8F8A);
    // 가운데: 불멍 라운지(돌 화로와 ㄷ자 소파, 둥근 깔개)
    const fireRug = new THREE.Mesh(new THREE.CircleGeometry(3.0, 48), toon(0xC9B79A)); fireRug.rotation.x = -Math.PI / 2; fireRug.position.set(PIT_X, 0.011, 0); fireRug.receiveShadow = true; S.add(fireRug); mark(P, fireRug, { floor: 0 });
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.75, 2.9, 48), toon(0x8C5A3B)); ring2.rotation.x = -Math.PI / 2; ring2.position.set(PIT_X, 0.013, 0); S.add(ring2);
    const pit = new THREE.Group();
    cyl(pit, 0.62, 0.55, 0.42, 0x8F857C, 0, 0, 0, { line: 0.02, seg: 20 }); cyl(pit, 0.66, 0.66, 0.06, 0xB9B2A6, 0, 0.42, 0, { line: 0.012, seg: 20 });
    cyl(pit, 0.48, 0.48, 0.02, 0x2B1C12, 0, 0.47, 0, { line: 0, seg: 20 });
    P.pitFlames = [0, 1, 2, 3].map((i) => { const fl = solid(new THREE.ConeGeometry(0.18 - (i % 2) * 0.05, 0.55 - (i % 2) * 0.12, 6), [0xF2A43A, 0xF2D16B, 0xE4572E, 0xF2A43A][i], { line: 0.008 }); fl.position.set(Math.cos(i * 1.6) * 0.15, 0.72, Math.sin(i * 1.6) * 0.15); pit.add(fl); return fl; });
    P.pitLight = new THREE.PointLight(0xffa860, 3.5, 9, 1.3); P.pitLight.position.y = 1.0; pit.add(P.pitLight);
    P.pitGlow = glow(pit, 0xffb070, 2.8, 0, 0.8, 0);
    pit.position.x = PIT_X; block(P, pit); S.add(pit);
    FIRE_SOFAS.forEach((s) => velvetSofa(P, s));
    // 왼쪽 앞: 온실, 화단, 해먹 둘
    const house = new THREE.Group();
    const gl = new THREE.MeshLambertMaterial({ color: 0xDDF0F7, transparent: true, opacity: 0.28, depthWrite: false });
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.2, 2.6), gl); hb.position.set(-10.2, 1.1, 6.0); house.add(hb);
    const hEdge = new THREE.LineSegments(new THREE.EdgesGeometry(hb.geometry), new THREE.LineBasicMaterial({ color: 0xFFFDF8 })); hEdge.position.copy(hb.position); house.add(hEdge);
    const roofGeo = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 4, 1, false, 0, Math.PI); const hr = new THREE.Mesh(roofGeo, gl); hr.rotation.set(Math.PI / 2, 0, Math.PI / 2); hr.scale.set(0.95, 1, 0.45); hr.position.set(-10.2, 2.2, 6.0); house.add(hr);
    for (let i = 0; i < 8; i++) { const pot = cyl(house, 0.16, 0.12, 0.22, 0xC9604A, -10.95 + (i % 4) * 0.5, 0.6, 5.2 + Math.floor(i / 4) * 1.6, { line: 0.008, seg: 10 }); const b = solid(new THREE.IcosahedronGeometry(0.2, 1), [0x6E8B74, 0x7A9E7E, 0xE8A0A8, 0xF2D16B][i % 4], { line: 0.01 }); b.position.set(-10.95 + (i % 4) * 0.5, 1.0, 5.2 + Math.floor(i / 4) * 1.6); house.add(b); }
    box(house, 2.2, 0.06, 0.4, 0xB98A5E, -10.2, 0.6, 5.2, { line: 0.008 }); box(house, 2.2, 0.06, 0.4, 0xB98A5E, -10.2, 0.6, 6.8, { line: 0.008 });
    block(P, house); S.add(house);
    const bed = new THREE.Group(); box(bed, 1.1, 0.55, 4.3, 0x8C5A3B, -11.0, 0, 0.2, { line: 0.025 });
    const r3 = seeded(73);
    for (let i = 0; i < 26; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(new THREE.Color(['#E4572E', '#F2D16B', '#B98DB5', '#FFFDF8'][i % 4]).getHex())); f.position.set(-11.25 + r3() * 0.5, 0.62 + r3() * 0.2, -1.8 + r3() * 4.0); bed.add(f); }
    block(P, bed); S.add(bed);
    const kiosk = new THREE.Group(); box(kiosk, 0.6, 1.8, 1.8, 0x55361F, -11.25, 0, -4.3, { line: 0.03 }); shelfFace(P, kiosk, 1.7, 1.6, 3, 141, -10.945, 0.1, -4.3, Math.PI / 2); box(kiosk, 0.8, 0.12, 2.0, 0xD9654B, -11.2, 1.8, -4.3, { line: 0.015 });
    plane(kiosk, 1.2, 0.3, toon(0xffffff, { map: signTex('옥상 책장', { bg: '#FFF6E6', fg: '#2E241C' }) }), -10.93, 2.15, -4.3, { ry: Math.PI / 2 });
    mark(P, kiosk, { hot: 'shelf' }); block(P, kiosk); S.add(kiosk);
    // 해먹: 기둥 사이에 늘어진 천
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
      cloth.position.y = -0.38; cloth.castShadow = true;
      swing.add(cloth);
      cloth.add(new THREE.LineSegments(new THREE.EdgesGeometry(hammockGeo, 40), new THREE.LineBasicMaterial({ color: INK })));
      [-1.2, 1.2].forEach((dx) => { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0x8C5A3B })); rope.position.set(dx * 1.08, -0.18, 0); rope.rotation.z = dx > 0 ? 0.35 : -0.35; swing.add(rope); });
      mark(P, swing, { seat: s.id });
      S.add(swing);
      s.mesh = swing;
      P.hammocks[s.id] = swing;
    });
    // 오른쪽 앞: 망원경과 별 보는 벤치
    box(S, 2.6, 0.36, 0.55, 0x8C5A3B, 5.6, 0, 7.0, { line: 0.03 });
    box(S, 2.6, 0.55, 0.08, 0x8C5A3B, 5.6, 0.4, 7.24, { line: 0.02 });
    P.seats.filter((s) => s.kind === 'bench').forEach((s, i) => { const c = box(S, 1.1, 0.1, 0.5, i ? 0x9BB7D4 : 0xE3A857, s.x, 0.36, s.z, { line: 0.02 }); mark(P, c, { seat: s.id }); s.mesh = c; });
    const scope = new THREE.Group();
    [0, 2.1, 4.2].forEach((a) => { const leg = box(scope, 0.05, 1.2, 0.05, 0x3B2618, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, { line: 0.01 }); leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); });
    const tube = solid(new THREE.CylinderGeometry(0.09, 0.13, 1.1, 16), 0x4F6D8A, { line: 0.02 });
    tube.position.set(0, 1.35, 0); tube.rotation.set(-0.9, 0.4, 0);
    scope.add(tube);
    scope.position.set(9.6, 0, 6.0);
    mark(P, scope, { hot: 'stars' });
    S.add(scope);
    palm(P, 11.0, 6.9); palm(P, -3.2, 7.0); palm(P, 3.4, -4.0);
    // 줄 전구: 퍼걸러에서 앞 기둥으로, 해 지면 켜진다
    P.bulbs = [];
    const strand = (a, b, n) => { for (let i = 1; i < n; i++) { const t = i / n; const x = lerp(a[0], b[0], t); const z = lerp(a[2], b[2], t); const y = lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * 0.6; const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b5 })); bulb.position.set(x, y, z); S.add(bulb); P.bulbs.push(bulb); } };
    [[-1.6, 7.3], [1.6, 7.3]].forEach(([x, z]) => cyl(S, 0.06, 0.06, 3.3, 0x3B2618, x, 0, z, { line: 0.012, seg: 8 }));
    strand([-4.2, 3.2, -4.6], [-1.6, 3.3, 7.3], 22); strand([4.2, 3.2, -4.6], [1.6, 3.3, 7.3], 22);
    strand([-4.2, 3.2, -4.6], [1.6, 3.3, 7.3], 24); strand([4.2, 3.2, -4.6], [-1.6, 3.3, 7.3], 24);
    strand([-hw + 0.1, 1.05, -hd + 0.1], [-4.2, 3.2, -7.6], 14); strand([hw - 0.1, 1.05, -hd + 0.1], [4.2, 3.2, -7.6], 14);
    P.anim = (dt, t) => {
      P.water.offset.set((t * 0.02) % 1, (t * 0.05) % 1);
      P.pitFlames.forEach((fl, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.15 + Math.sin(t * 23 + i * 2) * 0.06; fl.scale.set(1, k, 1); fl.rotation.y = t * (1 + i); });
      P.pitLight.intensity = 3.2 + Math.sin(t * 11) * 0.5 + Math.sin(t * 27) * 0.3;
      P.pitGlow.material.opacity = 0.7 + Math.sin(t * 9) * 0.15;
    };
    // 우리 건물 몸통: 옥상 아래로 길까지. 층 높이는 안과 맞춘다(길에서 1층 큰 서고 7.8m, 2층 라운지 7.2m, 3·4층 5.2m씩)
    const STREET = -26; const BW = 25.2; const BD = 17.2; const TOP = -0.6; const BH = TOP - STREET;
    const LEVELS = [0, 7.8, 15.0, 20.2, BH];
    const facade = (wm, side, lit) => canvasTex(Math.round(wm * 40), Math.round(BH * 40), (g, w, h) => {
      const px = 40; const Y = (m) => h - m * px; const X = (m) => w / 2 + m * px;
      if (lit) { g.fillStyle = '#000000'; g.fillRect(0, 0, w, h); } else {
        g.fillStyle = '#B8694A'; g.fillRect(0, 0, w, h);
        const r = seeded(Math.round(wm * 10) + side.length);
        for (let i = 0; i < (w * h) / 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,60,40,.18)' : 'rgba(225,150,112,.2)'; g.fillRect(Math.floor((r() * w) / 24) * 24 + (Math.floor((r() * h) / 12) % 2) * 12, Math.floor((r() * h) / 12) * 12, 23, 11); }
        g.strokeStyle = 'rgba(255,236,214,.3)'; g.lineWidth = 1.5;
        for (let row = 0, y = h; y > 0; row++, y -= 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (row % 2) * 12; x < w; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 12); g.stroke(); } }
        g.fillStyle = '#D9CBB2'; g.fillRect(0, Y(1.0), w, px);
        g.fillStyle = '#EFE3CF'; LEVELS.slice(1, -1).forEach((m) => g.fillRect(0, Y(m + 0.2), w, 0.4 * px)); g.fillRect(0, 0, w, 0.7 * px);
        g.strokeStyle = 'rgba(46,36,28,.35)'; g.lineWidth = 2; LEVELS.slice(1, -1).forEach((m) => { g.beginPath(); g.moveTo(0, Y(m - 0.2)); g.lineTo(w, Y(m - 0.2)); g.stroke(); });
      }
      const arch = (cx, y0, y1, wd) => { const rr = wd / 2; g.beginPath(); g.moveTo(X(cx - rr), Y(y0)); g.lineTo(X(cx - rr), Y(y1 - rr)); g.arc(X(cx), Y(y1 - rr), rr * px, Math.PI, 0); g.lineTo(X(cx + rr), Y(y0)); g.closePath(); };
      const rect = (cx, y0, y1, wd) => { g.beginPath(); g.rect(X(cx - wd / 2), Y(y1), wd * px, (y1 - y0) * px); };
      const win = (shape, cx, y0, y1, wd) => {
        if (lit) { g.fillStyle = '#FFD9A0'; shape(cx, y0, y1, wd); g.fill(); return; }
        g.fillStyle = '#F4EBDD'; shape(cx, y0 - 0.18, y1 + 0.18, wd + 0.36); g.fill();
        g.fillStyle = '#4F6274'; shape(cx, y0, y1, wd); g.fill();
        g.strokeStyle = '#F4EBDD'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(cx), Y(y0)); g.lineTo(X(cx), Y(y1 - 0.1)); g.moveTo(X(cx - wd / 2), Y(y0 + (y1 - y0) * 0.55)); g.lineTo(X(cx + wd / 2), Y(y0 + (y1 - y0) * 0.55)); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(X(cx - wd / 2 + 0.15), Y(y0 + (y1 - y0) * 0.9)); g.lineTo(X(cx - wd / 2 + 0.6), Y(y0 + (y1 - y0) * 0.9)); g.lineTo(X(cx - wd / 2 + 0.15), Y(y0 + (y1 - y0) * 0.6)); g.closePath(); g.fill();
      };
      const sides = side === 'side';
      if (side === 'front') [-9.2, -4.8, 4.8, 9.2].forEach((x) => win(arch, x, 1.4, 6.4, 2.6));
      else if (side === 'back') { win(arch, 0, 0.9, 6.6, 7.2); [-8.6, 8.6].forEach((x) => win(arch, x, 1.4, 6.0, 2.2)); }
      else [-5.5, 0, 5.5].forEach((x) => win(arch, x, 1.4, 6.2, 2.4));
      (sides ? [-5, 0, 5] : CAFE_WINDOWS).forEach((x) => win(arch, x, 8.65, 14.05, sides ? 2.4 : 2.7));
      (sides ? [-6, -2, 2, 6] : [-10.5, -7.5, -4.5, -1.5, 1.5, 4.5, 7.5, 10.5]).forEach((x) => { win(rect, x, 16.1, 18.6, 1.5); win(rect, x, 21.2, 23.6, 1.4); });
      if (side === 'front' && !lit) {
        g.fillStyle = '#EFE3CF'; arch(0, 0, 4.6, 3.6); g.fill();
        g.fillStyle = '#5E3B27'; arch(0, 0, 4.3, 3.0); g.fill();
        g.strokeStyle = '#3B2618'; g.lineWidth = 4; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(4.3)); g.stroke();
        g.fillStyle = '#E3A857'; [-0.25, 0.25].forEach((x) => { g.beginPath(); g.arc(X(x), Y(1.9), 6, 0, Math.PI * 2); g.fill(); });
      }
    });
    const bodyMat = (k, wm) => new THREE.MeshLambertMaterial({ map: facade(wm, k, false), emissiveMap: facade(wm, k, true), emissive: 0x000000 });
    const sideMat = bodyMat('side', BD); const frontMat = bodyMat('front', BW); const backMat = bodyMat('back', BW);
    P.bodyMats = [sideMat, frontMat, backMat];
    const gravel = new THREE.MeshLambertMaterial({ map: canvasTex(512, 352, (g, w, h) => { g.fillStyle = '#A39C90'; g.fillRect(0, 0, w, h); const r = seeded(19); for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,84,76,.35)' : 'rgba(240,232,220,.35)'; g.fillRect(r() * w, r() * h, 2, 2); } }) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), [sideMat, sideMat, gravel, gravel, frontMat, backMat]);
    body.position.y = STREET + BH / 2; S.add(body);
    const bodyInk = new THREE.Mesh(body.geometry, inkMat); bodyInk.scale.set((BW + 0.12) / BW, (BH + 0.12) / BH, (BD + 0.12) / BD); body.add(bodyInk);
    // 지붕 처마
    box(S, BW + 0.7, 0.35, BD + 0.7, 0xEFE3CF, 0, TOP - 0.45, 0, { line: 0.03, cast: false });
    // 정문: 초록 줄무늬 차양, 간판, 돌계단, 문 옆 등
    P.streetGlow = [];
    const awning = canvasTex(256, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFF6E6' : '#3E6B58'; g.fillRect(i * 32, 0, 32, 64); } });
    const aw = solid(new THREE.BoxGeometry(4.6, 0.12, 1.6), 0xffffff, { line: 0.02, mat: toon(0xffffff, { map: awning }) }); aw.rotation.x = 0.28; aw.position.set(0, STREET + 5.0, BD / 2 + 0.75); S.add(aw);
    plane(S, 3.6, 0.8, toon(0xffffff, { map: signTex('꼬깃 서고', { bg: '#3E6B58', fg: '#FFF3DC' }) }), 0, STREET + 6.2, BD / 2 + 0.03);
    box(S, 4.6, 0.18, 1.3, 0xD9CBB2, 0, STREET, BD / 2 + 0.65, { line: 0.015, cast: false });
    box(S, 4.0, 0.18, 0.7, 0xD9CBB2, 0, STREET + 0.18, BD / 2 + 0.35, { line: 0.015, cast: false });
    [-2.4, 2.4].forEach((x) => { box(S, 0.14, 0.42, 0.14, 0x2E241C, x, STREET + 3.2, BD / 2 + 0.1, { line: 0.008 }); P.streetGlow.push(glow(S, 0xffd98a, 1.4, x, STREET + 3.45, BD / 2 + 0.3)); });
    // 거리: 36m×30m 구획마다 차도(가운데 점선)·보도·건널목. 우리 건물은 가운데 구획
    const tile = canvasTex(576, 480, (g, w, h) => {
      const px = 16;
      g.fillStyle = '#4A4D55'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#BDB5A8'; g.fillRect(3.5 * px, 3.5 * px, w - 7 * px, h - 7 * px);
      g.strokeStyle = '#8E877C'; g.lineWidth = 3; g.strokeRect(3.5 * px, 3.5 * px, w - 7 * px, h - 7 * px);
      g.fillStyle = '#ADA597'; g.fillRect(5.5 * px, 5.5 * px, w - 11 * px, h - 11 * px);
      g.fillStyle = '#E8D9A0';
      for (let y = 4 * px; y < h - 4 * px; y += 3 * px) { g.fillRect(0, y, 2, 1.6 * px); g.fillRect(w - 2, y, 2, 1.6 * px); }
      for (let x = 4 * px; x < w - 4 * px; x += 3 * px) { g.fillRect(x, 0, 1.6 * px, 2); g.fillRect(x, h - 2, 1.6 * px, 2); }
      g.fillStyle = 'rgba(245,240,230,.85)';
      [3.9, h / px - 6.3].forEach((m) => { for (let x = 0; x < 3.4; x += 0.9) { g.fillRect(x * px, m * px, 0.5 * px, 2.4 * px); g.fillRect(w - (x + 0.5) * px, m * px, 0.5 * px, 2.4 * px); } });
      [3.9, w / px - 6.3].forEach((m) => { for (let y = 0; y < 3.4; y += 0.9) { g.fillRect(m * px, y * px, 2.4 * px, 0.5 * px); g.fillRect(m * px, h - (y + 0.5) * px, 2.4 * px, 0.5 * px); } });
    }, { repeat: [9, 11] });
    plane(S, 36 * 9, 30 * 11, new THREE.MeshLambertMaterial({ map: tile }), 0, STREET, 0, { rx: -Math.PI / 2, receive: false });
    // 가로등(밤에 켜진다)과 가로수
    const post = (x, z) => { cyl(S, 0.06, 0.08, 4.2, 0x2E3338, x, STREET, z, { line: 0.01, seg: 8 }); cyl(S, 0.2, 0.12, 0.25, 0x2E3338, x, STREET + 4.2, z, { line: 0.01, seg: 10 }); P.streetGlow.push(glow(S, 0xffd98a, 2.6, x, STREET + 4.25, z)); };
    [-45, -36, -27, -9, 0, 9, 27, 36, 45].forEach((x) => { post(x, 11.3); post(x, -11.3); });
    [-38, -30, -22, -5, 5, 22, 30, 38].forEach((z) => { post(14.3, z); post(-14.3, z); });
    const tree = (x, z, s = 1) => { cyl(S, 0.12 * s, 0.16 * s, 2.2 * s, 0x6B4430, x, STREET, z, { line: 0.012, seg: 8 }); const c = solid(new THREE.IcosahedronGeometry(1.25 * s, 1), 0x6E8B74, { line: 0.03 }); c.position.set(x, STREET + 3.1 * s, z); S.add(c); };
    [-11, -5.5, 5.5, 11].forEach((x) => tree(x, 10.3));
    [-11, -5.5, 0, 5.5, 11].forEach((x) => tree(x, -10.3, 0.9));
    [-4, 4].forEach((z) => { tree(13.4, z, 0.9); tree(-13.4, z, 0.9); });
    // 둘레 건물: 구획마다 한두 채, 모두 길에 선다. 창은 3m 한 층 크기로 되풀이하고 지붕에는 창을 그리지 않는다
    const towers = new THREE.Group();
    const windows = canvasTex(64, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#9aa6b0'; for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) g.fillRect(x, y, 7, 9); }, { repeat: [1, 1] });
    const litWindows = canvasTex(64, 128, (g) => { g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 128); const r = seeded(77); g.fillStyle = '#ffd27a'; for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) if (r() < 0.4) g.fillRect(x, y, 7, 9); }, { repeat: [1, 1] });
    const tints = [0xD9C7A7, 0xC5D2DA, 0xE8C9B8, 0xB9C8B4, 0xD8D2E6, 0xEFE3CF];
    P.towerTints = tints.map((tint) => [new THREE.MeshLambertMaterial({ color: tint, map: windows, emissive: 0x000000, emissiveMap: litWindows }), tint]);
    const towerGeo = (w, h, d) => {
      const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.attributes.uv;
      [[d, h], [d, h], null, null, [w, h], [w, h]].forEach((span, f) => { for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (span) uv.setXY(i, (uv.getX(i) * span[0]) / 8, (uv.getY(i) * span[1]) / 24); else uv.setXY(i, 0.03, 0.03); } });
      return geo;
    };
    for (let i = -4; i <= 4; i++) for (let j = -5; j <= 5; j++) {
      const cx = i * 36; const cz = j * 30; const far = Math.hypot(cx, cz);
      if ((!i && !j) || far > 135) continue;
      const near = far < 50; const n = rand() < 0.35 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = n === 2 ? 9 + rand() * 4 : 12 + rand() * 12; const d = 9 + rand() * 9;
        const h = near ? 9 + rand() * 13 : 18 + rand() * 50; // 바로 옆 구획은 우리 건물(25m)보다 낮게
        const ox = n === 2 ? (k ? 7 : -7) : (rand() - 0.5) * 4; const oz = (rand() - 0.5) * 3;
        const mat = P.towerTints[Math.abs(i * 7 + j * 3 + k) % tints.length][0];
        const t = new THREE.Mesh(towerGeo(w, h, d), mat); t.position.set(cx + ox, STREET + h / 2, cz + oz); towers.add(t);
        if (rand() < 0.4) { const cap = new THREE.Mesh(towerGeo(w * 0.35, 2.2, d * 0.35), mat); cap.position.set(cx + ox + (rand() - 0.5) * w * 0.3, STREET + h + 1.1, cz + oz + (rand() - 0.5) * d * 0.3); towers.add(cap); }
      }
    }
    S.add(towers);
    P.sky = canvasTex(32, 512, (g, w, h) => g.fillRect(0, 0, w, h));
    P.dome = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), new THREE.MeshBasicMaterial({ map: P.sky, side: THREE.BackSide, depthWrite: false, fog: false }));
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
    Object.assign(P.sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 2, far: 60 });
    P.sun.shadow.bias = -0.0006; P.sun.shadow.normalBias = 0.03;
    S.add(P.sun, P.sun.target);
    S.fog = new THREE.Fog(0xcfe3f2, 45, 170); // 가까이·멀리는 매 프레임 카메라 거리에 맞춘다
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


  // ───────── 층 사이: 책 엘리베이터와 계단 문 ─────────
  // 엘리베이터 문: 놋쇠 틀, 미닫이 두 짝(가까이 가면 열린다), 위에 층 바늘, 옆에 부름 단추
  const liftDoor = (P, parent, x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    box(g, 1.75, 2.8, 0.14, 0xC9A15E, 0, 0, 0, { line: 0.03 });
    box(g, 1.22, 2.3, 0.02, 0x2B1C12, 0, 0.05, 0.075, { line: 0, cast: false });
    const leaf = (k) => {
      const d = new THREE.Group(); d.position.set(k * 0.3, 0.05, 0.1); g.add(d);
      box(d, 0.6, 2.3, 0.05, 0x7E9C93, 0, 0, 0, { line: 0.02 });
      [0.55, 1.15, 1.75].forEach((y) => box(d, 0.44, 0.03, 0.012, 0xC9A15E, 0, y, 0.03, { line: 0, cast: false }));
      return d;
    };
    const L = leaf(-1); const R = leaf(1);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24, 0, Math.PI), toon(0xFFF6E6)); dial.position.set(0, 2.42, 0.08); g.add(dial);
    const needle = new THREE.Group(); needle.position.set(0, 2.44, 0.09); g.add(needle);
    box(needle, 0.025, 0.25, 0.01, 0x2E241C, 0, 0, 0, { line: 0, cast: false });
    const btn = cyl(g, 0.06, 0.06, 0.03, 0xF2D16B, 0.72, 1.08, 0.08, { line: 0.01, seg: 14 }); btn.rotation.x = Math.PI / 2;
    const sign = plane(g, 1.4, 0.32, toon(0xffffff, { map: signTex('책 엘리베이터', { bg: '#3B2618', fg: '#F2D16B', size: 80 }) }), 0, 3.0, 0.08);
    sign.castShadow = false;
    mark(P, g, { portal: 'lift' });
    parent.add(g);
    P.liftDoors = { L, R, needle, open: 0 };
    return g;
  };
  // 계단 문: 나무 문에 위·아래 화살표 팻말
  const stairDoor = (P, parent, x, z, ry, dir) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    box(g, 1.25, 2.4, 0.1, 0x5E3B27, 0, 0, 0, { line: 0.03 });
    box(g, 1.05, 2.25, 0.08, dir === 'up' ? 0xB98A5E : 0x9C7350, 0, 0, 0.05, { line: 0.025 });
    [0.5, 1.4].forEach((y) => box(g, 0.8, 0.6, 0.02, dir === 'up' ? 0xA97C50 : 0x8C6544, 0, y, 0.1, { line: 0.012 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(0xE3A857)); knob.position.set(0.38, 1.05, 0.14); g.add(knob);
    const sign = plane(g, 1.0, 0.3, toon(0xffffff, { map: signTex(dir === 'up' ? '↑ 위층' : '↓ 아래층', { bg: '#FFF6E6', fg: '#2E241C' }) }), 0, 2.6, 0.06);
    sign.castShadow = false;
    mark(P, g, { portal: dir });
    parent.add(g);
    return g;
  };
  // 매단 등: 줄 끝에 갓, 앉으면 더 밝아진다
  const pendant = (P, parent, id, x, z, color = 0xE3A857, drop = 2.0, top = 4.6) => {
    const g = new THREE.Group(); g.position.set(x, top, z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, drop, 4), new THREE.MeshBasicMaterial({ color: 0x2E241C })); cord.position.y = -drop / 2; g.add(cord);
    const shade = solid(new THREE.ConeGeometry(0.3, 0.28, 18, 1, true), color, { line: 0.02, mat: toon(color, { side: THREE.DoubleSide }) });
    shade.position.y = -drop - 0.1; g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0x6b5a3a })); bulb.position.y = -drop - 0.22; g.add(bulb);
    const halo = glow(g, 0xffd98a, 1.4, 0, -drop - 0.25, 0); halo.material.opacity = 0;
    const light = new THREE.PointLight(0xffc77a, 0, 5, 1.4); light.position.y = -drop - 0.3; g.add(light);
    parent.add(g);
    P.lamps[id] = { bulb, halo, light, on: false };
    return g;
  };
  // 실내 층의 공통 뼈대: 바닥판, 뒷벽 아치 창(하늘), 왼쪽 벽(엘리베이터·계단 문), 오른쪽 벽, 빛. 기본 16m×10m, 벽 높이 4.8m
  const buildRoom = (P, { floorTex, wall = 0xEFE3CF, side = 0xE9DCC6, sign, windowsAt = [-4, 0, 4], w = 16, d = 10, h = 4.8, win = { r: 1.25, y0: 1.1, y1: 2.7 } }) => {
    const S = P.scene;
    const hw = w / 2; const hd = d / 2; const { r: wr, y0, y1 } = win;
    box(S, w + 0.6, 0.59, d + 0.6, 0x6B4430, 0, -0.6, 0, { line: 0.05, cast: false });
    const floor = plane(S, w, d, toon(0xffffff, { map: floorTex }), 0, 0, 0, { rx: -Math.PI / 2 });
    mark(P, floor, { floor: 0 });
    const back = new THREE.Group();
    const shape = new THREE.Shape(); shape.moveTo(-hw - 0.3, 0); shape.lineTo(hw + 0.3, 0); shape.lineTo(hw + 0.3, h); shape.lineTo(-hw - 0.3, h); shape.lineTo(-hw - 0.3, 0);
    windowsAt.forEach((cx) => { const p = new THREE.Path(); p.moveTo(cx - wr, y0); p.lineTo(cx + wr, y0); p.lineTo(cx + wr, y1); p.absarc(cx, y1, wr, 0, Math.PI, false); p.lineTo(cx - wr, y0); shape.holes.push(p); });
    const wallMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), toon(wall));
    wallMesh.position.z = -hd - 0.3; wallMesh.receiveShadow = true; back.add(wallMesh);
    windowsAt.forEach((cx) => {
      const fr = wr + 0.17;
      const ring = new THREE.Shape(); ring.absarc(cx, y1, fr, 0, Math.PI, false); ring.lineTo(cx - fr, y0 - 0.12); ring.lineTo(cx + fr, y0 - 0.12); ring.lineTo(cx + fr, y1);
      const rh = new THREE.Path(); rh.absarc(cx, y1, wr, 0, Math.PI, false); rh.lineTo(cx - wr, y0); rh.lineTo(cx + wr, y0); rh.lineTo(cx + wr, y1); ring.holes.push(rh);
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.38, bevelEnabled: false }), toon(0x5E3B27)); frame.position.z = -hd - 0.34; frame.castShadow = true; back.add(frame);
      box(back, 0.08, y1 + wr - y0, 0.1, 0x5E3B27, cx, y0, -hd, { line: 0.015 });
      box(back, wr * 2, 0.08, 0.1, 0x5E3B27, cx, y1 - 0.4, -hd, { line: 0.015 });
    });
    P.sky = canvasTex(1024, 512, skyDraw('day', true));
    plane(back, w + 1, h + 2.2, new THREE.MeshBasicMaterial({ map: P.sky }), 0, h * 0.58, -hd - 1.2, { receive: false });
    P.rainGlass = plane(back, w, y1 + wr - y0 + 1.15, new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g) => { g.strokeStyle = 'rgba(220,235,255,.55)'; g.lineWidth = 2; const rand = seeded(5); for (let i = 0; i < 60; i++) { const x = rand() * 256; const y = rand() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 + rand() * 10); g.stroke(); } }, { repeat: [Math.round(w * 0.375), 2] }), transparent: true, depthWrite: false }), 0, (y0 + y1 + wr) / 2, -hd - 0.05, { receive: false });
    P.rainGlass.visible = false;
    if (sign) { const plate = plane(back, 3.0, 0.6, toon(0xffffff, { map: signTex(sign) }), 0, h - 0.45, -hd + 0.02); plate.castShadow = false; }
    box(back, w + 0.6, 0.25, 0.45, 0x3B2618, 0, h, -hd - 0.15, { line: 0.03, cast: false });
    block(P, back); S.add(back);
    P.walls.push({ group: back, nx: 0, nz: 1 });
    const left = new THREE.Group();
    box(left, 0.3, h, d + 0.6, side, -hw - 0.15, 0, 0, { line: 0.04, cast: false });
    liftDoor(P, left, -hw + 0.05, -3.2, Math.PI / 2);
    stairDoor(P, left, -hw + 0.03, -1.2, Math.PI / 2, 'up');
    stairDoor(P, left, -hw + 0.03, 0.8, Math.PI / 2, 'down');
    block(P, left); S.add(left);
    P.walls.push({ group: left, nx: 1, nz: 0 });
    const right = new THREE.Group();
    box(right, 0.3, h, d + 0.6, side, hw + 0.15, 0, 0, { line: 0.04, cast: false });
    block(P, right); S.add(right);
    P.walls.push({ group: right, nx: -1, nz: 0 });
    P.hemi = new THREE.HemisphereLight(0xfff4e0, 0x8a6a4a, 1.6); S.add(P.hemi);
    P.sun = new THREE.DirectionalLight(0xfff1d0, 2.0);
    P.sun.position.set(3, 11, -hd - 9); P.sun.target.position.set(0, 0, 1);
    P.sun.castShadow = true; P.sun.shadow.mapSize.set(2048, 2048);
    const reach = Math.max(11, hw + 3.5);
    Object.assign(P.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 2, far: 40 + reach });
    P.sun.shadow.bias = -0.0006; P.sun.shadow.normalBias = 0.03;
    S.add(P.sun, P.sun.target);
    S.background = new THREE.Color(0x2B1C12);
    return { back, left, right };
  };

  // ───────── 라운지 부품: 넓힌 실내 층이 함께 쓴다(판벽·기둥·촛대·휘장·벨벳 소파·샹들리에·스탠드·야자) ─────────
  const BRASS = 0xC9A15E; const WALNUT = 0x4A2F20; const MARBLE = 0xEFE6D6; const EMERALD = 0x3E6B58; const TEAL = 0x2F5D5A;
  const shadeOf = (c, k = 0.82) => new THREE.Color(c).multiplyScalar(k).getHex();
  // 벽 아래 호두나무 판벽과 놋쇠 띠, 창 사이 기둥과 촛대(등과 함께 켜진다), 창마다 휘장 두 폭
  const dressRoom = (P, { back, left, right }, { w, d, h, windowsAt, win, pillars = [], drape = TEAL, sconces = [] }) => {
    const hw = w / 2; const hd = d / 2;
    const wains = (len) => canvasTex(256, 128, (g, cw, ch) => {
      g.fillStyle = '#5A3825'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = '#3B2618'; g.lineWidth = 6; g.strokeRect(18, 16, cw - 36, ch - 32);
      g.strokeStyle = 'rgba(201,161,94,.55)'; g.lineWidth = 2; g.strokeRect(26, 24, cw - 52, ch - 48);
    }, { repeat: [Math.round(len / 1.6), 1] });
    box(back, w, 0.85, 0.06, 0xffffff, 0, 0, -hd + 0.03, { line: 0.015, cast: false, mat: toon(0xffffff, { map: wains(w) }) });
    box(back, w, 0.05, 0.1, BRASS, 0, 0.85, -hd + 0.05, { line: 0.008, cast: false });
    [[left, -1], [right, 1]].forEach(([g, k]) => {
      box(g, 0.06, 0.85, d, 0xffffff, k * (hw - 0.03), 0, 0, { line: 0.015, cast: false, mat: toon(0xffffff, { map: wains(d) }) });
      box(g, 0.1, 0.05, d, BRASS, k * (hw - 0.05), 0.85, 0, { line: 0.008, cast: false });
    });
    pillars.forEach((x) => {
      box(back, 0.6, 0.14, 0.2, 0xE0CFB2, x, 0.85, -hd + 0.1, { line: 0.012, cast: false });
      box(back, 0.5, h - 1.45, 0.14, 0xF7EEDD, x, 0.99, -hd + 0.07, { line: 0.015, cast: false });
      box(back, 0.64, 0.16, 0.22, BRASS, x, h - 0.46, -hd + 0.11, { line: 0.012, cast: false });
    });
    const flame = new THREE.MeshBasicMaterial({ color: 0x6b5a3a });
    const halo = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const sconce = (parent, x, y, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
      box(g, 0.16, 0.34, 0.04, BRASS, 0, -0.17, 0, { line: 0.008, cast: false });
      box(g, 0.04, 0.04, 0.2, BRASS, 0, -0.07, 0.1, { line: 0.006, cast: false });
      cyl(g, 0.06, 0.04, 0.05, BRASS, 0, -0.05, 0.2, { line: 0.006, seg: 10 });
      cyl(g, 0.022, 0.022, 0.14, 0xFFF6E6, 0, 0, 0.2, { line: 0.006, seg: 8 });
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), flame); f.scale.y = 1.6; f.position.set(0, 0.19, 0.2); g.add(f);
      const s = new THREE.Sprite(halo); s.scale.set(0.9, 0.9, 1); s.position.set(0, 0.2, 0.2); g.add(s);
      parent.add(g);
    };
    pillars.forEach((x) => sconce(back, x, 3.2, -hd + 0.14, 0));
    sconces.forEach(([side, z, y = 3.2]) => (side < 0 ? sconce(left, -hw + 0.02, y, z, Math.PI / 2) : sconce(right, hw - 0.02, y, z, -Math.PI / 2)));
    P.lamps.sconce = { bulb: { material: flame }, halo: { material: halo }, light: { intensity: 0 }, on: false };
    windowsAt.forEach((cx) => {
      const top = win.y1 + win.r + 0.42; const off = win.r + 0.36;
      [-1, 1].forEach((k) => {
        const x0 = cx + k * off;
        [-0.13, 0, 0.13].forEach((dx, j) => cyl(back, 0.09, 0.1, top, drape, x0 + dx, 0, -hd + 0.12 + (j === 1 ? 0.04 : 0), { line: 0.014, seg: 10 }));
        box(back, 0.46, 0.08, 0.3, BRASS, x0, 1.45, -hd + 0.15, { line: 0.01, cast: false });
      });
      const rod = solid(new THREE.CylinderGeometry(0.03, 0.03, off * 2 + 0.6, 8), BRASS, { line: 0.008 }); rod.rotation.z = Math.PI / 2; rod.position.set(cx, top + 0.05, -hd + 0.12); back.add(rod);
      [-1, 1].forEach((k) => { const fin = solid(new THREE.SphereGeometry(0.06, 10, 8), BRASS, { line: 0.008 }); fin.position.set(cx + k * (off + 0.3), top + 0.05, -hd + 0.12); back.add(fin); });
    });
  };
  // 벨벳 소파: 누른 단추, 둥근 팔걸이, 놋쇠 다리. 두 자리 중 가까운 쪽을 고르도록 왼쪽·오른쪽에 따로 표시
  const legsOf = (g, xs, zs) => xs.forEach((x) => zs.forEach((z) => cyl(g, 0.035, 0.025, 0.12, BRASS, x, 0, z, { line: 0.006, seg: 8 })));
  const velvetSofa = (P, s) => {
    const g = new THREE.Group(); const dk = shadeOf(s.color);
    legsOf(g, [-1.02, 1.02], [-0.36, 0.36]);
    box(g, 2.3, 0.26, 0.95, dk, 0, 0.12, 0, { line: 0.025 });
    box(g, 2.0, 0.64, 0.24, s.color, 0, 0.38, -0.355, { line: 0.022 });
    [-1, 1].forEach((k) => {
      box(g, 0.3, 0.44, 0.95, dk, k * 1.0, 0.12, 0, { line: 0.02 });
      const roll = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 16), s.color, { line: 0.018 }); roll.rotation.x = Math.PI / 2; roll.position.set(k * 1.0, 0.58, 0); g.add(roll);
    });
    [-0.5, 0.5].forEach((lx) => box(g, 0.98, 0.12, 0.68, s.color, lx, 0.38, 0.1, { line: 0.015 }));
    const btn = toon(shadeOf(s.color, 0.6));
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const x = -0.84 + i * 0.28 + (r ? 0.14 : 0); if (Math.abs(x) > 0.9) continue; const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), btn); b.position.set(x, 0.66 + r * 0.2, -0.23); g.add(b); }
    [-1, 1].forEach((k) => box(g, 0.36, 0.34, 0.12, s.pillow, k * 0.66, 0.5, -0.17, { line: 0.012, ry: -k * 0.22 }));
    g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw; P.scene.add(g);
    const ids = [`${s.id}-1`, `${s.id}-2`];
    mark(P, g, { seat: ids[0] });
    g.children.forEach((ch) => { const id = ch.position.x < 0 ? ids[0] : ids[1]; ch.traverse((m) => { if (m.isMesh && m.userData.seat) m.userData.seat = id; }); });
    ids.forEach((id) => { P.seatById(id).mesh = g; });
  };
  const velvetArm = (P, a) => {
    const g = new THREE.Group(); const dk = shadeOf(a.color);
    legsOf(g, [-0.38, 0.38], [-0.36, 0.36]);
    box(g, 0.95, 0.26, 0.9, dk, 0, 0.12, 0, { line: 0.022 });
    box(g, 0.64, 0.12, 0.66, a.color, 0, 0.38, 0.08, { line: 0.014 });
    if (a.wing) {
      box(g, 0.86, 1.05, 0.22, a.color, 0, 0.38, -0.35, { line: 0.02 });
      [-1, 1].forEach((k) => box(g, 0.12, 0.6, 0.38, dk, k * 0.41, 0.82, -0.2, { line: 0.014 }));
    } else box(g, 0.86, 0.6, 0.22, a.color, 0, 0.38, -0.34, { line: 0.02 });
    [-1, 1].forEach((k) => box(g, 0.16, 0.38, 0.9, dk, k * 0.4, 0.26, 0, { line: 0.016 }));
    g.position.set(a.x, 0, a.z); g.rotation.y = a.yaw; P.scene.add(g);
    mark(P, g, { seat: a.id }); P.seatById(a.id).mesh = g;
  };
  // 놋쇠 샹들리에: 두 단 촛대와 수정 방울. 등과 함께 켜진다
  const chandelier = (P, id, x, z, top, { big = 1.05, small = 0.6 } = {}) => {
    const chand = new THREE.Group(); chand.position.set(x, top, z);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), toon(BRASS)); chain.position.y = -0.6; chand.add(chain);
    cyl(chand, 0.06, 0.12, 0.9, BRASS, 0, -2.1, 0, { line: 0.012, seg: 12 });
    const knob = solid(new THREE.SphereGeometry(0.16, 14, 10), BRASS, { line: 0.015 }); knob.position.y = -2.15; chand.add(knob);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x6b5a3a });
    const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const crystal = new THREE.MeshLambertMaterial({ color: 0xE6F4FA, emissive: 0x2a3540 });
    [[big, -2.05, 10], [small, -1.6, 6]].forEach(([rad, y, n], tier) => {
      const ring = solid(new THREE.TorusGeometry(rad, 0.03, 6, 40), BRASS, { line: 0.01 }); ring.rotation.x = Math.PI / 2; ring.position.y = y; chand.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tier * (Math.PI / n); const cx = Math.cos(a) * rad; const cz = Math.sin(a) * rad;
        const arm = box(chand, rad, 0.025, 0.025, BRASS, cx / 2, y - 0.05, cz / 2, { line: 0, cast: false }); arm.rotation.y = -a;
        cyl(chand, 0.05, 0.035, 0.06, BRASS, cx, y, cz, { line: 0.006, seg: 10 });
        cyl(chand, 0.022, 0.022, 0.14, 0xFFF6E6, cx, y + 0.06, cz, { line: 0.006, seg: 8 });
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), flameMat); f.scale.y = 1.6; f.position.set(cx, y + 0.23, cz); chand.add(f);
        const s = new THREE.Sprite(haloMat); s.scale.set(0.36, 0.36, 1); s.position.set(cx, y + 0.24, cz); chand.add(s);
        const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), crystal); drop.scale.y = 1.7; drop.position.set(cx, y - 0.13, cz); chand.add(drop);
      }
    });
    const light = new THREE.PointLight(0xffc77a, 0, 14, 1.2); light.position.y = -2.0; chand.add(light);
    P.scene.add(chand);
    P.lamps[id] = { bulb: { material: flameMat }, halo: { material: haloMat }, light, on: false };
    return chand;
  };
  const floorLamp = (P, x, z) => {
    const g = new THREE.Group();
    cyl(g, 0.17, 0.19, 0.04, BRASS, 0, 0, 0, { line: 0.01 }); cyl(g, 0.022, 0.022, 1.6, BRASS, 0, 0.04, 0, { line: 0.006, seg: 8 });
    const sh = solid(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 20, 1, true), 0xF4EBDD, { line: 0.02, mat: toon(0xF4EBDD, { side: THREE.DoubleSide }) }); sh.position.y = 1.66; g.add(sh);
    glow(g, 0xffd98a, 1.8, 0, 1.55, 0); const l = new THREE.PointLight(0xffc77a, 2.2, 5, 1.4); l.position.y = 1.5; g.add(l);
    g.position.set(x, 0, z); P.scene.add(g);
  };
  const palm = (P, x, z) => {
    const g = new THREE.Group(); const r2 = seeded(Math.round((x + 20) * 7 + (z + 20) * 3));
    cyl(g, 0.36, 0.28, 0.6, MARBLE, 0, 0, 0, { line: 0.02 }); cyl(g, 0.37, 0.37, 0.06, BRASS, 0, 0.48, 0, { line: 0.008 });
    cyl(g, 0.33, 0.33, 0.03, 0x3B2618, 0, 0.58, 0, { line: 0, seg: 16 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + r2() * 0.3; const tilt = 0.45 + r2() * 0.65; const len = 0.9 + r2() * 0.5;
      const stem = new THREE.Group(); stem.position.y = 0.6; stem.rotation.set(tilt, a, 0, 'YXZ'); g.add(stem);
      cyl(stem, 0.015, 0.02, len, 0x5E7F67, 0, 0, 0, { line: 0.004, seg: 6 });
      const frond = solid(new THREE.SphereGeometry(0.2, 10, 6), i % 2 ? 0x5E7F67 : 0x7A9E7E, { line: 0.012 }); frond.scale.set(1.0, len * 1.6, 0.18); frond.position.y = len * 0.75; stem.add(frond);
    }
    g.position.set(x, 0, z); P.scene.add(g);
  };
  // 테두리와 가운데 무늬가 있는 직사각 깔개
  const rugAt = (P, field, border, seed, x, z, w, d) => {
    const tex = canvasTex(1024, 680, (g, cw, ch) => {
      g.fillStyle = border; g.fillRect(0, 0, cw, ch);
      g.fillStyle = field; g.fillRect(44, 44, cw - 88, ch - 88);
      g.strokeStyle = '#E8C07A'; g.lineWidth = 8; g.strokeRect(30, 30, cw - 60, ch - 60); g.strokeRect(62, 62, cw - 124, ch - 124);
      g.save(); g.translate(cw / 2, ch / 2); g.strokeStyle = 'rgba(232,192,122,.7)'; g.lineWidth = 6;
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, 0, ch * 0.28, ch * 0.09, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      const r = seeded(seed); g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 400; i++) g.fillRect(r() * cw, r() * ch, 3, 3);
    });
    const m = plane(P.scene, w, d, toon(0xffffff, { map: tex }), x, 0.012, z, { rx: -Math.PI / 2 }); mark(P, m, { floor: 0 });
    return m;
  };

  // ───────── 2층 북카페 사락 짓기: 호텔 라운지 ─────────
  const buildCafe = (P) => {
    const S = P.scene;
    const BRASS = 0xC9A15E; const WALNUT = 0x4A2F20; const MARBLE = 0xEFE6D6; const EMERALD = 0x3E6B58; const TEAL = 0x2F5D5A;
    const { w: W, d: D, h: H } = LOUNGE; const hw = W / 2; const hd = D / 2;
    const shade = (c, k = 0.82) => new THREE.Color(c).multiplyScalar(k).getHex();
    // 대리석 바닥: 크림색 큰 판에 옅은 결, 놋쇠 줄눈, 판 모서리마다 초록 마름모, 벽을 따라 초록 띠
    const marble = canvasTex(2048, 1195, (g, w, h) => {
      const px = w / W; const band = 0.6 * px; const tx = (w - band * 2) / 19; const tz = (h - band * 2) / 11; const rand = seeded(97);
      g.fillStyle = '#4E6B5E'; g.fillRect(0, 0, w, h);
      for (let j = 0; j < 11; j++) for (let i = 0; i < 19; i++) {
        const v = (rand() - 0.5) * 9;
        g.fillStyle = `rgb(${241 + v},${232 + v},${215 + v})`;
        g.fillRect(band + i * tx, band + j * tz, tx, tz);
      }
      g.save(); g.beginPath(); g.rect(band, band, w - band * 2, h - band * 2); g.clip();
      g.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = `rgba(150,132,112,${0.1 + rand() * 0.16})`; g.lineWidth = 1 + rand() * 2.2;
        let x = band + rand() * (w - band * 2); let y = band + rand() * (h - band * 2);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { const nx = x + (rand() - 0.3) * 90; const ny = y + (rand() - 0.5) * 50; g.quadraticCurveTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 40, nx, ny); x = nx; y = ny; }
        g.stroke();
      }
      g.strokeStyle = 'rgba(176,138,80,.6)'; g.lineWidth = 2;
      for (let i = 1; i < 19; i++) { g.beginPath(); g.moveTo(band + i * tx, band); g.lineTo(band + i * tx, h - band); g.stroke(); }
      for (let j = 1; j < 11; j++) { g.beginPath(); g.moveTo(band, band + j * tz); g.lineTo(w - band, band + j * tz); g.stroke(); }
      g.fillStyle = '#4E6B5E'; const dm = 0.1 * px;
      for (let i = 1; i < 19; i++) for (let j = 1; j < 11; j++) { const x = band + i * tx; const y = band + j * tz; g.beginPath(); g.moveTo(x, y - dm); g.lineTo(x + dm, y); g.lineTo(x, y + dm); g.lineTo(x - dm, y); g.closePath(); g.fill(); }
      g.restore();
      g.strokeStyle = '#C9A15E'; g.lineWidth = 6; g.strokeRect(band, band, w - band * 2, h - band * 2);
    });
    const { back, left, right } = buildRoom(P, { floorTex: marble, wall: 0xF0E1C8, side: 0xE8D5B8, sign: '북카페 사락', windowsAt: CAFE_WINDOWS, w: W, d: D, h: H, win: { r: 1.35, y0: 0.85, y1: 3.9 } });

    // 벽 아래 호두나무 판벽과 놋쇠 띠
    const wains = (len) => canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#5A3825'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#3B2618'; g.lineWidth = 6; g.strokeRect(18, 16, w - 36, h - 32);
      g.strokeStyle = 'rgba(201,161,94,.55)'; g.lineWidth = 2; g.strokeRect(26, 24, w - 52, h - 48);
    }, { repeat: [Math.round(len / 1.6), 1] });
    box(back, W, 0.85, 0.06, 0xffffff, 0, 0, -hd + 0.03, { line: 0.015, cast: false, mat: toon(0xffffff, { map: wains(W) }) });
    box(back, W, 0.05, 0.1, BRASS, 0, 0.85, -hd + 0.05, { line: 0.008, cast: false });
    [[left, -1], [right, 1]].forEach(([g, k]) => {
      box(g, 0.06, 0.85, D, 0xffffff, k * (hw - 0.03), 0, 0, { line: 0.015, cast: false, mat: toon(0xffffff, { map: wains(D) }) });
      box(g, 0.1, 0.05, D, BRASS, k * (hw - 0.05), 0.85, 0, { line: 0.008, cast: false });
    });
    // 창 사이 기둥(크림색 판, 놋쇠 머리)
    [-10.15, -5, 5, 10.15].forEach((x) => {
      box(back, 0.6, 0.14, 0.2, 0xE0CFB2, x, 0.85, -hd + 0.1, { line: 0.012, cast: false });
      box(back, 0.5, H - 1.45, 0.14, 0xF7EEDD, x, 0.99, -hd + 0.07, { line: 0.015, cast: false });
      box(back, 0.64, 0.16, 0.22, BRASS, x, H - 0.46, -hd + 0.11, { line: 0.012, cast: false });
    });
    // 벽 촛대: 낮에는 은은하게, 밤에는 환하게(등과 함께 켜진다)
    const sconceFlame = new THREE.MeshBasicMaterial({ color: 0x6b5a3a });
    const sconceHalo = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const sconce = (parent, x, y, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
      box(g, 0.16, 0.34, 0.04, BRASS, 0, -0.17, 0, { line: 0.008, cast: false });
      box(g, 0.04, 0.04, 0.2, BRASS, 0, -0.07, 0.1, { line: 0.006, cast: false });
      cyl(g, 0.06, 0.04, 0.05, BRASS, 0, -0.05, 0.2, { line: 0.006, seg: 10 });
      cyl(g, 0.022, 0.022, 0.14, 0xFFF6E6, 0, 0, 0.2, { line: 0.006, seg: 8 });
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), sconceFlame); f.scale.y = 1.6; f.position.set(0, 0.19, 0.2); g.add(f);
      const s = new THREE.Sprite(sconceHalo); s.scale.set(0.9, 0.9, 1); s.position.set(0, 0.2, 0.2); g.add(s);
      parent.add(g);
    };
    [-10.15, -5, 5, 10.15].forEach((x) => sconce(back, x, 3.2, -hd + 0.14, 0));
    [-1.85, 1.85].forEach((z) => sconce(right, hw - 0.02, 3.95, z, -Math.PI / 2));
    P.lamps.sconce = { bulb: { material: sconceFlame }, halo: { material: sconceHalo }, light: { intensity: 0 }, on: false };
    // 창마다 청록 휘장 두 폭과 놋쇠 봉
    CAFE_WINDOWS.forEach((cx) => {
      const top = 3.9 + 1.35 + 0.42;
      [-1, 1].forEach((k) => {
        const x0 = cx + k * 1.71;
        [-0.13, 0, 0.13].forEach((dx, j) => cyl(back, 0.09, 0.1, top, TEAL, x0 + dx, 0, -hd + 0.12 + (j === 1 ? 0.04 : 0), { line: 0.014, seg: 10 }));
        box(back, 0.46, 0.08, 0.3, BRASS, x0, 1.45, -hd + 0.15, { line: 0.01, cast: false });
      });
      const rod = solid(new THREE.CylinderGeometry(0.03, 0.03, 4.0, 8), BRASS, { line: 0.008 }); rod.rotation.z = Math.PI / 2; rod.position.set(cx, top + 0.05, -hd + 0.12); back.add(rod);
      [-1, 1].forEach((k) => { const fin = solid(new THREE.SphereGeometry(0.06, 10, 8), BRASS, { line: 0.008 }); fin.position.set(cx + k * 2.0, top + 0.05, -hd + 0.12); back.add(fin); });
    });
    // 왼쪽 벽 문 위 풍경화
    const art = canvasTex(640, 340, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#F3D9B1'); sky.addColorStop(1, '#F7EBD3'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,240,200,.95)'; g.beginPath(); g.arc(w * 0.72, h * 0.3, 32, 0, Math.PI * 2); g.fill();
      [['#A9BFA4', 0.55, 0.9], ['#7A9E7E', 0.68, 1.3], ['#5E7F67', 0.8, 0.7]].forEach(([c, y, f]) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * y - Math.sin((x / w) * Math.PI * 2 * f + y * 9) * h * 0.07); g.lineTo(w, h); g.closePath(); g.fill(); });
      g.fillStyle = '#9BB7D4'; g.beginPath(); g.ellipse(w * 0.3, h * 0.88, w * 0.2, h * 0.05, 0, 0, Math.PI * 2); g.fill();
    });
    box(left, 0.08, 2.0, 3.7, BRASS, -hw + 0.05, 3.75, -1.2, { line: 0.02, cast: false });
    plane(left, 3.4, 1.72, toon(0xffffff, { map: art }), -hw + 0.1, 4.75, -1.2, { ry: Math.PI / 2 });
    // 왼쪽 앞 책장 벽과 기댄 사다리(눌러서 카페 책장)
    const books = new THREE.Group();
    box(books, 0.62, 3.5, 5.1, WALNUT, -hw + 0.31, 0, 4.35, { line: 0.03, cast: false });
    shelfFace(P, books, 4.8, 3.25, 6, 91, -hw + 0.625, 0.12, 4.35, Math.PI / 2);
    box(books, 0.76, 0.14, 5.26, 0x3B2618, -hw + 0.38, 3.5, 4.35, { line: 0.02, cast: false });
    const lad = new THREE.Group();
    [-0.25, 0.25].forEach((z) => box(lad, 0.07, 3.3, 0.07, 0xB98A5E, 0, 0, z, { line: 0.015 }));
    for (let i = 1; i < 10; i++) box(lad, 0.06, 0.05, 0.5, 0xB98A5E, 0, i * 0.33, 0, { line: 0.01 });
    lad.position.set(-hw + 1.15, 0, 3.0); lad.rotation.z = 0.15; books.add(lad);
    mark(P, books, { hot: 'shelf' }); block(P, books); left.add(books);

    // 오른쪽 벽: 거울 뒤 선반에 병, 위에 메뉴 칠판
    box(right, 0.6, 1.0, 6.6, WALNUT, hw - 0.3, 0, 0, { line: 0.03, cast: false });
    box(right, 0.66, 0.05, 6.7, MARBLE, hw - 0.33, 1.0, 0, { line: 0.012, cast: false });
    plane(right, 6.2, 1.9, new THREE.MeshLambertMaterial({ color: 0xC4D6D8 }), hw - 0.02, 2.0, 0, { ry: -Math.PI / 2 });
    [-3.15, 3.15].forEach((z) => box(right, 0.08, 2.0, 0.1, BRASS, hw - 0.05, 1.05, z, { line: 0.01, cast: false }));
    box(right, 0.08, 0.1, 6.4, BRASS, hw - 0.05, 3.0, 0, { line: 0.01, cast: false });
    const BOTTLES = [0x8C5A3B, 0x3E6B58, 0xDDE9EC, 0xC9604A, 0xE3A857, 0x6E4A7A];
    [1.55, 2.3].forEach((y, r) => {
      box(right, 0.3, 0.035, 6.0, BRASS, hw - 0.17, y, 0, { line: 0.006, cast: false });
      for (let i = 0; i < 14; i++) {
        const z = -2.75 + i * 0.42 + (r ? 0.2 : 0); if (z > 2.9) continue;
        const c = BOTTLES[(i + r * 3) % BOTTLES.length]; const tall = 0.26 + ((i * 7 + r) % 3) * 0.05;
        cyl(right, 0.055, 0.06, tall, c, hw - 0.17, y + 0.035, z, { line: 0.006, seg: 10 });
        cyl(right, 0.02, 0.03, 0.1, c, hw - 0.17, y + 0.035 + tall, z, { line: 0.004, seg: 8 });
      }
    });
    const menu = canvasTex(768, 512, (g, w, h) => {
      g.fillStyle = '#2F3B33'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8C5A3B'; g.lineWidth = 26; g.strokeRect(0, 0, w, h);
      g.fillStyle = '#FFF3DC'; g.textAlign = 'center'; g.font = '700 64px "Gaegu", "Nanum Pen Script", sans-serif'; g.fillText('오늘의 메뉴', w / 2, 92);
      g.font = '46px "Gaegu", "Nanum Pen Script", sans-serif'; g.textAlign = 'left';
      [['아메리카노', '밤샘용'], ['카페라테', '한 장 더'], ['핫초코', '달달한 결말'], ['말차 라테', '초록 책갈피']].forEach(([a, b], i) => { g.fillStyle = '#FFF3DC'; g.fillText(a, 70, 180 + i * 78); g.fillStyle = '#F2D16B'; g.textAlign = 'right'; g.fillText(b, w - 70, 180 + i * 78); g.textAlign = 'left'; });
    });
    box(right, 0.06, 1.86, 2.76, BRASS, hw - 0.04, 3.07, 0, { line: 0.01, cast: false });
    plane(right, 2.6, 1.7, toon(0xffffff, { map: menu }), hw - 0.08, 4.0, 0, { ry: -Math.PI / 2 });

    // 긴 바: 호두나무 판, 대리석 상판, 놋쇠 발걸이, 가운데 주문하는 곳
    const counter = new THREE.Group();
    const bx = BAR.x + 0.45; const blen = BAR.z1 - BAR.z0;
    box(counter, 0.9, 1.0, blen, 0x5A3825, bx, 0, 0, { line: 0.03 });
    for (let z = BAR.z0 + 0.45; z < BAR.z1 - 0.3; z += 0.6) box(counter, 0.03, 0.66, 0.44, 0x6E4630, BAR.x - 0.01, 0.17, z, { line: 0.008, cast: false });
    box(counter, 1.06, 0.07, blen + 0.16, MARBLE, bx - 0.04, 1.0, 0, { line: 0.02 });
    const rail = solid(new THREE.CylinderGeometry(0.028, 0.028, blen - 0.2, 10), BRASS, { line: 0.008 }); rail.rotation.x = Math.PI / 2; rail.position.set(BAR.x - 0.2, 0.2, 0); counter.add(rail);
    for (let z = BAR.z0 + 0.4; z < BAR.z1; z += 1.4) box(counter, 0.2, 0.03, 0.03, BRASS, BAR.x - 0.1, 0.19, z, { line: 0.005 });
    plane(counter, 1.6, 0.36, toon(0xffffff, { map: signTex('주문하는 곳', { bg: '#3E6B58', size: 84 }) }), BAR.x - 0.035, 0.62, 0, { ry: -Math.PI / 2 });
    const top = 1.07;
    const machine = new THREE.Group();
    box(machine, 0.62, 0.55, 0.5, 0xC9604A, 0, 0, 0, { line: 0.02 });
    box(machine, 0.66, 0.08, 0.54, 0xA9B2BA, 0, 0.55, 0, { line: 0.012 });
    [-0.14, 0.14].forEach((z) => { cyl(machine, 0.045, 0.035, 0.12, 0xA9B2BA, -0.28, 0.2, z, { line: 0.008, seg: 10 }); cyl(machine, 0.05, 0.04, 0.07, 0xFFFDF8, -0.3, 0.03, z, { line: 0.008, seg: 12 }); });
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), toon(0xFFF6E6)); gauge.position.set(-0.315, 0.42, 0); gauge.rotation.y = -Math.PI / 2; machine.add(gauge);
    machine.position.set(BAR.x + 0.55, top, -1.3); counter.add(machine);
    const grinder = new THREE.Group(); box(grinder, 0.22, 0.3, 0.22, 0x3B2618, 0, 0, 0, { line: 0.012 }); const hop = solid(new THREE.ConeGeometry(0.12, 0.22, 10), 0x8C5A3B, { line: 0.01 }); hop.rotation.x = Math.PI; hop.position.y = 0.4; grinder.add(hop); grinder.position.set(BAR.x + 0.6, top, -0.6); counter.add(grinder);
    const caseG = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 1.0), new THREE.MeshLambertMaterial({ color: 0xDDF0F7, transparent: true, opacity: 0.28, depthWrite: false }));
    glass.position.y = 0.225; caseG.add(glass);
    const glassInk = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: INK })); glassInk.position.y = 0.225; caseG.add(glassInk);
    [[-0.3, 0xF4D6DC], [0, 0xF2D16B], [0.3, 0x8C5A3B]].forEach(([z, c]) => { const cake = cyl(caseG, 0.13, 0.13, 0.12, c, 0, 0.02, z, { line: 0.01, seg: 14 }); cake.scale.z = 0.8; const ct = cyl(caseG, 0.13, 0.13, 0.025, 0xFFFDF8, 0, 0.14, z, { line: 0.008, seg: 14 }); ct.scale.z = 0.8; const berry = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), toon(0xE4572E)); berry.position.set(0, 0.19, z); caseG.add(berry); });
    caseG.position.set(BAR.x + 0.45, top, 1.4); counter.add(caseG);
    const bellG = new THREE.Group(); cyl(bellG, 0.06, 0.08, 0.04, 0x3B2618, 0, 0, 0, { line: 0.008, seg: 12 }); const dome = solid(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), BRASS, { line: 0.008 }); dome.position.y = 0.04; bellG.add(dome); bellG.position.set(BAR.x + 0.2, top, 0.3); counter.add(bellG);
    for (let i = 0; i < 4; i++) cyl(counter, 0.06, 0.05, 0.1, 0xFFFDF8, BAR.x + 0.7 - (i % 2) * 0.12, top + Math.floor(i / 2) * 0.1, 2.3 + (i % 2) * 0.05, { line: 0.008, seg: 12 });
    [-3.1, 3.1].forEach((z) => { // 초록 갓 은행 등
      const g = new THREE.Group();
      cyl(g, 0.1, 0.12, 0.03, BRASS, 0, 0, 0, { line: 0.006 }); cyl(g, 0.015, 0.015, 0.28, BRASS, 0, 0.03, 0, { line: 0.004, seg: 6 });
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 14, 1, false, 0, Math.PI), toon(EMERALD, { side: THREE.DoubleSide })); sh.rotation.z = Math.PI / 2; sh.position.y = 0.33; g.add(sh);
      glow(g, 0xffd98a, 0.8, 0, 0.27, 0);
      g.position.set(BAR.x + 0.4, top, z); counter.add(g);
    });
    mark(P, counter, { hot: 'counter' }); block(P, counter); S.add(counter);
    // 바 의자: 놋쇠 기둥, 초록·겨자색 방석, 낮은 등받이
    P.seats.filter((x) => x.kind === 'stool').forEach((st, i) => {
      const g = new THREE.Group(); const c = i % 2 ? 0xD8A24A : EMERALD;
      cyl(g, 0.2, 0.22, 0.03, BRASS, 0, 0, 0, { line: 0.008 });
      cyl(g, 0.03, 0.03, 0.66, BRASS, 0, 0.03, 0, { line: 0.006, seg: 8 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 5, 18), toon(BRASS)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
      cyl(g, 0.21, 0.19, 0.09, c, 0, 0.69, 0, { line: 0.012 });
      for (let k = -1; k <= 1; k++) { const a = Math.PI + k * 0.5; box(g, 0.13, 0.22, 0.05, c, Math.sin(a) * 0.19, 0.78, Math.cos(a) * 0.19, { line: 0.008, ry: a }); }
      g.position.set(st.x, 0, st.z); g.rotation.y = st.yaw; mark(P, g, { seat: st.id }); S.add(g); st.mesh = g;
    });

    // 창가 둥근 대리석 탁자, 위에 초록 갓 등
    CAFE_TABLES.forEach(([x, z], i) => {
      const t = new THREE.Group();
      cyl(t, 0.26, 0.3, 0.04, BRASS, 0, 0, 0, { line: 0.01 });
      cyl(t, 0.04, 0.04, 0.68, BRASS, 0, 0.04, 0, { line: 0.006, seg: 8 });
      cyl(t, 0.52, 0.52, 0.03, BRASS, 0, 0.7, 0, { line: 0.01, seg: 30 });
      cyl(t, 0.5, 0.5, 0.05, MARBLE, 0, 0.72, 0, { line: 0.015, seg: 30 });
      cyl(t, 0.06, 0.05, 0.09, 0xFFFDF8, -0.15, 0.77, 0.1, { line: 0.008, seg: 12 });
      box(t, 0.32, 0.05, 0.24, new THREE.Color(BOOK_COLORS[(i * 5) % BOOK_COLORS.length]).getHex(), 0.15, 0.77, -0.05, { line: 0.01, ry: 0.4 });
      cyl(t, 0.035, 0.045, 0.16, 0xFFFDF8, 0.05, 0.77, 0.3, { line: 0.006, seg: 10 });
      const bloom = solid(new THREE.IcosahedronGeometry(0.06, 1), [0xE8A0A8, 0xF2C79B, 0xFFFDF8][i], { line: 0.008 }); bloom.position.set(0.05, 0.98, 0.3); t.add(bloom);
      t.position.set(x, 0, z); block(P, t); S.add(t);
      pendant(P, S, `C-${i + 1}`, x, z, EMERALD, 3.4, H);
    });
    // 둥근 벨벳 의자(창가 탁자에 둘씩 마주 본다)
    P.seats.filter((x) => x.kind === 'chair').forEach((st) => {
      const ch = new THREE.Group(); const c = 0xD99A8C; const dk = 0xC4806F;
      [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([a, b]) => cyl(ch, 0.022, 0.018, 0.1, BRASS, a, 0, b, { line: 0.005, seg: 6 }));
      cyl(ch, 0.29, 0.27, 0.3, dk, 0, 0.1, 0, { line: 0.015, seg: 20 });
      cyl(ch, 0.26, 0.26, 0.07, c, 0, 0.4, 0, { line: 0.012, seg: 20 });
      for (let k = -2; k <= 2; k++) { const a = Math.PI + k * 0.42; box(ch, 0.16, 0.34, 0.08, c, Math.sin(a) * 0.26, 0.4, Math.cos(a) * 0.26, { line: 0.01, ry: a }); }
      ch.position.set(st.x, 0, st.z); ch.rotation.y = st.yaw;
      mark(P, ch, { seat: st.id }); S.add(ch); st.mesh = ch;
    });

    // 그랜드 피아노: 검은 몸통, 열린 뚜껑, 건반은 바 쪽을 본다
    const piano = new THREE.Group();
    const BLACK = 0x2A2427;
    const outline = () => { const s = new THREE.Shape(); s.moveTo(-0.75, 0); s.lineTo(0.75, 0); s.lineTo(0.75, 0.75); s.bezierCurveTo(0.75, 1.25, 0.2, 1.15, 0.05, 1.6); s.quadraticCurveTo(-0.1, 2.0, -0.45, 2.0); s.lineTo(-0.75, 2.0); s.lineTo(-0.75, 0); return s; };
    const caseGeo = new THREE.ExtrudeGeometry(outline(), { depth: 0.34, bevelEnabled: false }); caseGeo.translate(0, -1, -0.17);
    const body = solid(caseGeo, BLACK, { line: 0.02 }); body.rotation.x = -Math.PI / 2; body.position.set(0, 0.79, -1.0); piano.add(body);
    const harp = new THREE.Mesh(new THREE.ShapeGeometry(outline()).translate(0, -1, 0), toon(BRASS)); harp.rotation.x = -Math.PI / 2; harp.scale.set(0.9, 0.9, 1); harp.position.set(0, 0.95, -1.0); piano.add(harp);
    const hinge = new THREE.Group(); hinge.position.set(-0.75, 0.97, -1.0); hinge.rotation.z = 0.55; piano.add(hinge);
    const lidGeo = new THREE.ExtrudeGeometry(outline(), { depth: 0.025, bevelEnabled: false }); lidGeo.translate(0, -1, -0.0125);
    const lid = solid(lidGeo, BLACK, { line: 0.012 }); lid.rotation.x = -Math.PI / 2; lid.position.set(0.75, 0.0125, 0); hinge.add(lid);
    cyl(piano, 0.012, 0.012, 0.62, BLACK, 0.3, 0.96, -0.9, { line: 0.004, seg: 6 });
    box(piano, 1.5, 0.12, 0.3, BLACK, 0, 0.66, 0.15, { line: 0.015 });
    [-1, 1].forEach((k) => box(piano, 0.07, 0.17, 0.3, BLACK, k * 0.715, 0.66, 0.15, { line: 0.008 }));
    const keys = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8F857C'; g.lineWidth = 1.5;
      const n = 36; const kw = w / n; for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(i * kw, 0); g.lineTo(i * kw, h); g.stroke(); }
      g.fillStyle = '#1E1A1C'; for (let i = 0; i < n - 1; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) g.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, h * 0.6);
    });
    plane(piano, 1.36, 0.17, toon(0xffffff, { map: keys }), 0, 0.785, 0.17, { rx: -Math.PI / 2 });
    const stand = box(piano, 0.8, 0.26, 0.03, BLACK, 0, 0.96, -0.1, { line: 0.008 }); stand.rotation.x = -0.25;
    plane(piano, 0.5, 0.2, toon(0xFFFDF8), 0, 1.09, -0.08, { rx: -0.25 });
    [[-0.62, -0.2], [0.62, -0.2], [-0.4, -1.75]].forEach(([x, z]) => cyl(piano, 0.06, 0.05, 0.62, BLACK, x, 0, z, { line: 0.01, seg: 10 }));
    box(piano, 0.2, 0.5, 0.06, BLACK, 0, 0.02, -0.3, { line: 0.008 });
    [-0.05, 0.05].forEach((x) => box(piano, 0.04, 0.02, 0.12, BRASS, x, 0.03, -0.22, { line: 0.004 }));
    box(piano, 0.85, 0.08, 0.36, BLACK, 0, 0.42, 0.75, { line: 0.012 });
    box(piano, 0.8, 0.06, 0.32, 0x8E3E3A, 0, 0.5, 0.75, { line: 0.01 });
    [[-0.36, 0.6], [0.36, 0.6], [-0.36, 0.9], [0.36, 0.9]].forEach(([x, z]) => cyl(piano, 0.025, 0.025, 0.42, BLACK, x, 0, z, { line: 0.005, seg: 6 }));
    piano.position.set(PIANO.x, 0, PIANO.z); piano.rotation.y = Math.PI / 2; block(P, piano); S.add(piano);

    // 가운데: 별무늬 바닥 장식, 꽃 섬, 위에 샹들리에
    const medal = canvasTex(1024, 1024, (g, w) => {
      g.translate(w / 2, w / 2);
      const disc = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); };
      const star = (r1, r2, n, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? r2 : r1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); };
      disc(510, '#C9A15E'); disc(494, '#4E6B5E'); disc(446, '#F3EADB');
      star(436, 210, 8, '#4E6B5E'); star(336, 160, 8, '#C9A15E'); disc(160, '#F3EADB'); disc(124, '#B5563F'); disc(62, '#C9A15E');
      g.strokeStyle = '#C9A15E'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 470, 0, Math.PI * 2); g.stroke();
    });
    const medMesh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.MeshToonMaterial({ map: medal, gradientMap: gradient }));
    medMesh.rotation.x = -Math.PI / 2; medMesh.position.set(0, 0.011, 0.4); medMesh.receiveShadow = true; S.add(medMesh); mark(P, medMesh, { floor: 0 });
    const island = new THREE.Group();
    cyl(island, 0.4, 0.55, 0.1, 0x3B2618, 0, 0, 0, { line: 0.012, seg: 24 });
    cyl(island, 0.24, 0.34, 0.62, 0x5A3825, 0, 0.1, 0, { line: 0.012, seg: 18 });
    cyl(island, 1.04, 1.04, 0.04, BRASS, 0, 0.72, 0, { line: 0.012, seg: 40 });
    cyl(island, 1.0, 1.0, 0.07, MARBLE, 0, 0.74, 0, { line: 0.018, seg: 40 });
    const vaseGeo = new THREE.LatheGeometry([[0, 0], [0.15, 0], [0.22, 0.1], [0.25, 0.28], [0.2, 0.46], [0.13, 0.56], [0.15, 0.62], [0.2, 0.66]].map(([a, b]) => new THREE.Vector2(a, b)), 22);
    vaseGeo.translate(0, -0.33, 0);
    const vase = solid(vaseGeo, TEAL, { line: 0.015 }); vase.position.y = 0.81 + 0.33; island.add(vase);
    const rand = seeded(57); const BLOOMS = [0xF4D6DC, 0xFFFDF8, 0xE8A0A8, 0xF2C79B, 0xD97B8A, 0xFFF1D6];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2; const leaf = solid(new THREE.SphereGeometry(0.1, 8, 6), i % 2 ? 0x6E8B74 : 0x7A9E7E, { line: 0.01 });
      leaf.scale.set(0.55, 0.3, 2.2); leaf.position.set(Math.cos(a) * 0.5, 1.5 + (i % 3) * 0.05, Math.sin(a) * 0.5); leaf.rotation.set(0.35, Math.PI / 2 - a, 0, 'YXZ'); island.add(leaf);
    }
    for (let i = 0; i < 30; i++) {
      const th = rand() * Math.PI * 2; const ph = Math.acos(1 - rand() * 0.95); const r = 0.42 + rand() * 0.12;
      const b = solid(new THREE.IcosahedronGeometry(0.1 + rand() * 0.07, 1), BLOOMS[i % BLOOMS.length], { line: 0.01 });
      b.position.set(Math.sin(ph) * Math.cos(th) * r, 1.62 + Math.cos(ph) * r * 0.8, Math.sin(ph) * Math.sin(th) * r); island.add(b);
    }
    [[0.62, 0.25, 0.2], [-0.58, -0.35, -0.5]].forEach(([x, z, ry], k) => [0, 1, 2].forEach((j) => box(island, 0.34 - j * 0.03, 0.06, 0.25 - j * 0.02, new THREE.Color(BOOK_COLORS[(k * 4 + j * 3) % BOOK_COLORS.length]).getHex(), x, 0.81 + j * 0.06, z, { line: 0.008, ry: ry + j * 0.15 })));
    island.position.set(0, 0, 0.4); block(P, island); S.add(island);
    const chand = new THREE.Group(); chand.position.set(0, H, 0.4);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), toon(BRASS)); chain.position.y = -0.6; chand.add(chain);
    cyl(chand, 0.06, 0.12, 0.9, BRASS, 0, -2.1, 0, { line: 0.012, seg: 12 });
    const knob = solid(new THREE.SphereGeometry(0.16, 14, 10), BRASS, { line: 0.015 }); knob.position.y = -2.15; chand.add(knob);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x6b5a3a });
    const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    const crystal = new THREE.MeshLambertMaterial({ color: 0xE6F4FA, emissive: 0x2a3540 });
    [[1.05, -2.05, 10], [0.6, -1.6, 6]].forEach(([rad, y, n], tier) => {
      const ring = solid(new THREE.TorusGeometry(rad, 0.03, 6, 40), BRASS, { line: 0.01 }); ring.rotation.x = Math.PI / 2; ring.position.y = y; chand.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + tier * (Math.PI / n); const x = Math.cos(a) * rad; const z = Math.sin(a) * rad;
        const arm = box(chand, rad, 0.025, 0.025, BRASS, x / 2, y - 0.05, z / 2, { line: 0, cast: false }); arm.rotation.y = -a;
        cyl(chand, 0.05, 0.035, 0.06, BRASS, x, y, z, { line: 0.006, seg: 10 });
        cyl(chand, 0.022, 0.022, 0.14, 0xFFF6E6, x, y + 0.06, z, { line: 0.006, seg: 8 });
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), flameMat); f.scale.y = 1.6; f.position.set(x, y + 0.23, z); chand.add(f);
        const s = new THREE.Sprite(haloMat); s.scale.set(0.36, 0.36, 1); s.position.set(x, y + 0.24, z); chand.add(s);
        const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), crystal); drop.scale.y = 1.7; drop.position.set(x, y - 0.13, z); chand.add(drop);
      }
    });
    const chandLight = new THREE.PointLight(0xffc77a, 0, 14, 1.2); chandLight.position.y = -2.0; chand.add(chandLight);
    S.add(chand);
    P.lamps.chandelier = { bulb: { material: flameMat }, halo: { material: haloMat }, light: chandLight, on: false };

    // 깔개 둘: 초록 소파 자리, 마주 보는 남색 소파 자리
    const rugTex = (field, border, seed) => canvasTex(1024, 680, (g, w, h) => {
      g.fillStyle = border; g.fillRect(0, 0, w, h);
      g.fillStyle = field; g.fillRect(44, 44, w - 88, h - 88);
      g.strokeStyle = '#E8C07A'; g.lineWidth = 8; g.strokeRect(30, 30, w - 60, h - 60); g.strokeRect(62, 62, w - 124, h - 124);
      g.save(); g.translate(w / 2, h / 2); g.strokeStyle = 'rgba(232,192,122,.7)'; g.lineWidth = 6;
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, 0, h * 0.28, h * 0.09, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      const rand2 = seeded(seed); g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 400; i++) g.fillRect(rand2() * w, rand2() * h, 3, 3);
    });
    [[rugTex('#2F5D5A', '#22403E', 11), -6.5, 1.15, 5.8, 3.9], [rugTex('#7A3B3B', '#5A2A2A', 12), 2.5, 4.6, 6.0, 3.4]].forEach(([tex, x, z, w, d]) => {
      const m = plane(S, w, d, toon(0xffffff, { map: tex }), x, 0.012, z, { rx: -Math.PI / 2 }); mark(P, m, { floor: 0 });
    });
    // 벨벳 소파(누른 단추, 둥근 팔걸이, 놋쇠 다리). 두 자리 중 가까운 쪽을 고르도록 왼쪽·오른쪽에 따로 표시
    const legs = (g, xs, zs) => xs.forEach((x) => zs.forEach((z) => cyl(g, 0.035, 0.025, 0.12, BRASS, x, 0, z, { line: 0.006, seg: 8 })));
    SOFAS.forEach((s) => {
      const g = new THREE.Group(); const dk = shade(s.color);
      legs(g, [-1.02, 1.02], [-0.36, 0.36]);
      box(g, 2.3, 0.26, 0.95, dk, 0, 0.12, 0, { line: 0.025 });
      box(g, 2.0, 0.64, 0.24, s.color, 0, 0.38, -0.355, { line: 0.022 });
      [-1, 1].forEach((k) => {
        box(g, 0.3, 0.44, 0.95, dk, k * 1.0, 0.12, 0, { line: 0.02 });
        const roll = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 16), s.color, { line: 0.018 }); roll.rotation.x = Math.PI / 2; roll.position.set(k * 1.0, 0.58, 0); g.add(roll);
      });
      [-0.5, 0.5].forEach((lx) => box(g, 0.98, 0.12, 0.68, s.color, lx, 0.38, 0.1, { line: 0.015 }));
      const btn = toon(shade(s.color, 0.6));
      for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const x = -0.84 + i * 0.28 + (r ? 0.14 : 0); if (Math.abs(x) > 0.9) continue; const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), btn); b.position.set(x, 0.66 + r * 0.2, -0.23); g.add(b); }
      [-1, 1].forEach((k) => box(g, 0.36, 0.34, 0.12, s.pillow, k * 0.66, 0.5, -0.17, { line: 0.012, ry: -k * 0.22 }));
      g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw; S.add(g);
      const ids = [`${s.id}-1`, `${s.id}-2`];
      mark(P, g, { seat: ids[0] });
      g.children.forEach((ch) => { const id = ch.position.x < 0 ? ids[0] : ids[1]; ch.traverse((m) => { if (m.isMesh && m.userData.seat) m.userData.seat = id; }); });
      ids.forEach((id) => { P.seatById(id).mesh = g; });
    });
    ARMS.forEach((a) => {
      const g = new THREE.Group(); const dk = shade(a.color);
      legs(g, [-0.38, 0.38], [-0.36, 0.36]);
      box(g, 0.95, 0.26, 0.9, dk, 0, 0.12, 0, { line: 0.022 });
      box(g, 0.64, 0.12, 0.66, a.color, 0, 0.38, 0.08, { line: 0.014 });
      if (a.wing) {
        box(g, 0.86, 1.05, 0.22, a.color, 0, 0.38, -0.35, { line: 0.02 });
        [-1, 1].forEach((k) => box(g, 0.12, 0.6, 0.38, dk, k * 0.41, 0.82, -0.2, { line: 0.014 }));
      } else box(g, 0.86, 0.6, 0.22, a.color, 0, 0.38, -0.34, { line: 0.02 });
      [-1, 1].forEach((k) => box(g, 0.16, 0.38, 0.9, dk, k * 0.4, 0.26, 0, { line: 0.016 }));
      g.position.set(a.x, 0, a.z); g.rotation.y = a.yaw; S.add(g);
      mark(P, g, { seat: a.id }); P.seatById(a.id).mesh = g;
    });
    // 낮은 대리석 탁자 둘과 위의 찻잔·책·꽃
    const lowTable = (x, z, w, d) => {
      const t = new THREE.Group();
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(t, 0.04, 0.4, 0.04, BRASS, a * (w / 2 - 0.06), 0, b * (d / 2 - 0.06), { line: 0.006 }));
      box(t, w - 0.08, 0.03, d - 0.08, BRASS, 0, 0.12, 0, { line: 0.006 });
      box(t, w, 0.05, d, MARBLE, 0, 0.4, 0, { line: 0.015 });
      t.position.set(x, 0, z); block(P, t); S.add(t); return t;
    };
    const tA = lowTable(-6.5, 1.9, 1.4, 0.7);
    [[-0.35, 0.1], [0.4, -0.12]].forEach(([x, z]) => { cyl(tA, 0.09, 0.09, 0.015, 0xFFFDF8, x, 0.45, z, { line: 0.004, seg: 14 }); cyl(tA, 0.055, 0.045, 0.08, 0xFFFDF8, x, 0.465, z, { line: 0.006, seg: 12 }); });
    [0, 1].forEach((j) => box(tA, 0.36 - j * 0.04, 0.05, 0.26, j ? 0x4F6D8A : 0xE3A857, 0.05, 0.45 + j * 0.05, 0.08, { line: 0.008, ry: 0.3 - j * 0.2 }));
    box(tA, 0.5, 0.04, 0.34, 0x2F4858, -0.2, 0.15, 0, { line: 0.006, ry: 0.1 });
    const tB = lowTable(2.5, 4.6, 0.8, 1.5);
    [0, 1, 2].forEach((j) => box(tB, 0.3 - j * 0.03, 0.05, 0.24, new THREE.Color(BOOK_COLORS[(j * 5 + 2) % BOOK_COLORS.length]).getHex(), 0, 0.45 + j * 0.05, -0.4, { line: 0.008, ry: 0.2 * j }));
    cyl(tB, 0.17, 0.12, 0.08, BRASS, 0, 0.45, 0.15, { line: 0.006, seg: 16 });
    [[0.05, 0.13], [-0.06, 0.18], [0.02, 0.2]].forEach(([x, z], j) => { const f = solid(new THREE.SphereGeometry(0.06, 10, 8), [0xE4572E, 0xF2D16B, 0x7A9E7E][j], { line: 0.006 }); f.position.set(x, 0.56, z); tB.add(f); });
    cyl(tB, 0.055, 0.045, 0.08, 0xFFFDF8, 0.15, 0.45, 0.5, { line: 0.006, seg: 12 });
    // 놋쇠 스탠드 둘(늘 켜져 있다), 날개 의자 곁 탁자
    const floorLamp = (x, z) => {
      const g = new THREE.Group();
      cyl(g, 0.17, 0.19, 0.04, BRASS, 0, 0, 0, { line: 0.01 }); cyl(g, 0.022, 0.022, 1.6, BRASS, 0, 0.04, 0, { line: 0.006, seg: 8 });
      const sh = solid(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 20, 1, true), 0xF4EBDD, { line: 0.02, mat: toon(0xF4EBDD, { side: THREE.DoubleSide }) }); sh.position.y = 1.66; g.add(sh);
      glow(g, 0xffd98a, 1.8, 0, 1.55, 0); const l = new THREE.PointLight(0xffc77a, 2.2, 5, 1.4); l.position.y = 1.5; g.add(l);
      g.position.set(x, 0, z); S.add(g);
    };
    floorLamp(-8.3, -0.55); floorLamp(-10.85, 6.35);
    const side = new THREE.Group();
    cyl(side, 0.2, 0.22, 0.03, BRASS, 0, 0, 0, { line: 0.006 }); cyl(side, 0.025, 0.025, 0.5, BRASS, 0, 0.03, 0, { line: 0.005, seg: 8 }); cyl(side, 0.24, 0.24, 0.04, MARBLE, 0, 0.53, 0, { line: 0.01, seg: 24 });
    cyl(side, 0.055, 0.045, 0.08, 0xFFFDF8, -0.08, 0.57, 0.05, { line: 0.006, seg: 12 }); box(side, 0.26, 0.05, 0.2, 0x8C5A3C, 0.05, 0.57, -0.05, { line: 0.008, ry: 0.6 });
    side.position.set(-9.95, 0, 6.35); block(P, side); S.add(side);
    // 큰 화분 야자(모서리 셋)
    const palm = (x, z) => {
      const g = new THREE.Group(); const r2 = seeded(Math.round((x + 20) * 7 + (z + 20) * 3));
      cyl(g, 0.36, 0.28, 0.6, MARBLE, 0, 0, 0, { line: 0.02 }); cyl(g, 0.37, 0.37, 0.06, BRASS, 0, 0.48, 0, { line: 0.008 });
      cyl(g, 0.33, 0.33, 0.03, 0x3B2618, 0, 0.58, 0, { line: 0, seg: 16 });
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + r2() * 0.3; const tilt = 0.45 + r2() * 0.65; const len = 0.9 + r2() * 0.5;
        const stem = new THREE.Group(); stem.position.y = 0.6; stem.rotation.set(tilt, a, 0, 'YXZ'); g.add(stem);
        cyl(stem, 0.015, 0.02, len, 0x5E7F67, 0, 0, 0, { line: 0.004, seg: 6 });
        const frond = solid(new THREE.SphereGeometry(0.2, 10, 6), i % 2 ? 0x5E7F67 : 0x7A9E7E, { line: 0.012 }); frond.scale.set(1.0, len * 1.6, 0.18); frond.position.y = len * 0.75; stem.add(frond);
      }
      g.position.set(x, 0, z); S.add(g);
    };
    palm(-11.1, -6.2); palm(11.0, -6.2); palm(11.0, 6.2);
    // 김: 커피 머신과 찻잔 위로 모락모락
    P.steam = [];
    [[BAR.x + 0.25, 1.75, -1.3], [BAR.x + 0.25, 1.75, -1.3], ...CAFE_TABLES.map(([x, z]) => [x - 0.15, 0.92, z + 0.1]), [-6.85, 0.6, 2.0]].forEach(([x, y, z], i) => { const sp = glow(S, 0xffffff, 0.25, x, y, z); sp.material.opacity = 0.0; sp.userData = { x, y, z, phase: i * 0.37 }; P.steam.push(sp); });
    P.anim = (dt, t) => {
      P.steam.forEach((sp) => { const k = (t * 0.35 + sp.userData.phase) % 1; sp.position.set(sp.userData.x + Math.sin(k * 6) * 0.04, sp.userData.y + k * 0.6, sp.userData.z); sp.scale.setScalar(0.15 + k * 0.35); sp.material.opacity = Math.sin(k * Math.PI) * 0.35; });
    };
  };



  // ───────── 지하 서고 굴 짓기: 큰 동굴 서고 ─────────
  const buildCave = (P) => {
    const S = P.scene;
    const { w: W, d: D, h: H } = CAVE; const hw = W / 2; const hd = D / 2;
    box(S, W + 0.6, 0.59, D + 0.6, 0x3B2A1E, 0, -0.6, 0, { line: 0.05, cast: false });
    const dirt = canvasTex(2048, 1317, (g, w, h) => {
      const rand = seeded(131); g.fillStyle = '#7A5A40'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 7000; i++) { const v = rand(); g.fillStyle = v < 0.5 ? 'rgba(60,40,26,.25)' : 'rgba(160,120,84,.22)'; g.fillRect(rand() * w, rand() * h, 3 + rand() * 6, 2 + rand() * 4); }
      for (let i = 0; i < 260; i++) { g.fillStyle = ['#A08670', '#8C7460', '#B59C80'][i % 3]; g.beginPath(); g.ellipse(rand() * w, rand() * h, 5 + rand() * 9, 4 + rand() * 6, rand() * 3, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(46,36,28,.5)'; g.lineWidth = 1.5; g.stroke(); }
    });
    const floor = plane(S, W, D, toon(0xffffff, { map: dirt }), 0, 0, 0, { rx: -Math.PI / 2 }); mark(P, floor, { floor: 0 });
    const strata = (rep) => canvasTex(1024, 320, (g, w, h) => {
      const bands = ['#6B4E3A', '#7E5E45', '#5E4332', '#8A6A4E', '#6B4E3A', '#5A402F'];
      bands.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, (i / bands.length) * h); for (let x = 0; x <= w; x += 32) g.lineTo(x, (i / bands.length) * h + Math.sin(x * 0.02 + i) * 8); g.lineTo(w, h); g.lineTo(0, h); g.fill(); });
      const rand = seeded(137); for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(180,150,110,.5)'; g.beginPath(); g.arc(rand() * w, rand() * h, 3 + rand() * 6, 0, Math.PI * 2); g.fill(); }
    }, { repeat: [rep, 1.4] });
    const rand = seeded(149);
    // 뒤 흙벽: 아래층 책 굴 열하나, 위층 회랑과 책 굴, 늘어진 뿌리
    const back = new THREE.Group();
    const bw = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, H, 0.6), toon(0xffffff, { map: strata(5) })); bw.position.set(0, H / 2, -hd - 0.3); bw.receiveShadow = true; back.add(bw);
    const alcove = (x, y, z, n) => {
      box(back, 1.6, 2.5, 0.7, 0x4A3526, x, y, z, { line: 0.03, cast: false });
      shelfFace(P, back, 1.36, 2.3, 4, 141 + n, x, y + 0.1, z + 0.355);
      const arch = solid(new THREE.TorusGeometry(0.8, 0.13, 6, 14, Math.PI), 0x5E4332, { line: 0.02 }); arch.position.set(x, y + 2.5, z + 0.3); back.add(arch);
      [-0.8, 0.8].forEach((dx) => box(back, 0.26, 2.5, 0.3, 0x5E4332, x + dx, y, z + 0.3, { line: 0.015 }));
    };
    for (let i = 0; i < 11; i++) alcove(-11 + i * 2.2, 0.15, -hd + 0.35, i);
    for (let i = 0; i < 10; i++) alcove(-9.9 + i * 2.2, 3.55, -hd + 0.35, 20 + i);
    box(back, W - 2, 0.16, 1.1, 0x6B4430, 0, 3.35, -hd + 0.75, { line: 0.02 }); // 위 회랑 마루
    for (let x = -hw + 1.2; x <= hw - 1.2; x += 0.6) cyl(back, 0.03, 0.03, 0.8, 0xB98A5E, x, 3.51, -hd + 1.25, { line: 0.008, seg: 6 });
    box(back, W - 2, 0.07, 0.08, 0x8C5A3B, 0, 4.31, -hd + 1.25, { line: 0.01 });
    for (let x = -hw + 1.5; x < hw - 1; x += 3.0) { const br = box(back, 0.12, 0.6, 0.12, 0x5E4332, x, 2.75, -hd + 0.75, { line: 0.01 }); br.rotation.x = 0.6; }
    [-hw + 0.9, hw - 0.9].forEach((x) => { const lad = new THREE.Group(); [-0.22, 0.22].forEach((dx) => box(lad, 0.07, 3.6, 0.07, 0xB98A5E, dx, 0, 0, { line: 0.012 })); for (let i = 1; i < 11; i++) box(lad, 0.44, 0.05, 0.06, 0xB98A5E, 0, i * 0.33, 0, { line: 0.008 }); lad.position.set(x, 0, -hd + 1.5); lad.rotation.x = -0.18; back.add(lad); });
    for (let i = 0; i < 46; i++) { const len = 0.6 + rand() * 1.8; const root = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, len, 4), toon(0x8C6A4A)); root.position.set(-hw + 0.5 + rand() * (W - 1), H - len / 2, -hd + 0.05 + rand() * 0.2); root.rotation.z = (rand() - 0.5) * 0.4; back.add(root); }
    const plate = plane(back, 3.6, 0.7, toon(0xffffff, { map: signTex('지하 서고 굴', { bg: '#3B2618', fg: '#F2D16B' }) }), 0, H - 0.55, -hd + 0.02); plate.castShadow = false;
    block(P, back); S.add(back); P.walls.push({ group: back, nx: 0, nz: 1 });
    // 왼쪽 벽: 엘리베이터·계단 문, 앞쪽 폭포
    const left = new THREE.Group();
    const lw = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D + 0.6), toon(0xffffff, { map: strata(3.5) })); lw.position.set(-hw - 0.3, H / 2, 0); lw.receiveShadow = true; left.add(lw);
    box(left, 2.2, 3.2, 0.12, 0x5E4332, -hw + 0.03, 0, -3.2, { line: 0.02, ry: Math.PI / 2 });
    liftDoor(P, left, -hw + 0.05, -3.2, Math.PI / 2);
    stairDoor(P, left, -hw + 0.03, -1.2, Math.PI / 2, 'up');
    P.fall = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#7FC4D8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(240,252,255,.7)'; g.lineWidth = 3; const r = seeded(9); for (let i = 0; i < 30; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, r() * h); g.lineTo(x + (r() - 0.5) * 4, r() * h + 40); g.stroke(); } }, { repeat: [1, 2] });
    const fall = plane(left, 1.3, 3.6, new THREE.MeshLambertMaterial({ map: P.fall, transparent: true, opacity: 0.85, emissive: 0x1a4a58 }), -hw + 0.12, 1.8, 5.2, { ry: Math.PI / 2, receive: false });
    fall.renderOrder = 2;
    [-0.8, 0.8].forEach((dz) => { const rk = solid(new THREE.DodecahedronGeometry(0.45, 0), 0x6E6258, { line: 0.02 }); rk.position.set(-hw + 0.35, 3.6 + Math.abs(dz) * 0.2, 5.2 + dz); left.add(rk); });
    block(P, left); S.add(left); P.walls.push({ group: left, nx: 1, nz: 0 });
    const right = new THREE.Group();
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, D + 0.6), toon(0xffffff, { map: strata(3.5) })); rw.position.set(hw + 0.3, H / 2, 0); rw.receiveShadow = true; right.add(rw);
    block(P, right); S.add(right); P.walls.push({ group: right, nx: -1, nz: 0 });
    // 가운데 받침: 이 문집이 펼쳐져 떠 있고, 둘레에 룬 고리와 그루터기 여섯
    const rune = canvasTex(512, 512, (g) => { g.strokeStyle = '#F2D16B'; g.globalAlpha = 0.6; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 244, 0, Math.PI * 2); g.stroke(); g.setLineDash([18, 14]); g.beginPath(); g.arc(256, 256, 204, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.lineWidth = 3; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); g.lineTo(256 + Math.cos(a) * 190, 256 + Math.sin(a) * 190); g.stroke(); } });
    const ring = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ map: rune, transparent: true, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(PED[0], 0.015, PED[1]); S.add(ring); mark(P, ring, { floor: 0 });
    P.rune = ring;
    const ped = new THREE.Group();
    cyl(ped, 0.75, 0.9, 0.5, 0x8C7460, 0, 0, 0, { line: 0.03, seg: 10 });
    cyl(ped, 0.58, 0.64, 0.4, 0x9C846E, 0, 0.5, 0, { line: 0.02, seg: 10 });
    [0, 1, 2, 3].forEach((k) => { const a = (k / 4) * Math.PI * 2 + 0.4; const c = solid(new THREE.OctahedronGeometry(0.16, 0), 0xB6A0F0, { line: 0.008, mat: new THREE.MeshToonMaterial({ color: 0xB6A0F0, emissive: 0x5A40A0, emissiveIntensity: 0.9, gradientMap: gradient }) }); c.scale.y = 1.8; c.position.set(Math.cos(a) * 0.62, 0.95, Math.sin(a) * 0.62); ped.add(c); });
    const bookG = new THREE.Group(); bookG.position.y = 1.35; ped.add(bookG);
    [-1, 1].forEach((k) => { const c = box(bookG, 0.6, 0.05, 0.8, 0xE4572E, k * 0.3, 0, 0, { line: 0.012 }); c.rotation.z = -k * 0.18; const pg = box(bookG, 0.56, 0.06, 0.74, 0xFFFDF8, k * 0.28, 0.04, 0, { line: 0.01 }); pg.rotation.z = -k * 0.18; });
    P.bookGlow = glow(bookG, 0xFFE9A8, 2.4, 0, 0.1, 0);
    const bookLight = new THREE.PointLight(0xffd98a, 6, 9, 1.4); bookLight.position.y = 0.3; bookG.add(bookLight);
    P.bookG = bookG;
    ped.position.set(PED[0], 0, PED[1]); mark(P, ped, { hot: 'archive' }); block(P, ped); S.add(ped);
    P.seats.filter((st) => st.id.startsWith('stump')).forEach((st) => { const g = new THREE.Group(); cyl(g, 0.22, 0.26, 0.45, 0x8C6A4A, 0, 0, 0, { line: 0.02, seg: 9 }); const top = new THREE.Mesh(new THREE.CircleGeometry(0.22, 9), toon(0xD9B98C)); top.rotation.x = -Math.PI / 2; top.position.y = 0.452; g.add(top); g.position.set(st.x, 0, st.z); mark(P, g, { seat: st.id }); S.add(g); st.mesh = g; });
    // 뿌리 기둥 둘: 천장에서 바닥까지 꼬여 내려온다
    [-7.5, 7.5].forEach((x, k) => {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const pts = []; for (let j = 0; j <= 10; j++) { const y = (j / 10) * H; const tw = a + j * 0.35 * (k ? 1 : -1); const r = 0.55 + Math.sin(j * 0.8 + i) * 0.12 + (j < 2 ? (2 - j) * 0.35 : 0); pts.push(new THREE.Vector3(Math.cos(tw) * r, y, Math.sin(tw) * r)); } const tube = solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.22, 7), 0x7A5A40, { line: 0.02 }); g.add(tube); }
      for (let i = 0; i < 6; i++) { const lan = glow(g, 0x9FE07A, 0.5, Math.cos(i) * 0.75, 1.2 + i * 0.8, Math.sin(i) * 0.75); lan.material.opacity = 0.7; }
      g.position.set(x, 0, -5.0); block(P, g); S.add(g);
    });
    // 물길: 폭포 아래 웅덩이에서 수정 웅덩이까지, 둑 돌과 아치 나무다리
    P.stream = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#4F8FA8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(230,250,255,.55)'; g.lineWidth = 2; const r = seeded(17); for (let i = 0; i < 22; i++) { const x = r() * w; const y = r() * h; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 10, y - 4, x + 20, y + 4, x + 32, y); g.stroke(); } }, { repeat: [10, 1] });
    const sw = STREAM.x1 + hw; const water = plane(S, sw, STREAM.z1 - STREAM.z0, new THREE.MeshLambertMaterial({ map: P.stream, emissive: 0x153a48, emissiveIntensity: 0.7 }), -hw + sw / 2, 0.02, (STREAM.z0 + STREAM.z1) / 2, { rx: -Math.PI / 2, receive: false });
    for (let x = -hw + 0.6; x < STREAM.x1; x += 0.9) [STREAM.z0 - 0.05, STREAM.z1 + 0.05].forEach((z, j) => { if (x > STREAM.bridge[0] - 0.3 && x < STREAM.bridge[1] + 0.3) return; const rk = solid(new THREE.DodecahedronGeometry(0.18 + ((x * 7 + j) % 3) * 0.05, 0), 0x8C7460, { line: 0.012 }); rk.position.set(x + (j ? 0.4 : 0), 0.08, z); rk.scale.y = 0.6; S.add(rk); });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshLambertMaterial({ color: 0x5FB8C8, emissive: 0x1a5560, emissiveIntensity: 0.8 })); pool.rotation.x = -Math.PI / 2; pool.position.set(6.8, 0.025, 5.2); S.add(pool);
    const fallPool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), new THREE.MeshLambertMaterial({ color: 0x5FB8C8, emissive: 0x1a5560, emissiveIntensity: 0.6 })); fallPool.rotation.x = -Math.PI / 2; fallPool.scale.set(0.8, 1.3, 1); fallPool.position.set(-hw + 0.6, 0.025, 5.2); S.add(fallPool);
    P.ripples = [0, 1, 2].map((i) => { const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 24), new THREE.MeshBasicMaterial({ color: 0xDDF0F7, transparent: true, opacity: 0.5, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(i < 2 ? 6.8 : -hw + 0.6, 0.03, 5.2); r.userData.phase = i * 0.5; S.add(r); return r; });
    const bridge = new THREE.Group();
    const bx = (STREAM.bridge[0] + STREAM.bridge[1]) / 2;
    for (let i = 0; i <= 8; i++) { const t = i / 8; const z = STREAM.z0 - 0.5 + t * (STREAM.z1 - STREAM.z0 + 1.0); const y = Math.sin(t * Math.PI) * 0.35; box(bridge, 1.5, 0.08, 0.2, 0xB98A5E, bx, y, z, { line: 0.008 }); }
    [-0.78, 0.78].forEach((dx) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(bx + dx, 0.9 + Math.sin(t * Math.PI) * 0.35, STREAM.z0 - 0.5 + t * (STREAM.z1 - STREAM.z0 + 1.0))); } const rl = solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.04, 6), 0x8C5A3B, { line: 0.008 }); bridge.add(rl); [0, 0.5, 1].forEach((t) => cyl(bridge, 0.04, 0.04, 0.9, 0x8C5A3B, bx + dx, Math.sin(t * Math.PI) * 0.35, STREAM.z0 - 0.5 + t * (STREAM.z1 - STREAM.z0 + 1.0), { line: 0.008, seg: 6 })); });
    S.add(bridge);
    // 수정 웅덩이: 보라·청록으로 빛나는 수정 무리
    P.crystals = [];
    [[8.7, 6.9, 7, 1.0], [8.4, 3.5, 5, 0.7], [5.6, 7.6, 4, 0.5]].forEach(([cx, cz, n, s], k) => {
      for (let i = 0; i < n; i++) {
        const c = [0xB6A0F0, 0x7FE0D0, 0xE8A0D8][(i + k) % 3]; const e = [0x5A40A0, 0x2A8C80, 0x8A3A78][(i + k) % 3];
        const cr = solid(new THREE.ConeGeometry(0.16 * s + (i % 3) * 0.06, (0.9 + (i % 4) * 0.45) * s * 1.6, 6), c, { line: 0.012, mat: new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: 0.9, gradientMap: gradient }) });
        const a = (i / n) * Math.PI * 2 + k; const r = i ? 0.25 + (i % 3) * 0.18 : 0;
        cr.position.set(cx + Math.cos(a) * r * s * 1.4, (0.45 + (i % 4) * 0.22) * s * 1.6, cz + Math.sin(a) * r * s * 1.4); cr.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); S.add(cr); P.crystals.push(cr);
      }
      const gl = glow(S, [0xB6A0F0, 0x7FE0D0, 0xE8A0D8][k], 2.6 * s + 0.8, cx, 0.8, cz); gl.material.opacity = 0.7;
    });
    P.crystalLight = new THREE.PointLight(0xb6a0f0, 4, 9, 1.4); P.crystalLight.position.set(8.0, 1.6, 5.6); S.add(P.crystalLight);
    // 광차 길과 책 실은 광차(오른쪽 벽을 따라 천천히 오간다), 책 상자 더미
    [11.0, 11.7].forEach((x) => box(S, 0.06, 0.06, D - 1.4, 0x6E7A84, x, 0, 0, { line: 0.01 }));
    for (let z = -hd + 0.8; z <= hd - 0.8; z += 0.5) box(S, 1.0, 0.05, 0.14, 0x5E4332, 11.35, 0, z, { line: 0.008 });
    [-hd + 0.6, hd - 0.6].forEach((z) => box(S, 1.2, 0.5, 0.25, 0x8C5A3B, 11.35, 0, z, { line: 0.015 }));
    const cart = new THREE.Group();
    box(cart, 0.95, 0.55, 1.3, 0x6E7A84, 0, 0.15, 0, { line: 0.025 });
    box(cart, 1.0, 0.06, 1.35, 0x4A545C, 0, 0.7, 0, { line: 0.012 });
    for (let i = 0; i < 8; i++) box(cart, 0.12, 0.3 + (i % 3) * 0.05, 0.4, new THREE.Color(BOOK_COLORS[(i * 3) % BOOK_COLORS.length]).getHex(), -0.4 + (i % 4) * 0.25, 0.7, i < 4 ? -0.25 : 0.25, { line: 0.008 });
    [-0.4, 0.4].forEach((z) => [-0.35, 0.35].forEach((x) => { const wh = cyl(cart, 0.13, 0.13, 0.06, 0x2B1C12, x, 0.02, z, { line: 0.008, seg: 12 }); wh.rotation.z = Math.PI / 2; wh.position.y = 0.13; }));
    cart.position.set(11.35, 0, 0); mark(P, cart, { hot: 'cart' }); S.add(cart); P.cart = cart;
    [[-4.5, 3], [4.5, 3]].forEach(([zc, n]) => { for (let i = 0; i < 6; i++) { const cr = box(S, 0.8, 0.55, 0.8, i % 2 ? 0x8C5A3B : 0x9C6B48, 13.2 - (i % 2) * 0.05, Math.floor(i / 2) * 0.55, zc - 1.0 + (i % 3) * 1.0, { line: 0.015 }); cr.rotation.y = (i % 3) * 0.08; } box(S, 0.5, 0.06, 0.4, 0xE3A857, 13.0, 1.65, zc, { line: 0.008 }); });
    // 물길 건너: 굴방 셋, 거대 버섯 숲, 둥근 독서 자리
    P.seats.filter((st) => st.id.startsWith('burrow')).forEach((st, i) => {
      const g = new THREE.Group();
      const dome = solid(new THREE.SphereGeometry(1.0, 18, 10, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI / 2), 0x7E5E45, { line: 0.03, mat: toon(0x7E5E45, { side: THREE.DoubleSide }) });
      dome.scale.set(1, 1.25, 1); g.add(dome);
      const c = cyl(g, 0.42, 0.46, 0.16, [0xE3A857, 0x9BB7D4, 0xB98DB5][i % 3], 0, 0.012, 0, { line: 0.02 });
      glow(g, 0xffd27a, 0.9, 0.45, 0.95, -0.45); const ll = new THREE.PointLight(0xffc77a, 1.4, 3, 1.5); ll.position.set(0.4, 0.9, -0.4); g.add(ll);
      g.position.set(st.x, 0, st.z); mark(P, c, { seat: st.id }); S.add(g); st.mesh = c;
    });
    P.shrooms = [];
    const bigShroom = (x, z, h, c, e) => {
      const g = new THREE.Group();
      cyl(g, 0.14, 0.22, h, 0xF4EBDD, 0, 0, 0, { line: 0.015, seg: 10 });
      const cap = solid(new THREE.SphereGeometry(0.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), c, { line: 0.02, mat: new THREE.MeshToonMaterial({ color: c, emissive: e, emissiveIntensity: 0.8, gradientMap: gradient }) });
      cap.scale.set(1, 0.55, 1); cap.position.y = h; g.add(cap); P.shrooms.push(cap);
      for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), toon(0xFFFDF8)); const a = i * 1.1; d.position.set(Math.cos(a) * 0.55, h + 0.35, Math.sin(a) * 0.55); g.add(d); }
      const gl = glow(g, c, 2.6, 0, h - 0.2, 0); gl.material.opacity = 0.55;
      g.position.set(x, 0, z); S.add(g);
    };
    bigShroom(-1.6, 7.9, 2.6, 0x7FE0D0, 0x2A8C80); bigShroom(-13.0, 7.9, 3.0, 0xB6A0F0, 0x5A40A0); bigShroom(4.2, 8.3, 2.2, 0x9FE07A, 0x3C8A28);
    [[-4.6, 7.4, 6], [-12.6, 6.4, 4], [3.0, 6.2, 4], [-7.8, -6.6, 5], [5.6, -7.0, 4], [-11.8, 2.6, 4]].forEach(([cx, cz, n], k) => {
      for (let i = 0; i < n; i++) {
        const g = new THREE.Group(); const a = (i / n) * Math.PI * 2 + k; const r = i ? 0.15 + (i % 3) * 0.13 : 0;
        const h = 0.18 + ((i * 7) % 5) * 0.08; cyl(g, 0.03, 0.04, h, 0xF4EBDD, 0, 0, 0, { line: 0.006, seg: 6 });
        const col = [0x7FE0D0, 0xB6A0F0, 0x9FE07A][(i + k) % 3];
        const cap = solid(new THREE.SphereGeometry(0.1 + (i % 3) * 0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), col, { line: 0.008, mat: new THREE.MeshToonMaterial({ color: col, emissive: [0x2A8C80, 0x5A40A0, 0x3C8A28][(i + k) % 3], emissiveIntensity: 0.9, gradientMap: gradient }) });
        cap.position.y = h; g.add(cap); g.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r); S.add(g); P.shrooms.push(cap);
      }
      const gl = glow(S, [0x7FE0D0, 0xB6A0F0, 0x9FE07A][k % 3], 1.4, cx, 0.4, cz); gl.material.opacity = 0.55;
    });
    const pitRug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), toon(0x5E4A6E)); pitRug.rotation.x = -Math.PI / 2; pitRug.position.set(PIT[0], 0.012, PIT[1]); pitRug.receiveShadow = true; S.add(pitRug); mark(P, pitRug, { floor: 0 });
    const pitRing = new THREE.Mesh(new THREE.RingGeometry(1.95, 2.1, 40), toon(0xE3A857)); pitRing.rotation.x = -Math.PI / 2; pitRing.position.set(PIT[0], 0.014, PIT[1]); S.add(pitRing);
    P.seats.filter((st) => st.id.startsWith('pit')).forEach((st, i) => { const c = cyl(S, 0.42, 0.46, 0.17, [0xE3A857, 0x9BB7D4, 0xB98DB5, 0x6E8B74, 0xD98C6C][i % 5], st.x, 0.012, st.z, { line: 0.02 }); mark(P, c, { seat: st.id }); st.mesh = c; });
    const lantern = new THREE.Group(); box(lantern, 0.24, 0.32, 0.24, 0x3B2618, 0, 0, 0, { line: 0.008 }); glow(lantern, 0xffd27a, 1.6, 0, 0.18, 0); const pl = new THREE.PointLight(0xffb86a, 2.2, 5, 1.5); pl.position.y = 0.25; lantern.add(pl); lantern.position.set(PIT[0], 0.01, PIT[1]); S.add(lantern);
    // 등불 기둥 넷
    [[-4.5, -3.0], [4.5, -3.0], [-9.0, 2.0], [9.0, 2.0]].forEach(([x, z]) => {
      const g = new THREE.Group(); cyl(g, 0.05, 0.06, 2.2, 0x5E4332, 0, 0, 0, { line: 0.01, seg: 6 });
      box(g, 0.3, 0.05, 0.05, 0x5E4332, 0.12, 2.15, 0, { line: 0.006 });
      const lan = new THREE.Group(); lan.position.set(0.25, 1.95, 0); g.add(lan);
      box(lan, 0.18, 0.24, 0.18, 0x3B2618, 0, 0, 0, { line: 0.008 }); glow(lan, 0xffd27a, 1.2, 0, 0.12, 0);
      const l = new THREE.PointLight(0xffb86a, 2.4, 7, 1.5); l.position.set(0, 0.1, 0); lan.add(l);
      g.position.set(x, 0, z); S.add(g);
    });
    // 종유석: 벽 가까이 천장에서
    for (let i = 0; i < 24; i++) { const len = 0.5 + rand() * 1.4; const st = solid(new THREE.ConeGeometry(0.12 + rand() * 0.12, len, 6), 0x6E6258, { line: 0.01 }); st.rotation.x = Math.PI; const side = i % 3; st.position.set(side === 0 ? -hw + 0.4 + rand() * 0.6 : side === 1 ? hw - 0.4 - rand() * 0.6 : -hw + rand() * W, H - len / 2, side === 2 ? -hd + 1.4 + rand() * 0.6 : -hd + rand() * D); S.add(st); }
    // 반딧불
    const flyGeo = new THREE.BufferGeometry(); const fly = []; for (let i = 0; i < 90; i++) fly.push(-hw + 1 + rand() * (W - 2), 0.5 + rand() * 4, -hd + 1 + rand() * (D - 2));
    flyGeo.setAttribute('position', new THREE.Float32BufferAttribute(fly, 3));
    P.flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ size: 0.12, map: glowTex, color: 0xF2E39A, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); S.add(P.flies);
    P.hemi = new THREE.HemisphereLight(0xa89888, 0x4a3a2e, 1.2); S.add(P.hemi);
    P.sun = new THREE.DirectionalLight(0xffd9a8, 0.6); P.sun.position.set(-4, 12, 8); P.sun.castShadow = true; P.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(P.sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 2, far: 50 }); P.sun.shadow.bias = -0.0006; P.sun.shadow.normalBias = 0.03;
    S.add(P.sun, P.sun.target);
    S.background = new THREE.Color(0x1A120C);
    P.anim = (dt, t) => {
      P.bookG.position.y = 1.35 + Math.sin(t * 1.4) * 0.06; P.bookG.rotation.y = t * 0.3;
      P.bookGlow.material.opacity = 0.75 + Math.sin(t * 2) * 0.2;
      P.rune.rotation.z = t * 0.05;
      P.cart.position.z = Math.sin(t * 0.1) * (hd - 2.2);
      P.cart.children.filter((m) => m.geometry && m.geometry.type === 'CylinderGeometry').forEach((w) => { w.rotation.x = P.cart.position.z * 6; });
      P.stream.offset.x = (-t * 0.12) % 1; P.fall.offset.y = (t * 0.6) % 1;
      P.crystalLight.intensity = 3.6 + Math.sin(t * 1.3) * 0.8;
      P.ripples.forEach((r) => { const k = (t * 0.5 + r.userData.phase) % 1; r.scale.setScalar(0.1 + k * 0.9); r.material.opacity = 0.5 * (1 - k); });
      const pos = P.flies.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { pos.setY(i, pos.getY(i) + Math.sin(t * 1.3 + i) * dt * 0.15); pos.setX(i, pos.getX(i) + Math.cos(t * 0.7 + i * 2) * dt * 0.12); } pos.needsUpdate = true;
      P.flies.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    };
  };
  // 큰 서고 바닥의 지하 계단 구멍: 어두운 구멍에 내려가는 계단 그림, 세 면 난간, 팻말
  const addHatch = () => {
    const S = hall.scene;
    const hole = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#1A120C'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { const y = 20 + i * 38; g.fillStyle = `rgba(185,138,94,${0.85 - i * 0.14})`; g.fillRect(14, y, w - 28, 22); g.fillStyle = 'rgba(46,36,28,.6)'; g.fillRect(14, y + 22, w - 28, 4); } g.strokeStyle = '#5E3B27'; g.lineWidth = 14; g.strokeRect(0, 0, w, h); });
    const p = plane(S, 1.5, 1.3, toon(0xffffff, { map: hole }), -9.9, 0.016, 4.4, { rx: -Math.PI / 2 }); p.rotation.z = Math.PI;
    mark(hall, p, { portal: 'down' });
    const rail = new THREE.Group();
    [[-10.65, 3.7], [-10.65, 4.4], [-10.65, 5.05], [-9.15, 3.7], [-9.15, 4.4], [-9.15, 5.05], [-9.9, 3.7]].forEach(([x, z]) => cyl(rail, 0.035, 0.035, 0.9, 0xB98A5E, x, 0, z, { line: 0.01, seg: 8 }));
    box(rail, 0.08, 0.07, 1.4, 0x8C5A3B, -10.65, 0.9, 4.38, { line: 0.012 }); box(rail, 0.08, 0.07, 1.4, 0x8C5A3B, -9.15, 0.9, 4.38, { line: 0.012 }); box(rail, 1.55, 0.07, 0.08, 0x8C5A3B, -9.9, 0.9, 3.7, { line: 0.012 });
    const sign = plane(rail, 0.9, 0.28, toon(0xffffff, { map: signTex('↓ 지하 굴', { bg: '#3B2618', fg: '#F2D16B' }) }), -9.9, 1.2, 3.72); sign.castShadow = false;
    S.add(rail);
  };
  // ───────── 4층 필사실 꾹꾹 짓기 ─────────
  // 종이학 하나: 몸통 마름모, 두 날개, 목·꼬리
  const craneGeo = (() => {
    const v = [
      0, 0, -0.16, 0, 0.05, 0, 0, 0, 0.16, // 몸 위
      0, 0, -0.16, 0, 0, 0.16, 0, -0.06, 0, // 몸 아래
      0, 0.03, -0.05, 0.22, 0.09, 0.0, 0, 0.03, 0.06, // 오른 날개
      0, 0.03, 0.06, -0.22, 0.09, 0.0, 0, 0.03, -0.05, // 왼 날개
      0, 0, 0.1, 0, 0.17, 0.2, 0, 0.02, 0.15, // 목
      0, 0, -0.1, 0, 0.14, -0.22, 0, 0.02, -0.15, // 꼬리
      0, 0.17, 0.2, 0, 0.14, 0.25, 0.0, 0.15, 0.19, // 부리
    ];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  })();
  const crane = (parent, color, x, y, z, len) => {
    const hang = new THREE.Group(); hang.position.set(x, y, z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 3), new THREE.MeshBasicMaterial({ color: 0xE8DCC6 })); cord.position.y = -len / 2; hang.add(cord);
    const bird = new THREE.Mesh(craneGeo, toon(color, { side: THREE.DoubleSide })); bird.position.y = -len - 0.05; bird.castShadow = true; hang.add(bird);
    bird.add(new THREE.LineSegments(new THREE.EdgesGeometry(craneGeo), new THREE.LineBasicMaterial({ color: INK })));
    hang.userData.phase = x * 1.7 + z;
    parent.add(hang);
    return hang;
  };
  const buildScribe = (P) => {
    const S = P.scene;
    const maple = canvasTex(1024, 640, (g, w, h) => {
      const rand = seeded(113); g.fillStyle = '#D9B98C'; g.fillRect(0, 0, w, h);
      const ph = 20;
      for (let y = 0; y < h; y += ph) { let x = -rand() * 150; while (x < w) { const len = 140 + rand() * 220; const v = (rand() - 0.5) * 18; g.fillStyle = `rgb(${222 + v},${190 + v},${146 + v})`; g.fillRect(x, y, len, ph); g.strokeStyle = 'rgba(140,100,60,.4)'; g.lineWidth = 1.5; g.strokeRect(x, y, len, ph); x += len; } }
    });
    const { w: W, d: D, h: H } = SCRIBE; const hw = W / 2;
    const win = { r: 1.3, y0: 0.85, y1: 3.6 };
    const walls = buildRoom(P, { floorTex: maple, wall: 0xF4EEE2, side: 0xEAE1D0, sign: '필사실 꾹꾹', windowsAt: CAFE_WINDOWS, w: W, d: D, h: H, win });
    const { back, left } = walls;
    dressRoom(P, walls, { w: W, d: D, h: H, windowsAt: CAFE_WINDOWS, win, pillars: [-10.15, -5, 5, 10.15], drape: 0x6E8B74, sconces: [[1, 3.6], [1, 5.4]] });
    // 원고지 무늬 긴 러그(책상 사이 통로)
    const runner = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#F6EFE1'; g.fillRect(0, 0, w, h); g.strokeStyle = '#D9654B'; g.lineWidth = 2; for (let x = 8; x < w; x += 28) g.strokeRect(x, 20, 24, 24); for (let x = 8; x < w; x += 28) g.strokeRect(x, 70, 24, 24); g.strokeStyle = '#B5563F'; g.lineWidth = 6; g.strokeRect(2, 2, w - 4, h - 4); });
    const rug = plane(S, 8.2, 1.0, toon(0xffffff, { map: runner }), -1.6, 0.012, -2.7, { rx: -Math.PI / 2 }); mark(P, rug, { floor: 0 });
    // 칸막이 1인 책상 두 줄: 스탠드, 원고지와 만년필 또는 타자기, 칸막이에 꽂힌 메모
    DESK_ROWS.forEach((z, r) => {
      const row = new THREE.Group();
      box(row, 7.4, 0.07, 0.8, 0xB07A4E, -1.65, 0.72, z, { line: 0.02 });
      box(row, 7.3, 0.72, 0.06, 0x8C5A3B, -1.65, 0, z - 0.36, { line: 0.015 });
      [-5.35, 2.05].forEach((x) => box(row, 0.06, 0.72, 0.8, 0x8C5A3B, x + (x < 0 ? 0.03 : -0.03), 0, z, { line: 0.012 }));
      [-5.4, -3.55, -1.65, 0.25, 2.1].forEach((x) => box(row, 0.05, 0.6, 0.8, 0x9BB7D4, x, 0.79, z, { line: 0.012 }));
      box(row, 7.5, 0.6, 0.05, 0x9BB7D4, -1.65, 0.79, z - 0.4, { line: 0.012 });
      DESKS.forEach((x, i) => {
        const n = r * 4 + i + 1;
        lamp(P, row, `S-${n}`, x - 0.55, 0.79, z - 0.2);
        if ((n + r) % 2) { // 타자기
          const tw = new THREE.Group();
          box(tw, 0.5, 0.14, 0.36, 0x3B4A5A, 0, 0, 0, { line: 0.012 });
          const keys = box(tw, 0.44, 0.04, 0.16, 0x2B1C12, 0, 0.12, 0.09, { line: 0.006 }); keys.rotation.x = 0.25;
          const roller = cyl(tw, 0.04, 0.04, 0.5, 0x2B1C12, 0, 0.16, -0.12, { line: 0.006, seg: 10 }); roller.rotation.z = Math.PI / 2;
          const sheet = plane(tw, 0.3, 0.32, toon(0xFFFDF8, { side: THREE.DoubleSide }), 0, 0.33, -0.15, { rx: -0.15 });
          sheet.castShadow = true;
          tw.position.set(x + 0.1, 0.79, z); row.add(tw);
        } else { // 원고지와 만년필
          const grid = canvasTex(128, 160, (g) => { g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, 128, 160); g.strokeStyle = '#D9654B'; g.lineWidth = 1.5; for (let yy = 8; yy < 150; yy += 14) for (let xx = 8; xx < 120; xx += 14) g.strokeRect(xx, yy, 12, 12); g.fillStyle = '#2E241C'; for (let k = 0; k < 9; k++) g.fillRect(10 + k * 14, 12, 8, 6); });
          plane(row, 0.3, 0.38, toon(0xffffff, { map: grid }), x + 0.05, 0.795, z + 0.05, { rx: -Math.PI / 2 });
          const pen = cyl(row, 0.012, 0.012, 0.18, 0x2E241C, x + 0.3, 0.8, z + 0.05, { line: 0.004, seg: 6 }); pen.rotation.set(Math.PI / 2, 0, 0.5);
        }
        [0xFFF3C4, 0xFFFDF8, 0xDCEBF5][n % 3] && box(row, 0.16, 0.16, 0.005, [0xFFF3C4, 0xFFFDF8, 0xDCEBF5][n % 3], x + 0.35, 1.05, z - 0.37, { line: 0.004, cast: false });
      });
      block(P, row); S.add(row);
    });
    P.seats.filter((st) => st.desk).forEach((st) => {
      const ch = new THREE.Group();
      box(ch, 0.48, 0.07, 0.46, 0x6E8B74, 0, 0.4, 0, { line: 0.015 });
      cyl(ch, 0.03, 0.03, 0.4, 0x3B2618, 0, 0, 0, { line: 0.006, seg: 8 });
      [0, 1, 2, 3, 4].forEach((k) => { const leg = box(ch, 0.3, 0.03, 0.04, 0x3B2618, 0, 0.02, 0, { line: 0.004 }); leg.rotation.y = (k / 5) * Math.PI * 2; leg.position.set(Math.cos((k / 5) * Math.PI * 2) * 0.13, 0.02, -Math.sin((k / 5) * Math.PI * 2) * 0.13); });
      box(ch, 0.46, 0.42, 0.06, 0x6E8B74, 0, 0.55, -0.21, { line: 0.012 });
      ch.position.set(st.x, 0, st.z); ch.rotation.y = st.yaw; mark(P, ch, { seat: st.id }); S.add(ch); st.mesh = ch;
    });
    // 오른쪽 필사 벽: 코르크판에 종이를 핀으로
    P.wallTex = canvasTex(1600, 600, () => {});
    const wall = new THREE.Group();
    box(wall, 0.12, 2.6, 6.6, 0x8C5A3B, hw - 0.08, 0.8, -0.9, { line: 0.025 });
    plane(wall, 6.4, 2.4, toon(0xffffff, { map: P.wallTex }), hw - 0.15, 2.1, -0.9, { ry: -Math.PI / 2 });
    plane(wall, 2.0, 0.42, toon(0xffffff, { map: signTex('필사 벽', { bg: '#6E8B74', size: 100 }) }), hw - 0.16, 3.65, -0.9, { ry: -Math.PI / 2 });
    box(wall, 0.4, 0.9, 6.4, 0xB07A4E, hw - 0.25, 0, -0.9, { line: 0.02 });
    box(wall, 0.5, 0.06, 6.6, 0x8C5A3B, hw - 0.3, 0.9, -0.9, { line: 0.012 });
    for (let i = 0; i < 6; i++) { const ink = cyl(wall, 0.06, 0.06, 0.08, [0x2E241C, 0x4F6D8A, 0xB5563F][i % 3], hw - 0.35, 0.96, -3.6 + i * 1.1, { line: 0.006, seg: 10 }); ink.scale.z = 1; }
    mark(P, wall, { hot: 'wall' }); block(P, wall); S.add(wall);
    // 뒤 창가 긴 의자
    box(back, 2.4, 0.42, 0.6, 0x5A3825, 7.5, 0, -6.5, { line: 0.025 });
    P.seats.filter((st) => st.id.startsWith('window')).forEach((st, i) => { const c = box(S, 1.1, 0.08, 0.5, i ? 0xF2D16B : 0xB98DB5, st.x, 0.42, st.z, { line: 0.015 }); mark(P, c, { seat: st.id }); st.mesh = c; });
    // 앞쪽 쉼터: 안락의자 둘, 작은 탁자, 둥근 러그, 낮은 책장, 화분
    rugAt(P, '#5E4A6E', '#3F3150', 31, 7.6, 4.6, 5.0, 3.0);
    P.seats.filter((st) => st.id.startsWith('nook')).forEach((st, i) => velvetArm(P, { id: st.id, x: st.x, z: st.z, yaw: st.yaw, color: i ? 0xD8A24A : 0x8E3E3A, wing: !i }));
    const tea = new THREE.Group(); cyl(tea, 0.2, 0.22, 0.03, BRASS, 0, 0, 0, { line: 0.006 }); cyl(tea, 0.03, 0.03, 0.45, BRASS, 0, 0.03, 0, { line: 0.005, seg: 8 }); cyl(tea, 0.34, 0.34, 0.05, MARBLE, 0, 0.48, 0, { line: 0.012, seg: 22 }); cyl(tea, 0.07, 0.06, 0.1, 0xFFFDF8, 0.1, 0.53, 0, { line: 0.008, seg: 12 }); box(tea, 0.26, 0.05, 0.2, 0x6E8B74, -0.08, 0.53, 0.05, { line: 0.008, ry: 0.4 });
    tea.position.set(7.6, 0, 4.6); block(P, tea); S.add(tea);
    floorLamp(P, 10.6, 6.0);
    // 왼쪽 앞 책장 벽과 책상 위 샹들리에
    const tall = new THREE.Group();
    box(tall, 0.62, 3.5, 5.1, WALNUT, -hw + 0.31, 0, 4.35, { line: 0.03, cast: false });
    shelfFace(P, tall, 4.8, 3.25, 6, 131, -hw + 0.625, 0.12, 4.35, Math.PI / 2);
    box(tall, 0.76, 0.14, 5.26, 0x3B2618, -hw + 0.38, 3.5, 4.35, { line: 0.02, cast: false });
    block(P, tall); left.add(tall);
    chandelier(P, 'K-1', -1.65, -2.9, H, { big: 0.9, small: 0.5 });
    const shelf = new THREE.Group(); box(shelf, 4.2, 1.1, 0.6, 0x55361F, 0, 0, 0, { line: 0.03 }); shelfFace(P, shelf, 4.1, 1.0, 2, 117, 0, 0.05, -0.305, Math.PI); shelf.position.set(-3.5, 0, 6.3); mark(P, shelf, { hot: 'shelf' }); block(P, shelf); S.add(shelf);
    for (let i = 0; i < 5; i++) { const b = box(S, 0.08, 0.26, 0.2, new THREE.Color(BOOK_COLORS[(i * 7) % BOOK_COLORS.length]).getHex(), -5.2 + i * 0.1, 1.1, 6.3, { line: 0.006 }); b.rotation.z = i === 4 ? 0.35 : 0; }
    palm(P, -11.1, -6.2); palm(P, 11.0, -6.2); palm(P, 11.0, 6.2);
    // 천장에 매단 종이학 무리(쉼터 위와 책상 위)
    const CR = [0xE4572E, 0xF2D16B, 0x9BB7D4, 0xFFFDF8, 0xB98DB5, 0x7A9E7E];
    P.cranes = [];
    const rand = seeded(127);
    for (let i = 0; i < 14; i++) P.cranes.push(crane(S, CR[i % CR.length], 5.6 + rand() * 4.0, H - 0.2, 3.4 + rand() * 2.4, 1.8 + rand() * 1.6));
    for (let i = 0; i < 8; i++) P.cranes.push(crane(S, CR[(i + 2) % CR.length], -6 + rand() * 9, H - 0.2, -0.3 + rand() * 0.8, 2.2 + rand() * 1.0));
    // 쉿 팻말
    const hush = plane(S, 1.3, 0.4, toon(0xffffff, { map: signTex('쉿, 꾹꾹 쓰는 중', { bg: '#FFF6E6', fg: '#2E241C', size: 70 }) }), -hw + 0.02, 2.95, -5.4, { ry: Math.PI / 2 });
    hush.castShadow = false;
    P.anim = (dt, t) => {
      P.cranes.forEach((c) => { c.rotation.y = t * 0.25 + c.userData.phase; c.children[1].rotation.z = Math.sin(t * 1.3 + c.userData.phase) * 0.12; });
      people.forEach((person) => { const st = seatOf(person); if (person.place === 'scribe' && st && st.desk && Math.random() < dt * 0.9) sfx('type', hear(person)); });
    };
  };
  // ───────── 3층 토론방 맞불 짓기: 토론 살롱 ─────────
  const PRO = 0x4F8F8A; const CON = 0xD9654B;
  const buildForum = (P) => {
    const S = P.scene;
    const { w: W, d: D, h: H } = FORUM; const hw = W / 2; const hd = D / 2;
    // 헤링본 마루와 벽을 따라 진한 띠
    const boards = canvasTex(2048, 1195, (g, w, h) => {
      const rand = seeded(97); const px = w / W; const band = 0.5 * px;
      g.fillStyle = '#4A2F20'; g.fillRect(0, 0, w, h);
      g.save(); g.beginPath(); g.rect(band, band, w - band * 2, h - band * 2); g.clip();
      const bl = 0.9 * px; const bw = 0.18 * px;
      for (let y = -bl; y < h + bl; y += bw * 2) for (let x = -bl; x < w + bl; x += bl) {
        [0, 1].forEach((k) => {
          const v = (rand() - 0.5) * 22; g.fillStyle = `rgb(${150 + v},${100 + v},${64 + v})`;
          g.save(); g.translate(x + k * bl / 2, y + k * bw); g.rotate(k ? -Math.PI / 4 : Math.PI / 4);
          g.fillRect(0, 0, bl * 0.7, bw); g.strokeStyle = 'rgba(50,30,18,.45)'; g.lineWidth = 1.5; g.strokeRect(0, 0, bl * 0.7, bw); g.restore();
        });
      }
      g.restore();
      g.strokeStyle = '#C9A15E'; g.lineWidth = 5; g.strokeRect(band, band, w - band * 2, h - band * 2);
    });
    const win = { r: 1.3, y0: 0.85, y1: 3.8 };
    const walls = buildRoom(P, { floorTex: boards, wall: 0xEADCC4, side: 0xDFCDB0, sign: '토론방 맞불', windowsAt: FORUM_WINDOWS, w: W, d: D, h: H, win });
    const { back, right } = walls;
    dressRoom(P, walls, { w: W, d: D, h: H, windowsAt: FORUM_WINDOWS, win, pillars: [-10.6, -6.5, 6.5, 10.6], drape: 0x7A3B3B, sconces: [[-1, 3.6], [-1, 5.6]] });
    // 찬·반으로 반씩 물든 타원 러그
    const rugTex = canvasTex(1024, 512, (g, w, h) => {
      g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#4F8F8A'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#D9654B'; g.fillRect(w / 2, 0, w / 2, h);
      g.strokeStyle = '#F4EBDD'; g.lineWidth = 16; g.setLineDash([36, 22]); g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 40, h / 2 - 40, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]); g.lineWidth = 10; g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 20); g.stroke(); g.restore();
      g.fillStyle = '#F4EBDD'; g.font = '700 110px "Gaegu", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('찬', w * 0.18, h / 2); g.fillText('반', w * 0.82, h / 2);
    });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshToonMaterial({ map: rugTex, gradientMap: gradient, transparent: true, alphaTest: 0.1 }));
    rug.rotation.x = -Math.PI / 2; rug.scale.set(9.4, 5.0, 1); rug.position.set(0, 0.012, 0.2); rug.receiveShadow = true; S.add(rug); mark(P, rug, { floor: 0 });
    // 연단: 낮은 무대, 앞 계단, 연단 탁자와 종, 뒤 벽 발제 칠판
    const stage = new THREE.Group();
    box(stage, STAGE.x1 - STAGE.x0, STAGE.h, STAGE.z1 - STAGE.z0, 0x5A3825, 0, 0, (STAGE.z0 + STAGE.z1) / 2, { line: 0.025 });
    const stageTop = plane(stage, STAGE.x1 - STAGE.x0, STAGE.z1 - STAGE.z0, toon(0x7A3B3B), 0, STAGE.h + 0.004, (STAGE.z0 + STAGE.z1) / 2, { rx: -Math.PI / 2 });
    mark(P, stageTop, { floor: 0 });
    box(stage, STAGE.x1 - STAGE.x0 + 0.06, 0.04, 0.06, BRASS, 0, STAGE.h - 0.03, STAGE.z1, { line: 0.006, cast: false });
    box(stage, 1.6, 0.09, 0.32, 0x6E4630, 0, 0, STAGE.z1 + 0.16, { line: 0.012 });
    const lectern = new THREE.Group();
    box(lectern, 0.7, 1.0, 0.45, 0x5E3B27, 0, 0, 0, { line: 0.02 });
    const lt = box(lectern, 0.78, 0.06, 0.55, 0x8C5A3B, 0, 1.0, 0.02, { line: 0.012 }); lt.rotation.x = 0.25;
    plane(lectern, 0.5, 0.16, toon(0xffffff, { map: signTex('맞불', { bg: '#D9654B', size: 100 }) }), 0, 0.72, 0.23);
    const bellL = solid(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xE3A857, { line: 0.008 }); bellL.position.set(0.25, 1.07, 0.1); lectern.add(bellL);
    lectern.position.set(0, STAGE.h, -5.95); stage.add(lectern);
    mark(P, stage, { floor: 0 }); mark(P, lectern, { hot: 'topic' });
    S.add(stage);
    // 발제 칠판: 글감 질문과 이 층에 붙은 발제를 분필로. 놋쇠 틀
    P.board = canvasTex(1024, 512, () => {});
    const boardG = new THREE.Group();
    box(boardG, 4.8, 2.6, 0.1, BRASS, 0, -0.1, -0.01, { line: 0.02 });
    box(boardG, 4.6, 2.4, 0.1, 0x5E3B27, 0, 0, 0, { line: 0.025 });
    plane(boardG, 4.4, 2.2, toon(0xffffff, { map: P.board }), 0, 1.2, 0.06);
    box(boardG, 4.6, 0.06, 0.16, 0x8C5A3B, 0, -0.02, 0.08, { line: 0.01 });
    [[-1.5, 0xFFFDF8], [-1.3, 0xF2D16B], [1.4, 0x9BB7D4]].forEach(([x, c]) => box(boardG, 0.12, 0.025, 0.025, c, x, 0.04, 0.1, { line: 0.004 }));
    boardG.position.set(0, 1.35, -hd + 0.05); back.add(boardG);
    mark(P, boardG, { hot: 'topic' });
    // 토론 탁자(타원)와 찬·반 의자, 위에 샹들리에
    const table = new THREE.Group();
    const top = solid(new THREE.CylinderGeometry(1, 1, 0.07, 40), 0xB07A4E, { line: 0.02 }); top.scale.set(2.2, 1, 0.9); top.position.y = 0.74; table.add(top);
    const apron = solid(new THREE.CylinderGeometry(1, 1, 0.1, 40), 0x8C5A3B, { line: 0.012 }); apron.scale.set(2.05, 1, 0.8); apron.position.y = 0.66; table.add(apron);
    [-1.3, 1.3].forEach((x) => cyl(table, 0.08, 0.1, 0.66, 0x5E3B27, x, 0, 0, { line: 0.012, seg: 10 }));
    const glass = new THREE.Group();
    [0, 0.34].forEach((y) => cyl(glass, 0.1, 0.1, 0.03, 0x5E3B27, 0, y, 0, { line: 0.006, seg: 12 }));
    [-1, 1].forEach((k) => { const c = solid(new THREE.ConeGeometry(0.075, 0.15, 12), 0xDDF0F7, { line: 0.006 }); c.position.y = 0.185 + k * 0.075; c.rotation.x = k > 0 ? Math.PI : 0; glass.add(c); });
    P.sand = [solid(new THREE.ConeGeometry(0.05, 0.08, 10), 0xE3C27A, { line: 0 }), solid(new THREE.ConeGeometry(0.05, 0.08, 10), 0xE3C27A, { line: 0 })];
    P.sand[0].rotation.x = Math.PI; P.sand[0].position.y = 0.3; P.sand[1].position.y = 0.075; P.sand.forEach((m) => glass.add(m));
    glass.position.set(0, 0.775, 0.0); table.add(glass); P.glass = glass;
    [[-0.9, 0.2, 0x4F6D8A], [0.9, -0.15, 0xE3A857]].forEach(([x, z, c]) => { box(table, 0.36, 0.07, 0.26, c, x, 0.775, z, { line: 0.01, ry: 0.3 }); box(table, 0.32, 0.06, 0.24, 0xFFFDF8, x, 0.845, z, { line: 0.01, ry: -0.1 }); });
    [[-1.7, PRO, '찬'], [1.7, CON, '반']].forEach(([x, c, t]) => { const tent = new THREE.Group(); [-1, 1].forEach((k) => { const pl = plane(tent, 0.34, 0.2, toon(0xffffff, { map: signTex(t, { bg: `#${c.toString(16)}`, size: 120, w: 256, h: 160 }), side: THREE.DoubleSide }), 0, 0.09, k * 0.04); pl.rotation.x = k * 0.35; }); tent.position.set(x, 0.775, 0); tent.rotation.y = Math.PI / 2; table.add(tent); });
    table.position.set(0, 0, 0.2); block(P, table); S.add(table);
    chandelier(P, 'F-1', 0, 0.2, H);
    P.seats.filter((st) => st.kind === 'chair').forEach((st) => {
      const c = st.side === 'pro' ? PRO : CON;
      const ch = new THREE.Group();
      [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([a, b]) => cyl(ch, 0.025, 0.02, 0.4, BRASS, a, 0, b, { line: 0.006, seg: 6 }));
      box(ch, 0.5, 0.1, 0.48, c, 0, 0.38, 0, { line: 0.02 });
      box(ch, 0.5, 0.52, 0.09, c, 0, 0.46, -0.21, { line: 0.015 });
      box(ch, 0.54, 0.04, 0.12, BRASS, 0, 0.98, -0.21, { line: 0.006 });
      ch.position.set(st.x, 0, st.z); ch.rotation.y = st.yaw;
      mark(P, ch, { seat: st.id }); S.add(ch); st.mesh = ch;
    });
    // 깃발 둘
    [[-4.0, PRO, '찬성'], [4.0, CON, '반대']].forEach(([x, c, t]) => {
      const f = new THREE.Group();
      cyl(f, 0.18, 0.2, 0.06, 0x3B2618, 0, 0, 0, { line: 0.01 }); cyl(f, 0.025, 0.025, 2.2, BRASS, 0, 0.06, 0, { line: 0.008, seg: 8 });
      const flag = new THREE.Group(); flag.position.set(0.02, 1.95, 0); f.add(flag);
      const flagMat = toon(0xffffff, { map: signTex(t, { bg: `#${c.toString(16)}`, size: 110 }) });
      plane(flag, 0.8, 0.5, flagMat, 0.4, 0, 0.004); plane(flag, 0.8, 0.5, flagMat, 0.4, 0, -0.004, { ry: Math.PI }); f.position.set(x, 0, -1.3); f.rotation.y = x < 0 ? 0.4 : Math.PI - 0.4; S.add(f);
      (P.flags || (P.flags = [])).push(flag);
    });
    // 오른쪽 벽: 대리석 벽난로(맞불)와 안락의자 둘, 뒤쪽 높은 토론 책장
    const fx = hw - 0.35; // 벽난로 가운데 x
    const fire = new THREE.Group();
    box(fire, 0.7, 1.3, 2.6, 0xD9CBB2, fx, 0, 0.5, { line: 0.03 });
    box(fire, 0.9, 0.14, 2.9, MARBLE, fx - 0.1, 1.3, 0.5, { line: 0.02 });
    box(fire, 0.55, 3.6, 1.7, 0xC9604A, fx + 0.1, 1.44, 0.5, { line: 0.03 });
    box(fire, 0.08, 1.2, 1.0, BRASS, fx - 0.18, 2.0, 0.5, { line: 0.01, cast: false });
    plane(fire, 0.9, 1.0, new THREE.MeshLambertMaterial({ color: 0xC4D6D8 }), fx - 0.23, 2.6, 0.5, { ry: -Math.PI / 2 });
    box(fire, 0.12, 0.85, 1.3, 0x2B1C12, fx - 0.36, 0.1, 0.5, { line: 0.015, cast: false });
    [-0.25, 0.25].forEach((z) => { const log = cyl(fire, 0.08, 0.08, 0.7, 0x6B4430, fx - 0.2, 0.12, 0.5 + z, { line: 0.01, seg: 8 }); log.rotation.x = Math.PI / 2; log.rotation.z = z * 0.6; });
    P.flames = [0, 1, 2].map((i) => { const fl = solid(new THREE.ConeGeometry(0.16 - i * 0.03, 0.5 - i * 0.08, 6), [0xF2A43A, 0xF2D16B, 0xE4572E][i], { line: 0.008 }); fl.position.set(fx - 0.23, 0.45, 0.5 + (i - 1) * 0.22); fire.add(fl); return fl; });
    P.fireLight = new THREE.PointLight(0xffa860, 4, 8, 1.3); P.fireLight.position.set(fx - 0.75, 0.8, 0.5); fire.add(P.fireLight);
    P.fireGlow = glow(fire, 0xffb070, 2.4, fx - 0.45, 0.55, 0.5);
    [[0x4F6D8A, 1.2], [0xE3A857, 1.3], [0xFFFDF8, 1.25]].forEach(([c], i) => box(fire, 0.2, 0.28, 0.08, c, fx - 0.15, 1.44, -0.3 + i * 0.35, { line: 0.008 }));
    block(P, fire); S.add(fire);
    rugAt(P, '#2F5D5A', '#22403E', 21, FIRE_X - 0.2, 0.6, 3.0, 4.2);
    ['fire-1', 'fire-2'].forEach((id, i) => { const st = P.seatById(id); velvetArm(P, { id, x: st.x, z: st.z, yaw: st.yaw, color: i ? 0x6E8B74 : 0xD8A24A, wing: true }); });
    const shelf = new THREE.Group();
    box(shelf, 0.65, 3.6, 3.2, WALNUT, 0, 0, 0, { line: 0.03 });
    shelfFace(P, shelf, 3.0, 3.4, 6, 101, -0.33, 0.08, 0, -Math.PI / 2);
    box(shelf, 0.8, 0.14, 3.36, 0x3B2618, -0.07, 3.6, 0, { line: 0.02 });
    shelf.position.set(hw - 0.33, 0, -4.8); mark(P, shelf, { hot: 'shelf' }); block(P, shelf); S.add(shelf);
    // 구경꾼 벤치 둘: 벨벳 방석
    [-2.1, 2.1].forEach((x) => { const b = new THREE.Group(); box(b, 2.4, 0.42, 0.55, 0x5A3825, 0, 0, 0, { line: 0.025 }); box(b, 2.4, 0.5, 0.08, 0x5A3825, 0, 0.42, 0.24, { line: 0.02 }); b.position.set(x, 0, 5.92); S.add(b); P.seats.filter((st) => st.kind === 'bench' && Math.sign(st.x) === Math.sign(x)).forEach((st) => { const c = box(S, 1.0, 0.08, 0.48, x < 0 ? PRO : CON, st.x, 0.42, st.z, { line: 0.015 }); mark(P, c, { seat: st.id }); st.mesh = c; }); });
    // 왼쪽 앞 쉼터: 벨벳 소파, 낮은 탁자, 안락의자, 스탠드
    rugAt(P, '#7A3B3B', '#5A2A2A', 22, -7.3, 4.2, 4.8, 3.2);
    velvetSofa(P, FORUM_SOFA); velvetArm(P, FORUM_ARM);
    const low = new THREE.Group();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => box(low, 0.04, 0.4, 0.04, BRASS, a * 0.24, 0, b * 0.39, { line: 0.006 }));
    box(low, 0.6, 0.05, 0.9, MARBLE, 0, 0.4, 0, { line: 0.015 });
    [0, 1].forEach((j) => box(low, 0.3, 0.05, 0.22, j ? 0x4F6D8A : 0xE3A857, 0, 0.45 + j * 0.05, -0.15, { line: 0.008, ry: 0.3 * j }));
    cyl(low, 0.055, 0.045, 0.08, 0xFFFDF8, 0.05, 0.45, 0.22, { line: 0.006, seg: 12 });
    low.position.set(-7.2, 0, 4.2); block(P, low); S.add(low);
    floorLamp(P, -9.7, 5.9);
    palm(P, -11.1, -6.2); palm(P, -11.0, 6.2); palm(P, 11.0, 6.2);
    P.anim = (dt, t) => {
      P.flames.forEach((fl, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.15 + Math.sin(t * 23 + i * 2) * 0.06; fl.scale.set(1, k, 1); fl.rotation.y = t * (1 + i); });
      P.fireLight.intensity = 3.6 + Math.sin(t * 11) * 0.5 + Math.sin(t * 27) * 0.3;
      P.fireGlow.material.opacity = 0.7 + Math.sin(t * 9) * 0.15;
      (P.flags || []).forEach((f, i) => { f.rotation.y = Math.sin(t * 2.2 + i) * 0.18; });
      const k = (t / 30) % 1; P.sand[0].scale.setScalar(1 - k * 0.9); P.sand[1].scale.setScalar(0.1 + k * 0.9);
    };
  };
  // 큰 서고·옥상에도 엘리베이터를 단다
  const addLifts = () => {
    const hallLeft = hall.walls.find((w) => w.nx === 1).group;
    liftDoor(hall, hallLeft, -11.93, 1.75, Math.PI / 2);
    const booth = new THREE.Group();
    box(booth, 1.6, 2.95, 1.1, 0xEFE3CF, -7.0, 0, -7.35, { line: 0.04 });
    box(booth, 1.8, 0.16, 1.3, 0x6B4430, -7.0, 2.95, -7.35, { line: 0.03 });
    liftDoor(roof, booth, -7.0, -6.78, 0);
    block(roof, booth); roof.scene.add(booth);
  };

  buildHall(hall);
  buildRoof(roof);
  buildCafe(cafe);
  buildForum(forum);
  buildScribe(scribe);
  buildCave(cave);
  addHatch();
  addLifts();

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
    Object.values(PLACES).filter((P) => !P.fixedLight).forEach((P) => {
      P.hemi.color.setHex(T.hemi[0]); P.hemi.groundColor.setHex(T.hemi[1]); P.hemi.intensity = T.hemi[2] * (weather === 'clear' || P.id === 'hall' ? 1 : 0.8);
      P.sun.color.setHex(T.sun[0]); P.sun.intensity = T.sun[1] * (weather === 'clear' ? 1 : 0.55);
    });
    hall.scene.background = new THREE.Color(T.bg);
    hall.sky.userData.draw(skyDraw(tod, true));
    hall.beam.material.opacity = T.beam * (weather === 'clear' ? 1 : 0.4);
    hall.rainGlass.visible = weather === 'rain';
    Object.values(PLACES).filter((P) => P.indoor).forEach((P) => { P.sky.userData.draw(skyDraw(tod, true)); P.rainGlass.visible = weather === 'rain'; P.scene.background = new THREE.Color(T.bg); });
    paintSkyDome(roof);
    roof.nightStars.visible = tod === 'night' && weather === 'clear';
    roof.constellation.material.opacity = tod === 'night' ? 1 : tod === 'dusk' ? 0.7 : 0.35;
    roof.scene.fog.color.setHex(T.fog);
    roof.towerTints.forEach(([m, tint]) => {
      m.emissive.setHex(tod === 'night' || tod === 'dusk' ? 0xffd27a : 0x000000);
      m.color.setHex(tod === 'night' ? 0x2a3048 : tod === 'dusk' ? new THREE.Color(tint).multiplyScalar(0.55).getHex() : tint);
    });
    roof.bulbs.forEach((b) => b.material.color.setHex(T.lamps ? 0xfff1b5 : 0xb8ad90));
    roof.bodyMats.forEach((m) => m.emissive.setHex(tod === 'night' || tod === 'dusk' ? 0xffc77a : 0x000000));
    roof.streetGlow.forEach((g) => { g.visible = T.lamps; });
    roof.poolLight.intensity = T.lamps ? 2.6 : 0;
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
  const maxDist = () => (current && current.maxDist) || 26;
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
      fold(B, lathe([[0, 0.12], [0.42, 0.16], [0.5, 0.26], [0.52, 0.36], [0.47, 0.5], [0.36, 0.62], [0.18, 0.68], [0, 0.69]], 16, 6), GREEN, { sz: 0.92, crease: 45 });
      const eyes3d = [];
      [-1, 1].forEach((k) => {
        fold(B, ico(0.15, 2, 7 + k, 0), GREEN, { x: k * 0.22, y: 0.7, z: 0.12, crease: 45 });
        fold(B, ico(0.1, 2, 9 + k, 0), 0xFFFFFF, { x: k * 0.23, y: 0.74, z: 0.22, sz: 0.7, crease: 45 });
        eyes3d.push(eyeBall(B, k * 0.235, 0.75, 0.29, 0.062));
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
  const whereOf = (person) => {
    if (person.place === 'hall') return levelOf(hall, person.layer, person.x, person.z) === 1 ? '다락 · ' : '';
    const s = seatOf(person);
    return `${PLACES[person.place].tag || PLACES[person.place].label} · ${s && s.side ? (s.side === 'pro' ? '찬성 · ' : '반대 · ') : onStage(person) ? '연단 · ' : ''}`;
  };
  const label = (person) => {
    const sleeping = person.pose !== 'up';
    const where = whereOf(person);
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
    return { gain: Math.max(0, 1 - d / 16) ** 1.5 * (PLACES[me.place].quiet ? 0.55 : 1), pan: clamp((dx * rx + dz * rz) / 8, -0.85, 0.85) };
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
    people.forEach((p) => { const s = seatOf(p); if (s && s.lamp) want.add(`${p.place}:${s.lamp}`); });
    Object.values(PLACES).forEach((P) => Object.entries(P.lamps).forEach(([id, L]) => {
      const sat = want.has(`${P.id}:${id}`);
      const on = night || sat || Boolean(P.alwaysLit);
      if ((on !== L.on || (P.alwaysLit && sat !== L.sat)) && by && by.place === P.id && !night) sfx('lamp', hear(by));
      L.on = on; L.sat = sat;
      L.light.intensity = on ? (sat ? 7 : P.alwaysLit && !night ? 2.2 : 4) : 0;
      L.halo.material.opacity = on ? (sat || night ? 0.9 : 0.5) : 0;
      L.bulb.material.color.setHex(on ? 0xfff1b5 : 0x6b5a3a);
    }));
    lit.clear();
    want.forEach((id) => lit.add(id));
    // 다락에서 누가 자면 스탠드를 낮추고 이불을 펼친다
    const napping = [...people.values()].some((p) => p.place === 'hall' && p.seated === 'loft-futon');
    hall.loftLamp.light.intensity = napping ? 0.8 : night ? 4 : 2.5;
    hall.loftLamp.halo.material.opacity = napping ? 0.3 : 0.9;
    hall.futon.spread.visible = napping; hall.futon.folded.visible = !napping;
  }

  // ───────── 앉기·눕기(깡충 → 털썩/폭신) ─────────
  const HOP = { chair: 0.55, bench: 0.45, beanbag: 0.5, cushion: 0.4, futon: 0.5, hammock: 0.6, lounger: 0.45, stool: 0.75, sofa: 0.45 };
  const WORD = { chair: '털썩', bench: '털썩', beanbag: '폭신', cushion: '폭신', futon: '폭신', hammock: '흔들', lounger: '폭신', stool: '쏙', sofa: '푹신' };
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
    popWord(person, s.side ? (s.side === 'pro' ? '찬성!' : '반대!') : WORD[s.kind]);
    sfx('sit', s.kind, hear(person));
    if (s.desk && person === me && me.status !== 'write') { me.statusBefore = me.status; setMyStatus('write'); }
    if (s.lie && person === me) { setTimeout(() => { if (me.seated === s.id && me.pose === 'up') setPose('sleep'); }, 600); }
    label(person);
    updateLamps(person);
  };
  const getUp = (person, s) => {
    person.seated = null;
    if (s && s.desk && person === me && me.statusBefore) { setMyStatus(me.statusBefore); me.statusBefore = null; }
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
    if (me.hold) data.hold = me.hold;
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
    if (portal.lift) { openLift(); return; }
    if (portal.off) return;
    travelling = true;
    path = null; pending = null; keys.clear();
    sfx(portal.viaLift ? 'ding' : 'door', {});
    fade.classList.add('on');
    setTimeout(() => {
      const to = PLACES[portal.to];
      moveToScene(me, to.id);
      me.layer = portal.arrive.layer; me.x = portal.arrive.x; me.z = portal.arrive.z;
      me.y = heightAt(to, me.layer, me.x, me.z);
      current = to;
      cam.distT = Math.min(cam.distT, maxDist());
      cam.target.set(me.x, me.y + 1, me.z);
      people.forEach((p) => { p.label.hidden = p.place !== current.id; });
      root.querySelector('.lib-place').textContent = to.label;
      label(me); renderPeople(); sendSpot(true);
      setMusic(music);
      setTimeout(() => { fade.classList.remove('on'); travelling = false; }, 120);
    }, 420);
  };
  const portalAt = (P, layer, x, z) => P.portals.find((p) => !p.off && (p.level === levelOf(P, layer, x, z)) && p.zone(x, z));

  // ───────── 쪽지(가구를 눌렀을 때) ─────────
  const card = root.querySelector('.lib-card');
  // 발제 칠판: 글감 질문 + 누군가 "발제:"로 시작하는 말을 하면 칠판에 붙는다(최근 셋)
  const prompts = [...(root.querySelector('template[data-card="board"]')?.content.querySelectorAll('li') || [])].map((li) => li.textContent.trim()).filter(Boolean);
  const topics = [];
  const wrapText = (g, text, maxW) => { const out = []; let line = ''; [...text].forEach((ch) => { if (g.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch; }); if (line) out.push(line); return out; };
  const drawBoard = () => {
    if (!forum.board) return;
    forum.board.userData.draw((g, w, h) => {
      g.fillStyle = '#2F3B33'; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.08; g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % h, 90, 3); g.globalAlpha = 1;
      g.fillStyle = '#F2D16B'; g.font = '700 76px "Gaegu", "Nanum Pen Script", sans-serif'; g.textAlign = 'left'; g.fillText(topics.length ? '오늘의 발제' : '글감 질문', 40, 90);
      const rows = topics.length ? topics.map((t) => [`${t.name}`, t.text]) : prompts.slice(0, 3).map((q, i) => [`${i + 1}`, q]);
      if (!rows.length) rows.push(['', '"발제: …"로 말하면 여기 붙어요']);
      let y = 175;
      rows.forEach(([who, text]) => {
        g.font = '54px "Gaegu", "Nanum Pen Script", sans-serif'; g.fillStyle = '#FFF3DC';
        const lines = wrapText(g, text, w - 260).slice(0, 2);
        g.font = '44px "Gaegu", "Nanum Pen Script", sans-serif'; g.fillStyle = '#9BB7D4'; g.fillText(who, 40, y);
        g.font = '54px "Gaegu", "Nanum Pen Script", sans-serif'; g.fillStyle = '#FFF3DC';
        lines.forEach((ln, i) => g.fillText(ln, 200, y + i * 58));
        y += 58 * lines.length + 26;
      });
    });
  };
  const pinTopic = (person, body) => {
    const text = body.replace(/^\s*(발제|📌)\s*[:：]?\s*/, '').trim();
    if (!text) return;
    topics.unshift({ name: person ? person.name : '누군가', text: text.slice(0, 70) });
    topics.length = Math.min(topics.length, 3);
    drawBoard();
  };
  drawBoard();
  function openTopic() {
    const nodes = [el('p', 'lib-card-kicker', '발제 칠판'), el('h2', '', topics.length ? '오늘의 발제' : '글감 질문')];
    const ol = el('ol', 'lib-card-prompts');
    (topics.length ? topics.map((t) => `${t.name} · ${t.text}`) : prompts).forEach((q) => ol.append(el('li', '', q)));
    if (ol.children.length) nodes.push(ol); else nodes.push(el('p', '', '아직 붙은 발제가 없어요.'));
    nodes.push(el('p', 'lib-card-sub', '"발제: …"로 말하면 칠판에 붙어요. 연단에 서서 말하면 이 층 모두에게 크게 보여요.'));
    const go = el('button', 'lib-menu-none', '발제 붙이기'); go.type = 'button';
    go.addEventListener('click', () => { closeCard(); const input = root.querySelector('.lib-say input'); input.value = '발제: '; input.focus(); });
    nodes.push(go);
    showCard(nodes);
  }
  // 필사 벽: "필사: …"로 한 말이 종이에 적혀 코르크판에 붙는다(최근 여섯)
  const copies = [];
  const drawWall = () => {
    if (!scribe.wallTex) return;
    scribe.wallTex.userData.draw((g, w, h) => {
      g.fillStyle = '#C9A06A'; g.fillRect(0, 0, w, h);
      const rand = seeded(7); g.fillStyle = 'rgba(120,80,40,.25)'; for (let i = 0; i < 900; i++) g.fillRect(rand() * w, rand() * h, 3, 3);
      const items = copies.length ? copies : [{ name: '', text: '"필사: …"로 말하면 한 줄씩 여기 붙어요' }];
      items.forEach((c, i) => {
        const x = 30 + i * 262; const y = 60 + (i % 2) * 40; const rot = ((i * 37) % 7 - 3) * 0.025;
        g.save(); g.translate(x + 115, y + 200); g.rotate(rot); g.translate(-115, -200);
        g.fillStyle = ['#FFFDF8', '#FFF3C4', '#DCEBF5'][i % 3]; g.fillRect(0, 0, 230, 400);
        g.strokeStyle = 'rgba(217,101,75,.35)'; g.lineWidth = 1.5; for (let ly = 76; ly < 360; ly += 46) { g.beginPath(); g.moveTo(14, ly); g.lineTo(216, ly); g.stroke(); }
        g.fillStyle = '#E4572E'; g.beginPath(); g.arc(115, 18, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#2E241C'; g.font = '38px "Gaegu", "Nanum Pen Script", sans-serif';
        wrapText(g, c.text, 200).slice(0, 6).forEach((ln, k) => g.fillText(ln, 16, 68 + k * 46));
        if (c.name) { g.fillStyle = '#8A7660'; g.font = '30px "Gaegu", sans-serif'; g.textAlign = 'right'; g.fillText(`— ${c.name}`, 214, 388); g.textAlign = 'left'; }
        g.restore();
      });
    });
  };
  const pinCopy = (person, body) => {
    const text = body.replace(/^\s*필사\s*[:：]?\s*/, '').trim();
    if (!text) return;
    copies.unshift({ name: person ? person.name : '누군가', text: text.slice(0, 90) });
    copies.length = Math.min(copies.length, 6);
    drawWall();
  };
  drawWall();
  function openWall() {
    const nodes = [el('p', 'lib-card-kicker', '필사 벽'), el('h2', '', '마음에 남은 한 줄')];
    const ol = el('ol', 'lib-card-prompts');
    copies.forEach((c) => ol.append(el('li', '', `${c.text} — ${c.name}`)));
    nodes.push(ol.children.length ? ol : el('p', '', '아직 붙은 필사가 없어요.'));
    nodes.push(el('p', 'lib-card-sub', '"필사: …"로 말하면 종이에 적혀 이 벽에 붙어요. 책상에 앉으면 저절로 \'쓰는 중\'이 돼요.'));
    const go = el('button', 'lib-menu-none', '필사 붙이기'); go.type = 'button';
    go.addEventListener('click', () => { closeCard(); const input = root.querySelector('.lib-say input'); input.value = '필사: '; input.focus(); });
    nodes.push(go);
    showCard(nodes);
  }
  function onStage(person) { return person.place === 'forum' && person.x > STAGE.x0 && person.x < STAGE.x1 && person.z > STAGE.z0 && person.z < STAGE.z1; }
  const openCard = (name) => {
    if (name === 'cafe') { openCafe(); return; }
    if (name === 'topic') { openTopic(); return; }
    if (name === 'wall') { openWall(); return; }
    const template = root.querySelector(`template[data-card="${name}"]`);
    if (!template) return;
    card.querySelector('.lib-card-body').replaceChildren(template.content.cloneNode(true));
    card.hidden = false;
    sfx('paper', true);
    card.querySelector('.lib-card-close').focus({ preventScroll: true });
  };
  const closeCard = () => { if (!card.hidden) sfx('paper', false); card.hidden = true; liftOpen = false; stage.focus({ preventScroll: true }); };
  const showCard = (nodes) => {
    card.querySelector('.lib-card-body').replaceChildren(...nodes);
    card.hidden = false;
    sfx('paper', true);
    card.querySelector('.lib-card-close').focus({ preventScroll: true });
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  // 책 엘리베이터: 층 단추를 누르면 띵 하고 그 층 엘리베이터 앞에서 내린다
  let liftOpen = false;
  function openLift() {
    liftOpen = true;
    const list = el('div', 'lib-lift');
    [...FLOORS].reverse().forEach((id) => {
      const P = PLACES[id];
      const b = el('button', id === current.id ? 'here' : '');
      b.type = 'button';
      b.append(el('b', '', P.short), el('span', '', P.name));
      if (id === current.id) { b.disabled = true; b.append(el('small', '', '지금 여기')); }
      b.addEventListener('click', () => { closeCard(); sfx('ding', {}); setTimeout(() => goPlace({ to: id, arrive: P.liftArrive, viaLift: true }), 380); });
      list.append(b);
    });
    showCard([el('p', 'lib-card-kicker', '책 엘리베이터'), el('h2', '', '몇 층으로 갈까요?'), list]);
  }
  // 사락 카운터: 음료를 고르면 내 인형이 컵을 들고 다닌다(다른 층에도 들고 간다)
  const MENU = [
    { id: 'americano', name: '아메리카노', note: '쌉싸름하게, 밤샘 독서용', top: 0x3B2618 },
    { id: 'latte', name: '카페라테', note: '부드럽게, 한 장만 더', top: 0xD9B48A },
    { id: 'cocoa', name: '핫초코', note: '달달한 결말처럼', top: 0x6B3F2A },
    { id: 'matcha', name: '말차 라테', note: '초록 책갈피 맛', top: 0x9CC27A },
  ];
  function openCafe() {
    const list = el('div', 'lib-menu');
    MENU.forEach((m) => {
      const b = el('button', me && me.hold === m.id ? 'on' : '');
      b.type = 'button';
      b.append(el('b', '', m.name), el('small', '', m.note));
      b.addEventListener('click', () => { closeCard(); order(m.id); });
      list.append(b);
    });
    const nodes = [el('p', 'lib-card-kicker', '사락 카운터'), el('h2', '', '무엇을 마실까요?'), list];
    if (me && me.hold) { const none = el('button', 'lib-menu-none', '빈손으로 다니기'); none.type = 'button'; none.addEventListener('click', () => { closeCard(); order(null); }); nodes.push(none); }
    showCard(nodes);
  }
  function order(id) {
    if (!me) return;
    me.hold = id;
    setHold(me);
    if (id) { sfx('pour', {}); popWord(me, '호로록'); say(`${MENU.find((m) => m.id === id).name} 한 잔 들었어요`); } else popWord(me, '꿀꺽');
    sendSpot(true);
  }
  function setHold(person) {
    const d = person.doll;
    if (d.cup) { d.yaw.remove(d.cup); d.cup = null; }
    const m = MENU.find((x) => x.id === person.hold);
    if (!m) return;
    const cup = new THREE.Group();
    const bodyCup = solid(new THREE.CylinderGeometry(0.075, 0.06, 0.15, 14), 0xFFFDF8, { line: 0.01 }); bodyCup.position.y = 0.075; cup.add(bodyCup);
    const sleeve = solid(new THREE.CylinderGeometry(0.073, 0.066, 0.06, 14, 1, true), 0xC99B6B, { line: 0.008, mat: toon(0xC99B6B, { side: THREE.DoubleSide }) }); sleeve.position.y = 0.07; cup.add(sleeve);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.068, 14), toon(m.top)); top.rotation.x = -Math.PI / 2; top.position.y = 0.145; cup.add(top);
    if (m.id === 'latte') { const heart = new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), toon(0xFFF6E6)); heart.rotation.x = -Math.PI / 2; heart.position.y = 0.147; cup.add(heart); }
    const steam = glow(cup, 0xffffff, 0.18, 0, 0.26, 0); steam.material.opacity = 0.4;
    cup.position.set(0.36, (d.len || 1) * 0.36, 0.2);
    d.yaw.add(cup);
    d.cup = cup;
  }
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
      what.textContent = (person === me ? '나 · ' : '') + whereOf(person)
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
    const held = data.hold || null;
    if (held !== (person.hold || null)) { person.hold = held; setHold(person); }
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
      if (/^\s*필사\s*[:：]/.test(data.body || '')) pinCopy(person || { name: faceOf(data.contributorId)?.dataset.name }, data.body);
      if (/^\s*(발제|📌)\s*[:：]/.test(data.body || '')) pinTopic(person || { name: faceOf(data.contributorId)?.dataset.name }, data.body);
      if (person && person.place === current.id) bubble(person, data.body || '');
      else say(`${person ? `${PLACES[person.place].label} · ` : '모임방 · '}${faceOf(data.contributorId)?.dataset.name || '누군가'}: ${(data.body || '').slice(0, 40)}`);
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
  const SEAT_TIP = { chair: '앉기', bench: '앉기', beanbag: '푹 기대기', cushion: '앉기', futon: '낮잠 자기', hammock: '해먹에 눕기', lounger: '선베드에 눕기' };
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
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; cam.distT = clamp(pinch.dist * (pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))), 6, maxDist()); return; }
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
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); cam.distT = clamp(cam.distT * (1 + event.deltaY * 0.0012), 6, maxDist()); }, { passive: false });
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
    else if (what === 'in') cam.distT = clamp(cam.distT * 0.8, 6, maxDist());
    else if (what === 'out') cam.distT = clamp(cam.distT * 1.25, 6, maxDist());
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
  function setMyStatus(value) {
    me.status = value;
    const sel = root.querySelector('.lib-status select'); if (sel) sel.value = value;
    label(me); renderPeople(); sendSpot(true);
  }
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
    cave: { dawn: { cave: 0.5, piano: 0.2 }, day: { cave: 0.5, piano: 0.22, writing: 0.08 }, dusk: { cave: 0.5, piano: 0.22 }, night: { cave: 0.55, piano: 0.18, crickets: 0.1 } },
    scribe: { dawn: { writing: 0.3, piano: 0.22, grass: 0.12 }, day: { writing: 0.32, piano: 0.24, keyboard: 0.1 }, dusk: { writing: 0.3, piano: 0.24, city: 0.08 }, night: { writing: 0.28, rain: 0.2, piano: 0.2 } },
    forum: { dawn: { piano: 0.34, noise: 0.14 }, day: { piano: 0.36, noise: 0.16, writing: 0.18 }, dusk: { piano: 0.36, noise: 0.18, city: 0.1 }, night: { piano: 0.32, noise: 0.2, crickets: 0.12 } },
    cafe: { dawn: { piano: 0.38, noise: 0.1, writing: 0.12 }, day: { piano: 0.4, noise: 0.18, city: 0.1, writing: 0.14 }, dusk: { piano: 0.4, noise: 0.15, city: 0.16 }, night: { piano: 0.36, noise: 0.12, rain: 0.18 } },
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
    const loud = onStage(person) && current.id === 'forum';
    el.classList.toggle('loud', loud);
    const scale = person === me ? (loud ? 1.15 : 1) : loud ? 1.15 : clamp(1.05 - dist / 26, 0.62, 1);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    el.style.opacity = person === me || loud ? '1' : String(clamp(1.15 - dist / 22, 0.45, 1));
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
          if (portal && !travelling) { if (portal.href || portal.lift) { if (!me.atDoor) { me.atDoor = true; if (portal.lift) openLift(); else openCard('leave'); } } else goPlace(portal); }
          else me.atDoor = false;
        }
        if (!moved && me.walking) sendSpot(true);
        if (moved && !me.walking) me.clock = cadence(me.critter) * 0.7;
        me.walking = moved;
      }
      // 내 인형이 화면 아래쪽 가운데에 오게: 바라보는 쪽으로 조금 앞을 본다(방 밖 허공은 보지 않게)
      const [bx0, bz0, bx1, bz1] = current.bounds;
      const ahead = clamp((cam.dist - 4) * 0.25, 0, 1.8 + cam.dist * 0.06); // 가까이 당기면 내 인형을 가운데에
      const sink = current.sink ? clamp((cam.dist - 26) / (maxDist() - 26), 0, 1) * current.sink : 0;
      project.set(clamp(me.x - Math.sin(cam.yaw) * ahead, bx0 + 3, bx1 - 3), me.y + 0.9 - sink, clamp(me.z - Math.cos(cam.yaw) * ahead, bz0 + 2.5, bz1 - 2.5));
      if (current === roof) { roof.scene.fog.near = cam.dist + 18; roof.scene.fog.far = cam.dist + 150; }
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
    if (current.anim && !reduceMotion) current.anim(dt, t);
    if (current.liftDoors) {
      const D = current.liftDoors; const A = current.liftArrive;
      const want = (me && me.place === current.id && Math.hypot(me.x - A.x, me.z - A.z) < 1.7) || liftOpen ? 1 : 0;
      D.open += (want - D.open) * Math.min(1, dt * 4);
      D.L.position.x = -0.3 - D.open * 0.52; D.R.position.x = 0.3 + D.open * 0.52;
      D.needle.rotation.z = (1 - FLOORS.indexOf(current.id) / Math.max(1, FLOORS.length - 1)) * Math.PI - Math.PI / 2;
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
  root.querySelector('.lib-place').textContent = current.label;
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
  window.__lib3 = { people, PLACES, cam, me: () => me, goTo, goSit, nap, goPlace, current: () => current, findPath, free, stepTo, openCard, order, pinTopic, pinCopy };
  requestAnimationFrame(tick);
}
