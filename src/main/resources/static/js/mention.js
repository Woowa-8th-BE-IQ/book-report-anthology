// "@"를 치면 부를 사람을 고르는 작은 목록. 모임방과 펫이 함께 쓴다.
// <textarea data-mention="이름을 가진 요소 선택자" data-mention-scope="찾을 범위(선택)">
// 요소의 data-name이 후보가 된다. 방향키로 고르고 Enter·Tab으로 넣는다.
(() => {
  const EVERYONE = '모두';

  const attach = (input) => {
    const form = input.form || input.parentElement;
    const scope = () => (input.dataset.mentionScope && input.closest(input.dataset.mentionScope)) || document;
    const names = () => {
      const seen = new Set();
      scope().querySelectorAll(input.dataset.mention).forEach((element) => {
        if (element.dataset.name) seen.add(element.dataset.name);
      });
      return [...seen];
    };

    const list = document.createElement('ul');
    list.className = 'mention-pick';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    form.append(list);

    let options = [];
    let active = 0;
    let query = null; // 지금 고르는 "@…"의 시작 위치와 글자

    const close = () => { list.hidden = true; options = []; query = null; };
    const render = () => {
      list.replaceChildren(...options.map((name, index) => {
        const item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === active));
        item.textContent = name === EVERYONE ? '@모두 · 다 같이 부르기' : '@' + name;
        item.addEventListener('mousedown', (event) => { event.preventDefault(); pick(index); });
        return item;
      }));
      list.hidden = options.length === 0;
    };
    const pick = (index) => {
      const name = options[index];
      if (!name || !query) return;
      const before = input.value.slice(0, query.start);
      const after = input.value.slice(input.selectionStart);
      input.value = `${before}@${name} ${after.replace(/^\S*/, '')}`;
      const caret = before.length + name.length + 2;
      input.setSelectionRange(caret, caret);
      close();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    };
    const update = () => {
      const upToCaret = input.value.slice(0, input.selectionStart);
      const match = /(^|\s)@([^\s@]*)$/.exec(upToCaret);
      if (!match) { close(); return; }
      const typed = match[2];
      query = { start: upToCaret.length - typed.length - 1, typed };
      const candidates = [...names(), EVERYONE];
      options = candidates.filter((name) => name.startsWith(typed)).slice(0, 6);
      if (options.length === 0) options = candidates.filter((name) => name.includes(typed)).slice(0, 6);
      active = Math.min(active, Math.max(0, options.length - 1));
      render();
    };

    input.addEventListener('input', update);
    input.addEventListener('click', update);
    input.addEventListener('blur', () => setTimeout(close, 120));
    // 폼에서 먼저(캡처) 받아야 Enter가 "보내기"보다 앞선다
    form.addEventListener('keydown', (event) => {
      if (event.target !== input || list.hidden || event.isComposing) return;
      const handled = { ArrowDown: 1, ArrowUp: -1, Enter: 0, Tab: 0, Escape: 0 };
      if (!(event.key in handled)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { close(); return; }
      if (event.key === 'Enter' || event.key === 'Tab') { pick(active); return; }
      active = (active + handled[event.key] + options.length) % options.length;
      render();
    }, true);
  };

  document.querySelectorAll('textarea[data-mention]').forEach(attach);

  // 말 속의 "@닉네임"·"@모두"를 칩으로 그린다. 나를 부른 건 더 진하게.
  // scope 안의 [data-name] 요소가 참여자 이름표다(펫은 얼굴 템플릿, 모임방은 자리).
  const mentions = (element, scope) => {
    const text = element.textContent;
    if (!text || text.indexOf('@') < 0) return;
    const names = [...new Set([...scope.querySelectorAll('[data-name]')].map((each) => each.dataset.name).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
    const mine = scope.querySelector('template[data-me="true"][data-name], .member.me[data-name]')?.dataset.name;
    const parts = [];
    let cursor = 0;
    for (let at = text.indexOf('@'); at >= 0; at = text.indexOf('@', at + 1)) {
      const rest = text.slice(at + 1);
      const name = names.find((each) => rest.startsWith(each)) || (rest.startsWith(EVERYONE) ? EVERYONE : null);
      if (!name || at < cursor) continue;
      parts.push(document.createTextNode(text.slice(cursor, at)));
      const chip = document.createElement('span');
      chip.className = 'mention' + (name === EVERYONE ? ' everyone' : '') + (name === mine || name === EVERYONE ? ' me' : '');
      chip.textContent = '@' + name;
      parts.push(chip);
      cursor = at + 1 + name.length;
    }
    if (parts.length === 0) return;
    parts.push(document.createTextNode(text.slice(cursor)));
    element.replaceChildren(...parts);
  };

  // 말 속의 주소(https://…, www.…)를 누를 수 있는 링크로. 끝에 붙은 문장부호는 빼고, 길면 줄여 보여 준다.
  const URL_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
  const links = (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => (node.parentElement?.closest('.mention, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = node.nodeValue;
      URL_PATTERN.lastIndex = 0;
      if (!URL_PATTERN.test(text)) return;
      URL_PATTERN.lastIndex = 0;
      const parts = [];
      let cursor = 0;
      for (let match = URL_PATTERN.exec(text); match; match = URL_PATTERN.exec(text)) {
        let raw = match[0];
        const trail = /[.,!?;:)\]}'"’”。、]+$/.exec(raw);
        if (trail) raw = raw.slice(0, -trail[0].length);
        const href = /^https?:/i.test(raw) ? raw : `https://${raw}`;
        let url;
        try { url = new URL(href); } catch (e) { continue; }
        if (!/^https?:$/.test(url.protocol)) continue;
        parts.push(document.createTextNode(text.slice(cursor, match.index)));
        const link = document.createElement('a');
        link.className = 'chat-link';
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = url.href;
        const shown = raw.replace(/^https?:\/\//i, '');
        link.textContent = shown.length > 42 ? `${shown.slice(0, 40)}…` : shown;
        parts.push(link);
        cursor = match.index + raw.length;
      }
      if (parts.length === 0) return;
      parts.push(document.createTextNode(text.slice(cursor)));
      node.replaceWith(...parts);
    });
  };

  const decorate = (element, scope = element.closest('.pet-view') || document) => {
    mentions(element, scope);
    links(element);
  };
  window.MentionMarkup = { decorate };
  // 처음 그려진 대화(서버가 그린 줄)도 칩으로
  document.querySelectorAll('.pet-line:not(.news) > span, .talk-line .talk-body > p').forEach((element) => decorate(element));
})();
