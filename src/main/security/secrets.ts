import type { DatabaseSync } from 'node:sqlite';
import { getSetting, setSetting } from '../db/repositories';

export interface CryptoPort {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export class SecretBox {
  constructor(private readonly db: DatabaseSync, private readonly crypto: CryptoPort) {}

  set(key: string, value: string): void {
    if (!this.crypto.isAvailable()) throw new Error('SECRET: OS encryption is unavailable');
    const cipher = this.crypto.encrypt(value).toString('base64');
    setSetting(this.db, key, cipher, true);
  }

  get(key: string): string | null {
    const cipher = getSetting(this.db, key);
    if (!cipher) return null;
    try {
      return this.crypto.decrypt(Buffer.from(cipher, 'base64'));
    } catch {
      throw new Error('SECRET: unable to decrypt stored value');
    }
  }

  has(key: string): boolean {
    return getSetting(this.db, key) !== null;
  }

  clear(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}
