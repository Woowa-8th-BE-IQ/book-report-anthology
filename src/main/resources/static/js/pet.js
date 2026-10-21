// 데스크톱 펫 화면. 데스크톱 앱(Electron)이면 window.petApp으로 창을 움직이고, 브라우저에서 열면 그냥 작은 모임방처럼 동작한다.
(() => {
  const app = window.petApp || {
    setInteractive() {}, setExpanded() {}, dragBy() {}, dragEnd() {}, relink() {}, onWalk() {}, attention() {},
  };

  // 투명한 곳은 클릭이 뒤의 앱으로 지나가고, 아바타·말풍선·대화창 위에서만 창이 클릭을 받는다.
  let interactive = null;
  document.addEventListener('mousemove', (event) => {
    const hit = Boolean(event.target.closest('[data-interactive], .pet-bubble'));
    if (hit !== interactive) {
      interactive = hit;
      app.setInteractive(hit);
    }
  });
  document.addEventListener('mouseleave', () => { interactive = false; app.setInteractive(false); });

  document.querySelector('[data-pet="relink"]')?.addEventListener('click', () => app.relink());

  const stage = document.getElementById('pet-stage');
  if (!stage) {
    return;
  }
  const me = Number(stage.dataset.me);
  const avatar = document.getElementById('pet-avatar');
  const panel = document.getElementById('pet-panel');
  const log = document.getElementById('pet-log');
  const bubbles = document.getElementById('pet-bubbles');
  const badge = document.getElementById('pet-badge');
  const onlineCount = document.getElementById('pet-online');
  const form = document.getElementById('pet-form');
  const input = document.getElementById('pet-input');
  const status = document.getElementById('pet-status');
  const seen = new Set([...log.querySelectorAll('[data-id]')].map((line) => Number(line.dataset.id)));
  let unread = 0;

  const faceOf = (id) => document.querySelector(`template[data-face="${id}"]`);
  const scrollLog = () => { log.scrollTop = log.scrollHeight; };

  // 펼치기·접기
  const expand = (open) => {
    if (open === !panel.hidden) {
      return;
    }
    app.setExpanded(open);
    panel.hidden = !open;
    if (open) {
      unread = 0;
      badge.hidden = true;
      bubbles.replaceChildren();
      scrollLog();
      setTimeout(() => input.focus(), 50);
    }
  };
  document.querySelector('[data-pet="collapse"]').addEventListener('click', () => expand(false));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') expand(false); });

  // 아바타: 끌면 창이 따라오고, 그냥 누르면 대화창을 연다.
  let press = null;
  avatar.addEventListener('pointerdown', (event) => {
    press = { x: event.screenX, y: event.screenY, moved: false };
    avatar.setPointerCapture(event.pointerId);
  });
  avatar.addEventListener('pointermove', (event) => {
    if (!press) return;
    const dx = event.screenX - press.x;
    const dy = event.screenY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 4) return;
    press.moved = true;
    app.dragBy(dx, dy);
    press.x = event.screenX;
    press.y = event.screenY;
  });
  avatar.addEventListener('pointerup', () => {
    if (press && !press.moved) {
      expand(panel.hidden);
    } else if (press) {
      app.dragEnd();
    }
    press = null;
  });
  avatar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      expand(panel.hidden);
    }
  });

  // 앱이 걷기 상태를 알려 준다.
  app.onWalk(({ walking, facing }) => {
    avatar.classList.toggle('walking', walking);
    if (facing) avatar.classList.toggle('facing-left', facing === 'left');
  });

  // 가끔 두리번거린다.
  setInterval(() => {
    const flipped = avatar.classList.contains('facing-left') ? -1 : 1;
    avatar.style.setProperty('--gaze', ((Math.random() < 0.5 ? -1 : 1) * 3 * flipped) + 'px');
    setTimeout(() => avatar.style.removeProperty('--gaze'), 1400);
  }, 5200);

  const addLine = (message) => {
    const line = document.createElement('li');
    line.className = 'pet-line' + (message.contributorId === me ? ' mine' : '');
    line.dataset.id = message.id;
    const name = document.createElement('b');
    name.textContent = faceOf(message.contributorId)?.dataset.name || '';
    const text = document.createElement('span');
    text.textContent = message.body;
    line.append(name, text);
    log.append(line);
    while (log.children.length > 60) log.firstElementChild.remove();
    scrollLog();
  };

  const showBubble = (message) => {
    const template = faceOf(message.contributorId);
    const bubble = document.createElement('div');
    bubble.className = 'pet-bubble';
    const face = template ? template.content.firstElementChild.cloneNode(true) : document.createElement('span');
    const body = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = template?.dataset.name || '';
    const text = document.createElement('p');
    text.textContent = message.body;
    body.append(name, text);
    bubble.append(face, body);
    bubble.addEventListener('click', () => expand(true));
    bubbles.append(bubble);
    while (bubbles.children.length > 2) bubbles.firstElementChild.remove();
    setTimeout(() => {
      bubble.classList.add('leaving');
      setTimeout(() => bubble.remove(), 320);
    }, 9000);
  };

  const receive = (message) => {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    addLine(message);
    if (message.contributorId === me) return;
    if (panel.hidden) {
      unread += 1;
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.hidden = false;
      showBubble(message);
      app.attention();
    }
    avatar.classList.remove('excited');
    void avatar.offsetWidth; // 애니메이션 다시 시작
    avatar.classList.add('excited');
  };

  const parse = (event) => { try { return JSON.parse(event.data); } catch (e) { return null; } };
  const source = new EventSource(stage.dataset.stream);
  const online = (event) => { const data = parse(event); if (data) onlineCount.textContent = data.online.length; };
  source.addEventListener('hello', (event) => { online(event); status.textContent = ''; });
  source.addEventListener('presence', online);
  source.addEventListener('message', (event) => { const data = parse(event); if (data) receive(data); });
  source.onerror = () => {
    if (source.readyState === EventSource.CONNECTING) status.textContent = '다시 연결하는 중…';
  };

  let sending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || sending) return;
    sending = true;
    status.textContent = '';
    try {
      const response = await fetch(stage.dataset.say, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' },
        body: new URLSearchParams({ body }),
        credentials: 'same-origin',
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        input.value = '';
        receive(result);
      } else {
        status.textContent = result.message || '보내지 못했어요.';
      }
    } catch (error) {
      status.textContent = '연결이 끊겨 보내지 못했어요.';
    } finally {
      sending = false;
      input.focus();
    }
  });
})();
