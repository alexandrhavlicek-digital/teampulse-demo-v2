/* TeamPulse — "Pulse" icon set
   Vlastní ikonografie kreslená pro tuto aplikaci. 24×24 grid, stroke 1.8,
   round caps. Podpis setu: EKG/pulse linka vetkaná do klíčových ikon
   (logo, kudos, check-in, kalendář, gauge). Nepoužívá žádnou cizí knihovnu. */
(function () {
  const P = {
    /* oficiální brand mark — geometrické „T" (outline, rounded join) dle Brand Manual v1.0 */
    logo: '<path d="M5.1 5.8H18.9A1.37 1.37 0 0 1 18.9 8.6H14.1V17.8A1.37 1.37 0 0 1 9.9 17.8V8.6H5.1A1.37 1.37 0 0 1 5.1 5.8Z"/>',

    /* navigation */
    home: '<path d="M4 11.2 12 4l8 7.2"/><path d="M6.2 9.8V20h11.6V9.8"/><path d="M9.4 20v-4.6h5.2V20"/>',
    doc: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4"/><path d="M9.6 14.2l1.9 1.9 3.4-4.1"/>',
    team: '<circle cx="9" cy="9" r="3.1"/><path d="M3.6 19.5c0-3.1 2.4-5.1 5.4-5.1s5.4 2 5.4 5.1"/><path d="M15.2 6.9a2.7 2.7 0 1 1 1.4 5.1"/><path d="M16.4 14.6c2.6.4 4 2.2 4 4.9"/>',
    target: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r=".4" fill="currentColor" stroke="none"/>',
    checkin: '<path d="M4 5.5h16v10.2H9.4L4 19.8z"/><polyline points="7 10.6 9 10.6 10.4 8.2 12.4 12.6 13.8 10.2 17 10.2"/>',
    heart: '<path d="M12 20.2S5.2 16 3.4 11.6C2 8.2 4.4 5 7.8 5c1.9 0 3.3 1 4.2 2.6C12.9 6 14.3 5 16.2 5c3.4 0 5.8 3.2 4.4 6.6C18.8 16 12 20.2 12 20.2z"/>',
    heartPulse: '<path d="M12 20.2S5.2 16 3.4 11.6C2 8.2 4.4 5 7.8 5c1.9 0 3.3 1 4.2 2.6C12.9 6 14.3 5 16.2 5c3.4 0 5.8 3.2 4.4 6.6C18.8 16 12 20.2 12 20.2z"/><polyline points="6.5 11.8 9 11.8 10.4 9.6 12.6 13.6 14 11.4 17.5 11.4"/>',
    people: '<circle cx="10" cy="8.4" r="3.4"/><path d="M4.2 20c0-3.4 2.6-5.4 5.8-5.4s5.8 2 5.8 5.4"/><path d="M18.3 9.3h4.2"/><path d="M20.4 7.2v4.2"/>',
    tree: '<circle cx="12" cy="5.2" r="2.3"/><circle cx="5.6" cy="18.4" r="2.3"/><circle cx="18.4" cy="18.4" r="2.3"/><path d="M12 7.5v4.1"/><path d="M5.6 16.1v-1.6a2.9 2.9 0 0 1 2.9-2.9h7a2.9 2.9 0 0 1 2.9 2.9v1.6"/>',
    gauge: '<path d="M4.2 16.4a8 8 0 1 1 15.6 0"/><path d="M12 16.4l3.6-4.8"/><circle cx="12" cy="16.4" r="1.1" fill="currentColor" stroke="none"/><path d="M6.6 20h10.8"/>',
    bulb: '<path d="M12 3.4a5.6 5.6 0 0 1 3.5 9.9c-.8.7-1.1 1.4-1.1 2.4h-4.8c0-1-.3-1.7-1.1-2.4A5.6 5.6 0 0 1 12 3.4z"/><path d="M9.8 18.6h4.4"/><path d="M10.6 21.2h2.8"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"/>',

    /* topbar & actions */
    bell: '<path d="M6.2 16.2v-5.4a5.8 5.8 0 0 1 11.6 0v5.4l1.6 2.6H4.6z"/><path d="M10.4 21.2a1.8 1.8 0 0 0 3.2 0"/>',
    palette: '<path d="M12 3.6a8.4 8.4 0 1 0 .2 16.8c1.5 0 1.9-1 1.4-2-.7-1.4.3-2.6 1.9-2.6h1.9c1.7 0 3-1.4 3-3.2C20.4 7.2 16.6 3.6 12 3.6z"/><circle cx="8.2" cy="9.4" r="1" fill="currentColor" stroke="none"/><circle cx="12.2" cy="7.4" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="9.8" r="1" fill="currentColor" stroke="none"/>',
    swap: '<path d="M6.8 8.2h10.4l-3-3"/><path d="M17.2 15.8H6.8l3 3"/>',
    search: '<circle cx="10.6" cy="10.6" r="5.6"/><path d="M15.2 15.2 20.4 20.4"/>',
    plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    arrowR: '<path d="M4.8 12h13.6"/><path d="M13.2 6.4 18.8 12l-5.6 5.6"/>',
    arrowL: '<path d="M19.2 12H5.6"/><path d="M10.8 6.4 5.2 12l5.6 5.6"/>',
    calendar: '<rect x="4" y="5.6" width="16" height="14.8" rx="2.2"/><path d="M4 10h16"/><path d="M8.4 3.4v4M15.6 3.4v4"/><polyline points="7.6 15.2 9.4 15.2 10.5 13.4 12 16.6 13.1 14.8 16.4 14.8"/>',
    lock: '<rect x="5.6" y="10.6" width="12.8" height="9.8" rx="2"/><path d="M8.6 10.6V7.6a3.4 3.4 0 0 1 6.8 0v3"/><circle cx="12" cy="15.4" r="1.2" fill="currentColor" stroke="none"/>',
    print: '<path d="M7.2 8V3.6h9.6V8"/><path d="M7.2 16.8H4.4V9.6h15.2v7.2h-2.8"/><rect x="7.2" y="14" width="9.6" height="6.4"/>',
    send: '<path d="M3.6 11.4 20.4 4.2l-3.8 15.6-4.7-5.9z"/><path d="M11.9 13.9l8.5-9.7"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    alert: '<path d="M12 4.2 21 19.2H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.6" r=".4" fill="currentColor" stroke="none"/>',
    importBox: '<path d="M12 3.4v8"/><path d="M8.8 8.2 12 11.4l3.2-3.2"/><path d="M4.6 11.4h4l1.4 2.2h4l1.4-2.2h4V20.4H4.6z"/>',
    building: '<rect x="6" y="4.4" width="12" height="16.2"/><path d="M9.4 8h1.6M13 8h1.6M9.4 11.5h1.6M13 11.5h1.6M9.4 15h1.6M13 15h1.6"/><path d="M11 20.6v-3.2h2v3.2"/>',
    spark: '<path d="M12 3.4 13.9 9.6 20 11.5l-6.1 1.9L12 19.6l-1.9-6.2L4 11.5l6.1-1.9z"/>',
    play: '<circle cx="12" cy="12" r="8.4"/><path d="M10.2 8.7l5.4 3.3-5.4 3.3z" fill="currentColor" stroke="none"/>',
    folder: '<path d="M3.6 6.4h6l2 2.6h8.8V19.6H3.6z"/>',
    trash: '<path d="M4.8 6.6h14.4"/><path d="M9.2 6.6V4.4h5.6v2.2"/><path d="M6.4 6.6 7.2 20h9.6l.8-13.4"/><path d="M10.2 10.2v6M13.8 10.2v6"/>',
    refresh: '<path d="M19.4 9.4A7.8 7.8 0 0 0 5.6 7.2L4.2 9"/><path d="M4.2 5v4h4"/><path d="M4.6 14.6a7.8 7.8 0 0 0 13.8 2.2l1.4-1.8"/><path d="M19.8 19v-4h-4"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.2V12l3.4 2.2"/>',
    inbox: '<path d="M4 4.8h16v14.4H4z"/><path d="M4 13.2h4.4l1.6 2.6h4l1.6-2.6H20"/>',
    globe: '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4"/><path d="M12 3.8c2.6 2.2 3.9 5 3.9 8.2s-1.3 6-3.9 8.2c-2.6-2.2-3.9-5-3.9-8.2s1.3-6 3.9-8.2z"/>',
    db: '<ellipse cx="12" cy="6" rx="7.6" ry="2.8"/><path d="M4.4 6v12c0 1.5 3.4 2.8 7.6 2.8s7.6-1.3 7.6-2.8V6"/><path d="M4.4 12c0 1.5 3.4 2.8 7.6 2.8s7.6-1.3 7.6-2.8"/>',
    /* talent 9-box grid */
    grid9: '<rect x="4" y="4" width="16" height="16" rx="2.2"/><path d="M9.4 4v16M14.6 4v16M4 9.4h16M4 14.6h16"/>',

    /* kudos values */
    link2: '<circle cx="9" cy="12" r="4.6"/><circle cx="15" cy="12" r="4.6"/>',
    gem: '<path d="M7.2 4.4h9.6l3.4 4.8L12 20.4 3.8 9.2z"/><path d="M3.8 9.2h16.4"/><path d="M12 4.4 9 9.2l3 11.2 3-11.2z"/>',
    sprout: '<path d="M12 20.6v-7.2"/><path d="M12 13.4C12 9.8 9.4 7.6 6 7.6c0 3.6 2.6 5.8 6 5.8z"/><path d="M12 11.6c0-3 2-4.8 5.6-4.8 0 3-2 4.8-5.6 4.8z"/>',
  };

  window.icon = function (name, size, cls) {
    const body = P[name] || P.spark;
    size = size || 20;
    return `<svg class="pi${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  };
})();
