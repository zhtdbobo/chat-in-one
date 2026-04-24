const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getTrayIcon() {
    // Prefer .ico on Windows; fall back to a small empty image if missing.
    const icoPath = path.join(__dirname, '../../assets/icon.ico');
    try {
        return nativeImage.createFromPath(icoPath);
    } catch (e) {
        return nativeImage.createEmpty();
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#ffffff',
            symbolColor: '#000000',
            height: 35
        },
        webPreferences: {
            preload: path.join(__dirname, '../../../preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        },
        backgroundColor: '#ffffff'
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in dev mode
    // mainWindow.webContents.openDevTools();

    mainWindow.on('close', (e) => {
        // Clicking the window X should hide to tray, not quit.
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

function createTray() {
    if (tray) return;
    tray = new Tray(getTrayIcon());
    tray.setToolTip('chat-in-one');

    const showMainWindow = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    };

    const toggleWindow = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else showMainWindow();
    };

    tray.on('click', toggleWindow);

    const contextMenu = Menu.buildFromTemplate([
        { label: '显示', click: showMainWindow },
        { label: '隐藏', click: () => mainWindow?.hide() },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);

    return tray;
}

function getMainWindow() {
    return mainWindow;
}

function getTray() {
    return tray;
}

function setIsQuitting(value) {
    isQuitting = value;
}

function getIsQuitting() {
    return isQuitting;
}

function updateTitlebarTheme(theme) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        if (theme === 'dark') {
            windows[0].setTitleBarOverlay({ color: '#1a1b1e', symbolColor: '#ffffff' });
            windows[0].setBackgroundColor('#1a1b1e');
        } else {
            windows[0].setTitleBarOverlay({ color: '#f8fafc', symbolColor: '#000000' });
            windows[0].setBackgroundColor('#f8fafc');
        }
    }
}

module.exports = {
    createWindow,
    createTray,
    getMainWindow,
    getTray,
    setIsQuitting,
    getIsQuitting,
    updateTitlebarTheme
};