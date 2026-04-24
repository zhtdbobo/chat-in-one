const { app } = require('electron');
const https = require('https');
const fs = require('fs');
const path = require('node:path');
const { spawn } = require('child_process');

let autoUpdater = null;
let updateSource = 'github'; // 'github' or 'gitee'
let updateInstallerPath = null;

function runInstallUpdate({
    source,
    installerPath,
    existsSync,
    spawnInstaller,
    quitAndInstall,
    quitApp
}) {
    const useCustomInstaller = (source === 'gitee' || source === 'github-proxy')
        && !!installerPath
        && existsSync(installerPath);

    if (useCustomInstaller) {
        spawnInstaller(installerPath);
        quitApp();
        return 'custom-installer';
    }

    if (quitAndInstall) {
        quitAndInstall(false, true);
        return 'auto-updater';
    }

    quitApp();
    return 'quit-fallback';
}

function sendUpdateStatus(payload) {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

// 检测网络环境，优先使用 Gitee 源（国内用户）
function isCNNetwork() {
    return new Promise((resolve) => {
        const testSites = [
            { name: 'gitee', url: 'https://gitee.com', timeout: 5000 },
            { name: 'github', url: 'https://github.com', timeout: 5000 }
        ];
        let completed = 0;
        const results = { gitee: Infinity, github: Infinity };
        let resolved = false;

        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            // 如果 GitHub 不通或者 Gitee 更快，则判定为中国网络
            const isCN = results.github === Infinity || results.gitee < results.github;
            resolve(isCN);
        };

        // 整体超时保护
        const overallTimeout = setTimeout(cleanup, 10000);

        testSites.forEach(site => {
            const startTime = Date.now();
            const req = https.get(site.url, { timeout: site.timeout }, (res) => {
                if (resolved) return;
                results[site.name] = Date.now() - startTime;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    cleanup();
                }
            }).on('error', (err) => {
                if (resolved) return;
                results[site.name] = Infinity;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    cleanup();
                }
            });

            req.setTimeout(site.timeout, function () {
                if (resolved) return;
                req.destroy();
                results[site.name] = Infinity;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    cleanup();
                }
            });
        });
    });
}

// 获取 Gitee 最新 Release 信息
async function getGiteeLatestRelease(owner, repo) {
    return new Promise((resolve, reject) => {
        const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/latest`;
        https.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'chat-in-one-updater' }
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Gitee API error: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release);
                } catch (e) {
                    reject(new Error('Failed to parse Gitee release: ' + e.message));
                }
            });
        }).on('error', reject).setTimeout(5000, function () {
            reject(new Error('Gitee API timeout'));
        });
    });
}

// 获取 GitHub 最新 Release 信息 (带代理回退)
async function getGithubLatestRelease(owner, repo, useProxy = false) {
    return new Promise((resolve, reject) => {
        const baseUrl = useProxy
            ? `https://mirror.ghproxy.com/https://api.github.com/repos/${owner}/${repo}/releases/latest`
            : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

        https.get(baseUrl, {
            timeout: 15000,
            headers: { 'User-Agent': 'chat-in-one-updater' }
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`GitHub API error: ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    resolve(release);
                } catch (e) {
                    reject(new Error('Failed to parse GitHub release: ' + e.message));
                }
            });
        }).on('error', reject).setTimeout(15000, function () {
            reject(new Error('GitHub API timeout'));
        });
    });
}

// 处理 Gitee 更新逻辑
async function handleGiteeUpdate(release) {
    try {
        const asset = release.assets && release.assets.find(a =>
            a.name && (a.name.includes('Setup') || a.name.includes('exe')) && a.name.endsWith('.exe')
        );

        if (!asset) throw new Error('未找到安装包');

        sendUpdateStatus({
            type: 'available',
            version: release.tag_name,
            releaseNotes: release.body || ''
        });

        const downloadUrl = asset.browser_download_url;
        const userDataPath = app.getPath('userData');
        const updatePath = path.join(userDataPath, 'update.exe');

        await downloadFile(downloadUrl, updatePath);

        sendUpdateStatus({ type: 'downloaded', version: release.tag_name });
        updateInstallerPath = updatePath;
        global.updateInstallerPath = updatePath;
    } catch (err) {
        sendUpdateStatus({ type: 'error', message: 'Gitee 下载失败: ' + err.message });
    }
}

// 获取 GHProxy 后的资源下载地址
async function handleGHProxyUpdate(release) {
    try {
        const asset = release.assets && release.assets.find(a =>
            a.name && a.name.endsWith('.exe')
        );
        if (!asset) throw new Error('未找到安装包');

        sendUpdateStatus({
            type: 'available',
            version: release.tag_name,
            releaseNotes: release.body || ''
        });

        // 使用镜像下载资源
        const downloadUrl = `https://mirror.ghproxy.com/${asset.browser_download_url}`;
        const userDataPath = app.getPath('userData');
        const updatePath = path.join(userDataPath, 'update.exe');

        await downloadFile(downloadUrl, updatePath);

        sendUpdateStatus({ type: 'downloaded', version: release.tag_name });
        updateInstallerPath = updatePath;
        global.updateInstallerPath = updatePath;
    } catch (err) {
        sendUpdateStatus({ type: 'error', message: '代理下载失败: ' + err.message });
    }
}

// 通用下载函数
function downloadFile(url, savePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(savePath);
        https.get(url, { timeout: 60000 }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // 处理重定向
                return downloadFile(response.headers.location, savePath).then(resolve).catch(reject);
            }

            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const percent = (downloadedBytes / totalBytes) * 100;
                    sendUpdateStatus({ type: 'progress', percent });
                }
            });

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(savePath, () => { });
            reject(err);
        }).setTimeout(90000, function () {
            fs.unlink(savePath, () => { });
            reject(new Error('下载超时'));
        });
    });
}

