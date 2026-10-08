// Processo principale Electron: finestra, selezione cartella, scansione dei file.
const { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, Menu, nativeTheme, shell, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync, statSync, readFileSync, createWriteStream } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');

const IMG = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'jfif']);
const HEIC = new Set(['heic', 'heif']);
const VID = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', '3gp']);
const isMac = process.platform === 'darwin';

let win = null;
let blocker = null;

function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 420,
    minHeight: 420,
    show: false,
    backgroundColor: '#0a0a12',
    title: 'Slideshower',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    icon: isMac ? undefined : path.join(__dirname, '..', 'app', 'assets', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  win.on('closed', () => { win = null; });
  // L'app mostra solo contenuti locali: niente navigazione né nuove finestre.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

// Scansione ricorsiva: restituisce foto e video con data di modifica.
async function scanFolder(root, recursive) {
  const items = [];
  const walk = async (dir, rel) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    const dirs = [];
    await Promise.all(entries.map(async (e) => {
      if (e.name.startsWith('.')) return;
      const full = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      let isDir = e.isDirectory(), isFile = e.isFile();
      if (e.isSymbolicLink()) {
        try { const s = statSync(full); isDir = s.isDirectory(); isFile = s.isFile(); } catch { return; }
      }
      if (isDir) { if (recursive && !e.name.endsWith('.photoslibrary')) dirs.push([full, relPath]); return; }
      if (!isFile) return;
      const ext = path.extname(e.name).slice(1).toLowerCase();
      const heic = isMac && HEIC.has(ext);
      const type = IMG.has(ext) || heic ? 'image' : VID.has(ext) ? 'video' : null;
      if (!type) return;
      let mtime = 0;
      try { mtime = (await fs.stat(full)).mtimeMs; } catch {}
      items.push({ id: full, url: pathToFileURL(full).href, name: e.name, rel: relPath, mtime, type, heic });
    }));
    for (const [d, r] of dirs) await walk(d, r);
  };
  await walk(root, '');
  return { name: path.basename(root), items };
}

// Chromium non legge i file HEIC: su macOS li convertiamo al volo in JPEG con `sips`.
const heicJobs = new Map();
function convertHeic(file) {
  if (heicJobs.has(file)) return heicJobs.get(file);
  const job = (async () => {
    const dir = path.join(app.getPath('temp'), 'slideshower-heic');
    await fs.mkdir(dir, { recursive: true });
    const st = await fs.stat(file);
    const key = crypto.createHash('sha1').update(`${file}:${st.mtimeMs}:${st.size}`).digest('hex');
    const out = path.join(dir, `${key}.jpg`);
    if (!existsSync(out)) {
      await new Promise((resolve, reject) => {
        execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', file, '--out', out],
          (err) => (err ? reject(err) : resolve()));
      });
    }
    return pathToFileURL(out).href;
  })();
  heicJobs.set(file, job);
  job.catch(() => heicJobs.delete(file));
  return job;
}

function folderOf(p) {
  try { return statSync(p).isDirectory() ? p : path.dirname(p); } catch { return null; }
}

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Scegli una cartella di foto e video',
    buttonLabel: 'Avvia presentazione',
    properties: ['openDirectory'],
  });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle('scan', (_e, dir, recursive) => scanFolder(String(dir), !!recursive));
ipcMain.handle('convert-heic', (_e, file) => convertHeic(String(file)));
ipcMain.handle('folder-of', (_e, p) => folderOf(String(p)));
ipcMain.handle('initial-folder', () => {
  const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-') && existsSync(a));
  return arg ? folderOf(path.resolve(arg)) : null;
});
ipcMain.handle('is-fullscreen', () => !!win && win.isFullScreen());
ipcMain.on('set-fullscreen', (_e, on) => { if (win && win.isFullScreen() !== !!on) win.setFullScreen(!!on); });
ipcMain.on('keep-awake', (_e, on) => {
  if (on && blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  else if (!on && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
});

// ───────────── aggiornamenti
// Si scarica solo dalle release del repository ufficiale (lo stesso indicato in app/js/version.js).
const REPO = (/APP_REPO = '([\w.-]+\/[\w.-]+)'/.exec(readFileSync(path.join(__dirname, '..', 'app', 'js', 'version.js'), 'utf8')) || [])[1];
const releasePrefix = `https://github.com/${REPO}/releases/`;

ipcMain.on('open-external', (_e, url) => {
  if (REPO && String(url).startsWith(`https://github.com/${REPO}`)) shell.openExternal(String(url));
});

ipcMain.handle('download-update', async (e, url) => {
  url = String(url);
  if (!REPO || !url.startsWith(`${releasePrefix}download/`)) throw new Error('Indirizzo non consentito');
  const name = path.basename(new URL(url).pathname).replace(/[^\w.-]/g, '_');
  const dest = path.join(app.getPath('downloads'), name);
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download non riuscito (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${dest}.download`;
  const file = createWriteStream(tmp);
  let done = 0, lastSent = 0;
  try {
    for await (const chunk of res.body) {
      if (!file.write(chunk)) await new Promise((r) => file.once('drain', r));
      done += chunk.length;
      if (total && Date.now() - lastSent > 120) { lastSent = Date.now(); e.sender.send('update-progress', done / total); }
    }
    await new Promise((resolve, reject) => file.end((err) => (err ? reject(err) : resolve())));
    await fs.rename(tmp, dest);
  } catch (err) {
    file.destroy();
    await fs.rm(tmp, { force: true });
    throw err;
  }
  // macOS: apre l'immagine disco; Windows: mostra lo zip nella cartella Download.
  if (isMac) await shell.openPath(dest); else shell.showItemInFolder(dest);
  return dest;
});

app.whenReady().then(() => {
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'Finestra', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }, { role: 'close' }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
