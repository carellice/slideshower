// Preferenze: valori, salvataggio e descrizione dei controlli mostrati nel pannello.
const Settings = (() => {
  const KEY = 'slideshower.settings.v1';
  const DEFAULTS = {
    photoDuration: 5,
    videoMode: 'full',        // full | limit | photo
    videoLimit: 30,
    videoMuted: false,
    videoVolume: 100,
    order: 'name',            // name | date | random
    reverse: false,
    loop: true,
    reshuffle: true,
    media: 'all',             // all | photos | videos
    recursive: true,
    transition: 'fade',
    transitionDuration: 0.9,
    kenBurns: true,
    fit: 'contain',           // contain | cover
    backdrop: 'blur',         // blur | black
    showName: false,
    showCounter: true,
    showProgress: true,
    showClock: false,
    fullscreenOnStart: true,
    keepAwake: true,
    resumeLast: false,
  };

  let values = { ...DEFAULTS };
  try { values = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}

  const listeners = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch {} };

  function set(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    save();
    listeners.forEach((fn) => fn(key, value));
  }
  function reset() {
    const old = values;
    values = { ...DEFAULTS };
    save();
    Object.keys(DEFAULTS).forEach((k) => { if (old[k] !== values[k]) listeners.forEach((fn) => fn(k, values[k])); });
  }

  const secs = (v) => (v < 60 ? `${+v.toFixed(1)} s` : `${Math.floor(v / 60)} min${v % 60 ? ` ${Math.round(v % 60)} s` : ''}`);

  // Scala non lineare: precisa sui tempi brevi, veloce su quelli lunghi.
  const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 45, 60, 90, 120, 180, 300, 600];
  const LIMITS = [3, 5, 8, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600];

  const SCHEMA = [
    { title: 'Riproduzione', rows: [
      { key: 'photoDuration', type: 'steps', label: 'Durata di ogni foto', steps: STEPS, format: secs },
      { key: 'videoMode', type: 'seg', label: 'Video', options: [['full', 'Per intero'], ['limit', 'Tempo massimo'], ['photo', 'Come le foto']] },
      { key: 'videoLimit', type: 'steps', label: 'Tempo massimo per video', steps: LIMITS, format: secs, showIf: (s) => s.videoMode === 'limit' },
      { key: 'videoMuted', type: 'toggle', label: 'Video senza audio' },
      { key: 'videoVolume', type: 'range', label: 'Volume', min: 0, max: 100, step: 5, format: (v) => `${v}%`, showIf: (s) => !s.videoMuted },
    ] },
    { title: 'Ordine', rows: [
      { key: 'order', type: 'seg', label: 'Scorri per', options: [['name', 'Nome'], ['date', 'Data'], ['random', 'Casuale']] },
      { key: 'reverse', type: 'toggle', label: 'Ordine inverso', showIf: (s) => s.order !== 'random' },
      { key: 'loop', type: 'toggle', label: 'Ricomincia da capo alla fine' },
      { key: 'reshuffle', type: 'toggle', label: 'Rimescola a ogni giro', showIf: (s) => s.order === 'random' && s.loop },
    ] },
    { title: 'Contenuti', rows: [
      { key: 'media', type: 'seg', label: 'Mostra', options: [['all', 'Foto e video'], ['photos', 'Solo foto'], ['videos', 'Solo video']] },
      { key: 'recursive', type: 'toggle', label: 'Includi le sottocartelle' },
    ] },
    { title: 'Transizione', rows: [
      { key: 'transition', type: 'transition' },
      { key: 'transitionDuration', type: 'range', label: 'Durata transizione', min: 0.2, max: 3, step: 0.1, format: secs, showIf: (s) => s.transition !== 'none' },
      { key: 'kenBurns', type: 'toggle', label: 'Movimento lento sulle foto', hint: 'Effetto Ken Burns: zoom e panoramica leggeri' },
    ] },
    { title: 'Aspetto', rows: [
      { key: 'fit', type: 'seg', label: 'Adattamento', options: [['contain', 'Mostra tutto'], ['cover', 'Riempi lo schermo']] },
      { key: 'backdrop', type: 'seg', label: 'Sfondo', options: [['blur', 'Sfocato'], ['black', 'Nero']], showIf: (s) => s.fit === 'contain' },
      { key: 'showProgress', type: 'toggle', label: 'Barra di avanzamento' },
      { key: 'showCounter', type: 'toggle', label: 'Contatore' },
      { key: 'showName', type: 'toggle', label: 'Nome del file' },
      { key: 'showClock', type: 'toggle', label: 'Orologio' },
    ] },
    { title: 'Sistema', rows: [
      { key: 'fullscreenOnStart', type: 'toggle', label: 'Avvia a schermo intero' },
      { key: 'keepAwake', type: 'toggle', label: 'Tieni lo schermo acceso' },
      { key: 'resumeLast', type: 'toggle', label: 'Riapri l’ultima cartella all’avvio' },
    ] },
  ];

  return {
    get: (k) => values[k],
    get all() { return values; },
    set, reset, SCHEMA, DEFAULTS,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
