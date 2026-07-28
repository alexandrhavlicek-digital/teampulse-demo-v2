/* TeamPulse demo v2 - skloňování českých jmen
   ---------------------------------------------------------------
   Pravidlové skloňování pro oslovení a věty v UI (vokativ,
   akuzativ, instrumentál). Bezpečnostní zásady:
   - skloňuje se JEN při locale 'cs',
   - křestní jméno musí být v whitelistu českých jmen (jinak se
     celé jméno vrací beze změny - cizí jména se neskloňují),
   - neznámá koncovka → beze změny (nikdy nevyrobíme paskvil).
   API: CzName.first(name, 'voc'|'acc'|'ins')
        CzName.full('Jana Nováková', 'acc')  → 'Janu Novákovou' */
(function () {
  /* whitelist českých křestních jmen (generátor + běžná jména) */
  const CZECH_FIRST = new Set([
    /* muži */
    'jakub', 'tomas', 'petr', 'martin', 'ondrej', 'lukas', 'marek', 'david', 'filip', 'vojtech',
    'adam', 'michal', 'jan', 'daniel', 'simon', 'matej', 'radek', 'karel', 'ales', 'patrik',
    'stepan', 'roman', 'viktor', 'dominik', 'pavel', 'jiri', 'josef', 'jaroslav', 'miroslav',
    'frantisek', 'zdenek', 'vaclav', 'milan', 'vladimir', 'ladislav', 'stanislav', 'antonin',
    'radim', 'ivo', 'ota', 'honza', 'libor', 'kamil', 'robert', 'richard', 'denis', 'oliver',
    'vit', 'matyas', 'krystof', 'tadeas', 'samuel', 'eduard', 'hynek', 'bohumil', 'rudolf',
    /* ženy */
    'tereza', 'anna', 'katerina', 'lucie', 'eliska', 'veronika', 'barbora', 'marketa', 'klara',
    'adela', 'nikola', 'petra', 'hana', 'simona', 'karolina', 'alena', 'monika', 'jana',
    'zuzana', 'kristyna', 'michaela', 'denisa', 'ivana', 'sara', 'marie', 'eva', 'lenka',
    'martina', 'vera', 'alzbeta', 'daniela', 'gabriela', 'andrea', 'iveta', 'renata', 'pavla',
    'blanka', 'dagmar', 'olga', 'milena', 'sofie', 'ema', 'laura', 'natalie', 'viktorie',
  ]);

  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isCzech = first => CZECH_FIRST.has(norm(first));

  /* výjimky (jméno → {voc,acc,ins}) - kde pravidla nestačí */
  const IRREG = {
    'daniel': { voc: 'Danieli', acc: 'Daniela', ins: 'Danielem' },
    'nemec': { voc: 'Němče', acc: 'Němce', ins: 'Němcem' },
    'ivo': { voc: 'Ivo', acc: 'Iva', ins: 'Ivem' },
    'ota': { voc: 'Oto', acc: 'Otu', ins: 'Otou' },
    'dagmar': { voc: 'Dagmar', acc: 'Dagmar', ins: 'Dagmar' },
  };

  /* skloňování jednoho slova (jméno či příjmení) podle koncovky */
  function word(w, kase) {
    if (!w || w.length < 3) return w;
    const irr = IRREG[norm(w)];
    if (irr) return irr[kase] || w;
    const low = w.toLowerCase();
    const cut = n => w.slice(0, w.length - n);

    /* -á (Nováková, Černá): adjektivní ženské - voc beze změny, acc/ins -ou */
    if (low.endsWith('á')) {
      return kase === 'voc' ? w : cut(1) + 'ou';
    }
    /* -a (Jana, Svoboda, Procházka, Honza) */
    if (low.endsWith('a')) {
      return kase === 'voc' ? cut(1) + 'o' : kase === 'acc' ? cut(1) + 'u' : cut(1) + 'ou';
    }
    /* -ie (Lucie, Marie, Sofie) */
    if (low.endsWith('ie')) {
      return kase === 'voc' ? w : kase === 'acc' ? cut(1) + 'i' : cut(1) + 'í';
    }
    /* -e (Alice) */
    if (low.endsWith('e')) {
      return kase === 'voc' ? w : kase === 'acc' ? cut(1) + 'i' : cut(1) + 'í';
    }
    /* -ý (Černý, Veselý, Šťastný): adjektivní */
    if (low.endsWith('ý')) {
      return kase === 'voc' ? w : kase === 'acc' ? cut(1) + 'ého' : cut(1) + 'ým';
    }
    /* -í (Jiří) */
    if (low.endsWith('í')) {
      return kase === 'voc' ? w : kase === 'acc' ? w + 'ho' : w + 'm';
    }
    /* -ěk / -ek (Radek, Zdeněk, Vaněk, Sedláček, Hájek): vsuvné e vypadává */
    if (/[eě]k$/.test(low)) {
      const stem = low.endsWith('něk') || low.endsWith('ňek')
        ? cut(3) + 'ňk'          /* Vaněk → Vaňk-, Zdeněk → Zdeňk- */
        : cut(2) + 'k';          /* Radek → Radk-, Sedláček → Sedláčk- */
      return kase === 'voc' ? stem + 'u' : kase === 'acc' ? stem + 'a' : stem + 'em';
    }
    /* -el (Karel, Pavel): vsuvné e vypadává; -iel/-ael řeší IRREG/soft */
    if (low.endsWith('el') && !/[ia]el$/.test(low)) {
      const stem = cut(2) + 'l';
      return kase === 'voc' ? stem + 'e' : kase === 'acc' ? stem + 'a' : stem + 'em';
    }
    /* -ec (Němec kryje IRREG; obecně: Kadlec → Kadlče/Kadlece) */
    if (low.endsWith('ec')) {
      const stem = cut(2);
      return kase === 'voc' ? stem + 'če' : kase === 'acc' ? stem + 'ce' : stem + 'cem';
    }
    /* měkké souhlásky š, č, ř, ž, j, c, s (Tomáš, Ondřej, Kolář, Beneš, Aleš) */
    if (/[ščřžjcs]$/.test(low)) {
      return kase === 'voc' ? w + 'i' : kase === 'acc' ? w + 'e' : w + 'em';
    }
    /* tvrdé veláry k, g, h, ch (Patrik, Novák, Vojtěch, Polák) */
    if (/(k|g|h|ch)$/.test(low)) {
      return kase === 'voc' ? w + 'u' : kase === 'acc' ? w + 'a' : w + 'em';
    }
    /* -r po souhlásce (Petr → Petře); po samohlásce (Viktor → Viktore) */
    if (low.endsWith('r')) {
      if (kase === 'voc') return /[aeiouyáéíóúůý]r$/.test(low) ? w + 'e' : cut(1) + 'ře';
      return kase === 'acc' ? w + 'a' : w + 'em';
    }
    /* ostatní tvrdé souhlásky (Jan, David, Šimon, Zeman, Urban, Holub, Musil, Kratochvíl) */
    if (/[bdflmnptvz]$/.test(low)) {
      return kase === 'voc' ? w + 'e' : kase === 'acc' ? w + 'a' : w + 'em';
    }
    return w; /* neznámá koncovka (o, u, y, i…) → beze změny */
  }

  /* skloňuje jen při locale cs; cizí křestní jméno → celé beze změny */
  function first(name, kase) {
    if (!name || (window.I18N && I18N.locale !== 'cs')) return name;
    if (!isCzech(name)) return name;
    return word(name, kase);
  }
  function full(name, kase) {
    if (!name || (window.I18N && I18N.locale !== 'cs')) return name;
    const parts = String(name).trim().split(/\s+/);
    if (!isCzech(parts[0])) return name; /* cizí jméno neskloňujeme */
    return parts.map(p => word(p, kase)).join(' ');
  }

  window.CzName = { first, full, isCzech, word };
})();
