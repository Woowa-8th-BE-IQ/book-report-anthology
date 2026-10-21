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
})();
