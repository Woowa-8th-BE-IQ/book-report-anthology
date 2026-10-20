// 남의 독후감 화면 효과. 번들러 없이 그대로 쓴다.
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

  // 6. 두 번 제출 막기. 누른 버튼의 name/value(저장·제출 구분)는 숨은 칸으로 옮겨 살린다.
  document.querySelectorAll('form[data-once]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (event.defaultPrevented) {
        return; // 확인 창에서 취소한 경우
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

  // 7. 쓰던 글이 있는데 나가려 하면 붙잡는다
  document.querySelectorAll('form[data-guard]').forEach((form) => {
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('submit', () => { dirty = false; });
    window.addEventListener('beforeunload', (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  });
})();
