import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export async function createBackup(db: DatabaseSync, destinationDir: string): Promise<string> {
  const file = path.join(destinationDir, `r3x-backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  return file;
}
