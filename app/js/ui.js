// Interfaccia: home, comandi del player, pannello impostazioni, gesti e scorciatoie.
(() => {
  const $ = (id) => document.getElementById(id);
  const S = Settings;
  const app = $('app');
  const playerEl = $('player');
  const RECENTS_KEY = 'slideshower.recents.v1';

  document.body.classList.add(`platform-${Platform.kind}`, Platform.os ? `os-${Platform.os}` : 'os-other');
  if (Platform.isTouch) document.body.classList.add('touch');
  Icons.hydrate();

  let folder = null;       // cartella aperta
  let busy = false;

  // ───────────── avvisi
  let toastTimer = 0;
  function toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function flash(icon) {
    const f = $('flash');
    f.innerHTML = Icons.svg(icon);
    f.getAnimations().forEach((a) => a.cancel());
    f.animate(
      [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.25)' }],
      { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  }

  // ───────────── cartelle recenti
  const readRecents = () => { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; } };
  const writeRecents = (r) => { try { localStorage.setItem(RECENTS_KEY, JSON.stringify(r.slice(0, 6))); } catch {} };

  function addRecent(f, photos, videos) {
    if (f.volatile) return;
    writeRecents([{ id: f.id, name: f.name, photos, videos }, ...readRecents().filter((r) => r.id !== f.id)]);
    renderRecents();
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function renderRecents() {
    const list = readRecents();
    $('recents').hidden = !list.length;
    $('recentList').replaceChildren(...list.map((r, i) => {
      const card = document.createElement('div');
      card.className = 'recent';
      card.style.setProperty('--i', i);
      const open = document.createElement('button');
      open.className = 'recent-open';
      const parts = [r.photos && plural(r.photos, 'foto', 'foto'), r.videos && plural(r.videos, 'video', 'video')].filter(Boolean);
      open.innerHTML = `<span class="recent-icon">${Icons.svg('folder')}</span><span class="recent-text"><b></b><small></small></span>`;
      open.querySelector('b').textContent = r.name;
      open.querySelector('small').textContent = parts.join(' · ');
      open.onclick = () => openFolder({ id: r.id, name: r.name });
      const del = document.createElement('button');
      del.className = 'recent-del';
      del.title = 'Rimuovi dai recenti';
      del.setAttribute('aria-label', `Rimuovi ${r.name} dai recenti`);
      del.innerHTML = Icons.svg('close');
      del.onclick = () => { writeRecents(readRecents().filter((x) => x.id !== r.id)); renderRecents(); };
      card.append(open, del);
      return card;
    }));
  }

  // ───────────── apertura cartella
  function setScanning(on) {
    busy = on;
    $('scanBox').hidden = !on;
    $('pickBtn').disabled = on;
    app.classList.toggle('scanning', on);
  }

  async function scan(f) {
    const r = await Platform.scan(f.id, S.get('recursive'));
    return r.items;
  }

  async function openFolder(f) {
    if (busy || !f) return;
    setScanning(true);
    let items;
    try { items = await scan(f); }
    catch {
      setScanning(false);
      writeRecents(readRecents().filter((x) => x.id !== f.id));
      renderRecents();
      toast('Non riesco più ad aprire questa cartella. Selezionala di nuovo.', 3600);
      return;
    }
    setScanning(false);
    if (!items.length) { toast('In questa cartella non ci sono foto o video.'); return; }
    folder = f;
    addRecent(f, items.filter((i) => i.type === 'image').length, items.filter((i) => i.type === 'video').length);
    enterPlayer(items);
  }

  async function pick() {
    if (busy) return;
    openFolder(await Platform.pickFolder());
  }

  function enterPlayer(items) {
    $('folderName').textContent = folder.name;
    app.dataset.view = 'player';
    playerEl.setAttribute('aria-hidden', 'false');
    Player.open(items);
    if (S.get('fullscreenOnStart')) Platform.setFullscreen(true);
    Platform.keepAwake(S.get('keepAwake'));
    showHud();
  }

  function exitPlayer() {
    closeDrawer();
    Player.close();
    app.dataset.view = 'home';
    playerEl.setAttribute('aria-hidden', 'true');
    Platform.setFullscreen(false);
    Platform.keepAwake(false);
    folder = null;
  }

  const inPlayer = () => app.dataset.view === 'player';

  // ───────────── comandi a scomparsa
  let hudTimer = 0;
  function showHud() {
    playerEl.classList.add('hud-on');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(hideHud, 2800);
  }
  function hideHud() {
    if ($('hud').matches(':hover') && !Platform.isTouch) { hudTimer = setTimeout(hideHud, 1200); return; }
    playerEl.classList.remove('hud-on');
  }

  let lastNonRandom = S.get('order') === 'random' ? 'name' : S.get('order');
  const actions = {
    toggle() { Player.toggle(); flash(Player.state.playing ? 'play' : 'pause'); },
    next() { Player.next(); },
    prev() { Player.prev(); },
    shuffle() {
      const on = S.get('order') !== 'random';
      if (on) lastNonRandom = S.get('order');
      S.set('order', on ? 'random' : lastNonRandom);
      toast(on ? 'Ordine casuale' : 'Ordine normale', 1400);
    },
    loop() { S.set('loop', !S.get('loop')); toast(S.get('loop') ? 'Ripetizione attiva' : 'Ripetizione disattivata', 1400); },
    mute() { S.set('videoMuted', !S.get('videoMuted')); toast(S.get('videoMuted') ? 'Audio disattivato' : 'Audio attivo', 1400); },
    async fullscreen() { Platform.setFullscreen(!(await Platform.isFullscreen())); },
  };

  const bind = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); if (inPlayer()) showHud(); });
  bind('pickBtn', pick);
  bind('exitBtn', exitPlayer);
  bind('playBtn', () => Player.toggle());
  bind('nextBtn', actions.next);
  bind('prevBtn', actions.prev);
  bind('shuffleBtn', actions.shuffle);
  bind('loopBtn', actions.loop);
  bind('muteBtn', actions.mute);
  bind('fsBtn', actions.fullscreen);
  bind('homeSettings', openDrawer);
  bind('playerSettings', openDrawer);
  bind('closeDrawer', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);

  // Mouse: movimento = mostra comandi, clic = pausa, doppio clic = schermo intero.
  // Tocco: tocco = mostra/nascondi comandi, scorrimento = avanti/indietro.
  let down = null;
  const stage = $('stage');
  playerEl.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') showHud(); });
  stage.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  stage.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const quick = performance.now() - down.t < 600;
    down = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) { dx < 0 ? actions.next() : actions.prev(); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || !quick) return;
    if (e.pointerType === 'mouse') actions.toggle();
    else if (playerEl.classList.contains('hud-on')) { clearTimeout(hudTimer); playerEl.classList.remove('hud-on'); }
    else showHud();
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('dblclick', (e) => { if (e.pointerType !== 'touch' && !Platform.isTouch) actions.fullscreen(); });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (drawerOpen()) closeDrawer();
      else if (inPlayer()) exitPlayer();
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (!inPlayer()) return;
    const k = e.key.toLowerCase();
    if (typing && (k.startsWith('arrow') || k === ' ')) return;
    const map = {
      ' ': actions.toggle, k: actions.toggle, arrowright: actions.next, arrowleft: actions.prev,
      pagedown: actions.next, pageup: actions.prev,
      f: actions.fullscreen, r: actions.shuffle, l: actions.loop, m: actions.mute,
      s: () => (drawerOpen() ? closeDrawer() : openDrawer()),
    };
    if (map[k]) {
      e.preventDefault();
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      map[k]();
    }
  });

  // ───────────── stato del player → interfaccia
  function syncToggles() {
    $('shuffleBtn').classList.toggle('on', S.get('order') === 'random');
    $('loopBtn').classList.toggle('on', S.get('loop'));
    Icons.set($('muteBtn'), S.get('videoMuted') ? 'mute' : 'volume');
    playerEl.classList.toggle('show-name', S.get('showName'));
    playerEl.classList.toggle('show-counter', S.get('showCounter'));
    playerEl.classList.toggle('show-progress', S.get('showProgress'));
    playerEl.classList.toggle('show-clock', S.get('showClock'));
  }

  Player.on((type, st) => {
    Icons.set($('playBtn'), st.playing ? 'pause' : 'play');
    playerEl.classList.toggle('paused', st.active && !st.playing);
    $('counter').textContent = st.total ? `${st.index + 1} / ${st.total}` : '';
    $('fileName').textContent = st.item ? st.item.name : '';
    if (type === 'end') { toast('Presentazione terminata'); showHud(); }
    if (type === 'empty') toast('Nessun file di questo tipo nella cartella.');
    if (type === 'unplayable') toast('Non riesco a riprodurre i file di questa cartella.', 3600);
  });

  const tickClock = () => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tickClock();
  setInterval(tickClock, 5000);

  let rescanTimer = 0;
  S.onChange((key) => {
    syncToggles();
    refreshControls();
    if (key === 'keepAwake' && inPlayer()) Platform.keepAwake(S.get('keepAwake'));
    if (key === 'recursive' && inPlayer() && folder) {
      clearTimeout(rescanTimer);
      const f = folder;
      rescanTimer = setTimeout(async () => {
        try { const items = await scan(f); if (folder === f) Player.setSource(items); } catch {}
      }, 250);
    }
  });

  Platform.onFullscreenChange((on) => {
    document.body.classList.toggle('fullscreen', on);
    Icons.set($('fsBtn'), on ? 'shrink' : 'expand');
  });

  // ───────────── pannello impostazioni
  const drawer = $('drawer');
  const controls = [];     // funzioni di aggiornamento dei controlli
  const drawerOpen = () => app.classList.contains('drawer-open');

  function openDrawer() {
    app.classList.add('drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
    refreshControls();
    animateTiles();
  }
  function closeDrawer() {
    app.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function buildRange(row, toValue, fromValue, min, max, step) {
    const wrap = el('div', 'row col');
    const head = el('div', 'row-head');
    const out = el('output');
    head.append(el('label', '', row.label), out);
    const input = el('input');
    Object.assign(input, { type: 'range', min, max, step });
    input.setAttribute('aria-label', row.label);
    const paint = () => {
      input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
      out.textContent = row.format(toValue(+input.value));
    };
    input.addEventListener('input', () => { paint(); S.set(row.key, toValue(+input.value)); });
    wrap.append(head, input);
    controls.push(() => { input.value = fromValue(S.get(row.key)); paint(); });
    return wrap;
  }

  const builders = {
    toggle(row) {
      const wrap = el('label', 'row');
      const text = el('span', 'row-text');
      text.append(el('span', '', row.label));
      if (row.hint) text.append(el('small', '', row.hint));
      const sw = el('button', 'switch');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-label', row.label);
      sw.append(el('i'));
      sw.addEventListener('click', () => S.set(row.key, !S.get(row.key)));
      wrap.append(text, sw);
      controls.push(() => sw.setAttribute('aria-checked', String(!!S.get(row.key))));
      return wrap;
    },
    seg(row) {
      const wrap = el('div', 'row col');
      wrap.append(el('label', '', row.label));
      const seg = el('div', 'seg');
      seg.style.setProperty('--n', row.options.length);
      seg.append(el('i', 'seg-thumb'));
      const btns = row.options.map(([value, label]) => {
        const b = el('button', '', label);
        b.type = 'button';
        b.addEventListener('click', () => S.set(row.key, value));
        seg.append(b);
        return b;
      });
      wrap.append(seg);
      controls.push(() => {
        const i = Math.max(0, row.options.findIndex(([v]) => v === S.get(row.key)));
        seg.style.setProperty('--i', i);
        btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      });
      return wrap;
    },
    range: (row) => buildRange(row, (v) => v, (v) => v, row.min, row.max, row.step),
    steps(row) {
      const nearest = (v) => row.steps.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(row.steps[best] - v) ? i : best), 0);
      return buildRange(row, (i) => row.steps[i], nearest, 0, row.steps.length - 1, 1);
    },
    transition(row) {
      const grid = el('div', 'tiles');
      const tiles = Transitions.LIST.map(([name, label]) => {
        const t = el('button', 'tile');
        t.type = 'button';
        t.dataset.name = name;
        const mini = el('div', 'mini');
        mini.append(el('i', 'a'), el('i', 'b'));
        if (name === 'random') { const d = el('span', 'mini-icon'); d.innerHTML = Icons.svg('dice'); mini.append(d); }
        t.append(mini, el('span', '', label));
        t.addEventListener('click', () => S.set(row.key, name));
        t.addEventListener('pointerenter', () => { t.dataset.hover = '1'; animateTile(t); });
        t.addEventListener('pointerleave', () => { delete t.dataset.hover; });
        grid.append(t);
        return t;
      });
      controls.push(() => {
        tiles.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.name === S.get(row.key))));
        animateTiles();
      });
      return grid;
    },
  };

  // Anteprime animate: girano solo sulla transizione selezionata o sotto il puntatore.
  function animateTile(t) {
    if (t._busy) return;
    const live = () => drawerOpen() && (t.dataset.hover || t.getAttribute('aria-pressed') === 'true');
    if (!live()) return;
    t._busy = true;
    const [a, b] = t._flip ? [t.querySelector('.b'), t.querySelector('.a')] : [t.querySelector('.a'), t.querySelector('.b')];
    t._flip = !t._flip;
    Transitions.start(t.dataset.name, a, b, 700, 1).finished.then(() => {
      setTimeout(() => { t._busy = false; animateTile(t); }, 650);
    });
  }
  function animateTiles() { drawer.querySelectorAll('.tile').forEach(animateTile); }

  function buildDrawer() {
    const body = $('drawerBody');
    const visibility = [];
    for (const group of S.SCHEMA) {
      const sec = el('section', 'group');
      sec.append(el('h3', '', group.title));
      const card = el('div', 'card');
      for (const row of group.rows) {
        if (row.key === 'fullscreenOnStart' && Platform.kind === 'android') row.label = 'Nascondi le barre di sistema';
        const fold = el('div', 'fold');
        const inner = el('div', 'fold-in');
        inner.append(builders[row.type](row));
        fold.append(inner);
        card.append(fold);
        if (row.showIf) visibility.push(() => fold.classList.toggle('closed', !row.showIf(S.all)));
      }
      sec.append(card);
      body.append(sec);
    }
    controls.push(() => visibility.forEach((fn) => fn()));

    body.append(buildUpdateSection());

    const foot = el('div', 'drawer-foot');
    if (Platform.kind !== 'android') {
      const keys = el('div', 'keys');
      [['Spazio', 'Pausa'], ['← →', 'Scorri'], ['F', 'Schermo intero'], ['R', 'Casuale'], ['L', 'Ripeti'], ['M', 'Audio'], ['S', 'Impostazioni'], ['Esc', 'Esci']]
        .forEach(([k, d]) => { const s = el('span'); s.append(el('kbd', '', k), document.createTextNode(d)); keys.append(s); });
      foot.append(keys);
    }
    const reset = el('button', 'ghost', 'Ripristina impostazioni predefinite');
    reset.type = 'button';
    reset.addEventListener('click', () => { S.reset(); toast('Impostazioni ripristinate', 1600); });
    foot.append(reset, el('p', 'version', `Slideshower ${Updater.current}`));
    body.append(foot);
  }

  function refreshControls() { controls.forEach((fn) => fn()); }

  // ───────────── aggiornamenti
  let checkForUpdate = () => {};
  function buildUpdateSection() {
    const sec = el('section', 'group');
    sec.append(el('h3', '', 'Aggiornamenti'));
    const card = el('div', 'card');
    const row = el('div', 'row update');
    const text = el('span', 'row-text');
    const title = el('span', '', `Versione ${Updater.current}`);
    const status = el('small', '', 'Premi per cercare una nuova versione');
    text.append(title, status);
    const btn = el('button', 'pill-btn', 'Controlla');
    btn.type = 'button';
    const meter = el('div', 'meter');
    meter.append(el('i'));
    row.append(text, btn);
    card.append(row, meter);
    sec.append(card);

    let found = null;
    const set = (msg, label, enabled = true) => { status.textContent = msg; if (label) btn.textContent = label; btn.disabled = !enabled; };
    const badge = (on) => document.querySelectorAll('#homeSettings, #playerSettings').forEach((b) => b.classList.toggle('has-update', on));

    checkForUpdate = async (silent = false) => {
      if (btn.disabled) return;
      if (!silent) set('Controllo in corso…', 'Controlla', false);
      try {
        const r = await Updater.check();
        found = r.newer ? r : null;
        badge(!!found);
        if (found) {
          title.textContent = `Disponibile la versione ${r.latest}`;
          card.classList.add('highlight');
          set(`Installata: ${Updater.current}`, r.url ? 'Scarica e installa' : 'Apri il download');
        } else if (!silent) {
          set(r.latest ? 'Hai già l’ultima versione' : 'Nessuna versione pubblicata', 'Controlla');
        }
      } catch {
        if (!silent) set('Controllo non riuscito: verifica la connessione', 'Riprova');
      }
    };

    async function download() {
      if (!found.url) { Platform.openExternal(found.page); return; }
      set('Scaricamento… 0%', 'Scarico…', false);
      meter.classList.add('on');
      const bar = meter.firstChild;
      try {
        await Platform.downloadUpdate(found.url, (p) => {
          if (p == null) return;
          bar.style.transform = `scaleX(${p})`;
          status.textContent = `Scaricamento… ${Math.round(p * 100)}%`;
        });
        bar.style.transform = 'scaleX(1)';
        set({
          android: 'Scaricato: conferma l’installazione nella finestra di sistema',
          desktop: Platform.os === 'darwin'
            ? 'Scaricato: trascina Slideshower in Applicazioni e sostituisci la versione attuale'
            : 'Scaricato nella cartella Download: estrai lo zip e sostituisci la vecchia versione',
        }[Platform.kind] || 'Scaricato', 'Scarica di nuovo');
      } catch {
        set('Scaricamento non riuscito', 'Riprova');
      }
      setTimeout(() => meter.classList.remove('on'), 900);
    }

    // Versione web: è sempre l'ultima pubblicata, quindi proponiamo le app da installare.
    if (Platform.kind === 'web') {
      set('Disponibile anche come app per Mac, Windows e Android', 'Scarica le app');
      btn.addEventListener('click', () => Platform.openExternal(Updater.PAGE));
      return sec;
    }
    btn.addEventListener('click', () => (found ? download() : checkForUpdate()));
    return sec;
  }

  // ───────────── trascinamento (desktop)
  if (Platform.canDrop) {
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; app.classList.add('dragging'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) app.classList.remove('dragging'); });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      app.classList.remove('dragging');
      const f = await Platform.folderFromDrop(e.dataTransfer);
      if (!f) return;
      if (inPlayer()) exitPlayer();
      openFolder(f);
    });
  } else {
    $('dropHint').hidden = true;
  }

  // ───────────── tasto indietro (Android)
  Platform.onBack(() => {
    if (drawerOpen()) closeDrawer();
    else if (inPlayer()) exitPlayer();
    else Platform.exitApp();
  });

  // ───────────── avvio
  buildDrawer();
  refreshControls();
  syncToggles();
  renderRecents();
  requestAnimationFrame(() => app.classList.add('ready'));
  if (Platform.kind !== 'web') setTimeout(() => checkForUpdate(true), 2500);     // controllo silenzioso all'avvio

  (async () => {
    const initial = await Platform.initialFolder();
    if (initial) return openFolder(initial);
    const last = readRecents()[0];
    if (S.get('resumeLast') && last) openFolder({ id: last.id, name: last.name });
  })();
})();