// 初始化自动更新器
function initAutoUpdater() {
    if (app.isPackaged) {
        try {
            const { autoUpdater: updater } = require('electron-updater');
            autoUpdater = updater;
            autoUpdater.autoDownload = true;
            autoUpdater.autoInstallOnAppQuit = true;

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
            autoUpdater.on('error', (err) => {
                sendUpdateStatus({ type: 'error', message: err.message || String(err) });
            });
        } catch (e) {
            console.warn('electron-updater not available:', e.message);
        }
    }
}

// 检查更新
async function checkForUpdates() {
    if (!autoUpdater) return { ok: false, reason: 'unavailable' };

    try {
        let isCN = false;
        try {
            isCN = await isCNNetwork();
        } catch (networkErr) {
            isCN = false;
        }

        const ghOwner = 'zhtdbobo';
        const giteeOwner = 'JaridLi';
        const repo = 'chat-in-one';

        sendUpdateStatus({ type: 'checking', message: '正在检测网络环境…' });

        // 1. 如果在 CN，优先试 Gitee
        if (isCN) {
            try {
                sendUpdateStatus({ type: 'checking', message: '正在从 Gitee 获取更新信息…' });
                const release = await getGiteeLatestRelease(giteeOwner, repo);
                const latestVersion = release.tag_name ? release.tag_name.replace(/^v/, '') : null;
                const currentVersion = app.getVersion();

                if (latestVersion && latestVersion > currentVersion) {
                    updateSource = 'gitee';
                    sendUpdateStatus({ type: 'checking', message: `发现新版本 ${latestVersion} (Gitee)，准备下载…` });
                    await handleGiteeUpdate(release);
                    return { ok: true, message: '发现 Gitee 更新' };
                } else {
                    // 如果 Gitee 明确返回没有更新，则直接结束，不再去试 GitHub
                    sendUpdateStatus({ type: 'not-available' });
                    return { ok: true, message: '已经是最新版本 (Gitee)' };
                }
            } catch (giteeErr) {
                console.warn('Gitee update check skipped/failed:', giteeErr.message);
            }

            // 2. 如果 Gitee 失败，在 CN 环境下尝试 GHProxy 镜像检查
            try {
                sendUpdateStatus({ type: 'checking', message: '正在通过镜像代理检查 GitHub 更新…' });
                const release = await getGithubLatestRelease(ghOwner, repo, true);
                const latestVersion = release.tag_name ? release.tag_name.replace(/^v/, '') : null;
                const currentVersion = app.getVersion();

                if (latestVersion && latestVersion > currentVersion) {
                    updateSource = 'github-proxy';
                    sendUpdateStatus({ type: 'checking', message: `发现新版本 ${latestVersion} (Mirror)，准备下载…` });
                    await handleGHProxyUpdate(release);
                    return { ok: true, message: '发现 GitHub (代理) 更新' };
                } else {
                    // 通过镜像确认没有更新，直接结束
                    sendUpdateStatus({ type: 'not-available' });
                    return { ok: true, message: '已经是最新版本 (Mirror)' };
                }
            } catch (proxyErr) {
                console.warn('GitHub Proxy check failed:', proxyErr.message);
            }
        }

        // 3. 默认尝试官方 checkForUpdates (GitHub)
        // 只有当前面所有优化通道都不可用时才会走到这里
        sendUpdateStatus({ type: 'checking', message: '正在通过 GitHub 官方通道检查更新…' });
        updateSource = 'github';

        const checkPromise = autoUpdater.checkForUpdates();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('检查更新超时，请检查网络连接或代理设置')), 10000)
        );

        await Promise.race([checkPromise, timeoutPromise]);
        return { ok: true, message: '检查更新已启动' };

    } catch (e) {
        const errorMessage = e.message || String(e);
        const userFriendlyError = errorMessage.includes('TIMEOUT') || errorMessage.includes('Timed out') || errorMessage.includes('timed_out') || errorMessage.includes('ERR_CONNECTION_TIMED_OUT')
            ? '检查更新超时：GitHub/Gitee 访问受限，请尝试开启代理或检查网络。'
            : errorMessage;

        sendUpdateStatus({ type: 'error', message: userFriendlyError });
        return { ok: false, reason: userFriendlyError };
    }
}

// 安装更新
function installUpdate(isQuitting) {
    return runInstallUpdate({
        source: updateSource,
        installerPath: updateInstallerPath,
        existsSync: fs.existsSync,
        spawnInstaller: (installerPath) => {
            spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref();
        },
        quitAndInstall: autoUpdater ? (isSilent, isForceRunAfter) => autoUpdater.quitAndInstall(isSilent, isForceRunAfter) : null,
        quitApp: () => app.quit()
    });
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    installUpdate,
    sendUpdateStatus,
    runInstallUpdate
};