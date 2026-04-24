const { ipcMain, app } = require('electron');
const { getStore } = require('./store');
const { checkForUpdates, installUpdate } = require('./updater');
const { handleStreamRequest, stopStream } = require('./stream');
const { updateTitlebarTheme, setIsQuitting } = require('./window');
const { fetchChatCompletionWithFallback } = require('./network');

function setupIpcHandlers() {
    // App version (from Electron / package used at build)
    ipcMain.handle('get-app-version', () => app.getVersion());

    // Auto-update
    ipcMain.handle('check-for-updates', checkForUpdates);
    ipcMain.handle('install-update', () => {
        setIsQuitting(true);
        return installUpdate();
    });

    // Settings API — API keys stay in main process only
    ipcMain.handle('get-settings', () => {
        const store = getStore();
        const settings = JSON.parse(JSON.stringify(store.get('settings')));
        // Mask API keys so they never reach the renderer memory
        if (settings && settings.providers) {
            for (const p of settings.providers) {
                if (p.apiKey) p.apiKey = '__MASKED__';
            }
        }
        return settings;
    });

    ipcMain.handle('save-settings', (event, newSettings) => {
        const store = getStore();
        const oldSettings = store.get('settings');
        // Restore masked API keys from stored settings
        if (newSettings && newSettings.providers) {
            for (const p of newSettings.providers) {
                if (p.apiKey === '__MASKED__') {
                    const oldP = oldSettings?.providers?.find(op => op.id === p.id);
                    if (oldP && oldP.apiKey) p.apiKey = oldP.apiKey;
                }
            }
        }
        store.set('settings', newSettings);
        return true;
    });

    // Chats API
    ipcMain.handle('get-chats', () => {
        const store = getStore();
        return store.get('chats');
    });

    ipcMain.handle('save-chats', (event, chats) => {
        const store = getStore();
        store.set('chats', chats);
        return true;
    });

    // Stream Chat API
    ipcMain.on('send-message-stream', handleStreamRequest);
    ipcMain.handle('stop-stream', stopStream);

    // Provider API key lookup (for settings page operations only)
    ipcMain.handle('get-provider-api-key', (event, providerId) => {
        const store = getStore();
        const settings = store.get('settings');
        const provider = settings?.providers?.find(p => p.id === providerId);
        return provider?.apiKey || '';
    });
    ipcMain.on('update-titlebar-theme', (event, theme) => {
        updateTitlebarTheme(theme);
    });

    // Window Management API
    ipcMain.handle('is-maximized', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.isMaximized();
        }
        return false;
    });

    ipcMain.handle('maximize-window', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
            mainWindow.maximize();
        }
        return true;
    });

    ipcMain.handle('unmaximize-window', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        return true;
    });

    // Connection test (for providers that may not support /models)
    ipcMain.handle('test-provider-connection', async (event, payload) => {
        const { endpoint, apiKey, modelName, providerId } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

        let resolvedKey = apiKey;
        if (!resolvedKey || resolvedKey === '__MASKED__') {
            const store = getStore();
            const settings = store.get('settings');
            const provider = settings?.providers?.find(p => p.id === (providerId || ''));
            resolvedKey = provider?.apiKey || '';
        }
        if (!resolvedKey) return { ok: false, error: 'Missing apiKey' };

        const controller = new AbortController();
        const timeoutMs = 12000;
        const t = setTimeout(() => controller.abort(), timeoutMs);

        const start = Date.now();
        try {
            const { response: resp, url: usedUrl } = await fetchChatCompletionWithFallback(
                endpoint,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resolvedKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        stream: false,
                        temperature: 0,
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'ping' }]
                    })
                },
                controller
            );

            const latencyMs = Date.now() - start;
            const text = await resp.text();

            if (!resp.ok) {
                return {
                    ok: false,
                    status: resp.status,
                    latencyMs,
                    error: text ? text.slice(0, 500) : `HTTP ${resp.status}`,
                    url: usedUrl
                };
            }

            let json = null;
            try { json = JSON.parse(text); } catch (e) { }

            const usedModel = json?.model || modelName;
            const usage = json?.usage || null;
            const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.delta?.content || '';

            return {
                ok: true,
                latencyMs,
                model: usedModel,
                usage,
                sample: content ? String(content).slice(0, 200) : '',
                url: usedUrl
            };
        } catch (err) {
            const latencyMs = Date.now() - start;
            const aborted = err?.name === 'AbortError';
            return {
                ok: false,
                latencyMs,
                error: aborted ? `Timeout after ${timeoutMs}ms` : (err?.message || String(err))
            };
        } finally {
            clearTimeout(t);
        }
    });

    // One-shot summarization (context compression)
    ipcMain.handle('summarize-chat', async (event, payload) => {
        const { endpoint, apiKey, modelName, providerId, systemPrompt, messages, max_tokens, temperature } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

        let resolvedKey = apiKey;
        if (!resolvedKey || resolvedKey === '__MASKED__') {
            const store = getStore();
            const settings = store.get('settings');
            const provider = settings?.providers?.find(p => p.id === (providerId || ''));
            resolvedKey = provider?.apiKey || '';
        }
        if (!resolvedKey) return { ok: false, error: 'Missing apiKey' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

        const controller = new AbortController();
        const timeoutMs = 45000;
        const t = setTimeout(() => controller.abort(), timeoutMs);

        const start = Date.now();
        try {
            const apiMessages = [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                ...((messages || []).map(m => ({ role: m.role, content: m.content })))
            ];

            const { response: resp, url: usedUrl } = await fetchChatCompletionWithFallback(
                endpoint,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${resolvedKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        stream: false,
                        temperature: (temperature != null ? temperature : 0.2),
                        max_tokens: max_tokens || 800,
                        messages: apiMessages
                    })
                },
                controller
            );

            const latencyMs = Date.now() - start;
            const text = await resp.text();

            if (!resp.ok) {
                return {
                    ok: false,
                    status: resp.status,
                    latencyMs,
                    error: text ? text.slice(0, 800) : `HTTP ${resp.status}`,
                    url: usedUrl
                };
            }

            let json = null;
            try { json = JSON.parse(text); } catch (e) { }
            const usedModel = json?.model || modelName;
            const usage = json?.usage || null;
            const content = json?.choices?.[0]?.message?.content ?? '';

            return {
                ok: true,
                latencyMs,
                model: usedModel,
                usage,
                summary: String(content || '').trim(),
                url: usedUrl
            };
        } catch (err) {
            const latencyMs = Date.now() - start;
            const aborted = err?.name === 'AbortError';
            return {
                ok: false,
                latencyMs,
                error: aborted ? `Timeout after ${timeoutMs}ms` : (err?.message || String(err))
            };
        } finally {
            clearTimeout(t);
        }
    });
}

module.exports = {
    setupIpcHandlers
};