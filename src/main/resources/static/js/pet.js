// 데스크톱 펫 화면. 데스크톱 앱(Electron)이면 window.petApp으로 창을 움직이고, 브라우저에서 열면 작은 모임방처럼 동작한다.
// 문집이 여러 개면 문집마다 탭과 실시간 연결을 하나씩 둔다.
(() => {
  const noop = () => {};
  const app = Object.assign({
    setInteractive: noop, setExpanded: noop, dragBy: noop, dragEnd: noop, relink: noop, onWalk: noop,
    attention: noop, onUpdate: noop, applyUpdate: noop, onCommand: noop, onLayout: noop,
  }, window.petApp || {});

  // 투명한 곳은 클릭이 뒤의 앱으로 지나가고, 아바타·말풍선·창·메뉴 위에서만 창이 클릭을 받는다.
  let interactive = null;
  let pressing = () => false; // 아바타를 끄는 중이면 창이 클릭을 놓지 않게(아래에서 채운다)
  document.addEventListener('mousemove', (event) => {
    // 끄는 동안 창이 커서보다 늦게 따라오면 커서가 잠깐 아바타 밖으로 나간다. 그때 클릭을 놓으면
    // 손을 뗀 신호(mouseup)를 못 받아 펫이 마우스에 붙어 다녔다. 끄는 중에는 계속 붙잡는다.
    const hit = pressing() || Boolean(event.target.closest('[data-interactive], .pet-bubble'));
    if (hit !== interactive) {
      interactive = hit;
      app.setInteractive(hit);
    }
  });
  document.addEventListener('mouseleave', () => {
    if (pressing()) return; // 끄는 중에 커서가 창 밖으로 나가도 놓지 않는다(손을 떼면 그 신호가 이 창으로 온다)
    interactive = false;
    app.setInteractive(false);
  });
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
  const creator = document.getElementById('pet-create');
  const soundPanel = document.getElementById('pet-sounds');
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
      // 안 읽은 수는 서버가 기억한다(펫을 다시 켜도 이어진다). called는 그중 나를 부른 말이 있는지.
      unread: Number(element.dataset.unread) || 0,
      called: element.dataset.called === 'true',
      readUpTo: 0,
    });
  });
  const many = views.size > 1;
  let selected = views.has(stage.dataset.selected) ? stage.dataset.selected : views.keys().next().value;

  const faceOf = (view, id) => view.element.querySelector(`template[data-face="${id}"]`);
  const svgOf = (template) => template ? template.content.firstElementChild.innerHTML : '';
  // 대화 한 줄 앞의 작은 캐릭터. 캐릭터를 바꾸면 refreshWho로 그 사람 줄을 모두 바꾼다.
  const whoOf = (view, id) => {
    const who = document.createElement('span');
    who.className = 'pet-who';
    who.dataset.who = id;
    who.innerHTML = svgOf(faceOf(view, id));
    return who;
  };
  const refreshWho = (view, id, svg) => {
    view.log.querySelectorAll(`.pet-who[data-who="${id}"]`).forEach((who) => { who.innerHTML = svg; });
  };
  const current = () => views.get(selected);
  const scrollLog = (view) => { view.log.scrollTop = view.log.scrollHeight; };

  // 나를 부른 말이 있으면 숫자 앞에 "@"를 붙이고 색을 바꾼다
  const label = (count, called) => (called ? '@' : '') + (count > 99 ? '99+' : count);
  const paint = (element, count, called) => {
    if (!element) return;
    element.hidden = count === 0 && !called;
    element.textContent = count === 0 ? '@' : label(count, called);
    element.classList.toggle('called', called);
  };
  const renderBadges = () => {
    let total = 0;
    let called = false;
    views.forEach((view) => {
      total += view.unread;
      called = called || view.called;
      paint(menu.querySelector(`[data-menu="focus"][data-code="${CSS.escape(view.code)}"] .pet-menu-badge`),
        view.unread, view.called);
      paint(view.tab?.querySelector('.pet-tab-badge'), view.unread, view.called);
    });
    paint(badge, total, called);
  };

  // 보고 있는 대화는 어디까지 읽었는지 서버에 남긴다(0.8초 모아서 한 번)
  const lastId = (view) => Math.max(0, ...view.seen);
  const markRead = (view) => {
    view.unread = 0;
    view.called = false;
    view.element.querySelectorAll('.pet-line.calls-me.fresh-call').forEach((line) => line.classList.remove('fresh-call'));
    renderBadges();
    const upTo = lastId(view);
    if (upTo <= view.readUpTo) return;
    clearTimeout(view.readTimer);
    view.readTimer = setTimeout(() => {
      view.readUpTo = upTo;
      fetch(view.element.dataset.read, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ upTo: String(upTo) }),
        credentials: 'same-origin',
      }).catch(() => {});
    }, 800);
  };

  const showMyFace = () => {
    face.innerHTML = svgOf(faceOf(current(), current().me));
  };

  const select = (code) => {
    if (!views.has(code)) return;
    selected = code;
    views.forEach((view) => {
      view.element.hidden = view.code !== code || !dresser.hidden || !creator.hidden || !soundPanel.hidden;
      view.tab?.setAttribute('aria-selected', String(view.code === code));
    });
    menu.querySelectorAll('[data-menu="focus"]').forEach((item) => {
      item.setAttribute('aria-checked', String(item.dataset.code === code));
    });
    if (!panel.hidden) {
      markRead(current());
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
      markRead(current());
      bubbles.querySelectorAll('.pet-bubble:not(.pet-update):not(.pet-news)').forEach((bubble) => bubble.remove());
      scrollLog(current());
      setTimeout(() => current().element.querySelector('.pet-form textarea, .pet-form input')?.focus(), 50);
    } else {
      closeDresser();
      closeCreator();
      closeSounds();
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
    const leave = menu.querySelector('.leave-label');
    if (leave) leave.textContent = `'${current().title}' 펫에서 빼기`;
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
  // ───────── 화면 밝기: 자동 → 밝게 → 어둡게 ─────────
  // 펫 창은 브라우저와 저장소가 따로라 사이트의 밤·낮 설정을 읽을 수 없다. 그래서 펫에서 따로 고른다.
  const THEMES = [['auto', '자동'], ['light', '밝게'], ['dark', '어둡게']];
  const themeNow = () => { try { return localStorage.getItem('pet-theme') || 'auto'; } catch (e) { return 'auto'; } };
  const applyTheme = (theme) => {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    const label = menu.querySelector('.theme-label');
    if (label) label.textContent = THEMES.find(([id]) => id === theme)?.[1] || '자동';
  };
  const cycleTheme = () => {
    const index = THEMES.findIndex(([id]) => id === themeNow());
    const next = THEMES[(index + 1) % THEMES.length][0];
    try { if (next === 'auto') localStorage.removeItem('pet-theme'); else localStorage.setItem('pet-theme', next); } catch (e) { /* 이번만 */ }
    applyTheme(next);
  };
  applyTheme(themeNow());

  // 꼬깃단 걸음 효과(캐릭터마다 다른 걸음). 정신없을 수 있어 기본은 꺼 둔다.
  const gaitOn = () => document.documentElement.dataset.gait === 'on';
  const applyGait = (on) => {
    if (on) document.documentElement.dataset.gait = 'on';
    else delete document.documentElement.dataset.gait;
    const label = menu.querySelector('.gait-label');
    if (label) label.textContent = on ? '켜짐' : '꺼짐';
  };
  const toggleGait = () => {
    const next = !gaitOn();
    try { if (next) localStorage.setItem('pet-gait', 'on'); else localStorage.removeItem('pet-gait'); } catch (e) { /* 이번만 */ }
    applyGait(next);
  };
  applyGait(gaitOn());

  menu.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-menu]');
    if (!item) return;
    closeMenu({ keepSize: ['focus', 'dress', 'add', 'sound'].includes(item.dataset.menu) });
    switch (item.dataset.menu) {
      case 'dress': expand(true); openDresser(); break;
      case 'sound': expand(true); openSounds(); break;
      case 'bookmarks': window.open(current().element.dataset.bookmarks, '_blank'); break;
      case 'theme': cycleTheme(); break;
      case 'gait': toggleGait(); break;
      case 'focus': select(item.dataset.code); expand(true); closeDresser(); closeCreator(); closeSounds(); break;
      case 'add': expand(true); openCreator(); break;
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
    else if (!soundPanel.hidden) closeSounds();
    else if (!creator.hidden) closeCreator();
    else expand(false);
  });
  app.onCommand((command) => {
    if (command === 'dress') { expand(true); openDresser(); }
    if (command === 'chat') expand(true);
    if (command === 'menu') openMenu();
    if (command === 'create') { expand(true); openCreator(); }
  });

  // ───────── 아바타: 끌면 창이 따라오고, 그냥 누르면 대화창 ─────────
  let press = null;
  pressing = () => press !== null;
  // 손을 뗀 신호를 놓쳤을 때 끄기를 끝낸다(움직였으면 자리를 저장)
  const release = () => {
    const was = press;
    press = null;
    if (was?.moved) app.dragEnd();
  };
  avatar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.ctrlKey) return; // 맥의 Ctrl+클릭은 우클릭이다
    press = { x: event.screenX, y: event.screenY, moved: false };
    avatar.setPointerCapture(event.pointerId);
  });
  avatar.addEventListener('pointermove', (event) => {
    if (!press) return;
    if ((event.buttons & 1) === 0) { release(); return; } // 버튼이 이미 떼어져 있다: 붙어 다니지 않게
    const dx = event.screenX - press.x;
    const dy = event.screenY - press.y;
    // 창 밖에서 들어온 이상한 좌표(무한대·엄청 큰 값)는 버린다. 앱이 창을 옮기다 오류를 냈다.
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 400 || Math.abs(dy) > 400) {
      press.x = event.screenX;
      press.y = event.screenY;
      return;
    }
    if (!press.moved && Math.hypot(dx, dy) < 4) return;
    press.moved = true;
    // 한 화면 그리기마다 한 번만 옮긴다(움직임을 모아서): 덜 끊기고 앱에 보내는 신호도 줄어든다
    press.pendingX = (press.pendingX || 0) + dx;
    press.pendingY = (press.pendingY || 0) + dy;
    press.x = event.screenX;
    press.y = event.screenY;
    if (!press.frame) {
      const current = press;
      current.frame = requestAnimationFrame(() => {
        current.frame = 0;
        const mx = Math.round(current.pendingX || 0);
        const my = Math.round(current.pendingY || 0);
        current.pendingX -= mx;
        current.pendingY -= my;
        if (mx || my) app.dragBy(mx, my);
      });
    }
  });
  avatar.addEventListener('pointerup', (event) => {
    const was = press;
    press = null;
    if (!was || event.button !== 0 || event.ctrlKey || !menu.hidden) return;
    if (!was.moved) expand(panel.hidden);
    else app.dragEnd();
  });
  avatar.addEventListener('pointercancel', release);
  avatar.addEventListener('lostpointercapture', () => { if (press) release(); });
  window.addEventListener('blur', () => { if (press) release(); });
  avatar.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      expand(panel.hidden);
    }
  });

  // 펫이 화면 위쪽에 있으면 앱이 창을 뒤집는다: 아바타가 위, 말풍선·대화창은 아래로 열린다(펫 0.4.7부터)
  app.onLayout(({ flip }) => {
    document.querySelectorAll('.pet-stage').forEach((element) => element.classList.toggle('flip', flip));
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

  // ───────── 새 버전: 받는 중 → 준비 중 → 누를 때까지 남는 "다시 켜기" ─────────
  // 보고 있지 않을 때 저절로 꺼졌다 켜지면 알 수가 없다. 그래서 준비되면 누를 때까지 남겨 두고,
  // 바뀐 뒤에는 "바뀌었어요" 말풍선을 확인할 때까지 남긴다.
  let updateBubble = null;
  let problemShown = null;

  const ensureUpdateBubble = () => {
    if (updateBubble) return updateBubble;
    updateBubble = document.createElement('div');
    updateBubble.className = 'pet-bubble pet-update';
    updateBubble.innerHTML = '<span class="mini update-icon"><svg class="i"><use href="#i-update"/></svg></span>'
      + '<div><b class="u-title"></b><p class="u-text"></p>'
      + '<div class="u-bar" hidden><i></i></div>'
      + '<div class="u-actions" hidden><button type="button" class="u-now">지금 다시 켜기</button></div></div>';
    updateBubble.querySelector('.u-now').addEventListener('click', (event) => {
      event.stopPropagation();
      restartNow();
    });
    bubbles.prepend(updateBubble);
    return updateBubble;
  };
  const setBubble = (title, text, { progress = null, actions = false } = {}) => {
    const bubble = ensureUpdateBubble();
    bubble.querySelector('.u-title').textContent = title;
    bubble.querySelector('.u-text').textContent = text;
    const bar = bubble.querySelector('.u-bar');
    bar.hidden = progress === null;
    bar.classList.toggle('indeterminate', progress === -1);
    if (progress !== null && progress >= 0) bar.querySelector('i').style.width = `${progress}%`;
    bubble.querySelector('.u-actions').hidden = !actions;
  };
  const restartNow = () => {
    setBubble(`새 버전 ${updateBubble?.dataset.version || ''}`, '다시 켜는 중…', { progress: -1 });
    avatar.classList.remove('has-update');
    app.applyUpdate();
  };
  const showReady = (version) => {
    setBubble(`새 버전 ${version} 준비됐어요`, '누르면 바꾸고 다시 켜져요. 그냥 두면 다음에 끌 때 바뀌어요.', { actions: true });
    avatar.classList.add('has-update');
  };
  const showUpdated = (version) => {
    const note = document.createElement('div');
    note.className = 'pet-bubble pet-update done';
    note.innerHTML = '<span class="mini update-icon"><svg class="i"><use href="#i-check"/></svg></span>'
      + '<div><b></b><p>업데이트가 끝났어요.</p><div class="u-actions"><button type="button" class="u-ok">확인</button></div></div>';
    note.querySelector('b').textContent = `새 버전 ${version}로 바뀌었어요`;
    note.querySelector('.u-ok').addEventListener('click', (event) => {
      event.stopPropagation();
      note.remove();
    });
    bubbles.prepend(note);
  };

  app.onUpdate(({ status, version, problem, progress }) => {
    if (version) ensureUpdateBubble().dataset.version = version;
    switch (status) {
      case 'downloading':
        setBubble(`새 버전 ${version} 받는 중`, Number.isFinite(progress) ? `${progress}%` : '잠시만요…',
          { progress: Number.isFinite(progress) ? progress : -1 });
        return;
      case 'preparing':
        setBubble(`새 버전 ${version}`, '설치 준비 중…', { progress: -1 });
        return;
      case 'ready':
        showReady(version);
        return;
      case 'updated':
        avatar.classList.remove('has-update');
        updateBubble?.remove();
        updateBubble = null;
        showUpdated(version);
        return;
      case 'applying':
        return;
      default:
    }
    // 진행 중이 아니면 진행 말풍선을 치운다
    avatar.classList.remove('has-update');
    updateBubble?.remove();
    updateBubble = null;
    // 받지 못한 이유가 있으면 한 번 알린다(같은 이유는 다시 띄우지 않는다)
    if (problem && problem !== problemShown) {
      problemShown = problem;
      const note = document.createElement('div');
      note.className = 'pet-bubble pet-update problem';
      const icon = document.createElement('span');
      icon.className = 'mini update-icon';
      icon.innerHTML = '<svg class="i"><use href="#i-alert"/></svg>';
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
  });

  // ───────── 말 ─────────
  // 책갈피 단추: 마음에 든 말에 남긴다(서버가 그린 줄과 같은 모양)
  function markButton(message) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pet-mark' + (message.marked ? ' on' : '') + (message.marks > 0 ? ' has' : '');
    button.dataset.mark = message.id;
    button.title = '책갈피';
    button.setAttribute('aria-pressed', String(Boolean(message.marked)));
    button.innerHTML = '<svg class="i"><use href="#i-mark"/></svg><em></em>';
    button.querySelector('em').textContent = message.marks > 0 ? message.marks : '';
    return button;
  }
  const paintMark = (button, marks, marked) => {
    button.querySelector('em').textContent = marks > 0 ? marks : '';
    button.classList.toggle('has', marks > 0);
    if (marked !== undefined) {
      button.classList.toggle('on', marked);
      button.setAttribute('aria-pressed', String(marked));
    }
  };
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.pet-mark[data-mark]');
    const base = button?.closest('[data-bookmark]')?.dataset.bookmark;
    if (!button || !base || button.disabled) return;
    event.stopPropagation();
    button.disabled = true;
    try {
      const response = await fetch(`${base}${button.dataset.mark}/bookmark`, { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) return;
      const result = await response.json();
      paintMark(button, result.marks, result.marked);
      if (result.marked) restart(button, 'pop');
    } finally {
      button.disabled = false;
    }
  });

  // 이전 대화 더 보기: 대화창 위에 붙인다
  const loadOlder = async (view, button) => {
    const ids = [...view.log.querySelectorAll('.pet-line[data-id]')].map((line) => Number(line.dataset.id));
    if (!ids.length) return;
    button.disabled = true;
    button.textContent = '불러오는 중…';
    try {
      const response = await fetch(`${view.element.dataset.say}?before=${Math.min(...ids)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const result = await response.json();
      const before = view.log.scrollHeight;
      const fragment = document.createDocumentFragment();
      result.messages.forEach((message) => {
        if (view.seen.has(message.id)) return;
        view.seen.add(message.id);
        const line = document.createElement('li');
        line.className = 'pet-line' + (message.contributorId === view.me ? ' mine' : '') + ((message.mentions || []).includes(view.me) ? ' calls-me' : '');
        line.dataset.id = message.id;
        const name = document.createElement('b');
        name.textContent = faceOf(view, message.contributorId)?.dataset.name || '';
        const text = document.createElement('span');
        text.textContent = message.body;
        window.MentionMarkup?.decorate(text, view.element);
        line.append(whoOf(view, message.contributorId), name, text, markButton(message));
        fragment.append(line);
      });
      view.log.querySelector('.pet-more').after(fragment);
      view.log.scrollTop += view.log.scrollHeight - before;
      view.log.querySelector('.pet-more').hidden = !result.more;
    } catch (error) {
      view.status.textContent = '이전 대화를 불러오지 못했어요.';
    } finally {
      button.disabled = false;
      button.textContent = '이전 대화 더 보기';
    }
  };

  const addLine = (view, message) => {
    const line = document.createElement('li');
    const callsMe = (message.mentions || []).includes(view.me);
    line.className = 'pet-line' + (message.contributorId === view.me ? ' mine' : '') + (callsMe ? ' calls-me fresh-call' : '');
    line.dataset.id = message.id;
    const name = document.createElement('b');
    name.textContent = faceOf(view, message.contributorId)?.dataset.name || '';
    const text = document.createElement('span');
    text.textContent = message.body;
    window.MentionMarkup?.decorate(text, view.element);
    line.append(whoOf(view, message.contributorId), name, text, markButton(message));
    view.log.append(line);
    while (view.log.querySelectorAll('.pet-line').length > 400) view.log.querySelector('.pet-line').remove();
    if (view.code === selected) scrollLog(view);
  };

  const trimBubbles = () => {
    while (bubbles.querySelectorAll('.pet-bubble:not(.pet-update):not(.pet-news):not(.called)').length > 2) {
      bubbles.querySelector('.pet-bubble:not(.pet-update):not(.pet-news):not(.called)').remove();
    }
    while (bubbles.querySelectorAll('.pet-news, .pet-bubble.called').length > 3) {
      bubbles.querySelector('.pet-news, .pet-bubble.called').remove();
    }
  };
  const fadeOut = (bubble, ms) => setTimeout(() => {
    bubble.classList.add('leaving');
    setTimeout(() => bubble.remove(), 320);
  }, ms);

  const showBubble = (view, message, called = false) => {
    const template = faceOf(view, message.contributorId);
    const bubble = document.createElement('div');
    bubble.className = 'pet-bubble' + (called ? ' called' : '');
    const mini = template ? template.content.firstElementChild.cloneNode(true) : document.createElement('span');
    const body = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = (many ? `[${view.title}] ` : '') + (template?.dataset.name || '')
      + (called ? '님이 나를 불렀어요' : '');
    const text = document.createElement('p');
    text.textContent = message.body;
    window.MentionMarkup?.decorate(text, view.element);
    body.append(name, text);
    bubble.append(mini, body);
    bubble.addEventListener('click', () => { bubble.remove(); select(view.code); expand(true); });
    bubbles.append(bubble);
    trimBubbles();
    if (!called) fadeOut(bubble, 9000); // 나를 부른 말은 누를 때까지 남는다
  };

  // 문집 소식: 누가 독후감을 냈다·내 글에 답글·마감했다·마감이 코앞. 누르면 그 화면을 브라우저로 연다.
  const newsIcon = { due: 'i-bell', closed: 'i-flag' };
  // ✕로 닫은 마감 재촉은 그 마감일에 대해 다시 띄우지 않는다(이 펫에 기억)
  const dismissed = (key) => { try { return Boolean(key) && localStorage.getItem(`pet-dismiss:${key}`) === '1'; } catch (e) { return false; } };
  const dismiss = (key) => { try { if (key) localStorage.setItem(`pet-dismiss:${key}`, '1'); } catch (e) { /* 이번만 */ } };

  const showNews = (view, news, lineOnly = false) => {
    if (dismissed(news.dismissKey)) return false;
    logNews(view, news);
    if (lineOnly) return true;
    const bubble = document.createElement('div');
    bubble.className = `pet-bubble pet-news ${news.kind}`;
    const template = news.actorId ? faceOf(view, news.actorId) : null;
    let mini;
    if (template) {
      mini = template.content.firstElementChild.cloneNode(true);
    } else {
      mini = document.createElement('span');
      mini.className = 'mini news-icon';
      mini.innerHTML = `<svg class="i"><use href="#${newsIcon[news.kind] || 'i-book'}"/></svg>`;
    }
    const body = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = (many ? `[${view.title}] ` : '') + news.title;
    const text = document.createElement('p');
    text.textContent = news.text;
    const go = document.createElement('small');
    go.className = 'news-go';
    go.textContent = news.kind === 'due' ? '쓰러 가기 ↗' : news.kind === 'reply' ? '답글 보기 ↗' : '보러 가기 ↗';
    body.append(title, text, go);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'news-close';
    close.setAttribute('aria-label', '닫기');
    close.textContent = '✕';
    close.addEventListener('click', (event) => { event.stopPropagation(); dismiss(news.dismissKey); bubble.remove(); });
    bubble.append(mini, body, close);
    bubble.addEventListener('click', () => {
      dismiss(news.dismissKey);
      bubble.remove();
      if (news.link) window.open(news.link, '_blank', 'noopener');
    });
    bubbles.append(bubble);
    trimBubbles();
    // 마감 재촉과 답글은 누를 때까지, 나머지는 30초 뒤 사라진다
    if (news.kind !== 'due' && news.kind !== 'reply') fadeOut(bubble, 30000);
    return true;
  };
  // 대화에도 한 줄 남긴다(저장하지 않는 알림 줄)
  const logNews = (view, news) => {
    const line = document.createElement('li');
    line.className = 'pet-line news';
    line.textContent = `${news.title} · ${news.text}`;
    view.log.append(line);
    if (view.code === selected) scrollLog(view);
  };

  const receive = (view, message) => {
    if (view.seen.has(message.id)) return;
    view.seen.add(message.id);
    addLine(view, message);
    if (message.contributorId === view.me) return;
    const called = (message.mentions || []).includes(view.me);
    const looking = !panel.hidden && view.code === selected && dresser.hidden && creator.hidden;
    if (looking) {
      markRead(view);
    } else {
      view.unread += 1;
      view.called = view.called || called;
      renderBadges();
      if (panel.hidden) {
        showBubble(view, message, called);
        app.attention();
      }
    }
    restart(avatar, called ? 'called' : 'excited');
  };

  // 서버가 새로 배포되면(다시 붙은 연결의 판이 다르면) 화면을 새로 고친다.
  // 쓰던 말이 있거나 메뉴·캐릭터 고르기를 보고 있으면 끝날 때까지 기다린다.
  let refreshing = null;
  const busy = () => !menu.hidden || !dresser.hidden || !creator.hidden || !soundPanel.hidden
    || [...views.values()].some((view) => view.element.querySelector('.pet-form textarea')?.value.trim());
  function refreshWhenIdle() {
    if (refreshing) return;
    const tryNow = () => {
      if (busy()) return;
      clearInterval(refreshing);
      const open = !panel.hidden;
      const url = new URL('/pet', window.location.origin);
      if (selected) url.searchParams.set('focus', selected);
      if (open) url.searchParams.set('open', '1');
      window.location.replace(url.toString());
    };
    refreshing = setInterval(tryNow, 3000);
    tryNow();
  }

  views.forEach((view) => {
    const source = new EventSource(view.element.dataset.stream);
    const online = (event) => { const data = parse(event); if (data) view.online.textContent = data.online.length; };
    source.addEventListener('hello', (event) => {
      online(event);
      view.status.textContent = '';
      const data = parse(event);
      if (data?.build && stage.dataset.build && data.build !== stage.dataset.build) refreshWhenIdle();
    });
    source.addEventListener('presence', online);
    source.addEventListener('message', (event) => { const data = parse(event); if (data) receive(view, data); });
    source.addEventListener('bookmark', (event) => {
      const data = parse(event);
      if (!data) return;
      view.log.querySelectorAll(`.pet-mark[data-mark="${data.messageId}"]`).forEach((button) => paintMark(button, data.marks));
    });
    const more = view.log.querySelector('.pet-more');
    if (more) {
      more.hidden = view.element.dataset.more !== 'true';
      more.querySelector('[data-older]').addEventListener('click', (event) => loadOlder(view, event.currentTarget));
    }
    source.addEventListener('news', (event) => {
      const data = parse(event);
      if (!data) return;
      if (!showNews(view, data, !panel.hidden) || !panel.hidden) return; // 대화창을 보고 있으면 대화에 한 줄만 남긴다
      app.attention();
      restart(avatar, data.kind === 'due' ? 'called' : 'excited');
    });
    source.addEventListener('avatar', (event) => {
      const data = parse(event);
      const template = data && faceOf(view, data.contributorId);
      if (!template) return;
      template.content.firstElementChild.innerHTML = data.svg;
      refreshWho(view, data.contributorId, data.svg);
      if (data.contributorId === view.me && view.code === selected) {
        face.innerHTML = data.svg;
        restart(avatar, 'excited');
      }
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CONNECTING) view.status.textContent = '다시 연결하는 중…';
    };

    const form = view.element.querySelector('.pet-form');
    const input = form.querySelector('textarea, input');
    // 길게 쓰면 아래로 늘어난다(최대 5줄). Enter는 보내기, Shift+Enter는 줄바꿈, 한글 조합 중 Enter는 무시.
    const fit = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 112) + 'px';
      input.style.overflowY = input.scrollHeight > 112 ? 'auto' : 'hidden';
    };
    input.addEventListener('input', fit);
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
          fit();
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

  // ───────── 캐릭터 바꾸기 (펫 창 안에서): 꼬깃단 여덟 친구 중 하나 ─────────
  const preview = dresser.querySelector('.dress-preview');
  const dressStatus = dresser.querySelector('.dress-status');
  const options = [...dresser.querySelectorAll('.dress-option')];
  const known = (slug) => options.some((option) => option.dataset.critter === slug);
  let draft = null;

  const renderDresser = () => {
    const chosen = options.find((option) => option.dataset.critter === draft);
    preview.src = avatarBase + draft + '.svg';
    dresser.querySelector('.dress-name').textContent = chosen ? chosen.dataset.name : '내 캐릭터';
    dresser.querySelector('.dress-tagline').textContent = chosen ? `“${chosen.dataset.tagline}”` : '';
    options.forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.critter === draft)));
  };
  function openDresser() {
    closeCreator();
    closeSounds();
    const view = current();
    const mine = view.element.dataset.critter;
    draft = known(mine) ? mine : view.element.dataset.original;
    if (!known(draft)) return;
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
      draft = option.dataset.critter;
      renderDresser();
      restart(preview, 'pop');
      return;
    }
    const action = event.target.closest('[data-dress]')?.dataset.dress;
    if (action === 'original') {
      draft = current().element.dataset.original;
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
          body: new URLSearchParams({ critter: draft }),
          credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          dressStatus.textContent = result.message || '저장하지 못했어요.';
          return;
        }
        view.element.dataset.critter = result.critter;
        const template = faceOf(view, view.me);
        if (template) template.content.firstElementChild.innerHTML = result.svg;
        refreshWho(view, view.me, result.svg);
        face.innerHTML = result.svg;
        restart(avatar, 'excited');
        closeDresser();
      } catch (error) {
        dressStatus.textContent = '연결이 끊겨 저장하지 못했어요.';
      }
    }
  });

  // ───────── 문집 열기·참여 (펫 안에서) ─────────
  const createStatus = creator.querySelector('.create-status');
  const done = creator.querySelector('.create-done');
  let createdCode = null;
  const setMode = (mode) => {
    creator.querySelectorAll('[data-mode]').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)));
    creator.querySelectorAll('.create-form').forEach((form) => { form.hidden = form.dataset.form !== mode; });
    createStatus.textContent = '';
    setTimeout(() => creator.querySelector(`.create-form[data-form="${mode}"] input`)?.focus(), 30);
  };
  function openCreator() {
    closeDresser();
    closeSounds();
    views.forEach((each) => { each.element.hidden = true; });
    creator.hidden = false;
    done.hidden = true;
    creator.querySelector('.create-modes').hidden = false;
    createdCode = null;
    setMode('open');
  }
  function closeCreator() {
    if (creator.hidden) return;
    creator.hidden = true;
    views.forEach((view) => { view.element.hidden = view.code !== selected; });
  }
  document.querySelector('[data-pet="create"]').addEventListener('click', () => {
    if (creator.hidden) openCreator(); else closeCreator();
  });
  creator.querySelectorAll('[data-mode]').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  creator.querySelectorAll('.create-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('.create-go');
      button.disabled = true;
      createStatus.textContent = '';
      try {
        const response = await fetch(form.dataset.form === 'open' ? '/pet/anthologies' : '/pet/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: new URLSearchParams(new FormData(form)),
          credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          createStatus.textContent = result.message || '하지 못했어요. 다시 시도해 주세요.';
          return;
        }
        createdCode = result.code;
        if (form.dataset.form === 'join') {
          // 참여는 바로 그 문집 탭으로 간다
          window.location.replace(`/pet?focus=${encodeURIComponent(result.code)}`);
          return;
        }
        creator.querySelectorAll('.create-form').forEach((each) => { each.hidden = true; });
        creator.querySelector('.create-modes').hidden = true;
        done.querySelector('.done-title').textContent = `'${result.title}' 문집을 열었어요`;
        done.querySelector('.done-url').value = result.inviteUrl;
        done.hidden = false;
      } catch (error) {
        createStatus.textContent = '연결이 끊겨 하지 못했어요.';
      } finally {
        button.disabled = false;
      }
    });
  });
  done.querySelector('.done-copy-btn').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const url = done.querySelector('.done-url');
    try {
      await navigator.clipboard.writeText(url.value);
    } catch (error) {
      url.select();
      document.execCommand('copy');
    }
    button.querySelector('span').textContent = '복사했어요';
    button.classList.add('copied');
    setTimeout(() => { button.querySelector('span').textContent = '복사'; button.classList.remove('copied'); }, 1800);
  });
  done.querySelector('.done-go').addEventListener('click', () => {
    if (createdCode) window.location.replace(`/pet?focus=${encodeURIComponent(createdCode)}`);
  });

  // ───────── 대화 속 링크: 기본 브라우저로 연다 ─────────
  // 새 펫 앱은 바로 연다. 예전 펫 앱은 이 서비스 주소만 밖으로 열 수 있어서, 한 번 거쳐 가는 안내 화면(/out)으로 연다.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.chat-link');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation(); // 말풍선을 눌러 대화창이 열리지 않게
    if (window.petApp?.openLink) window.petApp.openLink(link.href);
    else if (new URL(link.href).origin === window.location.origin) window.open(link.href, '_blank');
    else window.open(`/out?url=${encodeURIComponent(link.href)}`, '_blank');
  }, true);

  // ───────── 배경음 (ambience.js) ─────────
  const ambience = window.Ambience;
  const soundStatus = soundPanel.querySelector('.sound-status');
  function openSounds() {
    if (!ambience) return;
    closeDresser();
    closeCreator();
    views.forEach((each) => { each.element.hidden = true; });
    soundPanel.hidden = false;
  }
  function closeSounds() {
    if (soundPanel.hidden) return;
    soundPanel.hidden = true;
    views.forEach((view) => { view.element.hidden = view.code !== selected || !dresser.hidden || !creator.hidden; });
  }
  document.querySelector('[data-pet="sound"]').addEventListener('click', () => {
    if (soundPanel.hidden) openSounds(); else closeSounds();
  });
  if (!ambience) {
    document.querySelector('[data-pet="sound"]').hidden = true;
    menu.querySelector('[data-menu="sound"]').hidden = true;
  } else {
    const grid = soundPanel.querySelector('.sound-grid');
    const scenes = soundPanel.querySelector('.sound-scenes');
    const master = soundPanel.querySelector('[data-sound="master"]');
    ambience.scenes.forEach((scene) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sound-scene';
      chip.textContent = scene.name;
      // 이미 켜진 장면을 다시 누르면 그 장면을 통째로 끈다
      chip.addEventListener('click', () => (chip.classList.contains('on') ? ambience.clear() : ambience.scene(scene.mix)));
      scenes.append(chip);
    });
    const tiles = new Map();
    ambience.sounds.forEach((sound) => {
      const tile = document.createElement('div');
      tile.className = 'sound-tile';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sound-pick';
      button.innerHTML = `<svg class="i"><use href="#${sound.icon}"/></svg>`;
      const name = document.createElement('span');
      name.textContent = sound.name;
      button.append(name);
      button.addEventListener('click', () => ambience.toggle(sound.id));
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0.05';
      slider.max = '1';
      slider.step = '0.01';
      slider.setAttribute('aria-label', `${sound.name} 음량`);
      slider.addEventListener('input', () => ambience.volume(sound.id, Number(slider.value)));
      tile.append(button, slider);
      grid.append(tile);
      tiles.set(sound.id, { tile, button, slider });
    });
    master.addEventListener('input', () => ambience.setMaster(Number(master.value)));
    soundPanel.querySelector('[data-sound="play"]').addEventListener('click', () => ambience.play());
    soundPanel.querySelector('[data-sound="clear"]').addEventListener('click', () => ambience.clear());

    ambience.subscribe((now) => {
      const playing = now.playing && now.any;
      soundPanel.classList.toggle('playing', playing);
      soundPanel.querySelector('[data-sound="play"]').setAttribute('aria-label', playing ? '멈추기' : '재생');
      soundPanel.querySelector('[data-sound="play"]').disabled = !now.any;
      if (document.activeElement !== master) master.value = String(now.master);
      tiles.forEach(({ tile, button, slider }, id) => {
        const on = now.mix[id] > 0;
        tile.classList.toggle('on', on);
        tile.classList.toggle('loading', now.loading.includes(id));
        button.setAttribute('aria-pressed', String(on));
        if (on && document.activeElement !== slider) slider.value = String(now.mix[id]);
      });
      const names = ambience.sounds.filter((sound) => now.mix[sound.id] > 0).map((sound) => sound.name);
      soundStatus.textContent = names.length === 0 ? '들을 소리를 골라 보세요'
        : (playing ? '' : '멈춤 · ') + names.slice(0, 3).join(' · ') + (names.length > 3 ? ` 외 ${names.length - 3}` : '');
      scenes.querySelectorAll('.sound-scene').forEach((chip, index) => {
        const mix = ambience.scenes[index].mix;
        const same = Object.keys(mix).length === names.length && Object.keys(mix).every((id) => now.mix[id] > 0);
        chip.classList.toggle('on', same);
      });
      avatar.classList.toggle('listening', playing);
      document.querySelector('[data-pet="sound"]').classList.toggle('on', playing);
    });
  }

  select(selected);
  renderBadges();
  // 새로 고치기 전에 대화창을 열어 두었으면 다시 연다
  if (new URLSearchParams(window.location.search).get('open') === '1') expand(true);
})();
