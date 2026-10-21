// 데스크톱 펫 화면. 데스크톱 앱(Electron)이면 window.petApp으로 창을 움직이고, 브라우저에서 열면 작은 모임방처럼 동작한다.
// 문집이 여러 개면 문집마다 탭과 실시간 연결을 하나씩 둔다.
(() => {
  const noop = () => {};
  const app = Object.assign({
    setInteractive: noop, setExpanded: noop, dragBy: noop, dragEnd: noop, relink: noop, onWalk: noop,
    attention: noop, onUpdate: noop, applyUpdate: noop, onCommand: noop,
  }, window.petApp || {});
  const canHide = Boolean(window.petApp && window.petApp.hide);

  // 투명한 곳은 클릭이 뒤의 앱으로 지나가고, 아바타·말풍선·창·메뉴 위에서만 창이 클릭을 받는다.
  let interactive = null;
  document.addEventListener('mousemove', (event) => {
    const hit = Boolean(event.target.closest('[data-interactive], .pet-bubble'));
    if (hit !== interactive) {
      interactive = hit;
      app.setInteractive(hit);
    }
  });
  document.addEventListener('mouseleave', () => { interactive = false; app.setInteractive(false); });
  document.querySelector('[data-pet="relink"]')?.addEventListener('click', () => (app.addAnthology || app.relink)());

  const stage = document.getElementById('pet-stage');
  if (!stage) return;

  const avatar = document.getElementById('pet-avatar');
  const face = avatar.querySelector('.pet-face');
  const panel = document.getElementById('pet-panel');
  const bubbles = document.getElementById('pet-bubbles');
  const badge = document.getElementById('pet-badge');
  const menu = document.getElementById('pet-menu');
  const dresser = document.getElementById('pet-dresser');
  const avatarBase = stage.dataset.avatarBase;
  const parse = (event) => { try { return JSON.parse(event.data); } catch (e) { return null; } };
  const restart = (element, className) => {
    element.classList.remove(className);
    void element.offsetWidth; // 애니메이션 다시 시작
    element.classList.add(className);
  };

  // ───────── 문집(탭)마다 ─────────
  const views = new Map();
  document.querySelectorAll('.pet-view[data-view]').forEach((element) => {
    const code = element.dataset.view;
    views.set(code, {
      code,
      element,
      title: element.dataset.title,
      me: Number(element.dataset.me),
      log: element.querySelector('.pet-log'),
      status: element.querySelector('.pet-status'),
      online: element.querySelector('.pet-online'),
      tab: document.querySelector(`.pet-tab[data-tab="${CSS.escape(code)}"]`),
      seen: new Set([...element.querySelectorAll('.pet-line[data-id]')].map((line) => Number(line.dataset.id))),
      unread: 0,
    });
  });
  const many = views.size > 1;
  let selected = views.has(stage.dataset.selected) ? stage.dataset.selected : views.keys().next().value;

  const faceOf = (view, id) => view.element.querySelector(`template[data-face="${id}"]`);
  const svgOf = (template) => template ? template.content.firstElementChild.innerHTML : '';
  const current = () => views.get(selected);
  const scrollLog = (view) => { view.log.scrollTop = view.log.scrollHeight; };

  const renderBadges = () => {
    let total = 0;
    views.forEach((view) => {
      total += view.unread;
      const tabBadge = view.tab?.querySelector('.pet-tab-badge');
      if (tabBadge) {
        tabBadge.hidden = view.unread === 0;
        tabBadge.textContent = view.unread > 99 ? '99+' : view.unread;
      }
    });
    badge.hidden = total === 0;
    badge.textContent = total > 99 ? '99+' : total;
  };

  const showMyFace = () => {
    face.innerHTML = svgOf(faceOf(current(), current().me));
  };

  const select = (code) => {
    if (!views.has(code)) return;
    selected = code;
    views.forEach((view) => {
      view.element.hidden = view.code !== code || !dresser.hidden;
      view.tab?.setAttribute('aria-selected', String(view.code === code));
    });
    menu.querySelectorAll('[data-menu="focus"]').forEach((item) => {
      item.setAttribute('aria-checked', String(item.dataset.code === code));
    });
    if (!panel.hidden) {
      current().unread = 0;
      renderBadges();
      scrollLog(current());
    }
    showMyFace();
    if (!dresser.hidden) openDresser();
  };

  // ───────── 펼치기·접기 ─────────
  const expand = (open) => {
    if (open === !panel.hidden) return;
    if (!grownForMenu || !open) app.setExpanded(open);
    panel.hidden = !open;
    if (open) {
      current().unread = 0;
      renderBadges();
      bubbles.querySelectorAll('.pet-bubble:not(.pet-update)').forEach((bubble) => bubble.remove());
      scrollLog(current());
      setTimeout(() => current().element.querySelector('input')?.focus(), 50);
    } else {
      closeDresser();
    }
  };
  document.querySelector('[data-pet="collapse"]').addEventListener('click', () => expand(false));
  document.querySelectorAll('.pet-tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => select(tab.dataset.tab));
  });

  // ───────── 메뉴(우클릭) ─────────
  // 접힌 창은 작아서 메뉴가 잘린다. 메뉴가 열린 동안만 창을 키운다.
  let grownForMenu = false;
  const openMenu = () => {
    menu.querySelector('[data-menu="hide"]').hidden = !canHide;
    if (panel.hidden) {
      grownForMenu = true;
      app.setExpanded(true);
    }
    menu.hidden = false;
    menu.querySelector('button')?.focus();
  };
  const closeMenu = ({ keepSize = false } = {}) => {
    menu.hidden = true;
    if (grownForMenu && !keepSize && panel.hidden) app.setExpanded(false);
    grownForMenu = false;
  };
  avatar.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    press = null; // 우클릭(두 손가락 클릭·Ctrl+클릭)은 대화창을 열지 않는다
    if (menu.hidden) openMenu(); else closeMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.hidden && !event.target.closest('#pet-menu') && event.button === 0) closeMenu();
  });
  menu.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-menu]');
    if (!item) return;
    closeMenu({ keepSize: ['chat', 'dress'].includes(item.dataset.menu) });
    switch (item.dataset.menu) {
      case 'chat': expand(true); break;
      case 'dress': expand(true); openDresser(); break;
      case 'focus': select(item.dataset.code); break;
      case 'add': (app.addAnthology || app.relink)(); break;
      case 'hide': window.petApp?.hide?.(); break;
      case 'quit':
        // 새 펫 앱은 완전히 끈다. 예전 펫 앱은 창을 닫는다(메뉴 막대 아이콘은 남는다).
        if (window.petApp?.quit) window.petApp.quit(); else window.close();
        break;
      case 'leave': {
        const view = current();
        if (!window.confirm(`'${view.title}' 문집을 펫에서 뺄까요? 문집에서 나가는 건 아니에요.`)) break;
        await fetch(`/pet/leave?code=${encodeURIComponent(view.code)}`, { method: 'POST', credentials: 'same-origin' });
        window.location.replace('/pet');
        break;
      }
      default:
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!menu.hidden) closeMenu();
    else if (!dresser.hidden) closeDresser();
    else expand(false);
  });
  app.onCommand((command) => {
    if (command === 'dress') { expand(true); openDresser(); }
    if (command === 'chat') expand(true);
    if (command === 'menu') openMenu();
  });

  // ───────── 아바타: 끌면 창이 따라오고, 그냥 누르면 대화창 ─────────
  let press = null;
  avatar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.ctrlKey) return; // 맥의 Ctrl+클릭은 우클릭이다
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
  avatar.addEventListener('pointerup', (event) => {
    const was = press;
    press = null;
    if (!was || event.button !== 0 || event.ctrlKey || !menu.hidden) return;
    if (!was.moved) expand(panel.hidden);
    else app.dragEnd();
  });
  avatar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      expand(panel.hidden);
    }
  });

  app.onWalk(({ walking, facing }) => {
    avatar.classList.toggle('walking', walking);
    if (facing) avatar.classList.toggle('facing-left', facing === 'left');
  });
  setInterval(() => {
    const flipped = avatar.classList.contains('facing-left') ? -1 : 1;
    avatar.style.setProperty('--gaze', ((Math.random() < 0.5 ? -1 : 1) * 3 * flipped) + 'px');
    setTimeout(() => avatar.style.removeProperty('--gaze'), 1400);
  }, 5200);

  // ───────── 새 버전 알림 ─────────
  let updateBubble = null;
  let problemShown = null;
  app.onUpdate(({ status, version, problem }) => {
    if (status !== 'ready') {
      updateBubble?.remove();
      updateBubble = null;
      // 받지 못한 이유가 있으면 한 번 알린다(같은 이유는 다시 띄우지 않는다)
      if (problem && problem !== problemShown) {
        problemShown = problem;
        const note = document.createElement('div');
        note.className = 'pet-bubble pet-update problem';
        const icon = document.createElement('span');
        icon.className = 'mini update-icon';
        icon.textContent = '⚠️';
        const body = document.createElement('div');
        const title = document.createElement('b');
        title.textContent = version ? `새 버전 ${version}을 받지 못했어요` : '업데이트를 확인하지 못했어요';
        const text = document.createElement('p');
        text.textContent = problem;
        body.append(title, text);
        note.append(icon, body);
        note.addEventListener('click', () => note.remove());
        bubbles.prepend(note);
        setTimeout(() => note.remove(), 30000);
      }
      return;
    }
    if (updateBubble) return;
    updateBubble = document.createElement('div');
    updateBubble.className = 'pet-bubble pet-update';
    const icon = document.createElement('span');
    icon.className = 'mini update-icon';
    icon.textContent = '✨';
    const body = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = `새 버전 ${version}`;
    const text = document.createElement('p');
    text.textContent = '준비됐어요. 누르면 바꾸고 다시 켜져요. 그냥 두면 다음에 끌 때 바뀌어요.';
    body.append(title, text);
    updateBubble.append(icon, body);
    updateBubble.addEventListener('click', () => {
      text.textContent = '바꾸는 중…';
      app.applyUpdate();
    });
    bubbles.prepend(updateBubble);
  });

  // ───────── 말 ─────────
  const addLine = (view, message) => {
    const line = document.createElement('li');
    line.className = 'pet-line' + (message.contributorId === view.me ? ' mine' : '');
    line.dataset.id = message.id;
    const name = document.createElement('b');
    name.textContent = faceOf(view, message.contributorId)?.dataset.name || '';
    const text = document.createElement('span');
    text.textContent = message.body;
    line.append(name, text);
    view.log.append(line);
    while (view.log.children.length > 120) view.log.firstElementChild.remove();
    if (view.code === selected) scrollLog(view);
  };

  const showBubble = (view, message) => {
    const template = faceOf(view, message.contributorId);
    const bubble = document.createElement('div');
    bubble.className = 'pet-bubble';
    const mini = template ? template.content.firstElementChild.cloneNode(true) : document.createElement('span');
    const body = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = (many ? `[${view.title}] ` : '') + (template?.dataset.name || '');
    const text = document.createElement('p');
    text.textContent = message.body;
    body.append(name, text);
    bubble.append(mini, body);
    bubble.addEventListener('click', () => { select(view.code); expand(true); });
    bubbles.append(bubble);
    while (bubbles.querySelectorAll('.pet-bubble:not(.pet-update)').length > 2) {
      bubbles.querySelector('.pet-bubble:not(.pet-update)').remove();
    }
    setTimeout(() => {
      bubble.classList.add('leaving');
      setTimeout(() => bubble.remove(), 320);
    }, 9000);
  };

  const receive = (view, message) => {
    if (view.seen.has(message.id)) return;
    view.seen.add(message.id);
    addLine(view, message);
    if (message.contributorId === view.me) return;
    const looking = !panel.hidden && view.code === selected && dresser.hidden;
    if (!looking) {
      view.unread += 1;
      renderBadges();
      if (panel.hidden) {
        showBubble(view, message);
        app.attention();
      }
    }
    restart(avatar, 'excited');
  };

  views.forEach((view) => {
    const source = new EventSource(view.element.dataset.stream);
    const online = (event) => { const data = parse(event); if (data) view.online.textContent = data.online.length; };
    source.addEventListener('hello', (event) => { online(event); view.status.textContent = ''; });
    source.addEventListener('presence', online);
    source.addEventListener('message', (event) => { const data = parse(event); if (data) receive(view, data); });
    source.addEventListener('avatar', (event) => {
      const data = parse(event);
      const template = data && faceOf(view, data.contributorId);
      if (!template) return;
      template.content.firstElementChild.innerHTML = data.svg;
      if (data.contributorId === view.me && view.code === selected) {
        face.innerHTML = data.svg;
        restart(avatar, 'excited');
      }
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CONNECTING) view.status.textContent = '다시 연결하는 중…';
    };

    const form = view.element.querySelector('.pet-form');
    const input = form.querySelector('input');
    let sending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body || sending) return;
      sending = true;
      view.status.textContent = '';
      try {
        const response = await fetch(view.element.dataset.say, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' },
          body: new URLSearchParams({ body }),
          credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          input.value = '';
          receive(view, result);
        } else {
          view.status.textContent = result.message || '보내지 못했어요.';
        }
      } catch (error) {
        view.status.textContent = '연결이 끊겨 보내지 못했어요.';
      } finally {
        sending = false;
        input.focus();
      }
    });
  });

  // ───────── 캐릭터 바꾸기 (펫 창 안에서) ─────────
  const order = ['color', 'body', 'eyes', 'mouth', 'extra', 'cheeks'];
  const letter = { color: 'c', body: 'b', eyes: 'e', mouth: 'm', extra: 'x', cheeks: 'k' };
  const toStyle = (text) => {
    const match = /^c(\d+)b(\d)e(\d)m(\d)x(\d)k(\d)$/.exec(text || '');
    return match ? Object.fromEntries(order.map((part, i) => [part, Number(match[i + 1])])) : null;
  };
  const format = (style) => order.map((part) => letter[part] + style[part]).join('');
  const preview = dresser.querySelector('.dress-preview');
  const dressStatus = dresser.querySelector('.dress-status');
  let draft = null;

  const renderDresser = () => {
    preview.src = avatarBase + format(draft) + '.svg';
    dresser.querySelectorAll('.dress-part').forEach((row) => {
      const part = row.dataset.part;
      row.querySelectorAll('.dress-option').forEach((option) => {
        const value = Number(option.dataset.value);
        option.querySelector('img').src = avatarBase + format({ ...draft, [part]: value }) + '.svg';
        option.setAttribute('aria-pressed', String(draft[part] === value));
      });
    });
  };
  function openDresser() {
    const view = current();
    draft = toStyle(view.element.dataset.style) || toStyle(view.element.dataset.original);
    if (!draft) return;
    dresser.querySelector('.dress-where').textContent = many ? `'${view.title}'에서의 모습` : '';
    dressStatus.textContent = '';
    views.forEach((each) => { each.element.hidden = true; });
    dresser.hidden = false;
    renderDresser();
  }
  function closeDresser() {
    if (dresser.hidden) return;
    dresser.hidden = true;
    views.forEach((view) => { view.element.hidden = view.code !== selected; });
  }
  dresser.addEventListener('click', async (event) => {
    const option = event.target.closest('.dress-option');
    if (option) {
      draft = { ...draft, [option.closest('.dress-part').dataset.part]: Number(option.dataset.value) };
      renderDresser();
      restart(preview, 'pop');
      return;
    }
    const action = event.target.closest('[data-dress]')?.dataset.dress;
    if (action === 'random') {
      draft = Object.fromEntries(order.map((part) => {
        const count = dresser.querySelectorAll(`.dress-part[data-part="${part}"] .dress-option`).length;
        return [part, Math.floor(Math.random() * count)];
      }));
      renderDresser();
      restart(preview, 'pop');
    } else if (action === 'original') {
      draft = toStyle(current().element.dataset.original);
      renderDresser();
      restart(preview, 'pop');
    } else if (action === 'cancel') {
      closeDresser();
    } else if (action === 'save') {
      const view = current();
      dressStatus.textContent = '저장하는 중…';
      try {
        const response = await fetch(view.element.dataset.avatar, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'X-Room': '1' },
          body: new URLSearchParams({ style: format(draft) }),
          credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          dressStatus.textContent = result.message || '저장하지 못했어요.';
          return;
        }
        view.element.dataset.style = result.style;
        const template = faceOf(view, view.me);
        if (template) template.content.firstElementChild.innerHTML = result.svg;
        face.innerHTML = result.svg;
        restart(avatar, 'excited');
        closeDresser();
      } catch (error) {
        dressStatus.textContent = '연결이 끊겨 저장하지 못했어요.';
      }
    }
  });

  select(selected);
  renderBadges();
})();
