// Thin Electron shell over the hosted CreatorOS site (scalinity.bio).
// Override the URL at launch with: CREATOROS_URL=http://localhost:3000 electron .

const { app, BrowserWindow, shell, Menu, session, dialog } = require('electron');
const path = require('node:path');

const DEFAULT_URL = 'https://scalinity.bio';

function resolveAppUrl() {
  const candidate = process.env.CREATOROS_URL || DEFAULT_URL;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    console.warn(`[creatoros] invalid CREATOROS_URL=${candidate}, falling back to ${DEFAULT_URL}`);
    return DEFAULT_URL;
  }
}

const APP_URL = resolveAppUrl();

const iconPath = path.join(
  __dirname,
  'assets',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);

let mainWindow = null;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

function safeOpenExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      shell.openExternal(url);
    }
  } catch {
    // ignore unparseable URLs
  }
}

function renderErrorPage(reason) {
  const html = `<html><body style="font-family:system-ui;padding:32px;background:#1a1816;color:#e8e2d6">
    <h2>Couldn't reach CreatorOS</h2>
    <p>Tried <code>${escapeHtml(APP_URL)}</code></p>
    <pre>${escapeHtml(reason)}</pre>
    <p>Check your connection, then quit and relaunch.</p>
  </body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1a1816',
    icon: iconPath,
    title: 'CreatorOS',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hand target=_blank links to the user's real browser; let same-window navigation
  // (including OAuth/magic-link callback hops through Supabase/Google/etc.) proceed
  // normally so auth flows complete inside the shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 = ABORTED (e.g. user-initiated nav); ignore. Subframe failures aren't fatal.
    if (!isMainFrame || errorCode === -3) return;
    console.error('[creatoros] did-fail-load', { errorCode, errorDescription, validatedURL });
    mainWindow?.loadURL(renderErrorPage(`${errorDescription} (${errorCode})`)).catch(() => {});
  });

  try {
    await mainWindow.loadURL(APP_URL);
  } catch (err) {
    console.error('[creatoros] failed to load', APP_URL, err);
    await mainWindow.loadURL(renderErrorPage(err?.message || String(err)));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function clearSessionAndReload() {
  const choice = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Sign out & clear'],
    defaultId: 0,
    cancelId: 0,
    title: 'Clear session',
    message: 'Sign out and clear all CreatorOS session data?',
    detail: 'Removes cookies, local storage, and cached credentials for this app.',
  });
  if (choice.response !== 1) return;
  await session.defaultSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'],
  });
  await session.defaultSession.clearCache();
  if (mainWindow) await mainWindow.loadURL(APP_URL);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Sign Out & Clear Session', click: () => clearSessionAndReload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();

    try {
      await createWindow();
    } catch (err) {
      console.error('[creatoros] startup failed', err);
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
