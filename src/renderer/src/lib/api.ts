import type { IpcChannel, IpcContract } from '@shared/ipc-contract';

export const api = {
  invoke<C extends IpcChannel>(channel: C, payload?: IpcContract[C]['req']): Promise<IpcContract[C]['res']> {
    return window.r3x.invoke(channel, payload);
  },
  onAgentEvent: (callback: Parameters<typeof window.r3x.onAgentEvent>[0]) => window.r3x.onAgentEvent(callback),
};
