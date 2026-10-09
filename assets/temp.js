// Temporary Archive homework page. A learner's choices stay in this browser only (no submission, no checking).
// When the teacher releases a set's answers, the page shows the keys and explanations next to the learner's choices.
(() => {
  const hw = window.TA_HOMEWORK;
  const config = window.TA_PORTAL_CONFIG || {};
  if (!hw || !hw.assignmentId) return;
  const items = Array.from(document.querySelectorAll('.hw-item[data-n]'));
  const letters = ['A', 'B', 'C', 'D'];
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const storageKey = 'ta-hw:' + hw.assignmentId;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { responses: load(), released: false, correction: null };
  const box = document.getElementById('ta-answers');
  let pollTimer = null;

  items.forEach(decorate);
  paint();
  setAnswersLine('');
  if (config.endpoint) fetchCorrection();

  function load() {
    try { return JSON.parse((storage && storage.getItem(storageKey)) || '{}') || {}; } catch { return {}; }
  }
  function save() {
    try { if (storage) storage.setItem(storageKey, JSON.stringify(state.responses)); } catch { /* private mode */ }
  }

  function decorate(item) {
    const n = item.dataset.n;
    if (item.dataset.type === 'mc') {
      const list = item.querySelector('.choices');
      if (!list) return;
      list.setAttribute('role', 'radiogroup');
      list.setAttribute('aria-label', 'Question ' + n + ' choices');
      Array.from(list.children).forEach((li, index) => {
        li.classList.add('ta-choice');
        li.dataset.letter = letters[index];
        li.setAttribute('role', 'radio');
        li.setAttribute('aria-checked', 'false');
        li.tabIndex = 0;
        li.addEventListener('click', () => choose(n, letters[index]));
        li.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(n, letters[index]); }
        });
      });
    } else {
      const area = document.createElement('textarea');
      area.className = 'ta-text';
      area.rows = Number(item.dataset.lines || 2);
      area.maxLength = 1500;
      area.setAttribute('aria-label', 'Question ' + n + ' answer');
      area.addEventListener('input', () => { state.responses[n] = area.value; save(); });
      const anchor = item.querySelector('.workspace') || item.lastElementChild;
      anchor.insertAdjacentElement('beforebegin', area);
    }
  }

  function choose(n, letter) {
    if (state.released) return;
    state.responses[n] = state.responses[n] === letter ? '' : letter;
    save();
    paint();
  }

  function paint() {
    items.forEach((item) => {
      const n = item.dataset.n;
      const value = state.responses[n] || '';
      if (item.dataset.type === 'mc') {
        item.querySelectorAll('.ta-choice').forEach((li) => {
          const on = li.dataset.letter === value;
          li.classList.toggle('is-selected', on);
          li.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      } else {
        const area = item.querySelector('.ta-text');
        if (area && area.value !== value) area.value = value;
      }
    });
  }

  function setAnswersLine(text, released) {
    if (!box) return;
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle('is-released', Boolean(released));
  }

  function jsonp(action, parameters) {
    return new Promise((resolve, reject) => {
      const callbackName = '__taCorrection' + Date.now() + Math.random().toString(16).slice(2);
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 15000);
      const cleanup = () => { window.clearTimeout(timeout); delete window[callbackName]; script.remove(); };
      window[callbackName] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('unreachable')); };
      const query = new URLSearchParams(Object.assign({}, parameters, { action, callback: callbackName, _: String(Date.now()) }));
      script.src = config.endpoint + '?' + query.toString();
      document.head.appendChild(script);
    });
  }

  function fetchCorrection() {
    jsonp('getCorrection', { assignment: hw.assignmentId }).then((data) => {
      if (!data || !data.ok) { schedulePoll(); return; }
      if (data.released && Array.isArray(data.items)) { showCorrection(data.items); return; }
      setAnswersLine('Answers not released yet.');
      schedulePoll();
    }).catch(() => { schedulePoll(); });
  }

  function schedulePoll() {
    if (state.released) return;
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(fetchCorrection, 45000);
  }

  function showCorrection(corrections) {
    state.released = true;
    window.clearTimeout(pollTimer);
    document.body.classList.add('hw-released');
    const byNumber = {};
    corrections.forEach((c) => { byNumber[String(c.n)] = c; });
    let correct = 0, answered = 0, mc = 0;
    items.forEach((item) => {
      const n = item.dataset.n;
      const c = byNumber[n];
      if (!c) return;
      const mine = state.responses[n] || '';
      let mark = '';
      if (item.dataset.type === 'mc') {
        mc += 1;
        item.querySelectorAll('.ta-choice').forEach((li) => {
          li.tabIndex = -1;
          li.classList.toggle('is-key', li.dataset.letter === c.key);
          li.classList.toggle('is-miss', Boolean(mine) && mine !== c.key && li.dataset.letter === mine);
        });
        if (mine) {
          answered += 1;
          const right = mine === c.key;
          if (right) correct += 1;
          item.classList.add(right ? 'is-correct' : 'is-wrong');
          mark = right ? 'Correct · ' + c.key : 'Your choice ' + mine + ' · Answer ' + c.key;
        } else {
          mark = 'Answer ' + c.key;
        }
      } else {
        const area = item.querySelector('.ta-text');
        if (area) area.readOnly = true;
      }
      const block = document.createElement('div');
      block.className = 'ta-explain';
      block.innerHTML = (mark ? '<p class="ta-mark">' + esc(mark) + '</p>' : '') +
        (c.model ? '<p><b>Model answer</b></p><div>' + c.model + '</div>' : '') +
        (c.explanation ? '<div>' + c.explanation + '</div>' : '');
      item.appendChild(block);
    });
    setAnswersLine(mc ? 'Answers released · ' + correct + ' / ' + mc + ' correct' + (answered < mc ? ' · ' + (mc - answered) + ' not answered' : '') : 'Answers released', true);
  }
})();
