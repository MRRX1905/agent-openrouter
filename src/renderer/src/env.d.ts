/// <reference types="vite/client" />

declare global {
  interface Window {
    r3x: {
      invoke(channel: string, payload?: unknown): Promise<unknown>;
      onAgentEvent(callback: (event: unknown) => void): () => void;
    };
  }
}

export {};
