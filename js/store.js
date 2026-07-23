/* TeamPulse demo v2 — data layer
   ---------------------------------------------------------------
   The whole app talks to `Store` only. Today it's backed by
   localStorage; later you implement the same interface with
   Supabase (see createSupabaseStore stub below) and nothing
   else in the app changes.

   Entities (collections): people, reviews, goals, kudos,
   checkins, notifications. Singletons: company, settings.
   --------------------------------------------------------------- */
(function () {
  const LS_KEY = 'teampulse_demo_v2';

  function createLocalStore() {
    let db = load();

    function load() {
      try {
        const db2 = JSON.parse(localStorage.getItem(LS_KEY)) || blank();
        /* migrace: kolekce přidané v novějších verzích doplnit do starších DB */
        const b = blank();
        Object.keys(b).forEach(k => { if (db2[k] === undefined) db2[k] = b[k]; });
        return db2;
      }
      catch (e) { return blank(); }
    }
    function blank() {
      return {
        company: null,          // { name, industry, sizeLabel, kpis:[], departments:[] }
        settings: { theme: 'brand', locale: 'cs', onboarded: false, viewAs: null },
        people: [], reviews: [], goals: [], kudos: [], checkins: [], notifications: [],
        keyPositions: [],       // succession: [{id,deptKey,title,holderId,checklist{q1..q12},successors:[{personId,level,readiness}]}]
        talentChecks: [],       // kvartální talent check: [{id,period,managerId,status:draft|debate|final,items:[{personId,box{pot,perf}|null,source,note,attrition}],createdAt,sentAt,discussedAt}]
      };
    }
    function persist() { localStorage.setItem(LS_KEY, JSON.stringify(db)); }

    return {
      /* --- singletons --- */
      getCompany() { return db.company; },
      setCompany(c) { db.company = c; persist(); },
      getSettings() { return db.settings; },
      patchSettings(p) { Object.assign(db.settings, p); persist(); },

      /* --- collections (sync in demo; keep call sites simple) --- */
      list(coll) { return db[coll] || []; },
      get(coll, id) { return (db[coll] || []).find(x => x.id === id) || null; },
      insert(coll, item) { db[coll].push(item); persist(); return item; },
      update(coll, id, patch) {
        const it = this.get(coll, id);
        if (it) { Object.assign(it, patch); persist(); }
        return it;
      },
      remove(coll, id) { db[coll] = db[coll].filter(x => x.id !== id); persist(); },
      replaceAll(coll, items) { db[coll] = items; persist(); },

      /* --- whole-db ops --- */
      resetAll() { db = blank(); persist(); },
      exportJson() { return JSON.stringify(db, null, 2); },
    };
  }

  /* Stub for the future backend swap (Cloudflare Pages + Supabase):
     async variants of the same methods, RLS per tenant.
     function createSupabaseStore(client) {
       return {
         async list(coll) { return (await client.from(coll).select('*')).data; },
         ...
       };
     } */

  window.Store = createLocalStore();
  window.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
})();
