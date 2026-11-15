const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openSpeaker: () => ipcRenderer.invoke('dialog:openSpeaker'),
  saveText: (opts) => ipcRenderer.invoke('dialog:saveText', opts),
  parseFile: (filePath) => ipcRenderer.invoke('parse:file', filePath),
  parseExample: () => ipcRenderer.invoke('parse:example'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  setFullscreen: (on) => ipcRenderer.invoke('window:set-fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // OSC
  oscApplyConfig: (cfg) => ipcRenderer.invoke('osc:apply-config', cfg),
  oscStatus: () => ipcRenderer.invoke('osc:status'),
  oscSend: (address, args) => ipcRenderer.invoke('osc:send', address, args),
  oscStop: () => ipcRenderer.invoke('osc:stop'),
  onOscMessage: (handler) => {
    const listener = (_event, msg) => handler(msg);
    ipcRenderer.on('osc:message', listener);
    return () => ipcRenderer.removeListener('osc:message', listener);
  },
  onOscError: (handler) => {
    const listener = (_event, err) => handler(err);
    ipcRenderer.on('osc:error', listener);
    return () => ipcRenderer.removeListener('osc:error', listener);
  },

  // Remote webview
  webApplyConfig: (cfg) => ipcRenderer.invoke('web:apply-config', cfg),
  webSetState: (state) => ipcRenderer.invoke('web:set-state', state),
  webStatus: () => ipcRenderer.invoke('web:status'),
  webStop: () => ipcRenderer.invoke('web:stop'),
  onWebError: (handler) => {
    const listener = (_event, err) => handler(err);
    ipcRenderer.on('web:error', listener);
    return () => ipcRenderer.removeListener('web:error', listener);
  },
});
