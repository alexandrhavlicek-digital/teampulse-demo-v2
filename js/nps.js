/* TeamPulse demo v2 - eNPS pulse (zaměstnanecký Net Promoter Score)
   -------------------------------------------------------------------------
   Pravidelné krátké vlny (pulse) s posuvníky: klasická NPS otázka 0-10
   (detraktor 0-6 · pasivní 7-8 · promotér 9-10) + tři dimenze engagementu
   + volitelné téma vlny (např. zákaznická orientace) + volitelný komentář.

   ANONYMITA JE PRAVIDLO Č. 1:
   - odpověď se ukládá BEZ identity (jen deptKey + teamId pro agregace),
   - kdo odpověděl se eviduje odděleně v respondedIds (jen kvůli todo
     a response rate; nikdy se nespojuje s obsahem odpovědi),
   - agregáty (číslo, matice, komentáře) se zobrazují až od MIN_N = 3
     odpovědí v daném výřezu — menší tým žádná data neukáže,
   - komentáře se zobrazují deduplikované a seřazené dle délky, bez atribuce.
   Viditelnost přehledů: manažer (svůj tým/podstrom), HR (firma + oddělení).
   Zaměstnanec vidí jen svůj dotazník. */
(function () {
  const { esc, modal, closeModal, notify } = UI;
  const MIN_N = 3;
  const DIMS = ['work', 'growth', 'support']; /* osy engagementu (Y = průměr) */

  /* ---------------- logic ---------------- */
  const npsCat = v => (v >= 9 ? 'prom' : v >= 7 ? 'pass' : 'det');
  function enps(responses) {
    if (responses.length < MIN_N) return null;
    const p = responses.filter(r => npsCat(r.nps) === 'prom').length;
    const d = responses.filter(r => npsCat(r.nps) === 'det').length;
    return Math.round(((p - d) / responses.length) * 100);
  }
  const engagement = r => {
    const vals = DIMS.map(k => (r.dims || {})[k]).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  function waves() { return Store.list('npsWaves').slice().sort((a, b) => b.startedAt - a.startedAt); }
  function openWave() { return waves().find(w => w.status === 'collecting') || null; }
  function closedWaves() { return waves().filter(w => w.status === 'closed').reverse(); /* chronologicky */ }
  /* výřez odpovědí: scope = {teamIds: Set} | {deptKey} | null (firma) */
  function slice(w, scope) {
    let rs = w.responses || [];
    if (scope && scope.teamIds) rs = rs.filter(r => scope.teamIds.has(r.teamId));
    if (scope && scope.deptKey) rs = rs.filter(r => r.deptKey === scope.deptKey);
    return rs;
  }
  function pendingWaveFor(personId) {
    const w = openWave();
    if (!w) return null;
    const p = Store.get('people', personId);
    if (!p || !p.managerId) return null; /* jen zaměstnanci s hodnoticím vztahem */
    return (w.respondedIds || []).includes(personId) ? null : w;
  }
  window.NPS = { MIN_N, DIMS, npsCat, enps, engagement, waves, openWave, closedWaves, slice, pendingWaveFor };

  /* ---------------- dotazník (zaměstnanec) ---------------- */
  function sliderRow(id, label, val) {
    return `<div class="nps-q"><label>${esc(label)}</label>
      <div class="nps-slider">
        <input type="range" min="0" max="10" step="1" value="${val}" id="${id}">
        <output for="${id}">${val}</output>
      </div></div>`;
  }
  function respondModal(wave, personId, onDone) {
    const p = Store.get('people', personId); if (!p) return;
    modal(`<h3>${icon('heartPulse', 18)}${esc(t('nps.title'))}${wave.theme ? ` · ${esc(wave.theme)}` : ''}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:12px">${esc(t('nps.anonNote'))}</p>
      <div style="max-height:52vh;overflow:auto;padding-right:4px">
        <div class="nps-q nps-main"><label><b>${esc(t('nps.q.main'))}</b></label>
          <div class="nps-slider">
            <input type="range" min="0" max="10" step="1" value="5" id="nps-main">
            <output for="nps-main">5</output>
          </div>
          <div class="nps-scale-lbl"><span>${esc(t('nps.det'))}</span><span>${esc(t('nps.prom'))}</span></div>
        </div>
        ${sliderRow('nps-work', t('nps.q.work'), 5)}
        ${sliderRow('nps-growth', t('nps.q.growth'), 5)}
        ${sliderRow('nps-support', t('nps.q.support'), 5)}
        ${wave.themeQ ? `<div style="margin:14px 0 4px"><b>${esc(t('nps.themeTitle'))}: ${esc(wave.theme || '')}</b></div>${sliderRow('nps-theme', wave.themeQ, 5)}` : ''}
        <div class="field" style="margin-top:12px"><label>${esc(t('nps.comment'))}</label>
          <textarea class="input" id="nps-comment" style="min-height:56px" placeholder="${esc(t('nps.commentHint'))}"></textarea></div>
      </div>
      <div class="wizard-foot">
        <button class="btn" id="nps-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="nps-send">${esc(t('nps.send'))} ${icon('send', 14)}</button>
      </div>`, m => {
      m.querySelectorAll('input[type=range]').forEach(sl => {
        sl.oninput = () => { const o = m.querySelector(`output[for="${sl.id}"]`); if (o) o.textContent = sl.value; };
      });
      m.querySelector('#nps-cancel').onclick = closeModal;
      m.querySelector('#nps-send').onclick = () => {
        const g2 = id => +m.querySelector('#' + id).value;
        /* odpověď BEZ personId - jen tým a oddělení pro agregace */
        wave.responses.push({
          id: uid(), deptKey: p.deptKey, teamId: p.managerId,
          nps: g2('nps-main'),
          dims: { work: g2('nps-work'), growth: g2('nps-growth'), support: g2('nps-support') },
          theme: wave.themeQ ? g2('nps-theme') : null,
          comment: (m.querySelector('#nps-comment').value || '').trim(),
          at: Date.now(),
        });
        wave.respondedIds = wave.respondedIds || [];
        wave.respondedIds.push(personId);
        Store.update('npsWaves', wave.id, {});
        closeModal(); UI.toast(t('nps.thanks'));
        if (onDone) onDone();
      };
    });
  }

  /* ---------------- vizualizace ---------------- */
  function distHtml(rs) {
    const n = rs.length || 1;
    const c = { det: 0, pass: 0, prom: 0 };
    rs.forEach(r => c[npsCat(r.nps)]++);
    return `<div class="nps-dist" title="${esc(t('nps.det'))} ${c.det} · ${esc(t('nps.pass'))} ${c.pass} · ${esc(t('nps.prom'))} ${c.prom}">
      <i class="d" style="flex:${c.det / n}"></i><i class="p" style="flex:${c.pass / n}"></i><i class="m" style="flex:${c.prom / n}"></i>
    </div>
    <div class="nps-dist-lbl"><span>${c.det}× ${esc(t('nps.det'))}</span><span>${c.pass}× ${esc(t('nps.pass'))}</span><span>${c.prom}× ${esc(t('nps.prom'))}</span></div>`;
  }
  /* matice: X = doporučení (0-10), Y = engagement (0-10); anonymní tečky (žádná identita!) */
  function matrixHtml(rs) {
    return `<div class="nps-matrix">
      <div class="nps-mx-quad q-det"></div><div class="nps-mx-quad q-mid1"></div>
      <div class="nps-mx-quad q-mid2"></div><div class="nps-mx-quad q-prom"></div>
      ${rs.map((r, i) => {
        const y = engagement(r);
        if (y == null) return '';
        /* deterministický mini-jitter proti překryvu, žádné Math.random */
        const jx = ((i * 37) % 7 - 3) * 0.35, jy = ((i * 53) % 7 - 3) * 0.35;
        const cat = npsCat(r.nps);
        return `<i class="nps-dot ${cat}" style="left:calc(${Math.min(100, Math.max(0, r.nps * 10 + jx))}% - 5px);bottom:calc(${Math.min(100, Math.max(0, y * 10 + jy))}% - 5px)"
          title="${esc(t('nps.q.main'))}: ${r.nps} · ${esc(t('nps.engagement'))}: ${y.toFixed(1)}"></i>`;
      }).join('')}
      <span class="nps-mx-lbl bl">${esc(t('nps.det'))}</span>
      <span class="nps-mx-lbl tr">${esc(t('nps.prom'))}</span>
      <span class="nps-mx-ax x">${esc(t('nps.q.main'))} →</span>
      <span class="nps-mx-ax y">${esc(t('nps.engagement'))} ↑</span>
    </div>`;
  }
  function trendHtml(scope) {
    const ws = closedWaves().slice(-6);
    const pts = ws.map(w => ({ w, v: enps(slice(w, scope)) })).filter(x => x.v != null);
    if (pts.length < 2) return '';
    return `<div class="nps-trend">${pts.map(x => {
      const h = Math.max(6, Math.round((x.v + 100) / 200 * 46));
      return `<div class="nps-tcol" title="${esc(x.w.label)}${x.w.theme ? ' · ' + esc(x.w.theme) : ''}: ${x.v}">
        <b style="color:${x.v >= 30 ? 'var(--ok)' : x.v >= 0 ? 'var(--text-muted)' : 'var(--danger)'}">${x.v > 0 ? '+' : ''}${x.v}</b>
        <i style="height:${h}px;background:${x.v >= 30 ? 'var(--ok)' : x.v >= 0 ? 'var(--accent)' : 'var(--danger)'}"></i>
        <small>${esc(x.w.label)}</small></div>`;
    }).join('')}</div>`;
  }
  function commentsHtml(rs) {
    const cs = [...new Set(rs.map(r => r.comment).filter(Boolean))].sort((a, b) => a.length - b.length);
    if (!cs.length) return '';
    return `<div style="margin-top:10px"><b>${esc(t('nps.comments'))}</b> <span class="badge">${cs.length}</span>
      ${cs.slice(0, 6).map(c2 => `<p class="pc-item">· ${esc(c2)}</p>`).join('')}
      ${cs.length > 6 ? `<p class="pc-muted">+${cs.length - 6}</p>` : ''}</div>`;
  }

  /* sdílená karta přehledu pro daný výřez (manažer / HR) */
  function overviewHtml(scope, opts) {
    opts = opts || {};
    const w = opts.wave || closedWaves().slice(-1)[0] || null;
    if (!w) return `<p class="page-sub">${esc(t('nps.noWaves'))}</p>`;
    const rs = slice(w, scope);
    const score = enps(rs);
    if (score == null) return `<p class="callout">${icon('lock', 15)} ${esc(t('nps.tooFew'))}</p>`;
    const themeVals = rs.map(r => r.theme).filter(v => v != null);
    const themeAvg = themeVals.length >= MIN_N ? themeVals.reduce((a, b) => a + b, 0) / themeVals.length : null;
    return `
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <div class="kpi-num" style="color:${score >= 30 ? 'var(--ok)' : score >= 0 ? 'inherit' : 'var(--danger)'}">${score > 0 ? '+' : ''}${score}</div>
        <div style="flex:1;min-width:220px">
          <div style="font-size:.84rem;color:var(--text-muted);margin-bottom:4px">${esc(w.label)}${w.theme ? ` · ${esc(w.theme)}` : ''} · ${rs.length}× ${esc(t('f360.responses'))}</div>
          ${distHtml(rs)}
        </div>
        ${themeAvg != null ? `<span class="badge b-blue" title="${esc(w.themeQ || '')}">${esc(t('nps.themeTitle'))}: ${themeAvg.toFixed(1)}/10</span>` : ''}
      </div>
      ${matrixHtml(rs)}
      ${trendHtml(scope)}
      ${opts.comments ? commentsHtml(rs) : ''}`;
  }

  /* ---------------- HR: spuštění vlny ---------------- */
  function startWaveModal(onDone) {
    modal(`<h3>${icon('heartPulse', 18)}${esc(t('nps.startTitle'))}</h3>
      <p class="hint" style="color:var(--text-muted);margin-bottom:12px">${esc(t('nps.startHint'))}</p>
      <div class="field"><label>${esc(t('nps.waveTheme'))}</label>
        <input class="input" id="npw-theme" placeholder="${esc(t('nps.waveThemeHint'))}"></div>
      <div class="field"><label>${esc(t('nps.waveThemeQ'))}</label>
        <input class="input" id="npw-q" placeholder="${esc(t('nps.waveThemeQHint'))}"></div>
      <div class="wizard-foot">
        <button class="btn" id="npw-cancel">${esc(t('common.cancel'))}</button>
        <button class="btn btn-primary" id="npw-go">${esc(t('nps.launch'))} ${icon('send', 14)}</button>
      </div>`, m => {
      m.querySelector('#npw-cancel').onclick = closeModal;
      m.querySelector('#npw-go').onclick = () => {
        const now = new Date();
        Store.insert('npsWaves', {
          id: uid(), label: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'),
          theme: (m.querySelector('#npw-theme').value || '').trim() || null,
          themeQ: (m.querySelector('#npw-q').value || '').trim() || null,
          startedAt: Date.now(), deadline: Date.now() + 14 * 86400000,
          status: 'collecting', responses: [], respondedIds: [],
        });
        notify(t('nps.notifNew'), 'all');
        closeModal(); UI.toast(t('nps.launch'));
        if (onDone) onDone();
      };
    });
  }

  /* HR karta (Talent & Reporty) */
  function hrCardHtml() {
    const w = openWave();
    const co = Store.getCompany();
    const employees = Store.list('people').filter(p => p.managerId);
    const rate = w ? Math.round(((w.respondedIds || []).length / Math.max(1, employees.length)) * 100) : null;
    const last = closedWaves().slice(-1)[0];
    const deptRows = last ? ((co && co.departments) || []).map(d => {
      const rs = slice(last, { deptKey: d.key });
      const v = enps(rs);
      return `<div class="brow"><span>${esc(d.name)} <small style="color:var(--text-muted)">${rs.length}×</small></span>
        <div class="progressbar"><div style="width:${v != null ? (v + 100) / 2 : 0}%;${v != null && v < 0 ? 'background:var(--danger)' : ''}"></div></div>
        <b>${v != null ? (v > 0 ? '+' : '') + v : '·'}</b></div>`;
    }).join('') : '';
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">${icon('heartPulse', 18)}${esc(t('nps.hrTitle'))}</h2>
        ${w ? `<span class="badge b-amber">${icon('clock', 12)} ${esc(t('nps.collecting'))} · ${rate}%</span>`
          : `<button class="btn btn-primary btn-sm" id="nps-start">${icon('plus', 14)} ${esc(t('nps.start'))}</button>`}
      </div>
      <p class="page-sub" style="margin:6px 0 10px">${esc(t('nps.hrSub'))}</p>
      ${overviewHtml(null, { comments: true })}
      ${deptRows ? `<div style="margin-top:14px"><b>${esc(t('nps.byDept'))}</b><div class="bars" style="margin-top:6px">${deptRows}</div></div>` : ''}
      <p class="hint" style="color:var(--text-muted);margin-top:10px">${icon('lock', 12)} ${esc(t('nps.anonFoot'))}</p>
    </div>`;
  }
  function bindHrCard(root, rerender) {
    const b = root.querySelector('#nps-start');
    if (b) b.onclick = () => startWaveModal(rerender);
  }

  /* manažerská karta (Můj tým) - scope = tým/podstrom dle přepínače */
  function teamCardHtml(teamIds) {
    return `<div class="card">
      <h2>${icon('heartPulse', 18)}${esc(t('nps.teamTitle'))}</h2>
      <p class="page-sub" style="margin-bottom:10px">${esc(t('nps.teamSub'))}</p>
      ${overviewHtml({ teamIds }, {})}
      <p class="hint" style="color:var(--text-muted);margin-top:10px">${icon('lock', 12)} ${esc(t('nps.anonFoot'))}</p>
    </div>`;
  }

  window.NPSViews = { respondModal, startWaveModal, hrCardHtml, bindHrCard, teamCardHtml, overviewHtml };
})();
