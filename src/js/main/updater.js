const { app } = require('electron');

let autoUpdater = null;
let updateSource = 'proxy';
let checkingWithFallback = false;

const UPDATE_FEEDS = {
    proxy: {
        provider: 'generic',
        url: 'https://gh-proxy.com/https://github.com/zhtdbobo/chat-in-one/releases/latest/download'
    },
    github: {
        provider: 'github',
        owner: 'zhtdbobo',
        repo: 'chat-in-one'
    }
};

function setUpdateFeed(updater, source) {
    const feed = UPDATE_FEEDS[source];
    if (!updater || !feed) throw new Error(`Unknown update source: ${source}`);
    updater.setFeedURL({ ...feed });
    updateSource = source;
}

function sendUpdateStatus(payload) {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

function runInstallUpdate({ quitAndInstall }) {
    if (typeof quitAndInstall !== 'function') {
        return 'unavailable';
    }
    quitAndInstall(false, true);
    return 'auto-updater';
}

function initAutoUpdater() {
    if (!app.isPackaged) return;

    try {
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        setUpdateFeed(autoUpdater, 'proxy');

        autoUpdater.on('checking-for-update', () => {
            const message = updateSource === 'proxy'
                ? '正在通过 gh-proxy.com 检查更新…'
                : '正在通过 GitHub 官方通道检查更新…';
            sendUpdateStatus({ type: 'checking', message });
        });
        autoUpdater.on('update-available', (info) => {
            sendUpdateStatus({ type: 'available', version: info.version, releaseNotes: info.releaseNotes });
        });
        autoUpdater.on('update-not-available', () => {
            sendUpdateStatus({ type: 'not-available' });
        });
        autoUpdater.on('update-downloaded', (info) => {
            sendUpdateStatus({ type: 'downloaded', version: info.version });
        });
        autoUpdater.on('download-progress', (progress) => {
            sendUpdateStatus({ type: 'progress', percent: progress.percent });
        });
        autoUpdater.on('error', (error) => {
            if (checkingWithFallback) {
                console.warn(`${updateSource} update source failed:`, error.message || String(error));
                return;
            }
            sendUpdateStatus({ type: 'error', message: error.message || String(error) });
        });
    } catch (error) {
        console.warn('electron-updater not available:', error.message);
    }
}

async function runUpdateCheckWithFallback(updater, sources = ['proxy', 'github']) {
    let lastError = null;
    for (const source of sources) {
        let timeoutId;
        try {
            setUpdateFeed(updater, source);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('检查更新超时')), 15000);
            });
            const result = await Promise.race([updater.checkForUpdates(), timeoutPromise]);
            if (result?.downloadPromise) await result.downloadPromise;
            return { ok: true, source, message: '检查更新已完成' };
        } catch (error) {
            lastError = error;
            console.warn(`${source} update check failed:`, error.message || String(error));
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    return { ok: false, reason: lastError?.message || String(lastError || '所有更新源均不可用') };
}

async function checkForUpdates() {
    if (!autoUpdater) return { ok: false, reason: 'unavailable' };

    checkingWithFallback = true;
    try {
        const result = await runUpdateCheckWithFallback(autoUpdater);
        if (!result.ok) sendUpdateStatus({ type: 'error', message: result.reason });
        return result;
    } finally {
        checkingWithFallback = false;
    }
}

function installUpdate() {
    return runInstallUpdate({
        quitAndInstall: autoUpdater
            ? (isSilent, isForceRunAfter) => autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
            : null
    });
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    installUpdate,
    sendUpdateStatus,
    runInstallUpdate,
    runUpdateCheckWithFallback,
    setUpdateFeed,
    UPDATE_FEEDS
};
