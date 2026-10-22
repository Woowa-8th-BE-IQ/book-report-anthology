// 배경음: 여러 소리를 겹쳐 틀고, 소리마다 음량을 따로 정한다. 펫이 쓴다.
// 녹음 소리는 Freesound의 CC0 녹음(docs/sound-credits.md), 피아노와 포근한 소음은 여기서 직접 합성한다.
// 녹음은 끝과 처음을 겹쳐(크로스페이드) 이어서 반복할 때 끊기는 소리가 나지 않게 한다.
(() => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;

  const SOUNDS = [
    { id: 'rain', name: '빗소리', icon: 'i-rain', file: 'rain' },
    { id: 'piano', name: '은은한 피아노', icon: 'i-note', synth: 'piano' },
    { id: 'lake', name: '호숫가 물결', icon: 'i-wave', file: 'lake' },
    { id: 'crickets', name: '밤 귀뚜라미', icon: 'i-moon', file: 'crickets' },
    { id: 'grass', name: '바람 부는 풀밭', icon: 'i-wind', file: 'grass' },
    { id: 'cave', name: '동굴 물방울', icon: 'i-drop', file: 'cave' },
    { id: 'city', name: '먼 도시', icon: 'i-city', file: 'city' },
    { id: 'writing', name: '연필 사각', icon: 'i-pencil', file: 'writing' },
    { id: 'keyboard', name: '키보드 톡톡', icon: 'i-keys', file: 'keyboard' },
    { id: 'noise', name: '포근한 소음', icon: 'i-noise', synth: 'noise' },
  ];
  const SCENES = [
    { name: '비 오는 서재', mix: { rain: 0.7, piano: 0.45, writing: 0.25 } },
    { name: '호숫가의 밤', mix: { lake: 0.6, crickets: 0.45, piano: 0.3 } },
    { name: '늦은 밤 작업실', mix: { city: 0.4, keyboard: 0.3, noise: 0.35 } },
    { name: '바람 부는 오후', mix: { grass: 0.6, piano: 0.35 } },
  ];
  const KEY = 'pet-ambience';
  const FADE = 1.6; // 반복할 때 겹치는 초

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const saved = load();
  const state = {
    playing: Boolean(saved.playing),
    master: Number.isFinite(saved.master) ? saved.master : 0.7,
    mix: saved.mix && typeof saved.mix === 'object' ? saved.mix : {},
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 이번만 */ } };

  let audio = null;
  let masterGain = null;
  let reverb = null;
  const layers = new Map(); // id → { gain, stop }
  const buffers = new Map(); // file → Promise<AudioBuffer>
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(api.snapshot()));

  const ensure = () => {
    if (!audio) {
      audio = new Context();
      masterGain = audio.createGain();
      masterGain.gain.value = state.master;
      masterGain.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  };

  // 피아노에 쓰는 잔향: 짧게 사그라드는 잡음으로 공간을 만든다
  const room = () => {
    if (reverb) return reverb;
    const seconds = 3.2;
    const impulse = audio.createBuffer(2, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
    }
    reverb = audio.createConvolver();
    reverb.buffer = impulse;
    return reverb;
  };

  const fetchBuffer = (file) => {
    if (!buffers.has(file)) {
      buffers.set(file, fetch(`/sounds/${file}.mp3`)
        .then((response) => { if (!response.ok) throw new Error(response.status); return response.arrayBuffer(); })
        .then((data) => new Promise((resolve, reject) => audio.decodeAudioData(data, resolve, reject)))
        .catch((error) => { buffers.delete(file); throw error; }));
    }
    return buffers.get(file);
  };

  // 녹음 반복: 끝나기 FADE초 전에 다음 판을 겹쳐 시작한다
  const playLoop = (buffer, out) => {
    let timer = null;
    let stopped = false;
    const sources = new Set();
    const once = (at) => {
      if (stopped) return;
      const source = audio.createBufferSource();
      source.buffer = buffer;
      const fade = audio.createGain();
      const length = buffer.duration;
      const overlap = Math.min(FADE, length / 4);
      fade.gain.setValueAtTime(0, at);
      fade.gain.linearRampToValueAtTime(1, at + overlap);
      fade.gain.setValueAtTime(1, at + length - overlap);
      fade.gain.linearRampToValueAtTime(0, at + length);
      source.connect(fade).connect(out);
      source.start(at);
      sources.add(source);
      source.onended = () => sources.delete(source);
      const next = at + length - overlap;
      timer = setTimeout(() => once(next), Math.max(0, (next - audio.currentTime - 2) * 1000)); // 2초 앞서 걸어 둔다
    };
    once(audio.currentTime + 0.05);
    return () => {
      stopped = true;
      clearTimeout(timer);
      sources.forEach((source) => { try { source.stop(audio.currentTime + 0.6); } catch (e) { /* 이미 끝남 */ } });
    };
  };

  // 포근한 소음: 갈색 잡음을 낮게 거른다
  const playNoise = (out) => {
    const seconds = 8;
    const buffer = audio.createBuffer(2, audio.sampleRate * seconds, audio.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.2;
      }
    }
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(out);
    return playLoop(buffer, filter);
  };

  // 은은한 피아노: 오음 음계에서 몇 초마다 한두 음을 부드럽게 친다(매번 다르게)
  const playPiano = (out) => {
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    const bass = [130.81, 146.83, 196.0, 220.0];
    const wet = audio.createGain();
    wet.gain.value = 0.55;
    const dry = audio.createGain();
    dry.gain.value = 0.6;
    const space = room();
    dry.connect(out);
    wet.connect(out);
    const input = audio.createGain();
    input.connect(dry);
    input.connect(space).connect(wet);
    let timer = null;
    let stopped = false;
    const strike = (frequency, at, level) => {
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(level * 0.35, at + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0008, at + 4.2);
      const tone = audio.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      gain.connect(tone).connect(input);
      [[1, 1], [2, 0.32], [3, 0.12], [4.01, 0.05]].forEach(([ratio, amount]) => {
        const osc = audio.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency * ratio;
        const partial = audio.createGain();
        partial.gain.value = amount;
        osc.connect(partial).connect(gain);
        osc.start(at);
        osc.stop(at + 4.4);
      });
    };
    const phrase = () => {
      if (stopped) return;
      const at = audio.currentTime + 0.05;
      const note = scale[Math.floor(Math.random() * scale.length)];
      strike(note, at, 0.16);
      if (Math.random() < 0.45) strike(scale[Math.floor(Math.random() * scale.length)], at + 0.32 + Math.random() * 0.4, 0.11);
      if (Math.random() < 0.3) strike(bass[Math.floor(Math.random() * bass.length)], at, 0.12);
      timer = setTimeout(phrase, 2200 + Math.random() * 2800);
    };
    phrase();
    return () => { stopped = true; clearTimeout(timer); };
  };

  const start = async (sound) => {
    if (layers.has(sound.id)) return;
    ensure();
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(masterGain);
    const layer = { gain, stop: null, loading: true };
    layers.set(sound.id, layer);
    notify();
    try {
      if (sound.synth === 'piano') layer.stop = playPiano(gain);
      else if (sound.synth === 'noise') layer.stop = playNoise(gain);
      else {
        const buffer = await fetchBuffer(sound.file);
        if (layers.get(sound.id) !== layer) return; // 받는 사이 꺼졌다
        layer.stop = playLoop(buffer, gain);
      }
      layer.loading = false;
      gain.gain.setTargetAtTime(state.mix[sound.id] ?? 0.5, audio.currentTime, 0.4); // 스르륵 커진다
    } catch (error) {
      layers.delete(sound.id);
      gain.disconnect();
      layer.failed = true;
    }
    notify();
  };

  const stop = (id) => {
    const layer = layers.get(id);
    if (!layer) return;
    layers.delete(id);
    layer.gain.gain.setTargetAtTime(0, audio.currentTime, 0.25);
    setTimeout(() => { layer.stop?.(); layer.gain.disconnect(); }, 1200);
  };

  const sync = () => {
    SOUNDS.forEach((sound) => {
      const on = state.playing && state.mix[sound.id] > 0;
      if (on) start(sound); else stop(sound.id);
    });
    notify();
  };

  const api = {
    sounds: SOUNDS,
    scenes: SCENES,
    snapshot: () => ({
      playing: state.playing,
      master: state.master,
      mix: { ...state.mix },
      loading: [...layers.entries()].filter(([, layer]) => layer.loading).map(([id]) => id),
      any: Object.values(state.mix).some((value) => value > 0),
    }),
    subscribe(listener) { listeners.add(listener); listener(api.snapshot()); return () => listeners.delete(listener); },
    /** 소리 하나를 켜고 끈다. 켜면 재생도 켠다. */
    toggle(id) {
      if (state.mix[id] > 0) delete state.mix[id];
      else { state.mix[id] = 0.5; state.playing = true; }
      save();
      sync();
    },
    volume(id, value) {
      state.mix[id] = value;
      if (value <= 0) delete state.mix[id];
      save();
      const layer = layers.get(id);
      if (layer && value > 0) layer.gain.gain.setTargetAtTime(value, audio.currentTime, 0.08);
      else sync();
    },
    setMaster(value) {
      state.master = value;
      save();
      if (masterGain) masterGain.gain.setTargetAtTime(value, audio.currentTime, 0.08);
      notify();
    },
    scene(mix) {
      state.mix = { ...mix };
      state.playing = true;
      save();
      sync();
    },
    play(on = !state.playing) {
      state.playing = on && Object.values(state.mix).some((value) => value > 0);
      save();
      sync();
    },
    clear() {
      state.mix = {};
      state.playing = false;
      save();
      sync();
    },
  };
  window.Ambience = api;

  // 다시 켜지면(펫 재시작·화면 새로 고침) 듣던 소리를 이어서 튼다.
  // 브라우저가 소리를 막으면 처음 누를 때 이어서 튼다.
  if (state.playing) {
    sync();
    const resume = () => {
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
      document.removeEventListener('pointerdown', resume, true);
    };
    document.addEventListener('pointerdown', resume, true);
  }
})();
