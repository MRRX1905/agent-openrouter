import { contextBridge, ipcRenderer } from 'electron';
import type { AgentEvent } from '../shared/types';
import type { R3xApi } from '../shared/ipc-contract';

const api: R3xApi = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  onAgentEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: AgentEvent) => callback(value);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
};

contextBridge.exposeInMainWorld('r3x', api);
