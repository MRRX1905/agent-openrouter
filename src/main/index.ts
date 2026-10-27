import { app, BrowserWindow, safeStorage, session } from 'electron';
import { join } from 'node:path';
import { openDatabase } from './db/database';
import { registerIpc } from './ipc';
import { SecretBox } from './security/secrets';
import { SettingsService } from './settings-service';

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  if (isDev) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL as string);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const db = openDatabase(join(app.getPath('userData'), 'r3x.db'));
  const secrets = new SecretBox(db, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value),
  });
  const settings = new SettingsService(db, secrets, join(app.getPath('documents'), 'R3X-Projects'));
  registerIpc({ settings });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
