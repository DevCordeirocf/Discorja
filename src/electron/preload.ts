import { contextBridge, ipcRenderer } from 'electron';
import type { DiscorjaAPI, UpdateState } from '../shared/protocol';

const api: DiscorjaAPI = {
  getForeground: () => ipcRenderer.invoke('window:foreground'),
  onForeground: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (typeof value === 'boolean') callback(value);
    };
    ipcRenderer.on('window:foreground', listener);
    return () => ipcRenderer.removeListener('window:foreground', listener);
  },
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getSources: () => ipcRenderer.invoke('capture:sources'),
  selectSource: (id, audio = false) =>
    ipcRenderer.invoke('capture:select', id, audio),
  cancelCapture: () => ipcRenderer.invoke('capture:cancel'),
  setSharing: (sharing) => ipcRenderer.invoke('capture:sharing', sharing),
  copyCode: (code) => ipcRenderer.invoke('room:copy', code),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  exportDiagnostics: (report) =>
    ipcRenderer.invoke('diagnostics:export', report),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) =>
      callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
};
contextBridge.exposeInMainWorld('discorja', api);
