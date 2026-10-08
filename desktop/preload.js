// Ponte sicuro tra l'interfaccia e il processo principale.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('slideshowerNative', {
  os: process.platform,
  arch: process.arch,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scan: (dir, recursive) => ipcRenderer.invoke('scan', dir, recursive),
  convertHeic: (file) => ipcRenderer.invoke('convert-heic', file),
  folderForFile: (file) => ipcRenderer.invoke('folder-of', webUtils.getPathForFile(file)),
  initialFolder: () => ipcRenderer.invoke('initial-folder'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  setFullscreen: (on) => ipcRenderer.send('set-fullscreen', on),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, on) => cb(on)),
  keepAwake: (on) => ipcRenderer.send('keep-awake', on),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  downloadUpdate: async (url, onProgress) => {
    const listener = (_e, p) => onProgress(p);
    ipcRenderer.on('update-progress', listener);
    try { return await ipcRenderer.invoke('download-update', url); }
    finally { ipcRenderer.removeListener('update-progress', listener); }
  },
});
