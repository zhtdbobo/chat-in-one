const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('fs');

// 导入模块
const { initStore } = require('./src/js/main/store');
const { createWindow, createTray, setIsQuitting, getIsQuitting } = require('./src/js/main/window');
const { initAutoUpdater } = require('./src/js/main/updater');
const { setupIpcHandlers } = require('./src/js/main/ipc');

// Ignore SSL errors (e.g. net_error -100) on startup for proxy or local environments
app.commandLine.appendSwitch('ignore-certificate-errors');

// Work around Windows cache permission issues (0x5).
// Force Chromium cache directories to a writable userData subfolder.
try {
    const userDataPath = app.getPath('userData');
    const cacheDir = path.join(userDataPath, 'Cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (e) {
    // If this fails, Electron will fall back to its default behavior.
}

app.whenReady().then(async () => {
    await initStore();
    createWindow();
    createTray();
    initAutoUpdater();
    setupIpcHandlers();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    // Keep app running in tray on Windows/Linux. Quit only via tray "退出".
    if (process.platform === 'darwin') app.quit();
});

app.on('before-quit', () => {
    setIsQuitting(true);
});