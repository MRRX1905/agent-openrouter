import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureAskpass(userData: string): Promise<string> {
  const file = path.join(userData, 'git-askpass.cmd');
  await writeFile(file, '@echo off\r\necho %1 | findstr /I "username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %R3X_GIT_TOKEN%)\r\n', 'utf8');
  return file;
}
