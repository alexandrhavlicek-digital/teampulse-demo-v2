/* TeamPulse demo v2 - průběžná konstruktivní zpětná vazba (gap vs LutherOne, 2026-07-30)
   -------------------------------------------------------------------------
   Kdokoli může komukoli poslat strukturovanou rozvojovou vazbu kdykoli
   během roku - nejen kudos (pozitivní) a ne až u ročního hodnocení.
   Struktura = SBI (Situace - Chování - Dopad) + volitelné doporučení
   + štítek oblast/kompetence (dle aktivního rámce) + typ ocenění/k rozvoji.
   Viditelnost (rozhodnutí Alex 2026-07-30): příjemce + jeho přímý manažer
   (vazba se propisuje do Podkladů z období); HR vidí pouze agregáty (počty).
   Vazba NENÍ anonymní - u konstruktivní vazby je autor součástí sdělení. */
(function () {
  const { esc, avatar, fmtDate, modal, closeModal, notify } = UI;
  const KINDS = ['praise', 'develop'];

  /* ---------------- logic ---------------- */
  /* štítky dle aktivního rámce: 7 kompetencí (detailní režim) nebo 3 oblasti */
  function tags() {
    const co = Store.getCompany();
    return (co && co.competencies)
      ? co.competencies.map(c => ({ kind: 'comp', key: c.key, label: c.title }))
      : ['teamwork', 'growth', 'quality'].map(a => ({ kind: 'area', key: a, label: t('rev.area.' + a) }));
  }
  function tagLabel(it) {
    if (!it.tagKey) return '';
    if (it.tagKind === 'comp') {
      const co = Store.getCompany();
      const c = co && co.competencies && co.competencies.find(x => x.key === it.tagKey);
      if (c) return c.title;
      const lib = ((window.Generator && Generator.COMP_LIB) || []).find(x => x.key === it.tagKey);
      return lib ? lib.title : it.tagKey;
    }
    return t('rev.area.' + it.tagKey);
  }
  /* viditelnost: odesílatel, příjemce, přímý manažer příjemce. Nikdo jiný
     (zaměstnanec NIKDY nevidí cizí vazby; HR jen počty přes Store.list().length). */
  function canSee(item, personId) {
    if (!personId) return false;
    if (item.toId === personId || item.fromId === personId) return true;
    const to = Store.get('people', item.toId);
    return !!(to && to.managerId === personId);
  }
  function visibleTo(personId) {
    return Store.list('feedback').filter(i => canSee(i, personId));
  }
  function receivedBy(pid) { return Store.list('feedback').filter(i => i.toId === pid); }
  function sentBy(pid) { return Store.list('feedback').filter(i => i.fromId === pid); }
  /* vazby pro Podklady z období: manažer subjektu je smí vidět z titulu role */
  function forEvidence(subjectId, since) {
    return receivedBy(subjectId).filter(i => i.at > since);
  }
  window.Feedback = { tags, tagLabel, canSee, visibleTo, receivedBy, sentBy, forEvidence, KINDS };

  /* ---------------- formulář „Dát vazbu" ---------------- */
  function giveModal(onDone) {
    const va = App.viewAs();
    const meId = va.personId;
    const ps = Store.list('people').filter(p => p.id !== meId);
    if (!ps.length) return;
    let kind = 'develop', tagKey = null, tagKind = null;
    modal(`<h3>${icon('coach', 18)}${esc(t('fb.give'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:10px">${icon('lock', 13)} ${esc(t('fb.privacy'))}</p>
      <div class="field"><label>${esc(t('kudos.to'))}</label><div id="fb-to"></div></div>
      <div class="field"><label>${esc(t('fb.kind'))}</label>
        <div class="scale-row sm">${KINDS.map(k => `
          <button type="button" class="scale-opt ${k === kind ? 'sel' : ''}" data-fbk="${k}">${icon(k === 'praise' ? 'heart' : 'sprout', 15)} ${esc(t('fb.kind.' + k))}</button>`).join('')}
        </div></div>
      <div class="field"><label>${esc(t('fb.tag'))} <small style="color:var(--text-muted)">(${esc(t('fb.optional'))})</small></label>
        <div class="scale-row sm">${tags().map(tg => `
          <button type="button" class="scale-opt" data-fbt="${tg.kind}:${tg.key}">${esc(tg.label)}</button>`).join('')}
        </div></div>
      <div class="field"><label>${esc(t('fb.sit'))}</label>
        <input class="input" id="fb-sit" placeholder="${esc(t('fb.sitHint'))}"></div>
      <div class="field"><label>${esc(t('fb.beh'))}</label>
        <textarea class="input" id="fb-beh" style="min-height:52px" placeholder="${esc(t('fb.behHint'))}"></textarea></div>
      <div class="field"><label>${esc(t('fb.imp'))}</label>
        <textarea class="input" id="fb-imp" style="min-height:52px" placeholder="${esc(t('fb.impHint'))}"></textarea></div>
      <div class="field"><label>${esc(t('fb.sug'))} <small style="color:var(--text-muted)">(${esc(t('fb.optional'))})</small></label>
        <input class="input" id="fb-sug" placeholder="${esc(t('fb.sugHint'))}"></div>
      <div class="wizard-foot">
        <button class="btn" id="fb-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="fb-send">${esc(t('common.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      const pick = App.personPicker(m.querySelector('#fb-to'), { people: ps, autofocus: true });
      m.querySelectorAll('[data-fbk]').forEach(b => b.onclick = () => {
        m.querySelectorAll('[data-fbk]').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); kind = b.dataset.fbk;
      });
      m.querySelectorAll('[data-fbt]').forEach(b => b.onclick = () => {
        const [tk, key] = b.dataset.fbt.split(':');
        if (tagKey === key) { tagKey = null; tagKind = null; b.classList.remove('sel'); return; }
        m.querySelectorAll('[data-fbt]').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); tagKey = key; tagKind = tk;
      });
      m.querySelector('#fb-cancel').onclick = closeModal;
      m.querySelector('#fb-send').onclick = () => {
        const sit = m.querySelector('#fb-sit').value.trim();
        const beh = m.querySelector('#fb-beh').value.trim();
        const imp = m.querySelector('#fb-imp').value.trim();
        const sug = m.querySelector('#fb-sug').value.trim();
        const toId = pick.get(); if (!toId) { UI.toast(t('kudos.to')); return; }
        if (!sit || !beh || !imp) { UI.toast(t('fb.fillSbi')); return; }
        Store.insert('feedback', {
          id: uid(), fromId: meId || ((Store.list('people')[0] || {}).id), toId,
          kind, tagKind, tagKey, sit, beh, imp, sug, at: Date.now(),
        });
        notify(t('fb.notif'), 'all');
        closeModal(); UI.toast(t('common.send'));
        if (onDone) onDone();
      };
    });
  }

  /* ---------------- karta vazby ---------------- */
  function cardHtml(it, meId) {
    const from = Store.get('people', it.fromId), to = Store.get('people', it.toId);
    const kindBadge = it.kind === 'praise'
      ? `<span class="badge b-green">${icon('heart', 12)} ${esc(t('fb.kind.praise'))}</span>`
      : `<span class="badge b-amber">${icon('sprout', 12)} ${esc(t('fb.kind.develop'))}</span>`;
    return `<div class="card fb-card" style="margin-bottom:12px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        ${avatar(from, 34)} <b>${esc(from ? from.name : '?')}</b> → ${avatar(to, 34)} <b>${esc(to ? (to.id === meId ? t('misc.you') : to.name) : '?')}</b>
        ${kindBadge}
        ${it.tagKey ? `<span class="badge">${esc(tagLabel(it))}</span>` : ''}
        <span style="margin-left:auto;color:var(--text-muted);font-size:.8rem">${fmtDate(it.at)}</span></div>
      <div class="fb-sbi">
        <div class="fb-row"><span>${esc(t('fb.sit'))}</span><p>${esc(it.sit)}</p></div>
        <div class="fb-row"><span>${esc(t('fb.beh'))}</span><p>${esc(it.beh)}</p></div>
        <div class="fb-row"><span>${esc(t('fb.imp'))}</span><p>${esc(it.imp)}</p></div>
        ${it.sug ? `<div class="fb-row fb-sug"><span>${esc(t('fb.sug'))}</span><p>${esc(it.sug)}</p></div>` : ''}
      </div></div>`;
  }

  /* ---------------- záložka „Konstruktivní vazba" (v sekci Uznání) ---------------- */
  function renderTab(body, redraw) {
    const va = App.viewAs();
    const meId = va.personId;
    const mine = meId ? receivedBy(meId).slice().reverse() : [];
    const sent = meId ? sentBy(meId).slice().reverse() : [];
    const reports = meId ? Store.list('people').filter(p => p.managerId === meId).map(p => p.id) : [];
    const team = reports.length
      ? Store.list('feedback').filter(i => reports.includes(i.toId) && i.fromId !== meId && i.toId !== meId).slice().reverse()
      : [];
    const section = (title, list, emptyKey) => `
      <h2 style="margin:14px 0 8px">${esc(title)} <span class="badge">${list.length}</span></h2>
      ${list.length ? list.map(i => cardHtml(i, meId)).join('') : `<p class="page-sub">${esc(t(emptyKey))}</p>`}`;
    body.innerHTML = `
      <p class="callout" style="margin-bottom:4px">${icon('lock', 15)} ${esc(t('fb.privacy'))}</p>
      ${section(t('fb.received'), mine, 'fb.noneReceived')}
      ${section(t('fb.sent'), sent, 'fb.noneSent')}
      ${reports.length ? section(t('fb.team'), team, 'fb.noneTeam') : ''}`;
  }

  window.FeedbackViews = { giveModal, cardHtml, renderTab };
})();
