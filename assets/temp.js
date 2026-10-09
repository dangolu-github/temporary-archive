// Temporary Archive · public shell. A learner's link carries a private key: index.html#<key> is the class page,
// page.html?p=<page>#<key> one page (the key stays in the fragment, which is never sent to the web server). The pages
// come from the private backend only for that key. Nothing is submitted and nothing is checked automatically:
// homework choices stay in this browser, and keys and explanations appear only after the teacher releases them.
(() => {
  const config = window.TA_PORTAL_CONFIG || {};
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = window.location.hash.replace(/^#/, '').replace(/[^a-f0-9]/gi, '').toLowerCase().slice(0, 64);
  const pageId = String(new URLSearchParams(window.location.search).get('p') || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120);
  const view = document.body.dataset.view;
  const main = document.getElementById('ta-main');

  function jsonp(action, parameters) {
    return new Promise((resolve, reject) => {
      if (!config.endpoint) { reject(new Error('unavailable')); return; }
      const name = '__ta' + Date.now() + Math.random().toString(16).slice(2);
      const script = document.createElement('script');
      const timer = window.setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 30000);
      const cleanup = () => { window.clearTimeout(timer); delete window[name]; script.remove(); };
      window[name] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('unreachable')); };
      script.src = config.endpoint + '?' + new URLSearchParams(Object.assign({}, parameters, { action, callback: name, _: String(Date.now()) })).toString();
      document.head.appendChild(script);
    });
  }

  function message(text) { if (main) main.innerHTML = '<p class="ta-lead">' + esc(text) + '</p>'; }
  const linkProblem = 'This link does not open a page. Please use the link your teacher sent you.';

  function longDate(value) {
    if (!value) return '';
    const d = new Date(value + 'T00:00:00');
    return isNaN(d) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ---------- class page ----------
  function renderEntry(data) {
    document.title = data.name + ' · ' + (data.classTitle || 'Trial class');
    const kicker = [data.name, data.course, 'Trial class', longDate(data.classDate)].filter(Boolean).join(' · ');
    const sections = (data.sections || []).map((s) => '<section class="ta-section" id="' + esc(s.id) + '"><h2>' + esc(s.heading) + '</h2>' +
      s.items.map((it) => '<a class="item" href="page.html?p=' + encodeURIComponent(it.id) + '#' + key + '">' + esc(it.label) + '<span>Open →</span></a>').join('') + '</section>').join('');
    main.innerHTML = '<p class="ta-kicker">' + esc(kicker) + '</p><h1>' + esc(data.classTitle || 'Trial class') + '</h1>' + (sections || '<p class="ta-lead">Pages will appear here after the class.</p>');
  }

  // ---------- one page ----------
  function renderHtmlPage(data) {
    document.open();
    document.write(data.html);
    document.close();
  }

  function renderHomework(data) {
    document.title = data.label;
    const back = document.querySelector('.ta-bar a');
    if (back) back.href = './#' + key;
    const title = document.querySelector('.ta-bar-title');
    if (title) title.textContent = data.label;
    let html = '<header><div class="eyebrow">' + esc(data.course) + ' · Trial homework</div><h1>' + esc(data.title || data.label) + '</h1></header>';
    (data.sections || []).forEach((section) => {
      html += '<section>' + (section.title ? '<h2>' + esc(section.title) + '</h2>' : '');
      section.items.forEach((item) => {
        let choices = '';
        if (item.type === 'mc') {
          const plain = item.choices.map((c) => c.replace(/<[^>]+>/g, '').trim());
          const row = Math.max.apply(null, plain.map((c) => c.length)) <= 20 ? ' choices-row' : '';
          choices = '<ol class="choices' + row + '">' + item.choices.map((c) => '<li>' + c + '</li>').join('') + '</ol>';
        }
        html += '<article class="task hw-item" id="q' + item.n + '" data-n="' + item.n + '" data-type="' + esc(item.type) + '" data-lines="' + (item.lines || 2) + '">' +
          '<h3>Question ' + item.n + '</h3>' + (item.passage ? '<div class="passage">' + item.passage + '</div>' : '') +
          (item.instruction ? '<p class="instruction">' + item.instruction + '</p>' : '') + (item.gloss ? '<p class="gloss">' + item.gloss + '</p>' : '') +
          choices + '<div class="workspace" aria-hidden="true"></div></article>';
      });
      html += '</section>';
    });
    html += '<div id="ta-answers" class="ta-answers" hidden></div>';
    main.innerHTML = html;
    homework(data.id);
  }

  function homework(assignmentId) {
    const items = Array.from(document.querySelectorAll('.hw-item[data-n]'));
    const letters = ['A', 'B', 'C', 'D'];
    const storage = (() => { try { return window.localStorage; } catch { return null; } })();
    const storageKey = 'ta-hw:' + assignmentId;
    const load = () => { try { return JSON.parse((storage && storage.getItem(storageKey)) || '{}') || {}; } catch { return {}; } };
    const state = { responses: load(), released: false };
    const save = () => { try { if (storage) storage.setItem(storageKey, JSON.stringify(state.responses)); } catch { /* private mode */ } };
    const box = document.getElementById('ta-answers');
    let pollTimer = null;

    items.forEach((item) => {
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
          li.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(n, letters[index]); } });
        });
      } else {
        const area = document.createElement('textarea');
        area.className = 'ta-text';
        area.rows = Number(item.dataset.lines || 2);
        area.maxLength = 1500;
        area.setAttribute('aria-label', 'Question ' + n + ' answer');
        area.addEventListener('input', () => { state.responses[n] = area.value; save(); });
        (item.querySelector('.workspace') || item.lastElementChild).insertAdjacentElement('beforebegin', area);
      }
    });
    paint();
    fetchCorrection();

    function choose(n, letter) {
      if (state.released) return;
      state.responses[n] = state.responses[n] === letter ? '' : letter;
      save();
      paint();
    }
    function paint() {
      items.forEach((item) => {
        const value = state.responses[item.dataset.n] || '';
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
    function line(text, released) {
      box.textContent = text;
      box.hidden = !text;
      box.classList.toggle('is-released', Boolean(released));
    }
    function fetchCorrection() {
      jsonp('getCorrection', { t: key, assignment: assignmentId }).then((data) => {
        if (data && data.ok && data.released && Array.isArray(data.items)) { show(data.items); return; }
        if (data && data.ok) line('Answers not released yet.');
        poll();
      }).catch(poll);
    }
    function poll() {
      if (state.released) return;
      window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(fetchCorrection, 60000);
    }
    function show(corrections) {
      state.released = true;
      document.body.classList.add('hw-released');
      const byNumber = {};
      corrections.forEach((c) => { byNumber[String(c.n)] = c; });
      let correct = 0, answered = 0, mc = 0;
      items.forEach((item) => {
        const n = item.dataset.n, c = byNumber[n];
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
        block.innerHTML = (mark ? '<p class="ta-mark">' + esc(mark) + '</p>' : '') + (c.model ? '<p><b>Model answer</b></p><div>' + c.model + '</div>' : '') + (c.explanation ? '<div>' + c.explanation + '</div>' : '');
        item.appendChild(block);
      });
      line(mc ? 'Answers released · ' + correct + ' / ' + mc + ' correct' + (answered < mc ? ' · ' + (mc - answered) + ' not answered' : '') : 'Answers released', true);
    }
  }

  // ---------- start ----------
  if (view === 'entry') {
    if (!key) return;
    message('Opening…');
    jsonp('getEntry', { t: key }).then((data) => { if (data && data.ok) renderEntry(data); else message(linkProblem); }).catch(() => message('The page could not be reached. Please check your connection and reload.'));
  } else if (view === 'page') {
    if (!key || !pageId) { message(linkProblem); return; }
    const back = document.querySelector('.ta-bar a');
    if (back) back.href = './#' + key;
    message('Opening…');
    jsonp('getPage', { t: key, p: pageId }).then((data) => {
      if (!data || !data.ok) { message(linkProblem); return; }
      if (data.kind === 'html') renderHtmlPage(data); else renderHomework(data);
    }).catch(() => message('The page could not be reached. Please check your connection and reload.'));
  }
})();
