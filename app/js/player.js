// Motore della presentazione: playlist, caricamento, tempi, transizioni.
const Player = (() => {
  const S = Settings;
  const stage = document.getElementById('stage');
  const bar = document.querySelector('#progress i');
  const layers = [...stage.querySelectorAll('.slide')].map((el) => {
    el.innerHTML = '<canvas class="backdrop" width="64" height="36"></canvas><div class="media"></div>';
    return { el, canvas: el.firstChild, holder: el.lastChild };
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  let source = [];        // tutti i file della cartella
  let list = [];          // playlist filtrata e ordinata
  let idx = -1;
  let active = false, playing = false, ended = false;
  let cur = null;         // diapositiva visibile
  let settle = null;      // conclude la transizione in corso
  let pre = null;         // foto successiva già decodificata
  let token = 0, layerIx = 0, fails = 0;
  let raf = 0, last = 0, backdropAt = 0;

  const listeners = new Set();
  const state = () => ({ active, playing, ended, index: idx, total: list.length, item: cur && cur.item, isVideo: !!cur && cur.kind === 'video' });
  const emit = (type = 'change') => listeners.forEach((fn) => fn(type, state()));

  // ───────────── playlist
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildList(keepId) {
    const want = S.get('media');
    const l = source.filter((it) => want === 'all' || (want === 'photos') === (it.type === 'image'));
    const order = S.get('order');
    if (order === 'random') shuffle(l);
    else {
      l.sort(order === 'date'
        ? (a, b) => a.mtime - b.mtime || collator.compare(a.rel, b.rel)
        : (a, b) => collator.compare(a.rel, b.rel));
      if (S.get('reverse')) l.reverse();
    }
    list = l;
    pre = null;
    idx = keepId ? list.findIndex((it) => it.id === keepId) : -1;
    // In ordine casuale la diapositiva corrente diventa la prima del nuovo giro.
    if (order === 'random' && idx > 0) { [list[0], list[idx]] = [list[idx], list[0]]; idx = 0; }
  }

  // ───────────── caricamento
  async function load(item) {
    const url = await Platform.resolveUrl(item);
    if (item.type === 'image') {
      const img = new Image();
      img.decoding = 'async';
      img.draggable = false;
      img.src = url;
      try { await img.decode(); }
      catch (e) { if (!(img.complete && img.naturalWidth)) throw e; }
      return img;
    }
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.muted = true;
    v.disablePictureInPicture = true;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 15000);
      v.addEventListener('loadeddata', () => { clearTimeout(t); resolve(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(t); reject(v.error || new Error('video')); }, { once: true });
      v.src = url;
      v.load();
    });
    return v;
  }

  function release(el) {
    if (el && el.tagName === 'VIDEO') { try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} }
  }

  function peekNext() {
    if (idx + 1 < list.length) return idx + 1;
    return S.get('loop') && list.length > 1 ? 0 : -1;
  }

  function preload() {
    const it = list[peekNext()];
    if (!it || it.type !== 'image' || (pre && pre.id === it.id)) return;
    const promise = load(it);
    promise.catch(() => {});
    pre = { id: it.id, promise };
  }

  function obtain(item) {
    if (pre && pre.id === item.id) { const p = pre.promise; pre = null; return p; }
    return load(item);
  }

  // ───────────── diapositive
  function kenBurns(el) {
    const zoomIn = Math.random() < 0.6;
    const ang = Math.random() * Math.PI * 2;
    const lim = (s) => (50 * (s - 1) / s) * 0.8;       // spostamento massimo senza scoprire i bordi
    const at = (s, k) => ({ transform: `scale(${s}) translate(${(Math.cos(ang) * lim(s) * k).toFixed(2)}%, ${(Math.sin(ang) * lim(s) * k).toFixed(2)}%)` });
    const frames = [at(1.03, -1), at(1.15, 1)];
    if (!zoomIn) frames.reverse();
    const duration = (S.get('photoDuration') + S.get('transitionDuration') * 2) * 1000 + 400;
    return el.animate(frames, { duration, easing: 'linear', fill: 'both' });
  }

  function drawBackdrop(c) {
    if (S.get('fit') !== 'contain' || S.get('backdrop') !== 'blur') return;
    const cv = c.layer.canvas;
    const w = c.el.naturalWidth || c.el.videoWidth, h = c.el.naturalHeight || c.el.videoHeight;
    if (!w || !h) return;
    const k = Math.max(cv.width / w, cv.height / h);
    try { cv.getContext('2d').drawImage(c.el, (cv.width - w * k) / 2, (cv.height - h * k) / 2, w * k, h * k); } catch {}
  }

  function applyAudio(v) {
    v.muted = S.get('videoMuted');
    v.volume = Math.min(1, Math.max(0, S.get('videoVolume') / 100));
  }

  function playVideo(v) {
    const p = v.play();
    if (p) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
  }

  function mount(layer, el, item) {
    const c = { item, el, layer, kind: item.type, elapsed: 0, done: false, kb: null };
    el.className = 'media-el';
    layer.holder.replaceChildren(el);
    if (c.kind === 'video') {
      applyAudio(el);
      el.addEventListener('ended', () => { if (cur === c) advance(); });
      el.addEventListener('error', () => { if (cur === c) advance(); });
      if (playing) playVideo(el);
    } else if (S.get('kenBurns')) {
      c.kb = kenBurns(el);
      if (!playing) c.kb.pause();
    }
    drawBackdrop(c);
    return c;
  }

  function unmount(c) {
    if (c.kb) { try { c.kb.cancel(); } catch {} }
    release(c.el);
    if (c.el.parentNode === c.layer.holder) c.layer.holder.replaceChildren();
  }

  async function go(n, dir = 1) {
    if (!list.length) return;
    const my = ++token;
    const item = list[n];
    let el;
    try { el = await obtain(item); }
    catch {
      if (my !== token) return;
      if (++fails >= list.length) { fails = 0; setPlaying(false); emit('unplayable'); return; }
      return go((n + dir + list.length) % list.length, dir);
    }
    if (my !== token || !active) { release(el); return; }
    fails = 0;
    if (settle) settle();

    const prev = cur;
    layerIx ^= 1;
    const layer = layers[layerIx];
    idx = n;
    ended = false;
    cur = mount(layer, el, item);
    bar.style.transform = 'scaleX(0)';
    emit();

    const tr = Transitions.start(
      prev ? S.get('transition') : 'fade',
      prev && prev.layer.el, layer.el,
      prev ? S.get('transitionDuration') * 1000 : 600, dir,
    );
    let done = false;
    const mine = () => {
      if (done) return;
      done = true;
      if (settle === mine) settle = null;
      tr.finish();
      if (prev) unmount(prev);
    };
    settle = mine;
    tr.finished.then(mine);
    preload();
  }

  // ───────────── avanzamento
  function targetMs(c) {
    if (c.kind === 'image') return S.get('photoDuration') * 1000;
    const mode = S.get('videoMode');
    return mode === 'full' ? 0 : (mode === 'limit' ? S.get('videoLimit') : S.get('photoDuration')) * 1000;
  }

  function advance() {
    if (!cur || cur.done) return;
    cur.done = true;
    next(true);
  }

  function next(auto = false) {
    if (!list.length) return;
    let n = idx + 1;
    if (n >= list.length) {
      if (auto && !S.get('loop')) {
        ended = true;
        setPlaying(false);
        emit('end');
        return;
      }
      if (S.get('order') === 'random' && S.get('reshuffle') && list.length > 2) {
        const lastId = list[idx] && list[idx].id;
        shuffle(list);
        if (list[0].id === lastId) [list[0], list[1]] = [list[1], list[0]];
        pre = null;
      }
      n = 0;
    }
    go(n, 1);
  }

  function prev() {
    if (!list.length) return;
    go(idx - 1 < 0 ? list.length - 1 : idx - 1, -1);
  }

  function setPlaying(v) {
    if (v && ended) { ended = false; playing = true; emit(); go(0, 1); return; }
    playing = v;
    if (cur) {
      if (cur.kind === 'video') { if (v) playVideo(cur.el); else cur.el.pause(); }
      if (cur.kb) { if (v) cur.kb.play(); else cur.kb.pause(); }
    }
    emit();
  }

  function tick(now) {
    const dt = Math.min(now - last, 250);
    last = now;
    const c = cur;
    if (active && playing && c && !c.done) {
      const t = targetMs(c);
      let p = 0;
      if (c.kind === 'video') {
        const v = c.el;
        const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : 0;
        if (!v.paused && v.readyState > 2) c.elapsed += dt;
        p = t ? c.elapsed / (d ? Math.min(t, d) : t) : (d ? (v.currentTime * 1000) / d : 0);
        if (now - backdropAt > 400) { backdropAt = now; drawBackdrop(c); }
        if (t && c.elapsed >= t) advance();
      } else {
        c.elapsed += dt;
        p = c.elapsed / t;
        if (p >= 1) advance();
      }
      bar.style.transform = `scaleX(${Math.min(1, p).toFixed(4)})`;
    }
    raf = requestAnimationFrame(tick);
  }

  // ───────────── reazione alle impostazioni
  function syncStage() {
    stage.dataset.fit = S.get('fit');
    stage.dataset.backdrop = S.get('fit') === 'contain' ? S.get('backdrop') : 'black';
  }

  S.onChange((key) => {
    if (key === 'fit' || key === 'backdrop') { syncStage(); if (cur) drawBackdrop(cur); }
    if (!active) return;
    if (key === 'order' || key === 'reverse' || key === 'media') {
      buildList(cur && cur.item.id);
      if (idx === -1 && list.length) go(0, 1);
      else preload();
      emit(list.length ? 'change' : 'empty');
    }
    if ((key === 'videoMuted' || key === 'videoVolume') && cur && cur.kind === 'video') applyAudio(cur.el);
    if (key === 'kenBurns' && cur && cur.kind === 'image') {
      if (cur.kb) { try { cur.kb.cancel(); } catch {} cur.kb = null; }
      if (S.get('kenBurns')) { cur.kb = kenBurns(cur.el); if (!playing) cur.kb.pause(); }
    }
    if (key === 'loop') preload();
  });
  syncStage();

  // ───────────── API
  function open(items) {
    close();
    source = items;
    active = true;
    playing = true;
    ended = false;
    buildList();
    if (!list.length) { emit('empty'); }
    last = performance.now();
    raf = requestAnimationFrame(tick);
    go(0, 1);
  }

  // Sostituisce i file (es. dopo una nuova scansione) senza interrompere la riproduzione.
  function setSource(items) {
    source = items;
    buildList(cur && cur.item.id);
    if (idx === -1 && list.length) go(0, 1);
    emit(list.length ? 'change' : 'empty');
  }

  function close() {
    if (!active) return;
    active = false;
    playing = false;
    token++;
    cancelAnimationFrame(raf);
    if (settle) settle();
    if (cur) unmount(cur);
    cur = null; pre = null; idx = -1; list = []; source = [];
    layers.forEach((l) => { l.el.style.visibility = 'hidden'; l.el.getAnimations().forEach((a) => a.cancel()); });
    bar.style.transform = 'scaleX(0)';
    emit();
  }

  return {
    open, close, setSource, next: () => next(false), prev,
    toggle: () => setPlaying(!playing),
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    get state() { return state(); },
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
