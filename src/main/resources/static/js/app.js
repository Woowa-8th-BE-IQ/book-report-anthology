// 덕후감 화면 효과. 번들러 없이 그대로 쓴다.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. 글자 펼침: [data-reveal]의 텍스트를 글자 단위 span으로 나눈다.
  document.querySelectorAll('[data-reveal]').forEach((element) => {
    let index = 0;
    const split = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const fragment = document.createDocumentFragment();
          for (const char of child.textContent) {
            const span = document.createElement('span');
            if (char === ' ') {
              span.className = 'sp';
            } else {
              span.className = 'ch';
              span.textContent = char;
              span.style.setProperty('--i', index++);
            }
            fragment.appendChild(span);
          }
          child.replaceWith(fragment);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          split(child);
        }
      });
    };
    element.setAttribute('aria-label', element.textContent.trim().replace(/\s+/g, ' '));
    split(element);
    [...element.querySelectorAll('.ch, .sp')].forEach((span) => span.setAttribute('aria-hidden', 'true'));
  });

  // 2. 화면에 들어오면 .in을 붙인다. 글자 펼침·밑줄·손글씨 동그라미·진행 막대가 여기서 시작한다.
  const targets = document.querySelectorAll('[data-reveal], .reveal-on-view, .fade-up, .rule, .scribble, .progress-line');
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('in'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
    targets.forEach((target) => observer.observe(target));
  }

  // 3. 이어 읽기: 짧은 글이면 접지 않는다.
  document.querySelectorAll('.fold').forEach((fold) => {
    const toggle = fold.nextElementSibling;
    requestAnimationFrame(() => {
      if (fold.scrollHeight <= fold.clientHeight + 4) {
        fold.classList.add('short');
      }
    });
    if (toggle && toggle.classList.contains('fold-toggle')) {
      toggle.addEventListener('click', () => {
        const open = fold.classList.toggle('open');
        toggle.textContent = open ? '접기' : '이어 읽기';
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  });

  // 4. 글자 수 세기 (한글·이모지 모두 한 글자)
  document.querySelectorAll('[data-count]').forEach((field) => {
    const counter = document.getElementById(field.dataset.count);
    const max = Number(field.dataset.max || 0);
    const min = Number(field.dataset.min || 0);
    const update = () => {
      const length = [...field.value.trim()].length;
      counter.textContent = max ? `${length} / ${max}` : `${length}자`;
      counter.classList.toggle('over', (max && length > max) || (min && length > 0 && length < min));
    };
    field.addEventListener('input', update);
    update();
  });

  // 5. 링크 복사
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const input = document.getElementById(button.dataset.copy);
      try {
        await navigator.clipboard.writeText(input.value);
      } catch (error) {
        input.select();
        document.execCommand('copy');
      }
      const original = button.textContent;
      button.textContent = '복사했어요';
      setTimeout(() => { button.textContent = original; }, 1600);
    });
  });

  // 6. 확인 창(data-confirm)과 두 번 제출 막기. 누른 버튼의 name/value(저장·제출 구분)는 숨은 칸으로 옮겨 살린다.
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.confirm)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    });
  });
  document.querySelectorAll('form[data-once]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const submitter = event.submitter;
      if (submitter && submitter.name) {
        const carry = document.createElement('input');
        carry.type = 'hidden';
        carry.name = submitter.name;
        carry.value = submitter.value;
        form.appendChild(carry);
      }
      form.querySelectorAll('button[type=submit]').forEach((button) => { button.disabled = true; });
    });
  });

  const storage = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 공간이 없으면 넘어간다 */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* 무시 */ } },
  };
  const charCount = (text) => [...(text || '').trim()].length;

  // 7. 쓰기 화면: 자동 저장, 이 기기 사본, 200자 문턱, 제출 전 미리보기
  const writer = document.getElementById('essay-form');
  if (writer) {
    const fields = ['title', 'quote', 'body'].map((name) => writer.querySelector(`[name="${name}"]`));
    const [titleField, quoteField, bodyField] = fields;
    const status = document.getElementById('save-status');
    const submitButton = document.getElementById('submit-button');
    const draftKey = writer.dataset.draftKey;
    const minLength = Number(writer.dataset.bodyMin || 200);
    let serverSavedAt = Number(writer.dataset.savedAt || 0);
    let lastSaved = JSON.stringify(fields.map((f) => f.value));
    let timer = null;
    let maxWaitTimer = null;
    let inFlight = false;
    let leaving = false;

    const snapshot = () => fields.map((f) => f.value);
    const dirty = () => JSON.stringify(snapshot()) !== lastSaved;
    const show = (text, state) => {
      status.textContent = text;
      status.className = 'status' + (state ? ' ' + state : '');
    };

    // 이 기기 사본: 서버에 닿기 전에 창이 닫혀도 글이 남는다
    const keepLocal = () => {
      const [title, quote, body] = snapshot();
      storage.set(draftKey, { title, quote, body, at: Date.now() });
    };

    const save = async ({ keepalive = false } = {}) => {
      clearTimeout(timer);
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
      if (!dirty()) {
        return;
      }
      if (inFlight && !keepalive) {
        timer = setTimeout(save, 800);
        return;
      }
      inFlight = true;
      const sent = JSON.stringify(snapshot());
      const [title, quote, body] = snapshot();
      show('저장 중…', 'saving');
      try {
        const response = await fetch(writer.dataset.autosave, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ title, quote, body }),
          credentials: 'same-origin',
          keepalive,
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.saved) {
          lastSaved = sent;
          serverSavedAt = result.savedAtMillis || Date.now();
          show(`저장됨 · ${result.savedAt}`, 'saved');
          if (!dirty()) {
            storage.remove(draftKey);
          }
        } else {
          show(`저장 안 됨 · ${result.message || '잠시 후 다시 시도할게요'}`, 'failed');
        }
      } catch (error) {
        show('연결이 끊겼어요 · 이 기기에 보관 중', 'failed');
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 2500);
      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(save, 15000);
      }
    };

    // 200자 문턱
    const threshold = document.querySelector('.threshold');
    const thresholdText = document.getElementById('threshold-text');
    const thresholdFill = document.getElementById('threshold-fill');
    const ready = () => titleField.value.trim().length > 0 && charCount(bodyField.value) >= minLength;
    const updateThreshold = () => {
      const length = charCount(bodyField.value);
      thresholdFill.style.setProperty('--t', Math.min(1, length / minLength));
      threshold.classList.toggle('reached', length >= minLength);
      thresholdText.textContent = length >= minLength
        ? `${length.toLocaleString('ko-KR')}자`
        : `제출까지 ${(minLength - length).toLocaleString('ko-KR')}자`;
      if (submitButton) {
        submitButton.setAttribute('aria-disabled', String(!ready()));
      }
    };

    writer.addEventListener('input', () => {
      keepLocal();
      updateThreshold();
      show('쓰는 중…', '');
      schedule();
    });
    updateThreshold();

    // 창을 떠날 때: 남은 변경을 마지막으로 보낸다. 그래도 남으면 붙잡는다.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && dirty()) {
        save({ keepalive: true });
      }
    });
    writer.addEventListener('submit', () => { leaving = true; });
    window.addEventListener('beforeunload', (event) => {
      if (!leaving && dirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    // 이 기기에만 남은 글이 서버보다 새것이면 불러올지 묻는다
    const backup = storage.get(draftKey);
    const restore = document.getElementById('restore');
    if (backup && backup.at > serverSavedAt
        && JSON.stringify([backup.title, backup.quote, backup.body]) !== JSON.stringify(snapshot())) {
      restore.hidden = false;
      restore.querySelector('[data-restore="apply"]').addEventListener('click', () => {
        titleField.value = backup.title || '';
        quoteField.value = backup.quote || '';
        bodyField.value = backup.body || '';
        restore.hidden = true;
        fields.forEach((f) => f.dispatchEvent(new Event('input', { bubbles: true })));
      });
      restore.querySelector('[data-restore="discard"]').addEventListener('click', () => {
        storage.remove(draftKey);
        restore.hidden = true;
      });
    } else if (backup && !dirty()) {
      storage.remove(draftKey);
    }

    // 제출 전 미리보기: 책 한 쪽에 실린 모습
    const dialog = document.getElementById('preview');
    if (submitButton && dialog && typeof dialog.showModal === 'function') {
      let confirmed = false;
      submitButton.addEventListener('click', (event) => {
        if (confirmed) {
          return;
        }
        event.preventDefault();
        if (!ready()) {
          show(`제목과 ${minLength}자 이상의 본문이 있어야 제출할 수 있어요`, 'failed');
          (titleField.value.trim() ? bodyField : titleField).focus();
          return;
        }
        document.getElementById('preview-byline').textContent = writer.dataset.byline;
        document.getElementById('preview-title').textContent = titleField.value.trim();
        const quote = quoteField.value.trim();
        document.getElementById('preview-quote').hidden = !quote;
        document.getElementById('preview-quote-text').textContent = quote;
        document.getElementById('preview-citation').textContent = `— ${writer.dataset.citation}`;
        const body = document.getElementById('preview-body');
        body.replaceChildren(...bodyField.value.replace(/\r\n/g, '\n').split(/\n\s*\n/)
          .map((block) => block.trim().replace(/\s*\n\s*/g, ' '))
          .filter(Boolean)
          .map((text) => { const p = document.createElement('p'); p.textContent = text; return p; }));
        dialog.showModal();
        dialog.querySelector('.preview-page').scrollTop = 0;
      });
      dialog.querySelector('[data-preview="close"]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => { if (event.target === dialog) { dialog.close(); } });
      dialog.querySelector('[data-preview="submit"]').addEventListener('click', () => {
        confirmed = true;
        dialog.close();
        writer.requestSubmit(submitButton);
      });
    }
  }

  // 8. 책장: 읽은 글·새 글 표시, "안 읽은 글" 보기
  const reading = document.querySelector('article[data-read-key]');
  if (reading && reading.dataset.mine !== 'true') {
    const read = new Set(storage.get(reading.dataset.readKey) || []);
    read.add(Number(reading.dataset.essayId));
    storage.set(reading.dataset.readKey, [...read]);
  }

  const shelfSection = document.querySelector('section#shelf[data-code]');
  if (shelfSection && shelfSection.dataset.unlocked === 'true') {
    const code = shelfSection.dataset.code;
    const read = new Set(storage.get(`ab-read-${code}`) || []);
    const lastVisit = Number(storage.get(`ab-visit-${code}`) || 0);
    shelfSection.querySelectorAll('a.essay-card[data-essay-id]').forEach((card) => {
      if (card.dataset.mine === 'true') {
        return;
      }
      if (read.has(Number(card.dataset.essayId))) {
        card.classList.add('is-read');
        card.querySelector('.read-badge').hidden = false;
      } else if (lastVisit && Number(card.dataset.submitted) > lastVisit) {
        card.querySelector('.new-badge').hidden = false;
      }
    });
    storage.set(`ab-visit-${code}`, Date.now());

    const shelf = shelfSection.querySelector('.shelf');
    shelfSection.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const unreadOnly = chip.dataset.filter === 'unread';
        shelf.classList.toggle('only-unread', unreadOnly);
        shelfSection.querySelectorAll('[data-filter]').forEach((other) => {
          other.setAttribute('aria-pressed', String(other === chip));
        });
      });
    });
  }

  // 9. 책이 되는 순간: 누르면 바로 넘어간다
  const scene = document.querySelector('.bind-scene');
  if (scene) {
    scene.addEventListener('click', () => scene.classList.add('skip'));
    scene.addEventListener('animationend', (event) => {
      if (event.animationName === 'scene-out') {
        scene.remove();
      }
    });
  }

  // 10. 타자 소리: 녹음 파일 없이 Web Audio로 짧은 '톡' 소리를 합성한다. 기본은 꺼짐, 이 기기에 기억한다.
  const soundToggle = document.getElementById('typing-sound');
  if (soundToggle && (window.AudioContext || window.webkitAudioContext)) {
    const soundKey = 'ab-typing-sound';
    let enabled = storage.get(soundKey) === true;
    let audio = null;
    let noise = null;
    let lastAt = 0;

    const render = () => {
      soundToggle.setAttribute('aria-pressed', String(enabled));
      soundToggle.querySelector('.label').textContent = enabled ? '타자 소리 켜짐' : '타자 소리 꺼짐';
    };
    const ensureAudio = () => {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        // 짧은 백색 소음 한 조각을 만들어 두고 매번 걸러 쓴다
        noise = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.05), audio.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
        }
      }
      if (audio.state === 'suspended') {
        audio.resume();
      }
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

    soundToggle.hidden = false;
    render();
    soundToggle.addEventListener('click', () => {
      enabled = !enabled;
      storage.set(soundKey, enabled);
      render();
      if (enabled) {
        ensureAudio();
        click('key');
      }
    });

    document.getElementById('essay-form').addEventListener('keydown', (event) => {
      if (!enabled || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (!event.target.matches('input[type=text], textarea')) {
        return;
      }
      const key = event.key;
      let kind = 'key';
      if (key === ' ') kind = 'space';
      else if (key === 'Enter') kind = 'enter';
      else if (key === 'Backspace' || key === 'Delete') kind = 'delete';
      else if (key.length > 1 && key !== 'Process' && key !== 'Unidentified') return; // Shift, 방향키 등
      // 꾹 누르고 있을 때 소리가 쏟아지지 않게
      const at = performance.now();
      if (event.repeat && at - lastAt < 70) {
        return;
      }
      lastAt = at;
      ensureAudio();
      click(kind);
    });
  }

  // 11. 모임방: SSE로 들고 남·말·쓰는 중을 받는다. 보내기는 fetch, JS가 없으면 폼 제출로 동작한다.
  const room = document.querySelector('main.room[data-stream]');
  if (room && window.EventSource) {
    const me = Number(room.dataset.me);
    const talk = document.getElementById('talk');
    const end = document.getElementById('talk-end');
    const form = document.getElementById('talk-form');
    const input = document.getElementById('talk-input');
    const status = document.getElementById('talk-status');
    const typingLine = document.getElementById('typing-line');
    const onlineCount = document.getElementById('online-count');
    const memberOf = (id) => room.querySelector(`.member[data-member="${id}"]`);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seen = new Set([...talk.querySelectorAll('.talk-line[data-id]')].map((line) => Number(line.dataset.id)));
    const typers = new Map();
    const bubbleTimers = new Map();

    const nearBottom = () => talk.scrollHeight - talk.scrollTop - talk.clientHeight < 120;
    const toBottom = () => { talk.scrollTop = talk.scrollHeight; };
    toBottom();

    const showBubble = (member, text, typing) => {
      const bubble = member.querySelector('.bubble');
      clearTimeout(bubbleTimers.get(member));
      bubble.classList.toggle('typing', typing);
      if (typing) {
        bubble.replaceChildren(...['·', '·', '·'].map((dot) => { const span = document.createElement('span'); span.textContent = dot; return span; }));
      } else {
        bubble.textContent = text;
      }
      bubble.hidden = false;
      member.classList.toggle('speaking', !typing);
      bubbleTimers.set(member, setTimeout(() => {
        bubble.hidden = true;
        member.classList.remove('speaking');
      }, typing ? 3500 : 6000));
    };

    // 시선: 누가 말하면 방에 있는 사람들이 그쪽을 본다. 가만히 있을 때는 가끔 두리번거린다.
    const gaze = (member, direction, ms) => {
      const flipped = member.classList.contains('facing-left') ? -1 : 1;
      member.style.setProperty('--gaze', (direction * flipped * 2.6) + 'px');
      clearTimeout(member.gazeTimer);
      member.gazeTimer = setTimeout(() => member.style.removeProperty('--gaze'), ms);
    };
    const lookAt = (speaker) => {
      const at = positionOf(speaker);
      room.querySelectorAll('.member.online').forEach((member) => {
        if (member === speaker) {
          return;
        }
        const dx = at.x - positionOf(member).x;
        gaze(member, Math.abs(dx) < 0.02 ? 0 : Math.sign(dx), 3200);
      });
    };
    if (!reduceMotion) {
      setInterval(() => {
        const idle = [...room.querySelectorAll('.member.online:not(.walking):not(.speaking)')];
        if (idle.length) {
          gaze(idle[Math.floor(Math.random() * idle.length)], Math.random() < 0.5 ? -1 : 1, 1400);
        }
      }, 3800);
    }

    const renderTypers = () => {
      const names = [...typers.keys()].map((id) => memberOf(id)?.dataset.name).filter(Boolean);
      typingLine.textContent = names.length === 0 ? ''
        : names.length === 1 ? `${names[0]}님이 쓰는 중…` : `${names.length}명이 쓰는 중…`;
    };

    const append = (message) => {
      if (seen.has(message.id)) {
        return;
      }
      seen.add(message.id);
      const member = memberOf(message.contributorId);
      if (!member) {
        return;
      }
      const stick = nearBottom() || message.contributorId === me;
      talk.querySelector('.talk-empty')?.remove();
      const callsMe = (message.mentions || []).includes(me);
      const line = document.createElement('li');
      line.className = 'talk-line fresh' + (message.contributorId === me ? ' mine' : '') + (callsMe ? ' calls-me' : '');
      line.dataset.id = message.id;
      line.dataset.author = message.contributorId;
      const avatar = document.createElement('span');
      avatar.className = 'avatar small';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.innerHTML = member.querySelector('.avatar').innerHTML; // 서버가 그린 SVG(사용자 글자 없음)
      const body = document.createElement('div');
      body.className = 'talk-body';
      const who = document.createElement('span');
      who.className = 'talk-who';
      const name = document.createElement('b');
      name.textContent = member.dataset.name;
      const time = document.createElement('time');
      time.textContent = message.at;
      who.append(name, ' ', time);
      const text = document.createElement('p');
      text.textContent = message.body;
      body.append(who, text);
      line.append(avatar, body);
      talk.insertBefore(line, end);
      if (stick) {
        toBottom();
      }
      typers.delete(message.contributorId);
      renderTypers();
      showBubble(member, message.body, false);
      lookAt(member);
      markRead();
    };

    // 어디까지 읽었는지 서버에 남긴다(펫의 안 읽은 수와 이어진다). 화면을 보고 있을 때만.
    let readUpTo = 0;
    let readTimer = null;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      const upTo = Math.max(0, ...seen);
      if (upTo <= readUpTo) return;
      clearTimeout(readTimer);
      readTimer = setTimeout(() => {
        readUpTo = upTo;
        fetch(room.dataset.read, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ upTo: String(upTo) }),
          credentials: 'same-origin',
        }).catch(() => {});
      }, 800);
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);

    // 문집 소식(누가 독후감을 냈다, 내 글에 답글, 마감)은 대화 사이에 한 줄로 끼운다. 저장하지 않는다.
    const appendNews = (news) => {
      const stick = nearBottom();
      talk.querySelector('.talk-empty')?.remove();
      const line = document.createElement('li');
      line.className = `talk-news fresh ${news.kind}`;
      const text = document.createElement('span');
      text.textContent = `${news.title} · ${news.text}`;
      line.append(text);
      if (news.link) {
        const link = document.createElement('a');
        link.href = news.link;
        link.textContent = news.kind === 'due' ? '쓰러 가기' : news.kind === 'reply' ? '답글 보기' : '보러 가기';
        line.append(' ', link);
      }
      talk.insertBefore(line, end);
      if (stick) toBottom();
    };

    // 걷기: (x, y)는 방 바닥에 대한 비율. 거리만큼 천천히, 가는 쪽을 바라보며 깡충깡충 걷는다.
    const walkTimers = new Map();
    const positionOf = (member) => ({
      x: parseFloat(member.style.getPropertyValue('--x')),
      y: parseFloat(member.style.getPropertyValue('--y')),
    });
    const walkTo = (member, x, y, animate) => {
      const from = positionOf(member);
      const distance = Math.hypot(x - from.x, y - from.y);
      if (distance < 0.002) {
        return;
      }
      const seconds = animate && !reduceMotion ? Math.min(1.8, Math.max(0.35, distance * 2.2)) : 0;
      member.style.setProperty('--walk', seconds + 's');
      if (Math.abs(x - from.x) > 0.01) {
        member.classList.toggle('facing-left', x < from.x);
      }
      member.style.setProperty('--x', x);
      member.style.setProperty('--y', y);
      clearTimeout(walkTimers.get(member));
      member.classList.remove('arrived');
      if (seconds > 0) {
        member.classList.add('walking');
        walkTimers.set(member, setTimeout(() => {
          member.classList.remove('walking');
          member.classList.add('arrived');
        }, seconds * 1000));
      }
    };
    const backToSeat = (member) => walkTo(member, Number(member.dataset.seatX), Number(member.dataset.seatY), true);

    const setOnline = (ids) => {
      const online = new Set(ids);
      room.classList.toggle('can-walk', online.has(me));
      room.querySelectorAll('.member[data-member]').forEach((member) => {
        const on = online.has(Number(member.dataset.member));
        if (!on && member.classList.contains('online')) {
          backToSeat(member); // 나가면 제자리로 돌아가 앉는다
        }
        const seen = member.querySelector('.seen');
        if (seen) {
          if (!on && member.classList.contains('online')) {
            seen.textContent = '방금'; // 지금 막 나갔다
          }
          seen.hidden = on;
        }
        member.classList.toggle('online', on);
        member.querySelector('.presence-label').textContent = on ? '들어와 있음' : '자리 비움';
      });
      onlineCount.textContent = online.size;
    };

    const source = new EventSource(room.dataset.stream);
    const parse = (event) => { try { return JSON.parse(event.data); } catch (e) { return null; } };
    source.addEventListener('hello', (event) => {
      const data = parse(event);
      if (!data) {
        return;
      }
      setOnline(data.online);
      Object.entries(data.positions || {}).forEach(([id, at]) => {
        const member = memberOf(id);
        if (member) walkTo(member, at.x, at.y, false);
      });
      room.classList.toggle('can-walk', data.online.includes(me));
      status.textContent = '';
    });
    source.addEventListener('presence', (event) => { const data = parse(event); if (data) setOnline(data.online); });
    // 누가 캐릭터를 바꾸면 자리와 대화의 얼굴을 바로 바꾼다(서버가 그린 SVG, 사용자 글자 없음)
    source.addEventListener('avatar', (event) => {
      const data = parse(event);
      if (!data) return;
      const member = memberOf(data.contributorId);
      if (member) {
        member.querySelector('.avatar').innerHTML = data.svg;
        member.classList.remove('arrived');
        void member.offsetWidth;
        member.classList.add('arrived');
      }
      talk.querySelectorAll(`.talk-line[data-author="${data.contributorId}"] .avatar`).forEach((face) => {
        face.innerHTML = data.svg;
      });
    });
    source.addEventListener('move', (event) => {
      const data = parse(event);
      const member = data && memberOf(data.contributorId);
      if (member && data.contributorId !== me) {
        walkTo(member, data.x, data.y, true);
      }
    });
    source.addEventListener('message', (event) => { const data = parse(event); if (data) append(data); });
    source.addEventListener('news', (event) => { const data = parse(event); if (data) appendNews(data); });
    source.addEventListener('typing', (event) => {
      const data = parse(event);
      if (!data || data.contributorId === me) {
        return;
      }
      clearTimeout(typers.get(data.contributorId));
      typers.set(data.contributorId, setTimeout(() => { typers.delete(data.contributorId); renderTypers(); }, 3500));
      renderTypers();
      const member = memberOf(data.contributorId);
      if (member && !member.classList.contains('speaking')) {
        showBubble(member, '', true);
      }
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CONNECTING) {
        status.textContent = '연결이 잠깐 끊겼어요. 다시 붙는 중…';
      }
    };
    window.addEventListener('pagehide', () => source.close());

    // 내 아바타 옮기기: 바닥을 누르거나, 바닥에 초점을 두고 방향키(WASD도)를 누른다.
    const floor = document.getElementById('floor');
    const mine = memberOf(me);
    let sendTimer = null;
    const sendPosition = (x, y) => {
      clearTimeout(sendTimer);
      sendTimer = setTimeout(() => {
        fetch(room.dataset.position, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams({ x: x.toFixed(3), y: y.toFixed(3) }),
          credentials: 'same-origin',
        }).catch(() => {});
      }, 120);
    };
    // 책상 위로는 못 올라간다: 가운데 원 안을 누르면 책상 가장자리로 밀어낸다.
    const settle = (x, y) => {
      const table = room.querySelector('.table-scene').classList.contains('crowd') ? 0.24 : 0.29;
      let dx = x - 0.5;
      let dy = y - 0.5;
      const r = Math.hypot(dx, dy);
      if (r < table) {
        if (r < 0.001) { dx = 0; dy = 1; } else { dx /= r; dy /= r; }
        x = 0.5 + dx * table;
        y = 0.5 + dy * table;
      }
      const clamp = (v) => Math.min(0.94, Math.max(0.06, v));
      return [clamp(x), clamp(y)];
    };
    const moveMine = (x, y) => {
      if (!mine || !room.classList.contains('can-walk')) {
        return;
      }
      [x, y] = settle(x, y);
      walkTo(mine, x, y, true);
      sendPosition(x, y);
    };
    if (floor && mine) {
      floor.addEventListener('click', (event) => {
        const box = floor.getBoundingClientRect();
        moveMine((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
      });
      const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
        a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
      floor.addEventListener('keydown', (event) => {
        const step = steps[event.key];
        if (!step) {
          return;
        }
        event.preventDefault();
        const at = positionOf(mine);
        moveMine(at.x + step[0] * 0.05, at.y + step[1] * 0.05);
      });
    }

    // 입력: 높이 맞추기, 쓰는 중 알리기(3초에 한 번), Enter로 보내기(한글 조합 중에는 보내지 않는다)
    let lastTyping = 0;
    const fit = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
    input.addEventListener('input', () => {
      fit();
      const now = Date.now();
      if (input.value.trim() && now - lastTyping > 3000) {
        lastTyping = now;
        fetch(room.dataset.typing, { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    let sending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body || sending) {
        return;
      }
      sending = true;
      status.textContent = '';
      try {
        const response = await fetch(room.dataset.say, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' },
          body: new URLSearchParams({ body }),
          credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          input.value = '';
          fit();
          lastTyping = 0;
          append(result); // 실시간 이벤트가 먼저 와도 id로 한 번만 붙는다
        } else {
          status.textContent = result.message || '보내지 못했어요. 잠시 후 다시 시도해 주세요.';
        }
      } catch (error) {
        status.textContent = '연결이 끊겨 보내지 못했어요.';
      } finally {
        sending = false;
        input.focus();
      }
    });
  }

  // 12. 캐릭터 꾸미기: 조각을 고르면 미리보기와 다른 조각의 보기 그림이 함께 바뀐다.
  const dresser = document.getElementById('dresser');
  if (dresser) {
    const order = ['color', 'body', 'eyes', 'mouth', 'extra', 'cheeks'];
    const letter = { color: 'c', body: 'b', eyes: 'e', mouth: 'm', extra: 'x', cheeks: 'k' };
    const hidden = document.getElementById('style-value');
    const image = document.getElementById('dresser-image');
    const base = image.getAttribute('src').replace(/[^/]+\.svg$/, '');
    hidden.disabled = false;

    const current = () => Object.fromEntries(order.map((part) =>
      [part, Number(dresser.querySelector(`input[name="${part}"]:checked`)?.value || 0)]));
    const format = (style) => order.map((part) => letter[part] + style[part]).join('');
    const parse = (text) => {
      const match = /^c(\d+)b(\d)e(\d)m(\d)x(\d)k(\d)$/.exec(text || '');
      return match ? Object.fromEntries(order.map((part, i) => [part, Number(match[i + 1])])) : null;
    };

    const render = (pop) => {
      const style = current();
      hidden.value = format(style);
      image.src = base + hidden.value + '.svg';
      if (pop) {
        image.classList.remove('pop');
        void image.offsetWidth;
        image.classList.add('pop');
      }
      // 각 보기 그림은 "지금 모양에서 그 조각만 바꾼 모양"
      dresser.querySelectorAll('fieldset[data-part]').forEach((fieldset) => {
        const part = fieldset.dataset.part;
        fieldset.querySelectorAll('.option').forEach((option) => {
          const value = Number(option.querySelector('input').value);
          option.querySelector('img').src = base + format({ ...style, [part]: value }) + '.svg';
        });
      });
    };
    const apply = (style) => {
      order.forEach((part) => {
        const input = dresser.querySelector(`input[name="${part}"][value="${style[part]}"]`);
        if (input) input.checked = true;
      });
      render(true);
    };

    dresser.addEventListener('change', () => render(true));
    const counts = Object.fromEntries(order.map((part) =>
      [part, dresser.querySelectorAll(`input[name="${part}"]`).length]));
    const randomButton = dresser.querySelector('[data-dress="random"]');
    const originalButton = dresser.querySelector('[data-dress="original"]');
    randomButton.hidden = false;
    originalButton.hidden = false;
    randomButton.addEventListener('click', () => {
      apply(Object.fromEntries(order.map((part) => [part, Math.floor(Math.random() * counts[part])])));
    });
    originalButton.addEventListener('click', () => {
      const original = parse(dresser.dataset.original);
      if (original) apply(original);
    });
  }

  // 밤·낮 바꾸기. 고르면 이 기기에 기억하고, 고른 적 없으면 기기 설정을 따른다.
  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
    const label = () => toggle.setAttribute('aria-label', isDark() ? '낮의 서재로 바꾸기' : '밤의 서재로 바꾸기');
    label();
    systemDark.addEventListener?.('change', label);
    toggle.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.classList.add('theme-changing');
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* 저장 못 해도 이번 화면은 바뀐다 */ }
      label();
      setTimeout(() => root.classList.remove('theme-changing'), 400);
    });
  }
})();
