// Set di icone a tratto, inserite negli elementi con [data-icon].
const Icons = (() => {
  const P = {
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6a2 2 0 0 1 1.5.7l1 1.1a2 2 0 0 0 1.5.7h5.4A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    prev: '<path d="M18.5 6.5v11L10 12z" fill="currentColor"/><path d="M6 6v12"/>',
    next: '<path d="M5.5 6.5v11L14 12z" fill="currentColor"/><path d="M18 6v12"/>',
    play: '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.6-6.4a1 1 0 0 0 0-1.8L9.5 4.7a1 1 0 0 0-1.5.9z" fill="currentColor"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/>',
    shuffle: '<path d="M3 7h3.2a4 4 0 0 1 3.3 1.8l5 7.4a4 4 0 0 0 3.3 1.8H21M3 17h3.2a4 4 0 0 0 3.3-1.8l.6-.9M21 7h-3.2a4 4 0 0 0-3.3 1.8l-.6.9M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>',
    repeat: '<path d="M17 3.5L20 6.5l-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5L4 17.5l3-3M20 12.5v1a4 4 0 0 1-4 4H4"/>',
    volume: '<path d="M4 9.5h3l4.4-3.6a.6.6 0 0 1 1 .5v11.2a.6.6 0 0 1-1 .5L7 14.5H4z" fill="currentColor"/><path d="M16 9a4.2 4.2 0 0 1 0 6M18.6 6.4a8 8 0 0 1 0 11.2"/>',
    mute: '<path d="M4 9.5h3l4.4-3.6a.6.6 0 0 1 1 .5v11.2a.6.6 0 0 1-1 .5L7 14.5H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
    expand: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
    shrink: '<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l4.6-4.2a1.5 1.5 0 0 1 2 0L14 16l1.8-1.6a1.5 1.5 0 0 1 2 0L20 16.5"/>',
  };
  const svg = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  const set = (el, name) => { el.dataset.icon = name; el.innerHTML = svg(name); };
  const hydrate = (root = document) => root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = svg(el.dataset.icon); });
  return { svg, set, hydrate };
})();
