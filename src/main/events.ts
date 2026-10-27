import { BrowserWindow } from 'electron';
import type { AgentEvent } from '../shared/types';

export const emitAgentEvent = (event: AgentEvent): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent:event', event);
  }
};
