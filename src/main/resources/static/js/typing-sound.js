// 타자 소리: 녹음 파일 없이 Web Audio로 짧은 '톡' 소리를 합성한다. 기본은 꺼짐, 이 기기에 기억한다.
// 독후감 쓰기·모임방·펫이 함께 쓴다(같은 기기에서는 켜고 끈 게 함께 바뀐다).
//   [data-typing-sound]         이 안의 글칸에서 키를 누르면 소리가 난다
//   [data-typing-sound-toggle]  누르면 켜고 끈다. 안의 .label에 상태 글자를 쓴다
(() => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;

  const KEY = 'ab-typing-sound';
  const read = () => { try { return localStorage.getItem(KEY) === 'true'; } catch (e) { return false; } };
  const write = (value) => { try { localStorage.setItem(KEY, String(value)); } catch (e) { /* 이번만 */ } };

  let enabled = read();
  let audio = null;
  let noise = null;
  let lastAt = 0;

  const ensureAudio = () => {
    if (!audio) {
      audio = new Context();
      // 짧은 백색 소음 한 조각을 만들어 두고 매번 걸러 쓴다
      noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.05), audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
    }
    if (audio.state === 'suspended') audio.resume();
  };

  // kind: key(일반 글쇠), space(넓고 낮게), enter(묵직하게), delete(가볍게)
  const click = (kind) => {
    const now = audio.currentTime;
    const tone = { key: 2600, space: 1500, enter: 1100, delete: 3200 }[kind];
    const level = { key: 0.22, space: 0.26, enter: 0.32, delete: 0.16 }[kind];
    const jitter = 1 + (Math.random() - 0.5) * 0.18;

    const source = audio.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = jitter;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = tone * jitter;
    band.Q.value = 1.4;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'enter' ? 0.07 : 0.045));
    source.connect(band).connect(gain).connect(audio.destination);
    source.start(now);

    // 바닥에 닿는 낮은 '툭'
    const thump = audio.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime((kind === 'enter' || kind === 'space' ? 150 : 210) * jitter, now);
    thump.frequency.exponentialRampToValueAtTime(70, now + 0.04);
    const thumpGain = audio.createGain();
    thumpGain.gain.setValueAtTime(level * 0.55, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    thump.connect(thumpGain).connect(audio.destination);
    thump.start(now);
    thump.stop(now + 0.06);
  };

  const toggles = () => document.querySelectorAll('[data-typing-sound-toggle]');
  const render = () => {
    toggles().forEach((toggle) => {
      toggle.hidden = false;
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.title = enabled ? '타자 소리 끄기' : '타자 소리 켜기';
      const label = toggle.querySelector('.label');
      if (label) label.textContent = enabled ? '타자 소리 켜짐' : '타자 소리 꺼짐';
    });
  };

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-typing-sound-toggle]')) return;
    enabled = !enabled;
    write(enabled);
    render();
    if (enabled) {
      ensureAudio();
      click('key');
    }
  });

  // 다른 탭(예: 쓰기 화면)에서 바꿔도 따라간다
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) { enabled = read(); render(); }
  });

  document.addEventListener('keydown', (event) => {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (!target.matches?.('input[type=text], input:not([type]), textarea') || !target.closest('[data-typing-sound]')) return;
    const key = event.key;
    let kind = 'key';
    if (key === ' ') kind = 'space';
    else if (key === 'Enter') kind = 'enter';
    else if (key === 'Backspace' || key === 'Delete') kind = 'delete';
    else if (key.length > 1 && key !== 'Process' && key !== 'Unidentified') return; // Shift, 방향키 등
    // 꾹 누르고 있을 때 소리가 쏟아지지 않게
    const at = performance.now();
    if (event.repeat && at - lastAt < 70) return;
    lastAt = at;
    ensureAudio();
    click(kind);
  }, true);

  render();
})();
