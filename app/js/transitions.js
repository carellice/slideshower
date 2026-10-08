// Transizioni tra due livelli sovrapposti, basate sulla Web Animations API (solo transform/opacity/clip).
const Transitions = (() => {
  const SOFT = 'cubic-bezier(.4, 0, .2, 1)';
  const SWIFT = 'cubic-bezier(.65, 0, .35, 1)';

  // Ogni definizione riceve { dir, w } e restituisce i fotogrammi per il livello entrante e uscente.
  const DEFS = {
    fade: () => ({
      in: [{ opacity: 0 }, { opacity: 1 }],
      out: [{ opacity: 1 }, { opacity: 0 }],
    }),
    slide: ({ dir }) => ({
      easing: SWIFT,
      in: [{ transform: `translateX(${100 * dir}%)` }, { transform: 'translateX(0)' }],
      out: [{ transform: 'translateX(0)' }, { transform: `translateX(${-100 * dir}%)` }],
    }),
    slideUp: ({ dir }) => ({
      easing: SWIFT,
      in: [{ transform: `translateY(${100 * dir}%)` }, { transform: 'translateY(0)' }],
      out: [{ transform: 'translateY(0)' }, { transform: `translateY(${-100 * dir}%)` }],
    }),
    zoom: () => ({
      in: [{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }],
      out: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.88)' }],
    }),
    blur: () => ({
      in: [{ opacity: 0, filter: 'blur(28px)', transform: 'scale(1.06)' }, { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' }],
      out: [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(28px)' }],
    }),
    cover: ({ dir }) => ({
      easing: SWIFT,
      in: [{ transform: `translateX(${100 * dir}%)`, boxShadow: '0 0 80px rgba(0,0,0,.7)' }, { transform: 'translateX(0)', boxShadow: '0 0 80px rgba(0,0,0,0)' }],
      out: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.9)', opacity: 0.35 }],
    }),
    flip: ({ dir }) => ({
      easing: SWIFT,
      in: [{ transform: `rotateY(${180 * dir}deg)` }, { transform: `rotateY(${90 * dir}deg) scale(.82)` }, { transform: 'rotateY(0deg)' }],
      out: [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${-90 * dir}deg) scale(.82)` }, { transform: `rotateY(${-180 * dir}deg)` }],
    }),
    cube: ({ dir, w }) => {
      const h = w / 2;
      const face = (deg) => `translateZ(${-h}px) rotateY(${deg}deg) translateZ(${h}px)`;
      return {
        easing: SWIFT,
        in: [{ transform: face(90 * dir) }, { transform: face(0) }],
        out: [{ transform: face(0) }, { transform: face(-90 * dir) }],
      };
    },
    wipe: ({ dir }) => ({
      easing: SWIFT,
      in: [{ clipPath: dir > 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }],
      out: [{ opacity: 1 }, { opacity: 1 }],
    }),
    circle: () => ({
      easing: SWIFT,
      in: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }],
      out: [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }],
    }),
    none: () => ({ instant: true, in: [{ opacity: 1 }, { opacity: 1 }], out: [{ opacity: 0 }, { opacity: 0 }] }),
  };

  const LIST = [
    ['fade', 'Dissolvenza'], ['slide', 'Scorrimento'], ['slideUp', 'Verticale'], ['zoom', 'Zoom'],
    ['blur', 'Sfocatura'], ['cover', 'Copertura'], ['flip', 'Capovolgi'], ['cube', 'Cubo'],
    ['wipe', 'Tendina'], ['circle', 'Cerchio'], ['none', 'Nessuna'], ['random', 'Casuale'],
  ];
  const POOL = LIST.map((l) => l[0]).filter((n) => n !== 'none' && n !== 'random');
  let lastRandom = '';

  function pick(name) {
    if (name !== 'random') return DEFS[name] ? name : 'fade';
    let n;
    do { n = POOL[Math.floor(Math.random() * POOL.length)]; } while (n === lastRandom);
    lastRandom = n;
    return n;
  }

  // Avvia la transizione. Restituisce { finished, finish() }: finish() la conclude subito.
  function start(name, outEl, inEl, ms, dir = 1) {
    const spec = DEFS[pick(name)]({ dir, w: inEl.offsetWidth || 1 });
    const opts = { duration: spec.instant ? 0 : Math.max(0, ms), easing: spec.easing || SOFT, fill: 'both' };
    inEl.style.zIndex = 2;
    inEl.style.visibility = 'visible';
    const anims = [inEl.animate(spec.in, opts)];
    if (outEl) { outEl.style.zIndex = 1; anims.push(outEl.animate(spec.out, opts)); }

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (outEl) outEl.style.visibility = 'hidden';
      anims.forEach((a) => { try { a.cancel(); } catch {} });
    };
    const finished = Promise.all(anims.map((a) => a.finished)).then(cleanup, cleanup);
    return { finished, finish: cleanup };
  }

  return { start, LIST };
})();
