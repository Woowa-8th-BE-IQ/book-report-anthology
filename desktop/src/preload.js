// 화면(웹 페이지)에 열어 주는 기능은 이것뿐이다. Node나 Electron 객체는 넘기지 않는다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApp', {
  setInteractive: (on) => ipcRenderer.send('pet:interactive', Boolean(on)),
  setExpanded: (open) => ipcRenderer.send('pet:expand', Boolean(open)),
  dragBy: (dx, dy) => ipcRenderer.send('pet:drag', Number(dx) || 0, Number(dy) || 0),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  attention: () => ipcRenderer.send('pet:attention'),
  relink: () => ipcRenderer.send('pet:relink'),
  addAnthology: () => ipcRenderer.send('pet:add'),
  hide: () => ipcRenderer.send('pet:hide'),
  quit: () => ipcRenderer.send('pet:quit'),
  openLink: (url) => ipcRenderer.send('pet:open-link', String(url || '')),
  onCommand: (callback) => ipcRenderer.on('pet:command', (event, name) => callback(String(name || ''))),
  onWalk: (callback) => ipcRenderer.on('pet:walk', (event, state) => callback({
    walking: Boolean(state && state.walking),
    facing: state && (state.facing === 'left' || state.facing === 'right') ? state.facing : null,
  })),
  submitLink: (text) => ipcRenderer.invoke('setup:submit', String(text || '')),
  applyUpdate: () => ipcRenderer.send('pet:apply-update'),
  onUpdate: (callback) => ipcRenderer.on('pet:update', (event, state) => callback({
    status: String(state && state.status || 'idle'),
    version: state && typeof state.version === 'string' ? state.version : null,
    problem: state && typeof state.problem === 'string' ? state.problem : null,
    progress: state && Number.isFinite(state.progress) ? state.progress : null,
  })),
});
