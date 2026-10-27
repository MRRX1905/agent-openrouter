/// <reference types="vite/client" />
import type { R3xApi } from '../../shared/ipc-contract';

declare global {
  interface Window { r3x: R3xApi }
}

export {};
