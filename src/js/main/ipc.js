const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const {
    getStore,
    resolveApiKey,
    protectApiKey,
    getEndpointOrigin,
    normalizeHttpEndpoint,
    resolveProviderRequest
} = require('./store');
const { checkForUpdates, installUpdate } = require('./updater');
const { handleStreamRequest, stopStream } = require('./stream');
const { updateTitlebarTheme, setIsQuitting } = require('./window');
const { fetchChatCompletionWithFallback } = require('./network');

function isTrustedIpcSender(event) {
    const senderFrame = event?.senderFrame;
    if (!senderFrame || senderFrame.parent) return false;
    try {
        const senderPath = path.resolve(fileURLToPath(senderFrame.url));
        const expectedPath = path.resolve(__dirname, '../../../index.html');
        return process.platform === 'win32'
            ? senderPath.toLowerCase() === expectedPath.toLowerCase()
            : senderPath === expectedPath;
    } catch (error) {
        return false;
    }
}

function handleTrusted(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event)) {
            throw new Error(`Blocked IPC from untrusted sender: ${channel}`);
        }
        return handler(event, ...args);
    });
}

function onTrusted(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event)) {
            console.warn(`Blocked IPC from untrusted sender: ${channel}`);
            return;
        }
        return handler(event, ...args);
    });
}

