// Strato di astrazione: stessa interfaccia per desktop (Electron), Android (Capacitor) e browser.
const Platform = (() => {
  const IMG = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'jfif'];
  const VID = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', '3gp'];
  const ext = (n) => (n.split('.').pop() || '').toLowerCase();
  const typeOf = (n) => (IMG.includes(ext(n)) ? 'image' : VID.includes(ext(n)) ? 'video' : null);

  const native = window.slideshowerNative;                      // Electron (preload)
  const cap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    ? window.Capacitor : null;                                  // Android
  const call = (method, args = {}) => cap.nativePromise('Slideshower', method, args);

  const base = {
    kind: 'web',
    isTouch: matchMedia('(pointer: coarse)').matches,
    canDrop: false,
    async resolveUrl(item) { return item.url; },
    async folderFromDrop() { return null; },
    async initialFolder() { return null; },
    onBack() {},
    exitApp() {},
    // Aggiornamenti: nome del file da scaricare dalla release (null = nessun pacchetto per questa piattaforma)
    updateAsset: null,
    async downloadUpdate() { throw new Error('non disponibile'); },
    openExternal(url) { window.open(url, '_blank', 'noopener'); },
  };

  // ───────────── Electron
  if (native) {
    return {
      ...base,
      kind: 'desktop',
      os: native.os,
      canDrop: true,
      async pickFolder() {
        const p = await native.pickFolder();
        return p ? { id: p, name: p.split(/[\\/]/).filter(Boolean).pop() || p } : null;
      },
      scan: (id, recursive) => native.scan(id, recursive),
      async resolveUrl(item) { return item.heic ? native.convertHeic(item.id) : item.url; },
      async folderFromDrop(dt) {
        const f = dt.files && dt.files[0];
        if (!f) return null;
        const p = await native.folderForFile(f);
        return p ? { id: p, name: p.split(/[\\/]/).filter(Boolean).pop() || p } : null;
      },
      initialFolder: async () => {
        const p = await native.initialFolder();
        return p ? { id: p, name: p.split(/[\\/]/).filter(Boolean).pop() || p } : null;
      },
      setFullscreen: (on) => native.setFullscreen(on),
      isFullscreen: () => native.isFullscreen(),
      onFullscreenChange: (cb) => native.onFullscreen(cb),
      keepAwake: (on) => native.keepAwake(on),
      updateAsset: native.os === 'darwin' ? `Slideshower-mac-${native.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
        : native.os === 'win32' ? 'Slideshower-windows.zip' : null,
      downloadUpdate: (url, onProgress) => native.downloadUpdate(url, onProgress),
      openExternal: (url) => native.openExternal(url),
    };
  }

  // ───────────── Android
  if (cap) {
    let immersive = false;
    const fsListeners = [];
    return {
      ...base,
      kind: 'android',
      isTouch: true,
      async pickFolder() {
        try { const r = await call('pickFolder'); return r && r.uri ? { id: r.uri, name: r.name } : null; }
        catch { return null; }
      },
      async scan(id, recursive) {
        const r = await call('listMedia', { uri: id, recursive });
        return {
          name: r.name,
          items: r.items.map((it) => ({
            id: it.uri, url: cap.convertFileSrc(it.uri), name: it.name, rel: it.rel, mtime: it.mtime, type: it.type,
          })),
        };
      },
      async setFullscreen(on) {
        immersive = on;
        try { await call('setImmersive', { on }); } catch {}
        fsListeners.forEach((cb) => cb(on));
      },
      isFullscreen: async () => immersive,
      onFullscreenChange: (cb) => fsListeners.push(cb),
      keepAwake: (on) => call('keepAwake', { on }).catch(() => {}),
      onBack: (cb) => window.addEventListener('slideshowerBack', cb),
      exitApp: () => call('exitApp').catch(() => {}),
      updateAsset: 'Slideshower-android.apk',
      async downloadUpdate(url, onProgress) {
        const on = (e) => onProgress(e.percent);
        window.addEventListener('slideshowerProgress', on);
        try { return await call('installUpdate', { url }); }
        finally { window.removeEventListener('slideshowerProgress', on); }
      },
    };
  }

  // ───────────── Browser (sviluppo / anteprima)
  const webFolders = new Map();
  let wakeLock = null;

  async function demoItems(n) {
    const sizes = [[1600, 900], [900, 1350], [1400, 1400], [1920, 800]];
    const items = [];
    for (let i = 0; i < n; i++) {
      const [w, h] = sizes[i % sizes.length];
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = c.getContext('2d');
      const hue = (i * 47) % 360;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue} 80% 55%)`);
      grad.addColorStop(1, `hsl(${(hue + 70) % 360} 85% 35%)`);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `hsla(${(hue + k * 30) % 360} 90% 70% / .22)`;
        g.beginPath(); g.arc(w * ((k * 0.37 + 0.2) % 1), h * ((k * 0.53 + 0.3) % 1), h * (0.12 + k * 0.03), 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,.92)'; g.font = `700 ${h * 0.34}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), w / 2, h / 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      const name = `demo-${String(i + 1).padStart(2, '0')}.jpg`;
      items.push({ id: name, url: URL.createObjectURL(blob), name, rel: name, mtime: Date.now() - i * 864e5, type: 'image' });
    }
    return items;
  }

  return {
    ...base,
    pickFolder() {
      return new Promise((resolve) => {
        const input = document.getElementById('webPicker');
        input.value = '';
        input.onchange = () => {
          const files = [...input.files];
          if (!files.length) return resolve(null);
          const name = (files[0].webkitRelativePath || '').split('/')[0] || 'Cartella';
          const id = `web:${name}:${Date.now()}`;
          webFolders.set(id, files);
          resolve({ id, name, volatile: true });
        };
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      });
    },
    async scan(id, recursive) {
      if (id.startsWith('demo:')) return { name: 'Demo', items: await demoItems(+id.slice(5) || 8) };
      const files = webFolders.get(id) || [];
      const items = [];
      for (const f of files) {
        const type = typeOf(f.name);
        const rel = f.webkitRelativePath.split('/').slice(1).join('/') || f.name;
        if (!type || f.name.startsWith('.') || (!recursive && rel.includes('/'))) continue;
        items.push({ id: rel, url: URL.createObjectURL(f), name: f.name, rel, mtime: f.lastModified, type });
      }
      return { name: id.split(':')[1], items };
    },
    async initialFolder() {
      const n = new URLSearchParams(location.search).get('demo');
      return n ? { id: `demo:${n}`, name: 'Demo', volatile: true } : null;
    },
    async setFullscreen(on) {
      try {
        if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
        else if (!on && document.fullscreenElement) await document.exitFullscreen();
      } catch {}
    },
    isFullscreen: async () => !!document.fullscreenElement,
    onFullscreenChange: (cb) => document.addEventListener('fullscreenchange', () => cb(!!document.fullscreenElement)),
    async keepAwake(on) {
      try {
        if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
        else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
      } catch {}
    },
  };
})();
