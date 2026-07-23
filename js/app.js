/* TeamPulse demo v2 - app shell, onboarding, router, views */
(function () {
  const { esc, fmtDate, avatar, stBadge, toast, modal, closeModal, notify } = UI;

  /* ================= viewAs / personas ================= */
  function people() { return Store.list('people'); }
  function reviews() { return Store.list('reviews'); }
  function person(id) { return Store.get('people', id); }
  const INDICO = { it: 'db', travel: 'globe', auto: 'gear' };

  function personas() {
    const ps = people();
    const hr = ps.find(p => p.deptKey === 'hr' && p.isHead) || ps.find(p => /hr/i.test(p.role)) || null;
    // manager: evaluator with most actionable team reviews
    const counts = {};
    reviews().filter(r => r.period === Generator.CURRENT_PERIOD).forEach(r => {
      counts[r.evaluatorId] = (counts[r.evaluatorId] || 0) + 1;
    });
    let managerId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const manager = person(managerId) || ps.find(p => p.isHead && p.deptKey !== 'hr') || null;
    // employee: subject of a fillable review
    const er = reviews().find(r => ['pending_self', 'self_in_progress'].includes(r.status));
    const employee = er ? person(er.subjectId) : ps.find(p => !p.isHead && !p.isLead) || null;
    return { hr, manager, employee };
  }

  function viewAs() {
    const s = Store.getSettings();
    if (s.viewAs && (s.viewAs.personId === null || person(s.viewAs.personId))) return s.viewAs;
    const pp = personas();
    const va = { role: 'hr', personId: pp.hr ? pp.hr.id : null };
    Store.patchSettings({ viewAs: va });
    return va;
  }
  function setViewAs(role, personId) {
    Store.patchSettings({ viewAs: { role, personId } });
    render();
  }
  window.App = { viewAs, render: () => render() };

  /* ================= theme & locale ================= */
  function applySettings() {
    const s = Store.getSettings();
    document.documentElement.dataset.theme = s.theme || 'brand';
    I18N.setLocale(s.locale || 'cs');
  }

  /* ================= onboarding ================= */
  const ob = { mode: null, industry: 'it', size: 50, theme: 'brand', step: 0 };

  /* oficiální animované brand logo (Brand Manual v1.0) - pulzní kruh + geometrické T */
  function pulseMark() {
    return `<div class="tp-pulse" aria-hidden="true"><svg viewBox="0 0 140 140" style="overflow:visible">
      <defs>
        <linearGradient id="tpgu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FCB6D4"/><stop offset="50%" stop-color="#F5247D"/><stop offset="100%" stop-color="#C0185F"/>
        </linearGradient>
        <linearGradient id="tprgu" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#F986B7"/><stop offset="100%" stop-color="#F5247D"/>
        </linearGradient>
        <filter id="tpglu" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="70" cy="70" r="54" fill="none" stroke="url(#tprgu)" stroke-width="1.5" opacity="0.55" style="transform-origin:70px 70px;animation:tp-pulse 3.2s cubic-bezier(.22,1,.36,1) 0s infinite"/>
      <circle cx="70" cy="70" r="54" fill="none" stroke="url(#tprgu)" stroke-width="1.5" opacity="0.35" style="transform-origin:70px 70px;animation:tp-pulse 3.2s cubic-bezier(.22,1,.36,1) 1.05s infinite"/>
      <circle cx="70" cy="70" r="54" fill="none" stroke="url(#tprgu)" stroke-width="1.5" opacity="0.2" style="transform-origin:70px 70px;animation:tp-pulse 3.2s cubic-bezier(.22,1,.36,1) 2.1s infinite"/>
      <circle cx="70" cy="70" r="52" fill="url(#tprgu)" opacity="0.08" style="transform-origin:70px 70px;animation:tp-halo 3.2s ease-in-out infinite"/>
      <g style="transform-origin:70px 70px;filter:url(#tpglu)">
        <path d="M30 34 H110 A8 8 0 0 1 110 50 H82 V104 A8 8 0 0 1 58 104 V50 H30 A8 8 0 0 1 30 34 Z" fill="none" stroke="url(#tpgu)" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
      </g>
    </svg></div>`;
  }

  function renderOnboarding() {
    const root = document.getElementById('onboarding');
    root.hidden = false;
    document.getElementById('app').hidden = true;
    document.documentElement.dataset.theme = ob.theme;

    let inner = '';
    if (ob.step === 0) {
      inner = `
        <div class="ob-welcome">
          ${pulseMark()}
          <div class="ob-kicker">${icon('logo', 15)} TeamPulse</div>
          <h1>${t('ob.w.title')}</h1>
          <p class="ob-lead">${esc(t('ob.w.lead'))}</p>
          <div class="ob-values">
            <div class="ob-value">${icon('checkin', 24)}<b>${esc(t('ob.w.v1'))}</b><span>${esc(t('ob.w.v1d'))}</span></div>
            <div class="ob-value">${icon('target', 24)}<b>${esc(t('ob.w.v2'))}</b><span>${esc(t('ob.w.v2d'))}</span></div>
            <div class="ob-value">${icon('clock', 24)}<b>${esc(t('ob.w.v3'))}</b><span>${esc(t('ob.w.v3d'))}</span></div>
          </div>
          <button class="btn btn-primary" id="ob-start">${esc(t('ob.w.start'))} →</button>
        </div>`;
    } else if (ob.step === 1) {
      inner = `
        <div class="ob-hero">
          <div class="ob-mark">${icon('logo', 30)}</div><h1>${esc(t('ob.welcome'))}</h1>
          <p>${esc(t('ob.intro'))}</p>
        </div>
        <div class="card">
          <h2>${esc(t('ob.startTitle'))}</h2>
          <div class="choice-grid">
            <button class="choice ${ob.mode === 'company' ? 'sel' : ''}" data-mode="company">
              <span class="ch-ico">${icon('building', 30)}</span><b>${esc(t('ob.pickCompany'))}</b><span>${esc(t('ob.pickCompanyDesc'))}</span>
            </button>
            <button class="choice ${ob.mode === 'empty' ? 'sel' : ''}" data-mode="empty">
              <span class="ch-ico">${icon('doc', 30)}</span><b>${esc(t('ob.empty'))}</b><span>${esc(t('ob.emptyDesc'))}</span>
            </button>
          </div>
          <div class="wizard-foot"><span></span>
            <button class="btn btn-primary" id="ob-next" ${ob.mode ? '' : 'disabled'}>${esc(t('common.next'))} →</button>
          </div>
        </div>`;
    } else if (ob.step === 2 && ob.mode === 'company') {
      inner = `
        <div class="ob-hero"><h1>${esc(t('ob.pickCompany'))}</h1></div>
        <div class="card">
          <div class="choice-grid">
            ${['it', 'travel', 'auto'].map(k => `
              <button class="choice ${ob.industry === k ? 'sel' : ''}" data-ind="${k}">
                <span class="ch-ico">${icon(INDICO[k], 30)}</span>
                <b>${esc(t('ob.industry.' + k))}</b><span>${esc(t('ob.industry.' + k + 'Desc'))}</span>
              </button>`).join('')}
          </div>
          <div class="field" style="margin-top:18px">
            <label>${esc(t('ob.size'))}: <b id="ob-size-val">${ob.size}</b> ${esc(t('ob.people'))}</label>
            <input type="range" min="15" max="200" step="5" value="${ob.size}" id="ob-size" style="width:100%">
          </div>
          <div class="wizard-foot">
            <button class="btn" id="ob-back">← ${esc(t('common.back'))}</button>
            <button class="btn btn-primary" id="ob-next">${esc(t('common.next'))} →</button>
          </div>
        </div>`;
    } else {
      inner = `
        <div class="ob-hero"><h1>${esc(t('ob.designTitle'))}</h1><p>${esc(t('ob.designDesc'))}</p></div>
        <div class="card">
          <div class="choice-grid">
            ${[['brand', '#F5247D,#FFF0F7,#1A0E18'], ['corp', '#0070f2,#f0ab00,#f5f6f7'], ['glass', '#0a7aff,#bf5af2,#ffffff'], ['genz', '#3a57fc,#ff7a1a,#0a1230']].map(([k, colors]) => `
              <button class="choice ${ob.theme === k ? 'sel' : ''}" data-theme-pick="${k}">
                <b>${esc(t('ob.theme.' + k))}</b><span>${esc(t('ob.theme.' + k + 'Desc'))}</span>
                <span class="theme-preview">${colors.split(',').map(c => `<i style="background:${c}"></i>`).join('')}</span>
              </button>`).join('')}
          </div>
          <p class="hint" style="margin-top:14px;color:var(--text-muted)">${esc(t('ob.roleNote'))}</p>
          <div class="wizard-foot">
            <button class="btn" id="ob-back">← ${esc(t('common.back'))}</button>
            <button class="btn btn-primary" id="ob-enter">${ob.mode === 'company' ? esc(t('ob.generate')) : esc(t('ob.enter'))}</button>
          </div>
        </div>`;
    }

    root.innerHTML = `<div class="ob-card">
      <div style="text-align:right;margin-bottom:8px">${langSwitchHtml()}</div>${inner}</div>`;

    const start = root.querySelector('#ob-start');
    if (start) start.onclick = () => { ob.step = 1; renderOnboarding(); };
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { ob.mode = b.dataset.mode; renderOnboarding(); });
    root.querySelectorAll('[data-ind]').forEach(b => b.onclick = () => { ob.industry = b.dataset.ind; renderOnboarding(); });
    root.querySelectorAll('[data-theme-pick]').forEach(b => b.onclick = () => { ob.theme = b.dataset.themePick; renderOnboarding(); });
    bindLangSwitch(root, renderOnboarding);
    const size = root.querySelector('#ob-size');
    if (size) size.oninput = () => { ob.size = +size.value; root.querySelector('#ob-size-val').textContent = ob.size; };
    const back = root.querySelector('#ob-back');
    if (back) back.onclick = () => { ob.step = ob.step === 3 && ob.mode === 'empty' ? 1 : ob.step - 1; renderOnboarding(); };
    const next = root.querySelector('#ob-next');
    if (next) next.onclick = () => { ob.step = ob.mode === 'empty' ? 3 : ob.step + 1; renderOnboarding(); };
    const enter = root.querySelector('#ob-enter');
    if (enter) enter.onclick = () => {
      Store.patchSettings({ theme: ob.theme, locale: I18N.locale });
      if (ob.mode === 'company') {
        enter.disabled = true; enter.textContent = t('ob.generating');
        setTimeout(() => {
          Generator.install(ob.industry, ob.size);
          finishOnboarding();
        }, 700);
      } else {
        Generator.installEmpty();
        finishOnboarding();
      }
    };
  }

  function finishOnboarding() {
    Store.patchSettings({ onboarded: true, viewAs: null });
    notify(t('ob.welcome'), 'all');
    document.getElementById('onboarding').hidden = true;
    location.hash = '#/home';
    boot();
  }

  /* ================= language switch ================= */
  function langSwitchHtml() {
    return `<span class="lang-seg">${I18N.locales.map(l =>
      `<button data-lang="${l}" class="${l === I18N.locale ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</span>`;
  }
  function bindLangSwitch(root, rerender) {
    root.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
      I18N.setLocale(b.dataset.lang);
      Store.patchSettings({ locale: b.dataset.lang });
      rerender();
    });
  }

  /* ================= shell ================= */
  const NAV = [
    { sec: 'nav.work' },
    { id: 'home', ico: 'home', label: 'nav.home', roles: ['employee', 'manager', 'hr'] },
    { id: 'myreviews', ico: 'doc', label: 'nav.myreviews', roles: ['employee', 'manager', 'hr'], needsPerson: true },
    { id: 'team', ico: 'team', label: 'nav.team', roles: ['manager', 'hr'] },
    { id: 'myteam', ico: 'grid9', label: 'nav.myteam', roles: ['manager'] },
    { id: 'goals', ico: 'target', label: 'nav.goals', roles: ['employee', 'manager', 'hr'] },
    { id: 'checkins', ico: 'checkin', label: 'nav.checkins', roles: ['manager', 'hr'] },
    { sec: 'nav.company' },
    { id: 'kudos', ico: 'heartPulse', label: 'nav.kudos', roles: ['employee', 'manager', 'hr'] },
    { id: 'people', ico: 'people', label: 'nav.people', roles: ['manager', 'hr'] },
    { id: 'org', ico: 'tree', label: 'nav.org', roles: ['employee', 'manager', 'hr'] },
    { sec: 'nav.adminSec' },
    { id: 'hr', ico: 'gauge', label: 'nav.hr', roles: ['hr'] },
    { id: 'talent', ico: 'grid9', label: 'nav.talent', roles: ['hr'] },
    { id: 'help', ico: 'bulb', label: 'nav.help', roles: ['employee', 'manager', 'hr'] },
    { id: 'settings', ico: 'gear', label: 'nav.settings', roles: ['employee', 'manager', 'hr'] },
  ];
  const MOBILE_NAV = ['home', 'myreviews', 'team', 'kudos', 'hr', 'settings'];

  function route() {
    const h = location.hash.replace(/^#\//, '') || 'home';
    const [page, param] = h.split('/');
    return { page, param };
  }

  function renderShell() {
    const va = viewAs();
    const co = Store.getCompany();
    const { page } = route();
    const visible = NAV.filter(n => n.sec || n.roles.includes(va.role));

    document.getElementById('sidebar').innerHTML = `
      <div class="brand"><span class="logo-dot">${icon('logo', 18)}</span><b>TeamPulse</b>
        <span class="badge b-amber" style="margin-left:auto">${esc(t('common.demo'))}</span></div>
      ${visible.map(n => n.sec
        ? `<div class="nav-section">${esc(t(n.sec))}</div>`
        : `<button class="nav-item ${page === n.id ? 'active' : ''}" data-nav="${n.id}">
             ${icon(n.ico, 19)} ${esc(t(n.label))}</button>`).join('')}`;

    const me = va.personId ? person(va.personId) : null;
    const unread = Store.list('notifications').filter(n => !n.read).length;
    document.getElementById('topbar').innerHTML = `
      <div class="tb-company">${icon('building', 20)} <span>${esc(co ? co.name : 'TeamPulse')}
        <small>${esc(t('app.tagline'))}</small></span></div>
      <div class="tb-spacer"></div>
      ${langSwitchHtml()}
      <div class="has-dropdown">
        <button class="iconbtn" id="theme-btn" title="${esc(t('set.theme'))}">${icon('palette', 19)}</button>
        <div id="theme-dd" hidden class="dropdown">
          ${['brand', 'corp', 'glass', 'genz'].map(k => `<button class="dd-item" data-set-theme="${k}">${k === Store.getSettings().theme ? '✓' : '·'} ${esc(t('ob.theme.' + k))}</button>`).join('')}
        </div>
      </div>
      <div class="has-dropdown">
        <button class="iconbtn" id="ntf-btn" title="${esc(t('ntf.title'))}">${icon('bell', 19)}${unread ? '<span class="notif-dot"></span>' : ''}</button>
        <div id="ntf-dd" hidden class="dropdown" style="min-width:300px;max-height:330px;overflow:auto">
          ${Store.list('notifications').slice(-8).reverse().map(n =>
            `<div class="dd-item" style="cursor:default">${esc(n.text)}<br><small style="color:var(--text-muted)">${fmtDate(n.at)}</small></div>`).join('')
            || `<div class="dd-item">${esc(t('ntf.empty'))}</div>`}
        </div>
      </div>
      <div class="has-dropdown">
        <button class="role-pill" id="role-btn" title="${esc(t('role.switch'))}">
          ${me ? avatar(me, 26) : icon('people', 18)} ${esc(t('role.' + va.role))}${me ? ' · ' + esc(me.firstName) : ''} ${icon('swap', 14)}</button>
        <div id="role-dd" hidden class="dropdown">${roleDropdownHtml()}</div>
      </div>`;

    document.getElementById('mobilenav').innerHTML = MOBILE_NAV
      .map(id => NAV.find(n => n.id === id))
      .filter(n => n && n.roles.includes(va.role))
      .map(n => `<button class="${page === n.id ? 'active' : ''}" data-nav="${n.id}">
        ${icon(n.ico, 20)}${esc(t(n.label))}</button>`).join('');

    document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => location.hash = '#/' + b.dataset.nav);
    bindLangSwitch(document.getElementById('topbar'), render);
    bindDropdown('theme-btn', 'theme-dd');
    bindDropdown('ntf-btn', 'ntf-dd', () => {
      Store.list('notifications').forEach(n => Store.update('notifications', n.id, { read: true }));
    });
    bindDropdown('role-btn', 'role-dd');
    document.querySelectorAll('[data-set-theme]').forEach(b => b.onclick = () => {
      Store.patchSettings({ theme: b.dataset.setTheme }); applySettings(); render();
    });
    document.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => {
      const [role, pid] = b.dataset.switch.split('|');
      location.hash = '#/home';
      setViewAs(role, pid || null);
    });
  }

  function roleDropdownHtml() {
    const pp = personas();
    const items = [
      ['hr', pp.hr], ['manager', pp.manager], ['employee', pp.employee],
    ].map(([role, p]) =>
      `<button class="dd-item" data-switch="${role}|${p ? p.id : ''}">
        ${p ? avatar(p, 26) : icon('people', 16)} <span><b>${esc(t('role.' + role))}</b><br>
        <small style="color:var(--text-muted)">${p ? esc(p.name + ' · ' + p.role) : esc(t('misc.you')) + ' (HR)'}</small></span></button>`);
    return items.join('');
  }

  function bindDropdown(btnId, ddId, onOpen) {
    const btn = document.getElementById(btnId), dd = document.getElementById(ddId);
    if (!btn || !dd) return;
    btn.onclick = e => {
      e.stopPropagation();
      const wasHidden = dd.hidden;
      document.querySelectorAll('.dropdown').forEach(d => d.hidden = true);
      dd.hidden = !wasHidden;
      if (!dd.hidden && onOpen) onOpen();
    };
    document.addEventListener('click', () => { dd.hidden = true; }, { once: true });
  }

  /* ================= views ================= */
  const views = {};

  /* ---- home ---- */
  views.home = root => {
    const va = viewAs();
    const me = va.personId ? person(va.personId) : null;
    const myRevs = me ? reviews().filter(r => r.subjectId === me.id) : [];
    const teamRevs = me ? reviews().filter(r => r.evaluatorId === me.id && r.period === Generator.CURRENT_PERIOD) : [];
    const todos = [];
    myRevs.forEach(r => {
      if (['pending_self', 'self_in_progress'].includes(r.status))
        todos.push({ ico: icon('doc', 16), txt: t('home.actionFill'), hash: '#/review/' + r.id, d: ReviewLogic.daysLeft(r) });
      if (r.status === 'awaiting_employee_confirmation')
        todos.push({ ico: icon('check', 16), txt: t('home.actionConfirm'), hash: '#/review/' + r.id, d: ReviewLogic.daysLeft(r) });
    });
    teamRevs.forEach(r => {
      if (['self_done', 'manager_in_progress'].includes(r.status))
        todos.push({ ico: icon('doc', 16), txt: t('home.actionReview') + ' - ' + (person(r.subjectId) || {}).name, hash: '#/review/' + r.id, d: ReviewLogic.daysLeft(r) });
      if (['manager_done', 'conversation_scheduled', 'conversation_done'].includes(r.status))
        todos.push({ ico: icon('calendar', 16), txt: t('home.actionConversation') + ' - ' + (person(r.subjectId) || {}).name, hash: '#/review/' + r.id, d: ReviewLogic.daysLeft(r) });
    });
    /* 360: pozvánky k vyplnění pro aktuální osobu */
    const my360 = me && window.Feedback360 ? Feedback360.pendingFor(me.id) : [];
    my360.forEach(f2 => todos.push({
      ico: icon('heartPulse', 16),
      txt: t('f360.todoFill') + ' - ' + ((person(f2.subjectId) || {}).name || ''),
      f360: f2.id, d: Math.max(0, Math.ceil((f2.deadline - Date.now()) / 86400000)),
    }));
    const myGoals = me ? Store.list('goals').filter(g => g.ownerId === me.id) : [];
    const lastKudos = Store.list('kudos').slice(-3).reverse();
    const confirmed = reviews().filter(r => r.period === Generator.CURRENT_PERIOD && ['confirmed', 'closed_by_hr'].includes(r.status)).length;
    const totalCur = reviews().filter(r => r.period === Generator.CURRENT_PERIOD).length;

    root.innerHTML = `
      <h1 class="page-title">${esc(t('home.hello'))}${me ? ', ' + esc(me.firstName) : ''}</h1>
      <p class="page-sub">${esc(t('misc.viewAs'))}: ${esc(t('role.' + va.role))}</p>
      <div class="grid cols-2">
        <div class="card">
          <h2>${icon('doc', 18)}${esc(t('home.todo'))}</h2>
          ${todos.length ? todos.map(td => `
            <button class="btn btn-block" style="justify-content:flex-start;margin-bottom:8px" ${td.f360 ? `data-f360="${td.f360}"` : `onclick="location.hash='${td.hash}'"`}>
              ${td.ico} ${esc(td.txt)} <span class="badge ${td.d <= 7 ? 'b-amber' : ''}" style="margin-left:auto">${td.d} ${esc(t('home.daysLeft'))}</span>
            </button>`).join('') : `<div class="empty">${icon('spark', 52)}<br>${esc(t('home.noTodo'))}</div>`}
        </div>
        <div class="card">
          <h2>${icon('gauge', 18)}${esc(t('home.teamPulse'))}</h2>
          <div class="kpi-num">${totalCur ? Math.round(confirmed / totalCur * 100) : 0} %</div>
          <div class="kpi-label">${esc(t('hr.completion'))} · ${esc(Generator.CURRENT_PERIOD)}</div>
          <div class="progressbar" style="margin-top:10px"><div style="width:${totalCur ? confirmed / totalCur * 100 : 0}%"></div></div>
          <div style="margin-top:18px">
            <h2>${icon('heartPulse', 18)}${esc(t('home.recentKudos'))}</h2>
            ${lastKudos.map(k => `<p style="font-size:.88rem;margin-bottom:6px">${avatar(person(k.fromId), 22)} <b>${esc((person(k.fromId) || {}).firstName || '')}</b> → <b>${esc((person(k.toId) || {}).firstName || '')}</b>: ${esc(k.msg)}</p>`).join('') || `<p class="page-sub">-</p>`}
          </div>
        </div>
      </div>
      ${myGoals.length ? `
      <div class="card">
        <h2>${icon('target', 18)}${esc(t('home.myGoals'))}</h2>
        <div class="bars">${myGoals.map(g => `
          <div class="brow"><span>${esc(g.title)}</span>
            <div class="progressbar"><div style="width:${g.progress}%"></div></div><b>${g.progress}%</b></div>`).join('')}
        </div>
      </div>` : ''}`;

    root.querySelectorAll('[data-f360]').forEach(b => b.onclick = () => {
      const f2 = Store.get('feedback360', b.dataset.f360);
      if (f2) Feedback360Views.respondModal(f2, me.id, render);
    });
  };

  /* ---- my reviews ---- */
  views.myreviews = root => {
    const va = viewAs();
    const me = va.personId ? person(va.personId) : null;
    const my = me ? reviews().filter(r => r.subjectId === me.id).sort((a, b) => b.startedAt - a.startedAt) : [];
    root.innerHTML = `
      <h1 class="page-title">${esc(t('rev.title'))}</h1><p class="page-sub">${esc(t('rev.sub'))}</p>
      <div class="card">${my.length ? `<table class="table">
        <tr><th>${esc(t('rev.period'))}</th><th>${esc(t('rev.evaluator'))}</th><th>${esc(t('rev.status'))}</th><th></th></tr>
        ${my.map(r => {
          const action = ['pending_self', 'self_in_progress'].includes(r.status) ? t('rev.openWizard')
            : r.status === 'awaiting_employee_confirmation' ? t('rev.confirm') : t('rev.view');
          return `<tr class="clickable" onclick="location.hash='#/review/${r.id}'">
            <td><b>${esc(r.period)}</b><br><small style="color:var(--text-muted)">${esc(t('misc.' + ({ probation: 'probation', semi: 'semi', annual: 'annual' })[r.type]))}</small></td>
            <td>${avatar(person(r.evaluatorId), 26)} ${esc((person(r.evaluatorId) || {}).name || '-')}</td>
            <td>${stBadge(r.status)}</td>
            <td><button class="btn btn-sm btn-primary">${esc(action)}</button></td></tr>`;
        }).join('')}</table>` : `<div class="empty">${icon('inbox', 52)}<br>${esc(t('rev.noHistory'))}</div>`}
      </div>`;
  };

  /* ---- team reviews ---- */
  views.team = root => {
    const va = viewAs();
    let list = reviews().filter(r => r.period === Generator.CURRENT_PERIOD);
    if (va.role === 'manager') list = list.filter(r => r.evaluatorId === va.personId);
    list.sort((a, b) => a.startedAt - b.startedAt);
    root.innerHTML = `
      <h1 class="page-title">${esc(t('rev.teamTitle'))}</h1><p class="page-sub">${esc(t('rev.teamSub'))}</p>
      <div class="card">${list.length ? `<table class="table">
        <tr><th>${esc(t('rev.subject'))}</th><th>${esc(t('people.dept'))}</th><th>${esc(t('rev.status'))}</th><th>${esc(t('rev.deadline'))}</th><th></th></tr>
        ${list.map(r => {
          const p = person(r.subjectId); if (!p) return '';
          const d = ReviewLogic.daysLeft(r), rk = ReviewLogic.risk(r);
          return `<tr class="clickable" onclick="location.hash='#/review/${r.id}'">
            <td>${avatar(p, 30)} <b>${esc(p.name)}</b><br><small style="color:var(--text-muted)">${esc(p.role)}</small></td>
            <td>${esc(p.dept)}</td><td>${stBadge(r.status)}</td>
            <td><span class="badge ${rk === 'blocked' ? 'b-red' : rk === 'risk' ? 'b-amber' : ''}">${d} d</span></td>
            <td><button class="btn btn-sm">${esc(['self_done', 'manager_in_progress', 'manager_done', 'conversation_scheduled', 'conversation_done'].includes(r.status) ? t('rev.evaluate') : t('rev.view'))}</button></td></tr>`;
        }).join('')}</table>` : `<div class="empty">${icon('team', 52)}<br>${esc(t('rev.noHistory'))}</div>`}
      </div>`;
  };

  /* ---- review detail ---- */
  views.review = (root, id) => ReviewViews.renderDetail(root, id);

  /* ---- goals ---- */
  views.goals = root => {
    const va = viewAs();
    const co = Store.getCompany() || { kpis: [], teamKpis: [], goalPolicy: Generator.DEFAULT_GOAL_POLICY };
    const me = va.personId ? person(va.personId) : null;
    const policy = co.goalPolicy || Generator.DEFAULT_GOAL_POLICY;
    const all = Store.list('goals').filter(g => g.type === 'personal');
    const personal = va.role === 'hr' ? all : all.filter(g => g.ownerId === va.personId);
    const teamK = (co.teamKpis || []).filter(k => va.role === 'hr' || (me && k.deptKey === me.deptKey));

    const goalRow = g => {
      const owner = person(g.ownerId);
      return `<div style="display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px dashed var(--hairline);flex-wrap:wrap">
        ${va.role === 'hr' && owner ? avatar(owner, 30) : ''}
        <div style="flex:1;min-width:220px"><b>${esc(g.title)}</b> <span class="badge">${g.weight} %</span>
          ${UI.kpiChip(g.kpiRef)}
          ${g.confirmedByManager ? `<span class="badge b-green">${icon('check', 11)} ${esc(t('goals.confirmed'))}</span>` : `<span class="badge b-amber">${esc(t('goals.notConfirmed'))}</span>`}
          <div style="font-size:.82rem;color:var(--text-muted)">${esc(g.desc)}${va.role === 'hr' && owner ? ' · ' + esc(owner.name) : ''}</div></div>
        <div style="width:120px"><div class="progressbar"><div style="width:${g.progress}%"></div></div></div>
        <input type="range" min="0" max="100" value="${g.progress}" data-gp="${g.id}" style="width:80px">
        <b style="width:42px;text-align:right">${g.progress}%</b></div>`;
    };

    const areaSection = a => {
      const items = personal.filter(g => g.areaKey === a);
      const mineSum = me ? items.filter(g => g.ownerId === me.id).reduce((s2, g) => s2 + g.weight, 0) : 0;
      return `<div class="card"><h2>${icon('target', 18)}${esc(t('rev.area.' + a))}
          <span class="badge" style="margin-left:8px">${policy[a] || 2}×</span>
          ${Generator.KPI_REQUIRED[a] ? `<span class="badge b-blue">${esc(t('goals.kpi'))}</span>` : ''}
          ${va.role !== 'hr' && items.length ? `<span class="badge ${mineSum === 100 ? 'b-green' : 'b-amber'}">${esc(t('goals.sum'))}: ${mineSum} %</span>` : ''}
        </h2>
        ${items.length ? items.slice(0, va.role === 'hr' ? 10 : 99).map(goalRow).join('') : `<p class="page-sub">-</p>`}</div>`;
    };

    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('goals.title'))}</h1>
        <span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="g-add">${icon('plus', 15)} ${esc(t('goals.add'))}</button>
      </div>
      <p class="page-sub">${esc(t('goals.sub'))}</p>
      ${co.kpis && co.kpis.length ? `<div class="card"><h2>${icon('building', 18)}${esc(t('goals.company'))}</h2>
        <div class="bars">${co.kpis.map(k => `
          <div class="brow"><span title="${esc(k.desc)}">${esc(k.title)}</span>
          <div class="progressbar"><div style="width:${k.current}%"></div></div><b>${k.current}%</b></div>`).join('')}</div></div>` : ''}
      ${teamK.length ? `<div class="card"><h2>${icon('team', 18)}${esc(t('hr.teamKpis'))}</h2>
        <div class="bars">${teamK.map(k => `
          <div class="brow"><span><span class="badge">${esc(k.dept)}</span> ${esc(k.title)}</span>
          <div class="progressbar"><div style="width:${k.current}%"></div></div><b>${k.current}%</b></div>`).join('')}</div></div>` : ''}
      ${['teamwork', 'growth', 'quality'].map(areaSection).join('')}`;

    root.querySelectorAll('[data-gp]').forEach(sl => sl.onchange = () => {
      Store.update('goals', sl.dataset.gp, { progress: +sl.value });
      toast(t('common.saved')); render();
    });
    root.querySelector('#g-add').onclick = () => {
      const owner = va.personId || (personas().hr || {}).id;
      const kpiOpts = `<option value="">${esc(t('goals.kpiNone'))}</option>
        <optgroup label="${esc(t('goals.company'))}">${(co.kpis || []).map(k => `<option value="company:${k.id}">${esc(k.title)}</option>`).join('')}</optgroup>
        <optgroup label="${esc(t('hr.teamKpis'))}">${(co.teamKpis || []).map(k => `<option value="team:${k.id}">${esc(k.title)} (${esc(k.dept)})</option>`).join('')}</optgroup>`;
      modal(`<h3>${icon('plus', 18)}${esc(t('goals.add'))}</h3>
        <div class="field"><label>${esc(t('goals.area'))}</label>
          <select class="input" id="ng-area">${['teamwork', 'growth', 'quality'].map(a => `<option value="${a}">${esc(t('rev.area.' + a))}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('goals.name'))}</label><input class="input" id="ng-title"></div>
        <div class="field"><label>${esc(t('goals.desc'))}</label><textarea class="input" id="ng-desc"></textarea>
          <div class="hint">${esc(t('goals.smartHint'))}</div></div>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('goals.weight'))} (%)</label><input class="input" type="number" min="5" max="90" step="5" id="ng-w" value="30"></div>
          <div class="field"><label>${esc(t('goals.due'))}</label><input class="input" type="date" id="ng-due" value="2026-12-31"></div>
        </div>
        <div class="field"><label>${esc(t('goals.kpi'))}</label><select class="input" id="ng-kpi">${kpiOpts}</select></div>
        <div class="wizard-foot"><button class="btn" id="ng-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="ng-save">${esc(t('common.save'))}</button></div>`, m => {
        m.querySelector('#ng-cancel').onclick = closeModal;
        m.querySelector('#ng-save').onclick = () => {
          const title = m.querySelector('#ng-title').value.trim();
          if (!title) return;
          const area = m.querySelector('#ng-area').value;
          const kv = m.querySelector('#ng-kpi').value;
          if (Generator.KPI_REQUIRED[area] && !kv) { toast(t('goals.kpiRequired')); return; }
          const kpiRef = kv ? { type: kv.split(':')[0], id: kv.split(':')[1] } : null;
          Store.insert('goals', { id: uid(), ownerId: owner, areaKey: area, title, desc: m.querySelector('#ng-desc').value, weight: +m.querySelector('#ng-w').value || 30, progress: 0, kpiRef, confirmedByManager: false, due: m.querySelector('#ng-due').value, type: 'personal', period: Generator.CURRENT_PERIOD });
          closeModal(); toast(t('common.saved')); render();
        };
      });
    };
  };

  /* ---- people ---- */
  views.people = root => {
    const ps = people();
    const co = Store.getCompany();
    const emptyCo = !ps.length;
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('people.title'))} <span class="badge b-blue">${ps.length}</span></h1>
        <span style="flex:1"></span>
        <button class="btn btn-sm" id="p-import">${icon('importBox', 15)} ${esc(t('people.import'))}</button>
        <button class="btn btn-primary btn-sm" id="p-add">${icon('plus', 15)} ${esc(t('people.addPerson'))}</button>
      </div>
      <p class="page-sub">${esc(t('people.sub'))}</p>
      ${emptyCo ? `<div class="card"><div class="empty">${icon('people', 52)}<br>
        <b>${esc(t('people.emptyTitle'))}</b><p>${esc(t('people.emptyDesc'))}</p>
        <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" id="p-add2">${icon('plus', 15)} ${esc(t('people.addPerson'))}</button>
          <button class="btn" id="p-import2">${icon('importBox', 15)} ${esc(t('people.import'))}</button></div></div></div>`
      : `<div class="card"><input class="input" id="p-search" placeholder="${esc(t('common.search'))}" style="margin-bottom:12px">
         <div id="p-table"></div></div>`}`;

    function tableHtml(filter) {
      const f = (filter || '').toLowerCase();
      const list = ps.filter(p => !f || p.name.toLowerCase().includes(f) || p.role.toLowerCase().includes(f) || p.dept.toLowerCase().includes(f));
      return `<table class="table">
        <tr><th>${esc(t('people.name'))}</th><th>${esc(t('people.role'))}</th><th>${esc(t('people.dept'))}</th><th>${esc(t('people.manager'))}</th></tr>
        ${list.slice(0, 120).map(p => `<tr>
          <td>${avatar(p, 32)} <b>${esc(p.name)}</b><br><small style="color:var(--text-muted)">${esc(p.email)}</small></td>
          <td>${esc(p.role)}</td><td><span class="badge">${esc(p.dept)}</span></td>
          <td>${p.managerId ? esc((person(p.managerId) || {}).name || '-') : '-'}</td></tr>`).join('')}</table>`;
    }
    const tbl = root.querySelector('#p-table');
    if (tbl) {
      tbl.innerHTML = tableHtml('');
      root.querySelector('#p-search').oninput = e => tbl.innerHTML = tableHtml(e.target.value);
    }

    const importFn = () => {
      modal(`<h3>${icon('importBox', 18)}${esc(t('people.importTitle'))}</h3><p style="color:var(--text-muted);margin-bottom:14px">${esc(t('people.importDesc'))}</p>
        <div class="choice-grid">${['it', 'travel', 'auto'].map(k =>
          `<button class="choice" data-imp="${k}"><span class="ch-ico">${icon(INDICO[k], 26)}</span><b>${esc(t('ob.industry.' + k))}</b></button>`).join('')}
        </div>
        <div class="field" style="margin-top:12px"><label>${esc(t('ob.size'))}: <b id="imp-val">50</b></label>
        <input type="range" min="15" max="200" step="5" value="50" id="imp-size" style="width:100%"></div>`, m => {
        m.querySelector('#imp-size').oninput = e => m.querySelector('#imp-val').textContent = e.target.value;
        m.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => {
          Generator.install(b.dataset.imp, +m.querySelector('#imp-size').value);
          Store.patchSettings({ viewAs: null });
          closeModal(); toast(t('ob.generate')); render();
        });
      });
    };
    const addFn = () => {
      const depts = co && co.departments.length ? co.departments : [{ key: 'general', name: 'Obecné' }];
      modal(`<h3>${icon('plus', 18)}${esc(t('people.addPerson'))}</h3>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('people.name'))}</label><input class="input" id="np-name"></div>
          <div class="field"><label>${esc(t('people.role'))}</label><input class="input" id="np-role"></div>
        </div>
        <div class="grid cols-2">
          <div class="field"><label>${esc(t('people.dept'))}</label>
            <select class="input" id="np-dept">${depts.map(d => `<option value="${d.key}">${esc(d.name)}</option>`).join('')}</select></div>
          <div class="field"><label>${esc(t('people.manager'))}</label>
            <select class="input" id="np-mgr"><option value="">-</option>${ps.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        </div>
        <div class="wizard-foot"><button class="btn" id="np-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="np-save">${esc(t('common.save'))}</button></div>`, m => {
        m.querySelector('#np-cancel').onclick = closeModal;
        m.querySelector('#np-save').onclick = () => {
          const name = m.querySelector('#np-name').value.trim(); if (!name) return;
          const parts = name.split(/\s+/);
          const deptKey = m.querySelector('#np-dept').value;
          const dept = depts.find(d => d.key === deptKey);
          Store.insert('people', {
            id: uid(), firstName: parts[0], lastName: parts.slice(1).join(' ') || '',
            name, initials: (parts[0][0] || '?') + ((parts[1] || ' ')[0] || ''),
            hue: Math.floor(Math.random() * 360), role: m.querySelector('#np-role').value || '-',
            deptKey, dept: dept ? dept.name : deptKey, managerId: m.querySelector('#np-mgr').value || null,
            isHead: false, email: name.toLowerCase().replace(/\s+/g, '.') + '@firma.cz', hiredMonthsAgo: 0, female: false,
          });
          closeModal(); toast(t('common.saved')); render();
        };
      });
    };
    ['p-import', 'p-import2'].forEach(id => { const b = root.querySelector('#' + id); if (b) b.onclick = importFn; });
    ['p-add', 'p-add2'].forEach(id => { const b = root.querySelector('#' + id); if (b) b.onclick = addFn; });
  };

  /* ---- org chart (canvas: pan + zoom + collapse) ---- */
  const orgUi = { collapsed: null, x: 24, y: 16, z: 1 };

  views.org = root => {
    const ps = people();
    const roots = ps.filter(p => !p.managerId);
    const kidsOf = id => ps.filter(x => x.managerId === id);
    const subtreeCount = p => kidsOf(p.id).reduce((n, k) => n + 1 + subtreeCount(k), 0);

    /* succession overlay (DERTOUR legenda) - vidí jen manažer a HR, zaměstnanec nikdy */
    const showSucc = ['hr', 'manager'].includes(viewAs().role);
    const succ = showSucc ? SuccLogic.succMaps() : { kpByHolder: {}, succLevel: {} };

    /* default: sbalit vše pod úrovní vedoucích (CEO + heads viditelní) */
    if (orgUi.collapsed === null) {
      orgUi.collapsed = new Set();
      const mark = (p, depth) => kidsOf(p.id).forEach(k => {
        if (kidsOf(k.id).length) orgUi.collapsed.add(k.id); // start: jen CEO + přímí podřízení
        mark(k, depth + 1);
      });
      roots.forEach(r0 => mark(r0, 0));
    }

    function nodeHtml(p) {
      const kids = kidsOf(p.id);
      const isCollapsed = orgUi.collapsed.has(p.id);
      const toggle = kids.length ? `
        <button class="org-toggle" data-org-toggle="${p.id}" title="${kids.length}">
          ${isCollapsed ? `＋ ${subtreeCount(p)}` : '-'}
        </button>` : '';
      const kp = succ.kpByHolder[p.id];
      const sl = succ.succLevel[p.id];
      const rcq = (succ.red || {})[p.id];
      const uncovered = kp && !(kp.successors || []).length;
      return `<div class="org-branch">
        <div class="org-node ${kp ? 'org-kp' : ''} ${rcq ? 'org-redcard' : sl === 'key' ? 'org-succ-key' : sl ? 'org-succ-reg' : ''}"
          ${kp ? `title="${esc(t('kp.legend.kp'))}: ${esc(kp.title)}${uncovered ? ' · ' + esc(t('kp.noSucc')) : ''}"` : sl ? `title="${esc(t(sl === 'key' ? 'kp.succKey' : 'kp.succReg'))}"` : ''}>
          ${avatar(p, 40)}<div class="nm">${esc(p.name)}</div><div class="rl">${esc(p.role)}</div>
          ${uncovered ? `<span class="org-flag" title="${esc(t('kp.noSucc'))}">!</span>` : ''}${toggle}</div>
        ${kids.length && !isCollapsed ? `<div class="org-vline"></div><div class="org-children">
          ${kids.map(nodeHtml).join('')}</div>` : ''}
      </div>`;
    }

    root.innerHTML = `
      <h1 class="page-title">${esc(t('org.title'))}</h1>
      <p class="page-sub">${esc(t('org.sub'))} ${esc(t('org.hint'))}</p>
      ${roots.length ? `
      <div class="card" style="padding:0;position:relative;overflow:hidden">
        <div class="org-zoom">
          <button class="iconbtn" id="oz-in" title="+">${icon('plus', 16)}</button>
          <button class="iconbtn" id="oz-out" title="-"><svg class="pi" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5.2 12h13.6"/></svg></button>
          <button class="iconbtn" id="oz-fit" title="reset">${icon('refresh', 15)}</button>
        </div>
        <div class="org-canvas" id="org-canvas">
          <div class="org-stage" id="org-stage" style="transform:translate(${orgUi.x}px,${orgUi.y}px) scale(${orgUi.z})">
            ${roots.map(nodeHtml).join('')}
          </div>
        </div>
      </div>
      ${showSucc && (Store.list('keyPositions').length || Store.list('redCards').length) ? `
      <div class="card" style="margin-top:12px">
        <div class="org-legend">
          <span><i class="ol-kp"></i>${esc(t('kp.legend.kp'))}</span>
          <span><i class="ol-key"></i>${esc(t('kp.succKey'))}</span>
          <span><i class="ol-reg"></i>${esc(t('kp.succReg'))}</span>
          <span><i class="ol-red"></i>${esc(t('rc.legend'))}</span>
          <span><i class="ol-flag">!</i>${esc(t('kp.noSucc'))}</span>
          <span style="margin-left:auto;color:var(--text-muted);font-size:.78rem">${icon('lock', 12)} ${esc(t('kp.legend.privacy'))}</span>
        </div>
      </div>` : ''}`
      : `<div class="card"><div class="empty">${icon('sprout', 52)}<br>${esc(t('people.emptyDesc'))}</div></div>`}`;

    const canvas = root.querySelector('#org-canvas');
    const stage = root.querySelector('#org-stage');
    if (!canvas) return;

    const apply = () => { stage.style.transform = `translate(${orgUi.x}px,${orgUi.y}px) scale(${orgUi.z})`; };
    const setZoom = (z, cx, cy) => {
      z = Math.max(.3, Math.min(2.2, z));
      if (cx != null) { /* zoom k bodu kurzoru */
        const k = z / orgUi.z;
        orgUi.x = cx - k * (cx - orgUi.x);
        orgUi.y = cy - k * (cy - orgUi.y);
      }
      orgUi.z = z; apply();
    };

    /* pan - pointer events (myš i dotyk), klik na ＋/- zůstává klikem */
    let drag = null;
    canvas.addEventListener('pointerdown', e => {
      if (e.target.closest('.org-toggle')) return;
      drag = { sx: e.clientX, sy: e.clientY, ox: orgUi.x, oy: orgUi.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      orgUi.x = drag.ox + dx; orgUi.y = drag.oy + dy; apply();
    });
    const endDrag = () => { drag = null; canvas.classList.remove('grabbing'); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /* zoom - kolečko / pinch-trackpad */
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom(orgUi.z * factor, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    root.querySelector('#oz-in').onclick = () => setZoom(orgUi.z * 1.2);
    root.querySelector('#oz-out').onclick = () => setZoom(orgUi.z / 1.2);
    root.querySelector('#oz-fit').onclick = () => { orgUi.x = 24; orgUi.y = 16; orgUi.z = 1; apply(); };

    /* collapse / expand */
    root.querySelectorAll('[data-org-toggle]').forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const id = btn.dataset.orgToggle;
      if (orgUi.collapsed.has(id)) orgUi.collapsed.delete(id); else orgUi.collapsed.add(id);
      views.org(root);
    });
  };

  /* ---- kudos ---- */
  views.kudos = root => {
    const list = Store.list('kudos').slice().reverse();
    const va = viewAs();
    const VAL = { team: 'kudos.value.team', quality: 'kudos.value.quality', growth: 'kudos.value.growth', client: 'kudos.value.client' };
    const KICON = { team: 'link2', quality: 'gem', growth: 'sprout', client: 'heart' };
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('kudos.title'))}</h1><span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="k-give">${icon('heartPulse', 15)} ${esc(t('kudos.give'))}</button></div>
      <p class="page-sub">${esc(t('kudos.sub'))}</p>
      ${list.length ? list.map(k => {
        const from = person(k.fromId), to = person(k.toId);
        return `<div class="card kudo" style="margin-bottom:12px">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            ${avatar(from, 34)} <b>${esc(from ? from.name : '?')}</b> → ${avatar(to, 34)} <b>${esc(to ? to.name : '?')}</b>
            <span class="badge b-blue">${icon(KICON[k.value] || 'link2', 13)} ${esc(t(VAL[k.value] || VAL.team))}</span>
            <span style="margin-left:auto;color:var(--text-muted);font-size:.8rem">${fmtDate(k.at)}</span></div>
          <p style="margin-top:8px">${esc(k.msg)}</p></div>`;
      }).join('') : `<div class="card"><div class="empty">${icon('heartPulse', 52)}</div></div>`}`;
    root.querySelector('#k-give').onclick = () => {
      const ps = people();
      modal(`<h3>${icon('heartPulse', 18)}${esc(t('kudos.give'))}</h3>
        <div class="field"><label>${esc(t('kudos.to'))}</label>
          <select class="input" id="k-to">${ps.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('kudos.msg'))}</label><textarea class="input" id="k-msg"></textarea></div>
        <div class="field"><div class="scale-row">${Object.keys(VAL).map((v, i) =>
          `<button type="button" class="scale-opt ${i === 0 ? 'sel' : ''}" data-kv="${v}">${icon(KICON[v], 16)}<br>${esc(t(VAL[v]))}</button>`).join('')}</div></div>
        <div class="wizard-foot"><button class="btn" id="k-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="k-send">${esc(t('common.send'))}</button></div>`, m => {
        let val = 'team';
        m.querySelectorAll('[data-kv]').forEach(b => b.onclick = () => {
          m.querySelectorAll('[data-kv]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); val = b.dataset.kv;
        });
        m.querySelector('#k-cancel').onclick = closeModal;
        m.querySelector('#k-send').onclick = () => {
          const msg = m.querySelector('#k-msg').value.trim(); if (!msg) return;
          Store.insert('kudos', { id: uid(), fromId: va.personId || (personas().hr || {}).id, toId: m.querySelector('#k-to').value, msg, value: val, at: Date.now() });
          notify(t('kudos.give'), 'all');
          closeModal(); toast(t('common.send')); render();
        };
      });
    };
  };

  /* ---- check-ins ---- */
  views.checkins = root => {
    const va = viewAs();
    let list = Store.list('checkins').slice().reverse();
    if (va.role === 'manager') list = list.filter(c => c.managerId === va.personId);
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('ci.title'))}</h1><span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="ci-new">${icon('plus', 15)} ${esc(t('ci.new'))}</button></div>
      <p class="page-sub">${esc(t('ci.sub'))}</p>
      ${list.length ? list.map(c => {
        const m = person(c.managerId), e = person(c.employeeId);
        return `<div class="card" style="margin-bottom:12px">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span style="font-size:1.4rem">${c.mood}</span> ${avatar(m, 30)} <b>${esc(m ? m.name : '?')}</b> × ${avatar(e, 30)} <b>${esc(e ? e.name : '?')}</b>
            <span style="margin-left:auto;color:var(--text-muted);font-size:.8rem">${fmtDate(c.at)}</span></div>
          <p style="margin-top:8px">${esc(c.notes)}</p>
          <p style="margin-top:4px;font-size:.85rem;color:var(--text-muted)">→ ${esc(c.next)}</p></div>`;
      }).join('') : `<div class="card"><div class="empty">${icon('checkin', 52)}</div></div>`}`;
    root.querySelector('#ci-new').onclick = () => {
      const ps = people();
      modal(`<h3>${icon('plus', 18)}${esc(t('ci.new'))}</h3>
        <div class="field"><label>${esc(t('ci.with'))}</label>
          <select class="input" id="ci-who">${ps.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('ci.mood'))}</label>
          <div class="scale-row">${['😄', '🙂', '😐', '😟'].map((m2, i) => `<button type="button" class="scale-opt ${i === 1 ? 'sel' : ''}" data-md="${m2}" style="font-size:1.3rem">${m2}</button>`).join('')}</div></div>
        <div class="field"><label>${esc(t('ci.notes'))}</label><textarea class="input" id="ci-notes"></textarea></div>
        <div class="field"><label>${esc(t('ci.next'))}</label><input class="input" id="ci-next"></div>
        <div class="wizard-foot"><button class="btn" id="ci-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="ci-save">${esc(t('common.save'))}</button></div>`, m => {
        let mood = '🙂';
        m.querySelectorAll('[data-md]').forEach(b => b.onclick = () => {
          m.querySelectorAll('[data-md]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); mood = b.dataset.md;
        });
        m.querySelector('#ci-cancel').onclick = closeModal;
        m.querySelector('#ci-save').onclick = () => {
          Store.insert('checkins', { id: uid(), managerId: va.personId || (personas().hr || {}).id, employeeId: m.querySelector('#ci-who').value, at: Date.now(), mood, notes: m.querySelector('#ci-notes').value, next: m.querySelector('#ci-next').value });
          closeModal(); toast(t('common.saved')); render();
        };
      });
    };
  };

  /* ---- HR center ---- */
  views.hr = root => {
    const cur = reviews().filter(r => r.period === Generator.CURRENT_PERIOD);
    const done = cur.filter(r => ['confirmed', 'closed_by_hr'].includes(r.status)).length;
    const co = Store.getCompany();
    const stOrder = ['pending_self', 'self_in_progress', 'self_done', 'manager_in_progress', 'manager_done', 'conversation_scheduled', 'conversation_done', 'awaiting_employee_confirmation', 'confirmed'];
    const dist = stOrder.map(s => [s, cur.filter(r => r.status === s).length]).filter(([, n]) => n > 0);
    const atRisk = cur.filter(r => ['risk', 'blocked'].includes(ReviewLogic.risk(r)));
    // rating distribution from manager ratings of closed reviews
    // (competency ratings in detailed mode, area ratings otherwise)
    const ratings = { TN: 0, PO: 0, KV: 0, NR: 0, NU: 0 };
    reviews().filter(r => ['confirmed', 'closed_by_hr'].includes(r.status)).forEach(r => {
      const cr = r.form.compRatings;
      const vals = (cr && cr.mgr && Object.keys(cr.mgr).length) ? Object.values(cr.mgr) : Object.values(r.form.mgr.areas);
      vals.forEach(v => { if (ratings[v] != null) ratings[v]++; });
    });
    const maxR = Math.max(1, ...Object.values(ratings));
    const tl = [[0, 'hr.tl.0'], [5, 'hr.tl.5'], [10, 'hr.tl.10'], [15, 'hr.tl.15'], [18, 'hr.tl.18'], [25, 'hr.tl.25'], [30, 'hr.tl.30'], [35, 'hr.tl.35']];
    const bandCounts = { top: 0, std: 0, dev: 0, risk: 0 };
    reviews().filter(r => ['confirmed', 'closed_by_hr'].includes(r.status)).forEach(r => {
      const bb = ReviewLogic.band(ReviewLogic.computeScore(r.form));
      if (bb) bandCounts[bb.key]++;
    });
    const bandTotal = Math.max(1, Object.values(bandCounts).reduce((x, y) => x + y, 0));
    const policy = (co && co.goalPolicy) || Generator.DEFAULT_GOAL_POLICY;

    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="page-title" style="margin:0">${esc(t('hr.title'))}</h1><span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="hr-cycle">${icon('spark', 15)} ${esc(t('hr.newCycle'))}</button></div>
      <p class="page-sub">${esc(t('hr.sub'))} · ${esc(t('hr.cycle'))}: <b>${esc(Generator.CURRENT_PERIOD)}</b></p>

      <div class="grid cols-4">
        <div class="card"><div class="kpi-num">${cur.length}</div><div class="kpi-label">${esc(t('hr.participants'))}</div></div>
        <div class="card"><div class="kpi-num">${cur.length ? Math.round(done / cur.length * 100) : 0}%</div><div class="kpi-label">${esc(t('hr.completion'))}</div></div>
        <div class="card"><div class="kpi-num" style="color:${atRisk.length ? 'var(--warn)' : 'var(--ok)'}">${atRisk.length}</div><div class="kpi-label">${esc(t('hr.atRisk'))}</div></div>
        <div class="card"><div class="kpi-num">${Store.list('kudos').length}</div><div class="kpi-label">${esc(t('kudos.title'))}</div></div>
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><h2>${icon('gauge', 18)}${esc(t('hr.statusDist'))}</h2>
          <div class="bars">${dist.map(([s, n]) => `
            <div class="brow"><span>${esc(t('st.' + s))}</span>
            <div class="progressbar"><div style="width:${n / Math.max(1, cur.length) * 100}%"></div></div><b>${n}</b></div>`).join('') || '-'}</div></div>
        <div class="card"><h2>${icon('spark', 18)}${esc(t('hr.ratingDist'))}</h2>
          <div class="bars">${Object.entries(ratings).map(([k, n]) => `
            <div class="brow"><span><b>${k}</b> ${esc(t('help.scale.' + k))}</span>
            <div class="progressbar"><div style="width:${n / maxR * 100}%"></div></div><b>${n}</b></div>`).join('')}</div></div>
      </div>

      <div class="card"><h2>${icon('alert', 18)}${esc(t('hr.atRisk'))}</h2>
        ${atRisk.length ? `<table class="table"><tr><th>${esc(t('rev.subject'))}</th><th>${esc(t('rev.evaluator'))}</th><th>${esc(t('rev.status'))}</th><th>${esc(t('rev.deadline'))}</th><th></th></tr>
          ${atRisk.slice(0, 12).map(r => {
            const p = person(r.subjectId), ev = person(r.evaluatorId);
            const d = ReviewLogic.daysLeft(r);
            return `<tr><td>${avatar(p, 28)} ${esc(p ? p.name : '')}</td><td>${esc(ev ? ev.name : '')}</td>
              <td>${stBadge(r.status)}</td><td><span class="badge ${d < 0 ? 'b-red' : 'b-amber'}">${d} d</span></td>
              <td><button class="btn btn-sm" data-remind="${r.id}">${icon('send', 13)} ${esc(t('hr.remind'))}</button></td></tr>`;
          }).join('')}</table>` : `<p class="page-sub">${esc(t('hr.noRisk'))}</p>`}
      </div>

      <div class="card"><h2>${icon('building', 18)}${esc(t('hr.kpiBoard'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('hr.kpiHint'))}</p>
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="kpi-add">${icon('plus', 14)} ${esc(t('common.add'))}</button></div>
        ${co && co.kpis.length ? `<div class="bars">${co.kpis.map(k => `
          <div class="brow" data-kedit="${k.id}" style="cursor:pointer" title="${esc(t('common.edit'))} - ${esc(k.desc)}">
          <span>${esc(k.title)} <small style="color:var(--text-muted)">(${esc(t('goals.weight'))} ${k.weight} %, ${esc(t('hr.kpiTarget'))}: ${esc(k.target)})</small></span>
          <div class="progressbar"><div style="width:${k.current}%"></div></div><b>${k.current}%</b></div>`).join('')}</div>` : `<p class="page-sub">-</p>`}
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><h2>${icon('target', 18)}${esc(t('hr.policy'))}</h2>
          <p class="page-sub" style="margin-bottom:10px">${esc(t('hr.policyHint'))}</p>
          ${['teamwork', 'growth', 'quality'].map(a => `
            <div class="field" style="display:flex;align-items:center;gap:10px">
              <label style="flex:1;margin:0">${esc(t('rev.area.' + a))} ${Generator.KPI_REQUIRED[a] ? `<span class="badge b-blue">${esc(t('goals.kpi'))}</span>` : ''}</label>
              <input class="input" style="width:84px" type="number" min="2" max="5" data-pol="${a}" value="${policy[a] || 2}">
            </div>`).join('')}
          <label style="display:flex;gap:8px;align-items:center;margin:10px 0;font-size:.9rem;cursor:pointer">
            <input type="checkbox" id="pol-semi" ${((co && co.cycleConfig) || { semiEnabled: true }).semiEnabled ? 'checked' : ''}>
            ${esc(t('hr.semiEnabled'))}</label>
          <div class="field" style="display:flex;align-items:center;gap:10px">
            <label style="flex:1;margin:0">${esc(t('tc.cadence'))}</label>
            <select class="input" style="width:160px" id="pol-tc">
              ${['q', 'semi', 'off'].map(k => `<option value="${k}" ${(((co && co.cycleConfig) || {}).talentCheck || 'q') === k ? 'selected' : ''}>${esc(t('tc.cad.' + k))}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="display:flex;align-items:center;gap:10px">
            <label style="flex:1;margin:0">${esc(t('cand.threshold'))} <small style="color:var(--text-muted)">(/21)</small></label>
            <input class="input" style="width:160px" type="number" min="11" max="21" id="pol-cand" value="${(((co && co.cycleConfig) || {}).candidateThreshold || 16)}">
          </div>
          <button class="btn btn-sm" id="pol-save">${esc(t('common.save'))}</button>
        </div>
        <div class="card"><h2>${icon('gauge', 18)}${esc(t('hr.compBands'))}</h2>
          <p class="page-sub" style="margin-bottom:10px">${esc(t('hr.compHint'))}</p>
          <div class="bars">${['top', 'std', 'dev', 'risk'].map(k => `
            <div class="brow"><span>${esc(t('band.' + k))}</span>
            <div class="progressbar"><div style="width:${bandCounts[k] / bandTotal * 100}%"></div></div><b>${bandCounts[k]}</b></div>`).join('')}</div>
        </div>
      </div>

      <div class="card"><h2>${icon('spark', 18)}${esc(t('comp.title'))}</h2>
        <p class="page-sub" style="margin-bottom:10px">${esc(t('comp.hint'))}</p>
        <div class="choice-grid" style="margin-bottom:12px">
          <button class="choice ${!(co && co.competencies) ? 'sel' : ''}" id="comp-simple"><b>${esc(t('comp.simple'))}</b><span>${esc(t('rev.area.teamwork'))} · ${esc(t('rev.area.growth'))} · ${esc(t('rev.area.quality'))}</span></button>
          <button class="choice ${(co && co.competencies) ? 'sel' : ''}" id="comp-detailed"><b>${esc(t('comp.detailed'))}</b><span>${Generator.COMP_LIB.map(c => esc(c.title)).join(' · ')}</span></button>
        </div>
        ${(co && co.competencies) ? `
          <div id="comp-editor">
            ${co.competencies.map((c, i) => `
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                <span style="flex:1;min-width:180px">${esc(c.title)}</span>
                <input class="input" style="width:80px" type="number" min="5" max="50" step="5" data-cw="${i}" value="${c.weight}">
                <select class="input" style="width:170px" data-ca="${i}">
                  ${['teamwork', 'growth', 'quality'].map(a => `<option value="${a}" ${c.areaKey === a ? 'selected' : ''}>${esc(t('rev.area.' + a))}</option>`).join('')}
                </select>
              </div>`).join('')}
            <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
              <span class="badge ${co.competencies.reduce((x, c) => x + c.weight, 0) === 100 ? 'b-green' : 'b-amber'}" id="comp-sum">${esc(t('goals.sum'))}: ${co.competencies.reduce((x, c) => x + c.weight, 0)} %</span>
              <button class="btn btn-sm" id="comp-save">${esc(t('common.save'))}</button>
            </div>
          </div>` : ''}
      </div>

      <div class="card"><h2>${icon('tree', 18)}${esc(t('hr.depts'))}</h2>
        <p class="page-sub" style="margin-bottom:8px">${esc(t('hr.deptHint'))}</p>
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="dept-add">${icon('plus', 14)} ${esc(t('common.add'))}</button></div>
        ${(co && co.departments && co.departments.length) ? `<table class="table">
          <tr><th>${esc(t('people.dept'))}</th><th>${esc(t('people.title'))}</th><th>${esc(t('hr.teamKpis'))}</th><th></th></tr>
          ${co.departments.map(d => {
            const n = people().filter(p => p.deptKey === d.key).length;
            const k = (co.teamKpis || []).filter(x => x.deptKey === d.key).length;
            return `<tr><td><b>${esc(d.name)}</b></td><td>${n}</td><td>${k}</td>
              <td>${n === 0 && d.key !== 'vedeni' ? `<button class="btn btn-sm btn-danger" data-dept-del="${d.key}">${icon('trash', 13)}</button>` : ''}</td></tr>`;
          }).join('')}</table>` : `<p class="page-sub">-</p>`}
      </div>

      <div class="card"><h2>${icon('team', 18)}${esc(t('hr.teamKpis'))}</h2>
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="tk-add">${icon('plus', 14)} ${esc(t('common.add'))}</button></div>
        ${(co && co.teamKpis && co.teamKpis.length) ? `<div class="bars">${co.teamKpis.map(k => `
          <div class="brow"><span><span class="badge">${esc(k.dept)}</span> ${esc(k.title)}</span>
          <div class="progressbar"><div style="width:${k.current}%"></div></div><b>${k.current}%</b></div>`).join('')}</div>` : `<p class="page-sub">-</p>`}
      </div>

      <div class="card"><h2>${icon('clock', 18)}${esc(t('hr.timeline'))}</h2>
        <ul class="timeline">${tl.map(([d, key]) => `<li><span class="tday">${esc(t('common.day'))} ${d}</span> ${esc(t(key))}</li>`).join('')}</ul></div>`;

    root.querySelectorAll('[data-remind]').forEach(b => b.onclick = () => {
      notify(t('hr.reminded'), 'all'); toast(t('hr.reminded'));
    });
    const polSave = root.querySelector('#pol-save');
    if (polSave) polSave.onclick = () => {
      const gp = Object.assign({}, policy);
      root.querySelectorAll('[data-pol]').forEach(el => gp[el.dataset.pol] = Math.max(2, Math.min(5, +el.value || 2)));
      co.goalPolicy = gp;
      const semiEl = root.querySelector('#pol-semi');
      const tcEl = root.querySelector('#pol-tc');
      const candEl = root.querySelector('#pol-cand');
      co.cycleConfig = Object.assign({ semiEnabled: true }, co.cycleConfig,
        semiEl ? { semiEnabled: semiEl.checked } : {},
        tcEl ? { talentCheck: tcEl.value } : {},
        candEl ? { candidateThreshold: Math.max(11, Math.min(21, +candEl.value || 16)) } : {});
      Store.setCompany(co); toast(t('common.saved'));
    };
    const cSimple = root.querySelector('#comp-simple');
    if (cSimple) cSimple.onclick = () => { co.competencies = null; Store.setCompany(co); toast(t('common.saved')); render(); };
    const cDet = root.querySelector('#comp-detailed');
    if (cDet) cDet.onclick = () => {
      if (!co.competencies) { co.competencies = Generator.COMP_LIB.map(c => Object.assign({}, c)); Store.setCompany(co); render(); }
    };
    const cSave = root.querySelector('#comp-save');
    if (cSave) cSave.onclick = () => {
      const items = co.competencies.map(c => Object.assign({}, c));
      root.querySelectorAll('[data-cw]').forEach(el => items[+el.dataset.cw].weight = +el.value || 0);
      root.querySelectorAll('[data-ca]').forEach(el => items[+el.dataset.ca].areaKey = el.value);
      const sum = items.reduce((x, c) => x + c.weight, 0);
      if (sum !== 100) { toast(t('goals.sumBad')); return; }
      co.competencies = items; Store.setCompany(co); toast(t('common.saved')); render();
    };
        const kpiModal = (k) => {
      modal(`<h3>${icon('building', 18)}${esc(t('hr.kpiBoard'))}</h3>
        <div class="field"><label>${esc(t('goals.name'))}</label><input class="input" id="kp-title" value="${esc(k ? k.title : '')}"></div>
        <div class="field"><label>${esc(t('goals.desc'))}</label><textarea class="input" id="kp-desc" style="min-height:64px">${esc(k ? k.desc : '')}</textarea></div>
        <div class="grid cols-3">
          <div class="field"><label>${esc(t('hr.kpiTarget'))}</label><input class="input" id="kp-target" value="${esc(k ? k.target : '')}"></div>
          <div class="field"><label>${esc(t('goals.weight'))} (%)</label><input class="input" type="number" min="5" max="60" step="5" id="kp-w" value="${k ? k.weight : 20}"></div>
          <div class="field"><label>${esc(t('hr.kpiCurrent'))}</label><input class="input" type="number" min="0" max="100" id="kp-cur" value="${k ? k.current : 0}"></div>
        </div>
        <div class="wizard-foot">
          ${k ? `<button class="btn btn-danger" id="kp-del">${icon('trash', 14)} ${esc(t('common.delete'))}</button>` : '<span></span>'}
          <div style="display:flex;gap:8px">
            <button class="btn" id="kp-cancel">${esc(t('common.cancel'))}</button>
            <button class="btn btn-primary" id="kp-save">${esc(t('common.save'))}</button>
          </div>
        </div>`, m => {
        m.querySelector('#kp-cancel').onclick = closeModal;
        const del = m.querySelector('#kp-del');
        if (del) del.onclick = () => {
          co.kpis = co.kpis.filter(x => x.id !== k.id);
          Store.setCompany(co); closeModal(); toast(t('common.saved')); render();
        };
        m.querySelector('#kp-save').onclick = () => {
          const title = m.querySelector('#kp-title').value.trim(); if (!title) return;
          const data = {
            title, desc: m.querySelector('#kp-desc').value,
            target: m.querySelector('#kp-target').value,
            weight: +m.querySelector('#kp-w').value || 20,
            current: Math.max(0, Math.min(100, +m.querySelector('#kp-cur').value || 0)),
          };
          if (k) Object.assign(co.kpis.find(x => x.id === k.id), data);
          else { co.kpis = co.kpis || []; co.kpis.push(Object.assign({ id: uid() }, data)); }
          Store.setCompany(co); closeModal(); toast(t('common.saved')); render();
        };
      });
    };
    const kpiAdd = root.querySelector('#kpi-add');
    if (kpiAdd) kpiAdd.onclick = () => kpiModal(null);
    root.querySelectorAll('[data-kedit]').forEach(el => el.onclick = () => {
      const k = (co.kpis || []).find(x => x.id === el.dataset.kedit);
      if (k) kpiModal(k);
    });
        const deptAdd = root.querySelector('#dept-add');
    if (deptAdd) deptAdd.onclick = () => {
      modal(`<h3>${icon('plus', 18)}${esc(t('hr.depts'))}</h3>
        <div class="field"><label>${esc(t('people.dept'))}</label><input class="input" id="dp-name"></div>
        <div class="wizard-foot"><button class="btn" id="dp-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="dp-save">${esc(t('common.save'))}</button></div>`, m => {
        m.querySelector('#dp-cancel').onclick = closeModal;
        m.querySelector('#dp-save').onclick = () => {
          const name = m.querySelector('#dp-name').value.trim(); if (!name) return;
          const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
          co.departments = co.departments || [];
          if (co.departments.some(d => d.key === key)) { toast(t('common.saved')); closeModal(); return; }
          co.departments.push({ key, name });
          Store.setCompany(co); closeModal(); toast(t('common.saved')); render();
        };
      });
    };
    root.querySelectorAll('[data-dept-del]').forEach(b => b.onclick = () => {
      const key = b.dataset.deptDel;
      if (people().some(p => p.deptKey === key)) { toast(t('hr.deptDeleteBlocked')); return; }
      co.departments = co.departments.filter(d => d.key !== key);
      co.teamKpis = (co.teamKpis || []).filter(k => k.deptKey !== key);
      Store.setCompany(co); toast(t('common.saved')); render();
    });
        const tkAdd = root.querySelector('#tk-add');
    if (tkAdd) tkAdd.onclick = () => {
      const depts = (co.departments || []).filter(d => d.key !== 'vedeni');
      modal(`<h3>${icon('plus', 18)}${esc(t('hr.teamKpis'))}</h3>
        <div class="field"><label>${esc(t('goals.name'))}</label><input class="input" id="tk-title"></div>
        <div class="field"><label>${esc(t('people.dept'))}</label>
          <select class="input" id="tk-dept">${depts.map(d => `<option value="${d.key}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="wizard-foot"><button class="btn" id="tk-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="tk-save">${esc(t('common.save'))}</button></div>`, m => {
        m.querySelector('#tk-cancel').onclick = closeModal;
        m.querySelector('#tk-save').onclick = () => {
          const title = m.querySelector('#tk-title').value.trim(); if (!title) return;
          const dk = m.querySelector('#tk-dept').value;
          const d = depts.find(x => x.key === dk);
          co.teamKpis = co.teamKpis || [];
          co.teamKpis.push({ id: uid(), deptKey: dk, dept: d ? d.name : dk, title, target: '100 %', current: 0 });
          Store.setCompany(co); closeModal(); toast(t('common.saved')); render();
        };
      });
    };
    root.querySelector('#hr-cycle').onclick = () => {
      const candidates = people().filter(p => p.managerId && !reviews().some(r => r.subjectId === p.id && r.period === Generator.CURRENT_PERIOD && !['confirmed', 'closed_by_hr', 'cancelled'].includes(r.status)));
      const semiOn = ((co && co.cycleConfig) || { semiEnabled: true }).semiEnabled;
      modal(`<h3>${icon('spark', 18)}${esc(t('hr.newCycle'))}</h3>
        <div class="field"><label>${esc(t('hr.cycleType'))}</label>
          <select class="input" id="hc-type">
            <option value="annual">${esc(t('misc.annual'))}</option>
            ${semiOn ? `<option value="semi">${esc(t('misc.semi'))}</option>` : ''}
            <option value="probation">${esc(t('misc.probation'))}</option>
          </select>
          <div class="hint">${esc(t('hr.cycleTypeHint'))}</div></div>
        <p style="color:var(--text-muted);margin-bottom:12px">${esc(t('hr.participants'))}: <b>${candidates.length}</b> · ${esc(Generator.CURRENT_PERIOD)}</p>
        <ul class="timeline" style="max-height:200px;overflow:auto">${candidates.slice(0, 20).map(p => `<li><span class="tday">＋</span>${esc(p.name)} <small style="color:var(--text-muted)">(${esc(p.role)})</small></li>`).join('')}</ul>
        <div class="wizard-foot"><button class="btn" id="hc-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" id="hc-go">${esc(t('hr.launch'))} ${icon('arrowR', 15)}</button></div>`, m => {
        m.querySelector('#hc-cancel').onclick = closeModal;
        m.querySelector('#hc-go').onclick = () => {
          const now = Date.now();
          const cType = m.querySelector('#hc-type').value;
          const targets = cType === 'probation' ? candidates.filter(p => p.hiredMonthsAgo < 4) : candidates;
          targets.forEach(p => {
            const form = Generator.emptyForm();
            if (cType !== 'probation') {
              form.goalsEval = Store.list('goals').filter(g => g.ownerId === p.id && g.type === 'personal')
                .map(g => ({ goalId: g.id, title: g.title, areaKey: g.areaKey, weight: g.weight, kpiRef: g.kpiRef, outcome: '', rating: null, mgrConfirmed: false }));
            }
            Store.insert('reviews', { id: uid(), subjectId: p.id, evaluatorId: p.managerId, type: cType, period: Generator.CURRENT_PERIOD, status: 'pending_self', startedAt: now, deadline: now + 30 * 86400000, form });
          });
          notify(t('hr.newCycle') + ' - ' + targets.length + '× ' + t('st.pending_self'), 'all');
          closeModal(); toast(t('hr.launch')); render();
        };
      });
    };
  };

  /* ---- talent & reporty (jen HR) ---- */
  views.talent = root => TalentViews.renderHr(root);

  /* ---- můj tým (jen manažer) ---- */
  views.myteam = root => TalentViews.renderMyTeam(root);

  /* ---- kvartální talent check (manažer; HR read-only přes /talentcheck/<managerId>) ---- */
  views.talentcheck = (root, param) => {
    const va = viewAs();
    if (va.role === 'employee') { location.hash = '#/home'; return; } /* zaměstnanec nikdy */
    if (va.role === 'hr' && !param) { location.hash = '#/talent'; return; }
    TalentViews.renderCheck(root, va.role === 'hr' ? param : null);
  };

  /* ---- help (role-based) ---- */
  let helpTab = null;
  views.help = root => {
    if (!helpTab) helpTab = viewAs().role || 'employee';
    const STEPS = { employee: 7, manager: 8, hr: 7 };
    const TAB_ICO = { employee: 'doc', manager: 'target', hr: 'gauge' };
    root.innerHTML = `
      <h1 class="page-title">${esc(t('help.title'))}</h1><p class="page-sub">${esc(t('help.sub'))} ${esc(t('help.roleIntro'))}</p>
      <div class="lang-seg" style="margin-bottom:18px">${['employee', 'manager', 'hr'].map(rl =>
        `<button data-htab="${rl}" class="${helpTab === rl ? 'on' : ''}" style="padding:9px 18px;font-size:.88rem">${esc(t('role.' + rl))}</button>`).join('')}</div>

      <div class="card"><h2>${icon(TAB_ICO[helpTab], 18)}${esc(t('help.' + helpTab + '.title'))}</h2>
        <ul class="timeline">${Array.from({ length: STEPS[helpTab] }, (_, i) =>
          `<li><span class="tday">${i + 1}.</span>${esc(t('help.' + helpTab + '.' + (i + 1)))}</li>`).join('')}</ul>
      </div>

      <div class="card"><h2>${icon('calendar', 18)}${esc(t('help.types.title'))}</h2>
        <ul class="timeline">${[1, 2, 3].map(i =>
          `<li><span class="tday">·</span>${esc(t('help.types.' + i))}</li>`).join('')}</ul>
      </div>

      <div class="card"><h2>${icon('spark', 18)}${esc(t('help.goalsModel.title'))}</h2>
        <ul class="timeline">${[1, 2, 3, 4].map(i =>
          `<li><span class="tday">·</span>${esc(t('help.goalsModel.' + i))}</li>`).join('')}</ul>
      </div>

      <div class="card"><h2>${icon('refresh', 18)}${esc(t('help.flowTitle'))}</h2>
        <ul class="timeline">${[1, 2, 3, 4, 5].map(i => `<li><span class="tday">${i}.</span>${esc(t('help.flow.' + i))}</li>`).join('')}</ul>
        <p class="callout" style="margin-top:12px">${icon('heartPulse', 18)} ${esc(t('help.principle'))}</p></div>

      <div class="card"><h2>${icon('spark', 18)}${esc(t('help.scaleTitle'))}</h2>
        <div class="bars">${ReviewLogic.SCALE_DEF.map(sd => `
          <div class="brow"><span><b>${sd.k}</b></span><span style="grid-column:span 2">${esc(ReviewLogic.scaleLabel(sd.k))}</span></div>`).join('')}</div></div>

      <div class="grid cols-2">
        <div class="card"><h2>${icon('play', 18)}${esc(t('help.tutorials'))}</h2>
          <div class="empty" style="padding:24px">${icon('play', 44)}<br>Onboarding videa - spravuje HR (CMS)</div></div>
        <div class="card"><h2>${icon('folder', 18)}${esc(t('help.docs'))}</h2>
          <div class="empty" style="padding:24px">${icon('folder', 44)}<br>Směrnice, handbook, šablony - spravuje HR</div></div>
      </div>`;
    root.querySelectorAll('[data-htab]').forEach(btn => btn.onclick = () => { helpTab = btn.dataset.htab; views.help(root); });
  };

  /* ---- settings ---- */
  views.settings = root => {
    const s = Store.getSettings();
    root.innerHTML = `
      <h1 class="page-title">${esc(t('set.title'))}</h1><p class="page-sub"></p>
      <div class="card"><h2>${icon('palette', 18)}${esc(t('set.theme'))}</h2>
        <div class="choice-grid">
          ${[['corp', '#0070f2,#f0ab00,#f5f6f7'], ['glass', '#0a7aff,#bf5af2,#ffffff'], ['genz', '#3a57fc,#ff7a1a,#0a1230']].map(([k, colors]) => `
            <button class="choice ${s.theme === k ? 'sel' : ''}" data-th="${k}">
              <b>${esc(t('ob.theme.' + k))}</b><span>${esc(t('ob.theme.' + k + 'Desc'))}</span>
              <span class="theme-preview">${colors.split(',').map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`).join('')}
        </div></div>
      <div class="card"><h2>${icon('globe', 18)}${esc(t('set.lang'))}</h2>${langSwitchHtml()}</div>
      <div class="card"><h2>${icon('bell', 18)}${esc(t('set.notif'))}</h2><p class="page-sub">${esc(t('set.notifHint'))}</p></div>
      <div class="card"><h2>${icon('db', 18)}${esc(t('set.backend'))}</h2><p class="page-sub">${esc(t('set.backendHint'))}</p></div>
      <div class="card"><h2>${icon('alert', 18)}${esc(t('set.demoData'))}</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" id="set-regen">${icon('refresh', 15)} ${esc(t('set.regen'))}</button>
          <button class="btn btn-danger" id="set-reset">${icon('trash', 15)} ${esc(t('set.reset'))}</button>
        </div></div>`;
    root.querySelectorAll('[data-th]').forEach(b => b.onclick = () => {
      Store.patchSettings({ theme: b.dataset.th }); applySettings(); render();
    });
    bindLangSwitch(root, render);
    root.querySelector('#set-regen').onclick = () => {
      const co = Store.getCompany();
      Generator.install((co && co.industry) || 'it', (co && co.size) || 50);
      Store.patchSettings({ viewAs: null });
      toast(t('common.saved')); render();
    };
    root.querySelector('#set-reset').onclick = () => {
      if (!confirm(t('set.resetConfirm'))) return;
      Store.resetAll(); location.hash = ''; location.reload();
    };
  };

  /* ================= router & boot ================= */
  function render() {
    applySettings();
    closeModal(); /* navigace zavírá případný otevřený modal */
    const s = Store.getSettings();
    if (!s.onboarded) { renderOnboarding(); return; }
    document.getElementById('onboarding').hidden = true;
    document.getElementById('app').hidden = false;
    renderShell();
    const { page, param } = route();
    const root = document.getElementById('view');
    const va = viewAs();
    const nav = NAV.find(n => n.id === page);
    if (page !== 'review' && (!views[page] || (nav && !nav.roles.includes(va.role)))) {
      location.hash = '#/home'; return;
    }
    (views[page] || views.home)(root, param);
    window.scrollTo(0, 0);
  }

  function boot() { render(); }
  window.addEventListener('hashchange', render);
  applySettings();
  boot();
})();
