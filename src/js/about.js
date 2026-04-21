// about.js - About dialog & update

let updateStatusUnsubscribe = null;

async function openAbout() {
    if (typeof closeAllModals === 'function') closeAllModals();
    const versionEl = document.getElementById('about-version');
    if (versionEl && window.api && window.api.getAppVersion) {
        try {
            const v = await window.api.getAppVersion();
            versionEl.textContent = '版本 ' + (v || '--');
        } catch (e) {
            versionEl.textContent = '版本 --';
        }
    }

    setUpdateStatus('', false);
    const installBtn = document.getElementById('install-update-btn');
    if (installBtn) installBtn.style.display = 'none';

    if (updateStatusUnsubscribe) {
        updateStatusUnsubscribe();
        updateStatusUnsubscribe = null;
    }
    if (window.api && window.api.onUpdateStatus) {
        updateStatusUnsubscribe = window.api.onUpdateStatus(handleUpdateStatus);
    }

    if (aboutModal) aboutModal.style.display = 'flex';
}

function closeAbout() {
    if (updateStatusUnsubscribe) {
        updateStatusUnsubscribe();
        updateStatusUnsubscribe = null;
    }
    if (aboutModal) aboutModal.style.display = 'none';
}

function setUpdateStatus(text, isError) {
    const el = document.getElementById('update-status');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('checking', 'new-version', 'error');
    if (text) el.classList.add(isError ? 'error' : 'new-version');
}

function handleUpdateStatus(data) {
    const statusEl = document.getElementById('update-status');
    const installBtn = document.getElementById('install-update-btn');
    if (!data || !data.type) return;

    switch (data.type) {
        case 'available':
            statusEl.classList.add('new-version');
            statusEl.textContent = '发现新版本 ' + (data.version || '') + '，正在下载…';
            break;
        case 'progress':
            statusEl.textContent = '下载中 ' + (data.percent != null ? Math.round(data.percent) + '%' : '…');
            break;
        case 'downloaded':
            statusEl.textContent = '新版本已下载完成，点击下方按钮重启安装。';
            if (installBtn) installBtn.style.display = 'inline-flex';
            break;
        case 'checking':
            statusEl.classList.add('checking');
            statusEl.textContent = data.message || '正在检查更新…';
            break;
        case 'not-available':
            statusEl.classList.remove('error', 'checking');
            statusEl.textContent = '当前已是最新版本';
            break;
        case 'error':
            statusEl.classList.remove('checking');
            statusEl.classList.add('error');
            statusEl.textContent = '检查更新失败：' + (data.message || '未知错误');
            break;
        default:
            break;
    }
}

async function checkForUpdates() {
    const statusEl = document.getElementById('update-status');
    const installBtn = document.getElementById('install-update-btn');
    if (!window.api || !window.api.checkForUpdates) {
        setUpdateStatus('当前环境不支持自动更新（仅正式版可用）', false);
        return;
    }
    if (statusEl) {
        statusEl.classList.add('checking');
        statusEl.textContent = '正在检查更新…';
    }
    if (installBtn) installBtn.style.display = 'none';

    try {
        const result = await window.api.checkForUpdates();
        if (result && result.ok === false && result.reason === 'unavailable') {
            setUpdateStatus('当前环境不支持自动更新（仅正式版可用）', false);
        }
        // 注意：无需在这里处理 result.ok 的情况。
        // 因为 handleUpdateStatus 事件监听器会自动接收来自主进程的 'available' 或 'not-available' 反馈。
    } catch (e) {
        setUpdateStatus('检查失败：' + (e && e.message ? e.message : '未知错误'), true);
    }
}

function initAboutEvents() {
    const checkBtn = document.getElementById('check-update-btn');
    const installBtn = document.getElementById('install-update-btn');
    if (checkBtn) checkBtn.addEventListener('click', checkForUpdates);
    if (installBtn) installBtn.addEventListener('click', () => {
        if (window.api && window.api.installUpdate) window.api.installUpdate();
    });
}

// Bind when DOM ready (state.js already has aboutModal refs; about.js loads after state.js)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutEvents);
} else {
    initAboutEvents();
}
