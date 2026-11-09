// 꼬깃 서고 효과음: 녹음 파일 없이 Web Audio로 그 자리에서 만든다.
// 발소리는 꼬깃단마다 다르고(뒤뚱 찰박, 느릿 미끈…), 러그 위에서는 먹먹해진다.
// 다른 사람이 내는 소리는 내 화면 가운데서 먼 만큼 작아지고 왼쪽·오른쪽으로 나뉜다(sp = { gain, pan, soft }).
(() => {
  const Context = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let out = null;
  let noise = null;
  let on = false;
  let alt = 0; // 왼발·오른발

  const setup = (context) => {
    ctx = context;
    out = ctx.createGain();
    out.gain.value = 0.8;
    const limiter = ctx.createDynamicsCompressor(); // 여러 소리가 겹쳐도 귀가 아프지 않게
    limiter.threshold.value = -16;
    limiter.ratio.value = 5;
    out.connect(limiter).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  };
  const ensure = () => {
    if (!Context) return false;
    if (!ctx) setup(new Context());
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 소리 하나가 나갈 길: 음량 → (러그 위면 먹먹하게) → 좌우
  const voice = (sp = {}, level = 1) => {
    const gain = (sp.gain ?? 1) * level;
    if (!on || !ctx || gain < 0.02) return null;
    const g = ctx.createGain();
    g.gain.value = gain * (sp.soft ? 0.75 : 1);
    let head = g;
    if (sp.soft) {
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = 620;
      head.connect(muffle);
      head = muffle;
    }
    if (sp.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(sp.pan, -0.9, 0.9);
      head.connect(panner);
      head = panner;
    }
    head.connect(out);
    return g;
  };
  const env = (param, at, peak, attack, decay) => {
    param.setValueAtTime(0.0001, at);
    param.exponentialRampToValueAtTime(peak, at + attack);
    param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };
  // 잡음 한 토막(마찰·종이·발바닥)
  const burst = (d, t, { type = 'bandpass', freq = 1200, to = 0, q = 1, level = 0.3, attack = 0.004, decay = 0.06 }) => {
    const length = attack + decay + 0.03;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const g = ctx.createGain();
    env(g.gain, t, level, attack, decay);
    src.connect(filter).connect(g).connect(d);
    src.start(t, Math.random() * (1.9 - length), length);
  };
  // 음 하나(통통·종·휘파람)
  const tone = (d, t, { type = 'sine', freq = 440, to = 0, glide = 0, level = 0.2, attack = 0.005, decay = 0.2 }) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + (glide || attack + decay));
    const g = ctx.createGain();
    env(g.gain, t, level, attack, decay);
    osc.connect(g).connect(d);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  };
  // 뜯는 줄(베이스·기타): 밝게 시작해 어두워지고, drive면 살짝 찌그러뜨린다
  let curve = null;
  const pluck = (d, t, { type = 'sawtooth', freq = 110, level = 0.2, len = 0.3, cutoff = 800, open = 2000, drive = false }) => {
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(open, t); filter.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(0.25, len));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(level * 0.55, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
    let head = osc;
    if (drive) {
      if (!curve) { curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } }
      const shaper = ctx.createWaveShaper(); shaper.curve = curve; osc.connect(shaper); head = shaper;
    }
    head.connect(filter).connect(g).connect(d);
    osc.start(t); osc.stop(t + len + 0.12);
  };
  // 길게 내는 소리(현·관): 천천히 차오르고, 떨림을 주고, 끝에서 사그라든다
  const swell = (d, t, freq, len, { level = 0.06, wave = 'sawtooth', cutoff = 1500, attack = 0.1, vib = 0.006, detune = 0, q = 0.8 } = {}) => {
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = q;
    const g = ctx.createGain(); const end = t + Math.max(attack + 0.05, len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.setValueAtTime(level, Math.max(t + attack, end - 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
    filter.connect(g).connect(d);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2 + Math.random() * 0.6; const depth = ctx.createGain(); depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(freq * vib, t + Math.min(0.4, len)); lfo.connect(depth);
    (detune ? [-detune, detune] : [0]).forEach((k) => { const osc = ctx.createOscillator(); osc.type = wave; osc.frequency.setValueAtTime(freq * (1 + k), t); depth.connect(osc.frequency); osc.connect(filter); osc.start(t); osc.stop(end + 0.3); });
    lfo.start(t); lfo.stop(end + 0.3);
  };
  // 노래(우~ 아~): 톱니파 둘에 떨림을 주고 모음 공명(포먼트) 둘로 거른다
  const sing = (d, t, freq, len, level) => {
    const vib = ctx.createOscillator(); vib.frequency.value = 5.4; const depth = ctx.createGain(); depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.35, len)); vib.connect(depth);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.06);
    g.gain.setValueAtTime(level, t + Math.max(0.07, len - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.12);
    const vowel = freq > 500 ? [650, 1080] : [420, 820];
    vowel.forEach((f, i) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; const v = ctx.createGain(); v.gain.value = i ? 0.6 : 1; bp.connect(v).connect(g); [0, 0.006].forEach((det) => { const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq * (1 + det), t); depth.connect(osc.frequency); osc.connect(bp); osc.start(t); osc.stop(t + len + 0.15); }); });
    const lp = ctx.createGain(); lp.gain.value = 2.2; g.connect(lp).connect(d);
    vib.start(t); vib.stop(t + len + 0.15);
  };
  const thud = (d, t, level) => tone(d, t, { freq: 125, to: 52, level, attack: 0.003, decay: 0.15 });
  const poof = (d, t, level, decay = 0.24) => burst(d, t, { type: 'lowpass', freq: 950, to: 150, level, attack: 0.014, decay });
  // 나무 삐걱: 불규칙하게 걸리는 마찰을 나무 울림통에 통과시킨다
  const creak = (d, t, dur, base, level) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    for (let i = 1; i <= 8; i++) osc.frequency.linearRampToValueAtTime(base * (0.65 + Math.random() * 0.8), t + (dur * i) / 8);
    const wood = ctx.createBiquadFilter();
    wood.type = 'bandpass';
    wood.frequency.value = 1100;
    wood.Q.value = 6;
    const grain = ctx.createBiquadFilter();
    grain.type = 'peaking';
    grain.frequency.value = 2300;
    grain.gain.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.04);
    g.gain.setValueAtTime(level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(wood).connect(grain).connect(g).connect(d);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };
  // 빈백 속 알갱이가 사르륵
  const beads = (d, t, dur, level) => {
    for (let i = 0; i < 20; i++) {
      burst(d, t + Math.random() * dur, { type: 'highpass', freq: 2800 + Math.random() * 2800, level: level * (0.35 + Math.random() * 0.65), attack: 0.001, decay: 0.01 + Math.random() * 0.014 });
    }
  };
  const bellHit = (d, t, f, level) => {
    [[1, 1], [2.76, 0.42], [5.4, 0.22], [8.93, 0.1]].forEach(([ratio, amount]) => {
      tone(d, t, { freq: f * ratio, level: level * amount, attack: 0.002, decay: 1.5 / Math.sqrt(ratio) });
    });
  };

  // 꼬깃단 발소리
  const STEP = {
    penguin(d, t, side) { // 찰박: 넓적한 발바닥
      burst(d, t, { freq: 1300 + side * 250, q: 1.6, level: 0.26, decay: 0.045 });
      tone(d, t, { freq: 170, to: 80, level: 0.2, attack: 0.002, decay: 0.06 });
    },
    duck(d, t, side) { // 철퍽: 물갈퀴
      burst(d, t, { freq: 900 + side * 150, q: 2.2, level: 0.22, decay: 0.035 });
      burst(d, t + 0.018, { type: 'highpass', freq: 2800, level: 0.07, decay: 0.03 });
      tone(d, t, { freq: 140, to: 75, level: 0.16, attack: 0.002, decay: 0.05 });
    },
    mole(d, t) { // 사박: 흙 묻은 발로 끌듯이
      burst(d, t, { type: 'lowpass', freq: 1400, to: 500, level: 0.24, attack: 0.02, decay: 0.09 });
    },
    frog(d, t) { // 퐁: 뛰어올랐다 내려앉는다
      tone(d, t, { freq: 240, to: 520, glide: 0.07, level: 0.12, attack: 0.004, decay: 0.09 });
      tone(d, t + 0.11, { freq: 140, to: 70, level: 0.2, attack: 0.002, decay: 0.06 });
      burst(d, t + 0.11, { freq: 1100, q: 1.5, level: 0.1, decay: 0.04 });
    },
    raccoon(d, t, side) { // 톡톡: 발끝으로 살금
      burst(d, t, { freq: 2600 + side * 300, q: 2.5, level: 0.17, decay: 0.022 });
      tone(d, t, { freq: 220, to: 120, level: 0.09, attack: 0.002, decay: 0.035 });
    },
    bookworm(d, t) { // 꼬물: 몸을 접었다 편다
      burst(d, t, { freq: 450, to: 1100, q: 2.5, level: 0.9, attack: 0.03, decay: 0.1 });
    },
    hedgehog(d, t, side) { // 타닥: 작은 발이 빠르게
      burst(d, t, { freq: 3400 + side * 400, q: 3, level: 0.22, decay: 0.016 });
      tone(d, t, { freq: 260, to: 150, level: 0.07, attack: 0.001, decay: 0.025 });
    },
    snail(d, t) { // 미끈… 쪽: 점액이 마루에 붙었다 떨어진다
      burst(d, t, { freq: 360, to: 820, q: 3, level: 1.1, attack: 0.05, decay: 0.16 });
      burst(d, t + 0.17, { freq: 1600, q: 4, level: 0.3, attack: 0.002, decay: 0.03 });
    },
    wood(d, t, side) { // 그 밖: 마루 위 톡
      burst(d, t, { freq: 1700 + side * 200, q: 1.4, level: 0.12, decay: 0.03 });
      tone(d, t, { freq: 150, to: 70, level: 0.2, attack: 0.002, decay: 0.07 });
    },
  };
  const CADENCE = { penguin: 0.27, duck: 0.3, mole: 0.22, frog: 0.42, raccoon: 0.26, bookworm: 0.4, hedgehog: 0.17, snail: 0.62 };

  const play = (sp, level, fn) => {
    const d = voice(sp, level);
    if (d) fn(d, ctx.currentTime + 0.01);
  };

  const api = {
    get on() { return on; },
    /** 켜고 끈다. 처음 켤 때는 누르거나 치는 순간에 불러야 브라우저가 소리를 허락한다. */
    enable(value) { on = Boolean(value) && ensure(); },
    /** 미리듣기·시험용: 다른 오디오 문맥(OfflineAudioContext 등)에 소리를 낸다. */
    attach(context) { setup(context); on = true; },
    cadence: (kind) => CADENCE[kind] || 0.3,
    step(kind, sp) {
      alt = 1 - alt;
      play(sp, 0.6, (d, t) => {
        (STEP[kind] || STEP.wood)(d, t, alt);
        if (sp && sp.stairs) { tone(d, t, { freq: 110, to: 60, level: 0.22, attack: 0.002, decay: 0.09 }); burst(d, t, { freq: 700, q: 1.6, level: 0.08, decay: 0.05 }); } // 계단: 속이 빈 나무 통통
      });
    },
    sit(kind, sp) {
      play(sp, 1, (d, t) => {
        if (kind === 'chair') { creak(d, t, 0.26, 52, 0.15); thud(d, t + 0.2, 0.3); burst(d, t + 0.2, { freq: 900, q: 1.2, level: 0.1, decay: 0.05 }); }
        else if (kind === 'beanbag') { poof(d, t, 0.5, 0.36); beads(d, t + 0.03, 0.45, 0.1); thud(d, t + 0.04, 0.2); }
        else if (kind === 'bench') { poof(d, t, 0.38); thud(d, t + 0.02, 0.3); }
        else if (kind === 'futon') { poof(d, t, 0.55, 0.4); thud(d, t + 0.03, 0.16); }
        else if (kind === 'hammock') { creak(d, t + 0.05, 0.45, 38, 0.08); poof(d, t, 0.22, 0.2); }
        else { poof(d, t, 0.42, 0.22); tone(d, t + 0.05, { freq: 330, to: 250, level: 0.05, decay: 0.12 }); }
      });
    },
    stand(kind, sp) {
      play(sp, 1, (d, t) => {
        if (kind === 'chair') creak(d, t, 0.17, 78, 0.14);
        else if (kind === 'beanbag') { beads(d, t, 0.25, 0.07); poof(d, t, 0.16, 0.16); }
        else burst(d, t, { freq: 700, to: 1500, q: 1, level: 0.1, attack: 0.04, decay: 0.1 });
      });
    },
    act(name, sp) {
      play(sp, 1, (d, t) => {
        if (name === 'bow') { // 꾸벅: 두 음이 내려간다
          tone(d, t, { type: 'triangle', freq: 784, level: 0.13, decay: 0.25 });
          tone(d, t + 0.15, { type: 'triangle', freq: 587, level: 0.13, decay: 0.38 });
        } else if (name === 'stretch') { // 으쌰: 쭉 올라가는 휘파람, 끝에 뾱
          tone(d, t, { type: 'triangle', freq: 260, to: 780, glide: 0.5, level: 0.09, attack: 0.06, decay: 0.48 });
          tone(d, t + 0.56, { freq: 1040, level: 0.08, decay: 0.1 });
        } else if (name === 'flip') { // 사락사락
          for (let i = 0; i < 4; i++) burst(d, t + i * 0.085 + Math.random() * 0.02, { freq: 2600 + Math.random() * 1800, to: 5200, q: 0.9, level: 0.17, attack: 0.008, decay: 0.06 });
        }
      });
    },
    /** 문을 열고 다른 장소로: 삐걱 열리고 바람이 휙 */
    door(sp) {
      play(sp, 1, (d, t) => {
        creak(d, t, 0.42, 34, 0.1);
        burst(d, t + 0.25, { freq: 500, to: 2600, q: 0.7, level: 0.16, attack: 0.12, decay: 0.35 });
        bellHit(d, t + 0.5, 1175, 0.05);
      });
    },
    /** 잠들 때 하품: 길게 내려가는 소리 */
    yawn(sp) {
      play(sp, 1, (d, t) => {
        tone(d, t, { type: 'triangle', freq: 520, to: 230, glide: 0.9, level: 0.07, attack: 0.15, decay: 0.85 });
        burst(d, t + 0.1, { type: 'lowpass', freq: 900, to: 300, level: 0.08, attack: 0.2, decay: 0.7 });
      });
    },
    /** 폴짝: 뛰어오를 때 뿅, 내려앉을 때 통 */
    jump(sp) { play(sp, 1, (d, t) => { tone(d, t, { freq: 320, to: 760, glide: 0.12, level: 0.09, attack: 0.004, decay: 0.14 }); burst(d, t, { freq: 900, to: 2400, q: 0.8, level: 0.06, attack: 0.02, decay: 0.1 }); }); },
    land(sp) { play(sp, 1, (d, t) => { thud(d, t, 0.26); burst(d, t, { type: 'lowpass', freq: 900, to: 200, level: 0.12, attack: 0.008, decay: 0.12 }); }); },
    /** 깜짝 깨기 */
    wake(sp) { play(sp, 1, (d, t) => { tone(d, t, { freq: 600, to: 1300, glide: 0.08, level: 0.08, attack: 0.003, decay: 0.1 }); }); },
    /** 타자기: 탁탁탁, 가끔 줄 끝 땡 */
    type(sp) {
      play(sp, 0.7, (d, t) => {
        const n = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) burst(d, t + i * (0.07 + Math.random() * 0.06), { type: 'highpass', freq: 2600 + Math.random() * 900, level: 0.12, attack: 0.001, decay: 0.03 });
        if (Math.random() < 0.15) bellHit(d, t + n * 0.1 + 0.05, 2637, 0.04);
      });
    },
    /** 책 엘리베이터: 띵— */
    ding(sp) { play(sp, 1, (d, t) => { bellHit(d, t, 1568, 0.1); bellHit(d, t + 0.02, 2349, 0.04); }); },
    /** 음료 따르기: 쪼르륵 올라가는 물소리 */
    pour(sp) {
      play(sp, 1, (d, t) => {
        for (let i = 0; i < 9; i++) tone(d, t + i * 0.055, { freq: 520 + i * 70 + Math.random() * 40, to: 900 + i * 60, glide: 0.04, level: 0.045, attack: 0.004, decay: 0.05 });
        burst(d, t, { type: 'bandpass', freq: 1800, q: 0.7, level: 0.06, attack: 0.05, decay: 0.45 });
      });
    },
    /** 입구 종: 딸랑 */
    bell(sp) { play(sp, 1, (d, t) => { bellHit(d, t, 1320, 0.11); bellHit(d, t + 0.13, 1480, 0.08); bellHit(d, t + 0.27, 1320, 0.05); }); },
    pop(sp) { play(sp, 1, (d, t) => tone(d, t, { freq: 420, to: 980, glide: 0.05, level: 0.11, attack: 0.003, decay: 0.07 })); },
    /**
     * 밴드 한 소리. part: kick·snare·hat·crash·tom·floor(드럼), bass, guitar, keys, vocal.
     * o = { delay(초 뒤), midi, chord[midi…], len(초), level, open(하이햇 열림) }
     */
    band(part, sp, o = {}) {
      play(sp, 1, (d, t0) => {
        const t = t0 + (o.delay || 0);
        const lv = o.level ?? 1;
        const len = o.len || 0.3;
        const hz = (m) => 440 * 2 ** ((m - 69) / 12);
        if (part === 'kick') { tone(d, t, { freq: 150, to: 44, glide: 0.1, level: 0.6 * lv, attack: 0.002, decay: 0.3 }); burst(d, t, { type: 'lowpass', freq: 2800, to: 300, level: 0.1 * lv, attack: 0.001, decay: 0.02 }); }
        else if (part === 'snare') { burst(d, t, { type: 'highpass', freq: 1300, level: 0.3 * lv, attack: 0.001, decay: 0.17 }); tone(d, t, { type: 'triangle', freq: 230, to: 160, level: 0.16 * lv, attack: 0.001, decay: 0.08 }); }
        else if (part === 'hat') burst(d, t, { type: 'highpass', freq: 7600, level: 0.11 * lv, attack: 0.001, decay: o.open ? 0.3 : 0.035 });
        else if (part === 'crash') { burst(d, t, { type: 'highpass', freq: 4200, level: 0.2 * lv, attack: 0.002, decay: 1.5 }); burst(d, t, { type: 'bandpass', freq: 6200, q: 0.6, level: 0.08 * lv, attack: 0.002, decay: 0.9 }); }
        else if (part === 'tom' || part === 'floor') { const f = hz(o.midi || (part === 'tom' ? 50 : 41)); tone(d, t, { freq: f * 1.6, to: f, glide: 0.08, level: 0.42 * lv, attack: 0.002, decay: 0.32 }); burst(d, t, { type: 'lowpass', freq: 1500, level: 0.06 * lv, attack: 0.001, decay: 0.04 }); }
        else if (part === 'bass') { pluck(d, t, { type: 'sawtooth', freq: hz(o.midi), level: 0.2 * lv, len, cutoff: 520, open: 1500 }); pluck(d, t, { type: 'sine', freq: hz(o.midi), level: 0.16 * lv, len, cutoff: 900, open: 900 }); }
        else if (part === 'guitar') { const f = hz(o.midi); [1, 1.4983, 2].forEach((k, i) => pluck(d, t + i * 0.007, { type: 'sawtooth', freq: f * k * (1 + (i - 1) * 0.004), level: 0.05 * lv, len, cutoff: 1900, open: 4200, drive: true })); }
        else if (part === 'keys') (o.chord || [o.midi]).forEach((m) => { const f = hz(m); tone(d, t, { type: 'triangle', freq: f, level: 0.05 * lv, attack: 0.004, decay: len }); tone(d, t, { freq: f * 2, level: 0.016 * lv, attack: 0.003, decay: len * 0.4 }); });
        else if (part === 'vocal') sing(d, t, hz(o.midi), len, 0.11 * lv);
        // 오케스트라: 활로 켜는 현, 숨으로 부는 관, 뜯는 하프, 북채로 치는 팀파니
        else if (part === 'violin') (o.chord || [o.midi]).forEach((m) => swell(d, t, hz(m), len, { level: 0.05 * lv, wave: 'sawtooth', cutoff: 2600, attack: 0.14, vib: 0.008, detune: 0.004 }));
        else if (part === 'cello') swell(d, t, hz(o.midi), len, { level: 0.09 * lv, wave: 'sawtooth', cutoff: 950, attack: 0.16, vib: 0.006, detune: 0.003 });
        else if (part === 'flute') { swell(d, t, hz(o.midi), len, { level: 0.07 * lv, wave: 'sine', cutoff: 5000, attack: 0.06, vib: 0.01 }); burst(d, t, { type: 'bandpass', freq: hz(o.midi) * 2, q: 3, level: 0.02 * lv, attack: 0.03, decay: Math.min(0.4, len) }); }
        else if (part === 'horn') (o.chord || [o.midi]).forEach((m) => swell(d, t, hz(m), len, { level: 0.045 * lv, wave: 'sawtooth', cutoff: 780, attack: 0.1, vib: 0.003, detune: 0.002 }));
        else if (part === 'harp') { const f = hz(o.midi); tone(d, t, { type: 'triangle', freq: f, level: 0.08 * lv, attack: 0.002, decay: Math.max(0.9, len) }); tone(d, t, { freq: f * 2, level: 0.025 * lv, attack: 0.002, decay: 0.5 }); }
        else if (part === 'timpani') { const f = hz(o.midi || 43); const roll = o.roll ? 6 : 1; for (let i = 0; i < roll; i++) { const at = t + i * 0.055; const lvl = (o.roll ? 0.18 + i * 0.03 : 0.42) * lv; tone(d, at, { freq: f * 1.04, to: f, glide: 0.05, level: lvl, attack: 0.003, decay: 0.9 }); tone(d, at, { freq: f * 1.5, level: lvl * 0.3, attack: 0.003, decay: 0.4 }); burst(d, at, { type: 'lowpass', freq: 900, level: 0.05 * lv, attack: 0.001, decay: 0.05 }); } }
        // 재즈: 그랜드 피아노, 콘트라베이스, 색소폰, 라이드 심벌, 브러시
        else if (part === 'piano') (o.chord || [o.midi]).forEach((m, i) => { const f = hz(m); tone(d, t + i * 0.008, { type: 'triangle', freq: f, level: 0.055 * lv, attack: 0.003, decay: len + 0.4 }); tone(d, t + i * 0.008, { freq: f * 2, level: 0.02 * lv, attack: 0.002, decay: 0.35 }); tone(d, t + i * 0.008, { freq: f * 3, level: 0.008 * lv, attack: 0.002, decay: 0.15 }); });
        else if (part === 'upright') { const f = hz(o.midi); pluck(d, t, { type: 'triangle', freq: f, level: 0.3 * lv, len: Math.max(0.25, len), cutoff: 420, open: 1100 }); burst(d, t, { type: 'bandpass', freq: 300, q: 2, level: 0.05 * lv, attack: 0.002, decay: 0.04 }); }
        else if (part === 'sax') { swell(d, t, hz(o.midi), len, { level: 0.07 * lv, wave: 'sawtooth', cutoff: 1500, attack: 0.05, vib: 0.012, detune: 0.003, q: 3 }); burst(d, t, { type: 'bandpass', freq: 2400, q: 1.5, level: 0.025 * lv, attack: 0.02, decay: 0.1 }); }
        else if (part === 'ride') { burst(d, t, { type: 'highpass', freq: 5200, level: 0.07 * lv, attack: 0.001, decay: 0.35 }); tone(d, t, { freq: 3100, level: 0.012 * lv, attack: 0.001, decay: 0.4 }); }
        else if (part === 'brush') burst(d, t, { type: 'bandpass', freq: 3200, q: 0.7, level: 0.09 * lv, attack: 0.05, decay: 0.16 });
        // 어쿠스틱: 통기타(줄을 차례로 긁는다), 우쿨렐레, 카혼
        else if (part === 'aguitar' || part === 'uke') { const notes = o.chord || [o.midi]; const order = o.up ? [...notes].reverse() : notes; const uke = part === 'uke'; order.forEach((m, i) => pluck(d, t + i * (uke ? 0.012 : 0.018), { type: uke ? 'triangle' : 'sawtooth', freq: hz(m), level: (uke ? 0.06 : 0.04) * lv, len, cutoff: uke ? 2400 : 1700, open: uke ? 4200 : 3600 })); }
        else if (part === 'cajon') { tone(d, t, { freq: 110, to: 60, glide: 0.06, level: 0.45 * lv, attack: 0.002, decay: 0.22 }); burst(d, t, { type: 'lowpass', freq: 700, level: 0.08 * lv, attack: 0.001, decay: 0.05 }); }
        else if (part === 'slap') { burst(d, t, { type: 'bandpass', freq: 1900, q: 0.9, level: 0.24 * lv, attack: 0.001, decay: 0.09 }); tone(d, t, { freq: 320, to: 210, level: 0.1 * lv, attack: 0.001, decay: 0.06 }); }
        // 로파이·DJ: 전자 피아노(떨림), 판 잡음, 박수, 낮은 베이스, 짧은 화음
        else if (part === 'rhodes') (o.chord || [o.midi]).forEach((m) => { const f = hz(m); tone(d, t, { freq: f, level: 0.05 * lv, attack: 0.006, decay: len + 0.3 }); tone(d, t, { type: 'triangle', freq: f * 2.001, level: 0.012 * lv, attack: 0.004, decay: 0.5 }); });
        else if (part === 'crackle') for (let i = 0; i < 14; i++) burst(d, t + Math.random() * len, { type: 'highpass', freq: 2500 + Math.random() * 3000, level: 0.03 * lv * Math.random(), attack: 0.001, decay: 0.008 });
        else if (part === 'clap') for (let i = 0; i < 3; i++) burst(d, t + i * 0.012, { type: 'bandpass', freq: 1500, q: 1, level: 0.16 * lv, attack: 0.001, decay: i === 2 ? 0.14 : 0.02 });
        else if (part === 'sub') pluck(d, t, { type: 'sine', freq: hz(o.midi), level: 0.32 * lv, len, cutoff: 300, open: 400 });
        else if (part === 'stab') (o.chord || [o.midi]).forEach((m) => pluck(d, t, { type: 'sawtooth', freq: hz(m), level: 0.028 * lv, len, cutoff: 1100, open: 3000 }));
        // 객석: 박수와 환호
        else if (part === 'applause') { for (let i = 0; i < 16; i++) burst(d, t + Math.random() * 0.9, { type: 'bandpass', freq: 1200 + Math.random() * 1400, q: 1, level: 0.06 * lv, attack: 0.001, decay: 0.03 }); burst(d, t, { type: 'bandpass', freq: 900, q: 0.5, level: 0.05 * lv, attack: 0.15, decay: 0.8 }); }
      });
    },
    /** 물 첨벙: 헤엄칠 때와 튜브에 올라탈 때 */
    splash(sp, level = 1) {
      play(sp, level, (d, t) => {
        burst(d, t, { type: 'bandpass', freq: 1400, to: 500, q: 0.8, level: 0.22, attack: 0.01, decay: 0.22 });
        for (let i = 0; i < 3; i++) tone(d, t + 0.04 + i * 0.05 + Math.random() * 0.03, { freq: 700 + Math.random() * 500, to: 1500 + Math.random() * 600, glide: 0.04, level: 0.035, attack: 0.003, decay: 0.05 });
      });
    },
    tick() { play({}, 1, (d, t) => tone(d, t, { freq: 1900, level: 0.035, attack: 0.001, decay: 0.025 })); },
    paper(open) {
      play({}, 1, (d, t) => {
        burst(d, t, { freq: 1800, to: 4200, q: 0.8, level: 0.15, attack: 0.03, decay: 0.15 });
        if (open) burst(d, t + 0.13, { freq: 3000, to: 5000, q: 0.8, level: 0.08, attack: 0.01, decay: 0.07 });
      });
    },
    nope() {
      play({}, 1, (d, t) => {
        tone(d, t, { type: 'triangle', freq: 262, to: 196, level: 0.1, decay: 0.13 });
        tone(d, t + 0.13, { type: 'triangle', freq: 220, to: 150, level: 0.09, decay: 0.16 });
      });
    },
    twinkle() { play({}, 1, (d, t) => [1047, 1319, 1568, 2093].forEach((f, i) => tone(d, t + i * 0.07, { freq: f, level: 0.07, attack: 0.003, decay: 0.5 }))); },
    /** 스탠드 딸깍 */
    lamp(sp) { play(sp, 1, (d, t) => { burst(d, t, { type: 'highpass', freq: 2500, level: 0.14, attack: 0.001, decay: 0.012 }); tone(d, t, { freq: 2100, level: 0.04, attack: 0.001, decay: 0.02 }); }); },
    scribble() { play({}, 1, (d, t) => { for (let i = 0; i < 3; i++) burst(d, t + i * 0.07, { freq: 3600, q: 3, level: 0.22, attack: 0.01, decay: 0.04 }); }); },
    /** 멀리서 들리는 서고 소리: 책장 넘기는 소리, 책 꽂는 소리, 연필 소리 */
    distant() {
      const sp = { gain: 0.28 + Math.random() * 0.12, pan: Math.random() * 1.6 - 0.8, soft: Math.random() < 0.5 };
      const pick = Math.random();
      play(sp, 1, (d, t) => {
        if (pick < 0.45) for (let i = 0; i < 2; i++) burst(d, t + i * 0.11, { freq: 2400 + Math.random() * 1500, to: 5000, q: 0.9, level: 0.14, attack: 0.01, decay: 0.07 });
        else if (pick < 0.75) { thud(d, t, 0.22); burst(d, t, { freq: 800, q: 1.4, level: 0.08, decay: 0.05 }); burst(d, t + 0.09, { freq: 600, q: 1.4, level: 0.05, decay: 0.04 }); }
        else for (let i = 0; i < 5; i++) burst(d, t + i * 0.06 + Math.random() * 0.03, { freq: 3400 + Math.random() * 600, q: 4, level: 0.06, attack: 0.008, decay: 0.035 });
      });
    },
  };
  window.LibSound = api;
})();
