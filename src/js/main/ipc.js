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

    // Settings API
    ipcMain.handle('get-settings', () => {
        const store = getStore();
        return store.get('settings');
    });

    ipcMain.handle('save-settings', (event, settings) => {
        const store = getStore();
        store.set('settings', settings);
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
        const { endpoint, apiKey, modelName } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!apiKey) return { ok: false, error: 'Missing apiKey' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

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
                        'Authorization': `Bearer ${apiKey}`
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
        const { endpoint, apiKey, modelName, systemPrompt, messages, max_tokens, temperature } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!apiKey) return { ok: false, error: 'Missing apiKey' };
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
                        'Authorization': `Bearer ${apiKey}`
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