function setupIpcHandlers() {
    // App version (from Electron / package used at build)
    handleTrusted('get-app-version', () => app.getVersion());

    // Auto-update
    handleTrusted('check-for-updates', checkForUpdates);
    handleTrusted('install-update', () => {
        setIsQuitting(true);
        try {
            const result = installUpdate();
            if (result === 'unavailable') setIsQuitting(false);
            return result;
        } catch (error) {
            setIsQuitting(false);
            throw error;
        }
    });

    // Settings API — API keys stay in main process only
    handleTrusted('get-settings', () => {
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

    handleTrusted('save-settings', (event, newSettings) => {
        const store = getStore();
        const oldSettings = store.get('settings');
        if (!newSettings || !Array.isArray(newSettings.providers)) {
            return { ok: false, error: 'Invalid settings payload' };
        }

        // Restore masked API keys from stored settings
        for (const p of newSettings.providers) {
            const oldP = oldSettings?.providers?.find(op => op.id === p.id);
            const newEndpoint = normalizeHttpEndpoint(p.endpoint);
            if (p.endpoint && !newEndpoint) {
                return { ok: false, error: `Invalid API endpoint for provider ${p.name || p.id || ''}` };
            }

            if (p.apiKey === '__MASKED__') {
                const oldOrigin = getEndpointOrigin(oldP?.endpoint);
                const newOrigin = getEndpointOrigin(p.endpoint);
                if (oldP?.apiKey && oldOrigin && newOrigin && oldOrigin !== newOrigin) {
                    return { ok: false, error: 'Changing a provider host requires re-entering its API key' };
                }
                p.apiKey = oldP?.apiKey || '';
            } else if (p.apiKey) {
                p.apiKey = protectApiKey(p.apiKey);
            }
        }
        store.set('settings', newSettings);
        return true;
    });

    // Chats API
    handleTrusted('get-chats', () => {
        const store = getStore();
        return store.get('chats');
    });

    handleTrusted('save-chats', (event, chats) => {
        const store = getStore();
        store.set('chats', chats);
        return true;
    });

    // Stream Chat API
    onTrusted('send-message-stream', handleStreamRequest);
    handleTrusted('stop-stream', stopStream);

    onTrusted('update-titlebar-theme', (event, theme) => {
        updateTitlebarTheme(theme);
    });

    // Window Management API
    handleTrusted('is-maximized', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
            return mainWindow.isMaximized();
        }
        return false;
    });

    handleTrusted('maximize-window', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
            mainWindow.maximize();
        }
        return true;
    });

    handleTrusted('unmaximize-window', () => {
        const { getMainWindow } = require('./window');
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        return true;
    });

    // Connection test (for providers that may not support /models)
    handleTrusted('test-provider-connection', async (event, payload) => {
        const { endpoint, apiKey, modelName, providerId } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

        const credentials = resolveProviderRequest({ providerId, endpoint, apiKey });
        if (credentials.error) return { ok: false, error: credentials.error };
        const { endpoint: resolvedEndpoint, apiKey: resolvedKey } = credentials;

        const controller = new AbortController();
        const timeoutMs = 12000;
        const t = setTimeout(() => controller.abort(), timeoutMs);

        const start = Date.now();
        try {
            const { response: resp, url: usedUrl } = await fetchChatCompletionWithFallback(
                resolvedEndpoint,
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
    handleTrusted('summarize-chat', async (event, payload) => {
        const { endpoint, apiKey, modelName, providerId, systemPrompt, messages, max_tokens, temperature } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };
        if (!modelName) return { ok: false, error: 'Missing modelName' };

        const credentials = resolveProviderRequest({ providerId, endpoint, apiKey });
        if (credentials.error) return { ok: false, error: credentials.error };
        const { endpoint: resolvedEndpoint, apiKey: resolvedKey } = credentials;

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
                resolvedEndpoint,
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

    // Fetch models from provider endpoint (resolves API key server-side)
    handleTrusted('fetch-provider-models', async (event, payload) => {
        const { endpoint, apiKey, providerId } = payload || {};
        if (!endpoint) return { ok: false, error: 'Missing endpoint' };

        const credentials = resolveProviderRequest({ providerId, endpoint, apiKey });
        if (credentials.error) return { ok: false, error: credentials.error };
        const { endpoint: resolvedEndpoint, apiKey: resolvedKey } = credentials;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
            // Build model-list URL candidates from the short endpoint
            const base = resolvedEndpoint
                .replace(/\/(chat\/completions|completions|complete)\/?$/i, '')
                .replace(/\/+$/, '');
            const lower = base.toLowerCase();
            const candidates = [];

            if (lower.match(/\/v\d+$/i)) {
                candidates.push(base + '/models');
                candidates.push(base.replace(/\/v\d+$/i, '') + '/models');
            } else {
                candidates.push(base + '/v1/models');
                candidates.push(base + '/models');
            }

            let lastError = null;
            let data = null;

            for (const fetchPath of Array.from(new Set(candidates))) {
                try {
                    const resp = await fetch(fetchPath, {
                        headers: { 'Authorization': 'Bearer ' + resolvedKey },
                        signal: controller.signal
                    });
                    if (!resp.ok) {
                        lastError = new Error('HTTP ' + resp.status + ' @ ' + fetchPath);
                        continue;
                    }
                    data = await resp.json();
                    lastError = null;
                    break;
                } catch (err) {
                    if (err?.name === 'AbortError') throw err;
                    lastError = err;
                }
            }

            if (!data || lastError) {
                return { ok: false, error: lastError ? lastError.message : 'Failed to fetch models' };
            }

            // Support multiple response formats
            let models = [];
            if (data.data && Array.isArray(data.data)) {
                models = data.data;
            } else if (Array.isArray(data)) {
                models = data;
            } else if (data.models && Array.isArray(data.models)) {
                models = data.models;
            } else if (data.object === 'list' && Array.isArray(data.data)) {
                models = data.data;
            }

            return { ok: true, models };
        } catch (err) {
            const error = err?.name === 'AbortError' ? 'Timeout after 12000ms' : (err.message || String(err));
            return { ok: false, error };
        } finally {
            clearTimeout(timeoutId);
        }
    });

    // Generic: save arbitrary JSON data to a file via native save dialog
    handleTrusted('save-json-file', async (event, { data, defaultName, title }) => {
        const win = event.sender.getOwnerBrowserWindow?.() || null;
        const result = await dialog.showSaveDialog(win, {
            title: title || '保存文件',
            defaultPath: defaultName || `export_${new Date().toISOString().slice(0, 10)}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (result.canceled || !result.filePath) {
            return { ok: false, canceled: true };
        }

        try {
            fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
            return { ok: true, filePath: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });

    // Save resolved providers to a file via native save dialog
    handleTrusted('export-providers-to-file', async (event, providers) => {
        if (!Array.isArray(providers) || providers.length === 0) {
            return { ok: false, error: 'No providers to export' };
        }

        // Resolve masked keys
        const resolved = providers.map(p => {
            if (!p) return p;
            const r = { ...p };
            if (r.apiKey === '__MASKED__') {
                r.apiKey = resolveApiKey(p.id);
            }
            return r;
        });

        const win = event.sender.getOwnerBrowserWindow?.() || null;
        const result = await dialog.showSaveDialog(win, {
            title: '导出服务商配置',
            defaultPath: `providers_export_${new Date().toISOString().slice(0, 10)}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (result.canceled || !result.filePath) {
            return { ok: false, canceled: true };
        }

        try {
            fs.writeFileSync(result.filePath, JSON.stringify(resolved, null, 2), 'utf-8');
            return { ok: true, filePath: result.filePath };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });
}

module.exports = {
    setupIpcHandlers,
    isTrustedIpcSender
};
