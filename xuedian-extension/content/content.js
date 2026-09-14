(() => {
  if (window.__xuedianCompanionLoaded) return;
  window.__xuedianCompanionLoaded = true;

  const ROOT_ID = 'xuedian-suishi-root';
  const IDLE_GIFS = ['kanshan-hi.gif', 'kanshan-idle.gif'];
  let lastGeneratedKey = '';
  let generating = false;
  let mascotTimer = null;
  let mascotBusy = false;
  let pendingTimer = null;
  let miniCards = [];
  let miniIndex = 0;
  let miniFlipped = false;

  function asset(name) {
    try {
      return chrome.runtime.getURL(`assets/${name}`);
    } catch {
      return '';
    }
  }

  function isQuestionPage() {
    return /\/question\/\d+/.test(location.pathname);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function cleanUrl(href) {
    try {
      const u = new URL(href);
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return href;
    }
  }

  function textOf(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extractQuestion() {
    if (!isQuestionPage()) {
      return { title: '', excerpt: '', url: cleanUrl(location.href), key: '' };
    }

    const titleEl =
      document.querySelector('h1.QuestionHeader-title') ||
      document.querySelector('.QuestionHeader-title') ||
      document.querySelector('[itemprop="name"]') ||
      document.querySelector('h1');
    let title = textOf(titleEl);
    if (!title) {
      title = document.title.replace(/\s*[-–—|]\s*知乎.*$/, '').trim();
    }

    const excerptEl =
      document.querySelector('.QuestionRichText .RichText') ||
      document.querySelector('.QuestionRichText') ||
      document.querySelector('.QuestionHeader-detail');
    let excerpt = textOf(excerptEl);
    if (excerpt.length > 400) excerpt = `${excerpt.slice(0, 400)}…`;

    return {
      title,
      excerpt,
      url: cleanUrl(location.href),
      key: cleanUrl(location.href) || title,
    };
  }

  function api(path, options = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'xuedian-api',
            path,
            method: options.method || 'GET',
            body: options.body,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                ok: false,
                error: chrome.runtime.lastError.message || '扩展需重新加载',
              });
              return;
            }
            resolve(response || { ok: false, error: '无响应' });
          },
        );
      } catch (error) {
        resolve({ ok: false, error: error.message || '扩展通信失败' });
      }
    });
  }

  function setMascot(srcName, { thinking = false } = {}) {
    const mascot = document.querySelector(`#${ROOT_ID} .xd-mascot`);
    const fabImg = document.querySelector(`#${ROOT_ID} .xd-fab img`);
    const next = asset(srcName);
    if (mascot && next && mascot.getAttribute('src') !== next) mascot.src = next;
    if (fabImg && next && fabImg.getAttribute('src') !== next) fabImg.src = next;
    mascot?.classList.toggle('is-thinking', thinking);
  }

  function startMascotLoop() {
    stopMascotLoop();
    let i = 0;
    setMascot(IDLE_GIFS[0]);
    mascotTimer = setInterval(() => {
      if (mascotBusy) return;
      i = (i + 1) % IDLE_GIFS.length;
      setMascot(IDLE_GIFS[i]);
    }, 4200);
  }

  function stopMascotLoop() {
    if (mascotTimer) {
      clearInterval(mascotTimer);
      mascotTimer = null;
    }
  }

  function currentCard() {
    return miniCards[miniIndex] || null;
  }

  function renderMiniCard() {
    const bubble = document.querySelector(`#${ROOT_ID} [data-role="bubble"]`);
    const kicker = document.querySelector(`#${ROOT_ID} [data-role="bubble-kicker"]`);
    const text = document.querySelector(`#${ROOT_ID} [data-role="bubble-text"]`);
    const hint = document.querySelector(`#${ROOT_ID} [data-role="bubble-hint"]`);
    const indexEl = document.querySelector(`#${ROOT_ID} [data-role="mini-index"]`);
    const nav = document.querySelector(`#${ROOT_ID} .xd-mini-nav`);
    if (!bubble || !text) return;

    const card = currentCard();
    bubble.classList.toggle('is-back', miniFlipped);
    bubble.classList.toggle('is-loading', generating && !card);

    if (generating && !card) {
      kicker.textContent = '想这题';
      text.textContent = '刘看山正在把问题收成闪卡…';
      hint.textContent = '稍等几秒';
      if (nav) nav.hidden = true;
      return;
    }

    if (!card) {
      kicker.textContent = '学点什么';
      text.textContent = isQuestionPage()
        ? '点狐狸展开，把这题收成路径。'
        : '打开一篇知乎问题，我会出小闪卡。';
      hint.textContent = '点气泡或狐狸';
      if (nav) nav.hidden = true;
      return;
    }

    kicker.textContent = miniFlipped ? '答案' : '问你';
    text.textContent = miniFlipped ? card.a : card.q;
    hint.textContent = miniFlipped ? '再点收回 · 点狐狸看路径' : '点一下翻开';
    if (indexEl) indexEl.textContent = `${miniIndex + 1}/${miniCards.length}`;
    if (nav) nav.hidden = miniCards.length < 2;
  }

  function cardsFromPath(path, questionTitle = '') {
    // 与网页学习路径同一套：直接用 path.cards；不足时用与 pathBuilder 相同的兜底
    const title = String(path?.topicTitle || questionTitle || path?.summary || '').trim() || '这道题';
    const summary = String(path?.summary || '').trim();
    const existing = (Array.isArray(path?.cards) ? path.cards : [])
      .map((c) => ({
        q: String(c.q || c.question || '').trim(),
        a: String(c.a || c.answer || '').trim(),
      }))
      .filter((c) => c.q && c.a);

    if (existing.length >= 3) return existing.slice(0, 6);

    const fallback = [
      {
        q: `「${title}」背后的核心专业问题是什么？`,
        a: summary || '先抽出可迁移的机制与概念，而不是娱乐叙事。',
      },
      { q: '深入学习时优先读什么？', a: '权威度更高、论证更完整的知乎专业回答。' },
      { q: '如何判断一条回答是否专业？', a: '看权威等级、论证结构、是否给出机制/边界/证据。' },
    ];
    return [...existing, ...fallback].slice(0, 6);
  }

  function knowledgeFromPath(path) {
    // 与网页学习路径同一套：直接展示 path.knowledge
    return (Array.isArray(path?.knowledge) ? path.knowledge : [])
      .filter((k) => k.title && k.body)
      .slice(0, 4);
  }

  function setMiniCards(cards) {
    miniCards = (Array.isArray(cards) ? cards : [])
      .map((c) => ({
        q: String(c.q || c.question || '').trim(),
        a: String(c.a || c.answer || '').trim(),
      }))
      .filter((c) => c.q && c.a)
      .slice(0, 6);
    miniIndex = 0;
    miniFlipped = false;
    renderMiniCard();
  }

  function stepMini(delta) {
    if (miniCards.length < 2) return;
    miniIndex = (miniIndex + delta + miniCards.length) % miniCards.length;
    miniFlipped = false;
    renderMiniCard();
  }

  function flipMini() {
    if (!currentCard()) {
      document.getElementById(ROOT_ID)?.classList.remove('is-minimized');
      return;
    }
    miniFlipped = !miniFlipped;
    renderMiniCard();
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'is-minimized';
    root.innerHTML = `
      <button class="xd-fab" type="button" title="展开学点什么" aria-label="展开学点什么">
        <img src="${asset('kanshan-idle.gif')}" alt="刘看山" />
      </button>
      <div class="xd-mini" data-role="mini">
        <button class="xd-bubble" type="button" data-role="bubble" aria-label="翻开闪卡">
          <span class="xd-bubble-kicker" data-role="bubble-kicker">学点什么</span>
          <span class="xd-bubble-text" data-role="bubble-text">打开一篇问题，我给你出闪卡</span>
          <span class="xd-bubble-hint" data-role="bubble-hint">点一下翻开</span>
        </button>
        <div class="xd-mini-nav" hidden>
          <button type="button" data-role="mini-prev" aria-label="上一张">‹</button>
          <span data-role="mini-index">1/1</span>
          <button type="button" data-role="mini-next" aria-label="下一张">›</button>
        </div>
      </div>
      <aside class="xd-panel" aria-label="学点什么">
        <div class="xd-head">
          <img class="xd-mascot" src="${asset('kanshan-hi.gif')}" alt="刘看山" />
          <div class="xd-brand">
            <strong>学点什么</strong>
            <span>刘看山陪你读这道题</span>
          </div>
          <button class="xd-toggle" type="button" title="收起" aria-label="收起">−</button>
        </div>
        <div class="xd-body">
          <p class="xd-label">当前问题</p>
          <p class="xd-title" data-role="title">打开任意知乎问题页</p>
          <p class="xd-excerpt" data-role="excerpt"></p>
          <button class="xd-btn" type="button" data-role="generate">生成学习路径</button>
          <p class="xd-status" data-role="status"></p>
          <div class="xd-loading" data-role="loading">
            <img src="${asset('kanshan-pc.gif')}" alt="" />
            <p>正在提炼关键词与学习路径…</p>
          </div>
          <div class="xd-result" data-role="result"></div>
        </div>
      </aside>
    `;
    document.documentElement.appendChild(root);

    root.querySelector('.xd-toggle').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      root.classList.add('is-minimized');
      renderMiniCard();
    });
    root.querySelector('.xd-fab').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      root.classList.remove('is-minimized');
    });
    root.querySelector('[data-role="bubble"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      flipMini();
    });
    root.querySelector('[data-role="mini-prev"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepMini(-1);
    });
    root.querySelector('[data-role="mini-next"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stepMini(1);
    });
    root.querySelector('[data-role="generate"]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      generatePath(true);
    });
    startMascotLoop();
    renderMiniCard();
    return root;
  }

  function setStatus(text, isError = false) {
    const el = document.querySelector(`#${ROOT_ID} [data-role="status"]`);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', Boolean(isError));
  }

  function setLoading(on) {
    generating = on;
    mascotBusy = on;
    const loading = document.querySelector(`#${ROOT_ID} [data-role="loading"]`);
    const btn = document.querySelector(`#${ROOT_ID} [data-role="generate"]`);
    if (loading) loading.classList.toggle('is-on', on);
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? '生成中…' : '生成学习路径';
    }
    if (on) setMascot('kanshan-pc.gif', { thinking: true });
    else setMascot('kanshan-hi.gif');
    renderMiniCard();
  }

  function renderMeta(question) {
    const titleEl = document.querySelector(`#${ROOT_ID} [data-role="title"]`);
    const excerptEl = document.querySelector(`#${ROOT_ID} [data-role="excerpt"]`);
    if (titleEl) {
      titleEl.textContent = question.title || (isQuestionPage() ? '正在识别问题标题…' : '打开任意知乎问题页后自动生成');
    }
    if (excerptEl) {
      excerptEl.textContent = question.excerpt || '';
      excerptEl.hidden = !question.excerpt;
    }
  }

  function renderPath(path) {
    const result = document.querySelector(`#${ROOT_ID} [data-role="result"]`);
    if (!result) return;

    const question = extractQuestion();
    const keywords = Array.isArray(path.keywords) ? path.keywords : [];
    const concepts = Array.isArray(path.concepts) ? path.concepts : [];
    const knowledge = knowledgeFromPath(path);

    const chips = keywords
      .slice(0, 3)
      .map((k) => {
        const term = typeof k === 'string' ? k : k.term || k.query || '';
        return term ? `<span class="xd-chip">${escapeHtml(term)}</span>` : '';
      })
      .join('');

    const funBits = [
      path.hook ? ['抓人一句', path.hook] : null,
      path.twist ? ['反直觉一点', path.twist] : null,
      path.action ? ['今天就能做', path.action] : null,
    ]
      .filter(Boolean)
      .map(
        ([label, text]) => `
        <div class="xd-fun">
          <h4>${escapeHtml(label)}</h4>
          <p>${escapeHtml(text)}</p>
        </div>`,
      )
      .join('');

    const conceptHtml = concepts
      .slice(0, 3)
      .map((c) => `<li><strong>${escapeHtml(c.term || '')}</strong> — ${escapeHtml(c.desc || '')}</li>`)
      .join('');

    const knowledgeHtml = knowledge
      .slice(0, 3)
      .map(
        (k) => `
        <div class="xd-knowledge-item">
          <strong>${escapeHtml(k.title || '')}</strong>
          <p>${escapeHtml(k.body || '')}</p>
        </div>`,
      )
      .join('');

    result.innerHTML = `
      ${chips ? `<p class="xd-label">关键词</p><div class="xd-chips">${chips}</div>` : ''}
      ${funBits}
      <div class="xd-block">
        <h4>一句话是什么</h4>
        <p>${escapeHtml(path.summary || '')}</p>
      </div>
      ${conceptHtml ? `<div class="xd-block"><h4>必懂概念</h4><ul>${conceptHtml}</ul></div>` : ''}
      ${knowledgeHtml ? `<div class="xd-block"><h4>专业知识</h4>${knowledgeHtml}</div>` : ''}
    `;
    result.classList.add('is-on');
    setMiniCards(cardsFromPath(path, question.title));
  }

  async function generatePath(force = false) {
    const question = extractQuestion();
    renderMeta(question);

    if (!isQuestionPage()) {
      setStatus('请先打开一篇知乎问题（地址含 /question/），再点生成。不会跳转页面。', true);
      renderMiniCard();
      return;
    }
    if (!question.title) {
      setStatus('还没读到问题标题，稍等页面加载后再点生成。', true);
      return;
    }
    if (!force && (generating || lastGeneratedKey === question.key)) return;

    lastGeneratedKey = question.key;
    setLoading(true);
    setStatus('正在生成学习路径…');
    const result = document.querySelector(`#${ROOT_ID} [data-role="result"]`);
    if (result) {
      result.classList.remove('is-on');
      result.innerHTML = '';
    }

    const response = await api('/api/path', {
      method: 'POST',
      body: {
        title: question.title,
        excerpt: question.excerpt,
        url: question.url,
        id: 'companion',
      },
    });

    setLoading(false);

    if (!response.ok) {
      lastGeneratedKey = '';
      setStatus(
        `${response.error || '生成失败'}。请先启动本机学点什么（http://127.0.0.1:8787）。`,
        true,
      );
      renderMiniCard();
      return;
    }

    const path = response.data?.path || response.data;
    if (!path) {
      lastGeneratedKey = '';
      setStatus('返回数据异常', true);
      return;
    }

    renderPath(path);
    setStatus('已生成 · 就在当前页，无需跳转');
  }

  function onRouteChange() {
    lastGeneratedKey = '';
    miniCards = [];
    miniIndex = 0;
    miniFlipped = false;
    const result = document.querySelector(`#${ROOT_ID} [data-role="result"]`);
    if (result) {
      result.classList.remove('is-on');
      result.innerHTML = '';
    }
    setStatus('');
    renderMeta(extractQuestion());
    renderMiniCard();
    if (isQuestionPage()) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => generatePath(false), 700);
    }
  }

  function boot() {
    ensureRoot();
    renderMeta(extractQuestion());
    renderMiniCard();
    if (isQuestionPage()) {
      pendingTimer = setTimeout(() => generatePath(false), 800);
    } else {
      setStatus('点进一篇问题后，会在这里生成路径。');
    }

    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        onRouteChange();
      }
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
