import { contextBridge, ipcRenderer } from 'electron';
import type { DiscorjaAPI, UpdateState } from '../shared/protocol';

const api: DiscorjaAPI = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getSources: () => ipcRenderer.invoke('capture:sources'),
  selectSource: (id) => ipcRenderer.invoke('capture:select', id),
  cancelCapture: () => ipcRenderer.invoke('capture:cancel'),
  setSharing: (sharing) => ipcRenderer.invoke('capture:sharing', sharing),
  copyCode: (code) => ipcRenderer.invoke('room:copy', code),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) =>
      callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
};
contextBridge.exposeInMainWorld('discorja', api);
