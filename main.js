const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('fs');

function sendUpdateStatus(payload) {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send('update-status', payload);
}

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

// We will use electron-store or a simpler file-based store if store fails
let store;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Simple fallback JSON store in user paths if electron-store is not available during dev
class SimpleStore {
    constructor(opts) {
        const userDataPath = app.getPath('userData');
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        this.path = path.join(userDataPath, opts.name + '.json');
        this.data = parseDataFile(this.path, opts.defaults);
    }
    get(key) { return this.data[key]; }
    set(key, val) {
        this.data[key] = val;
        try {
            fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error("Failed to write to store:", e);
        }
    }
}
function parseDataFile(filePath, defaults) {
    try {
        if (!fs.existsSync(filePath)) return defaults;
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content) || defaults;
    } catch (error) {
        console.error("Error parsing settings file, using defaults:", error);
        return defaults;
    }
}


async function initStore() {
    const defaultSettings = {
        theme: "light",
        systemPrompt: "You are a helpful assistant.",
        providers: [
            {
                id: "default",
                name: "默认服务商",
                endpoint: "https://api.openai.com/v1",
                apiKey: "",
                models: "gpt-3.5-turbo, deepseek-chat"
            }
        ],
        skills: [
            { id: 'all-in-one', name: '全能助手', desc: '处理各种通用任务', prompt: '你是一个智能、高效且有帮助的助理。' },
            { id: 'code-helper', name: '代码专家', desc: '精通多语言编程', prompt: '你是一个资深的程序员，擅长优化代码、寻找 Bug 并提供优雅的架构建议。' },
            { id: 'translator', name: '翻译官', desc: '更自然地翻译与润色', prompt: '你是一个精通多国语言的翻译官，能够根据上下文提供最自然、地道的翻译结果，并可给出简短改写建议。' },
            { id: 'writer', name: '写作助手', desc: '写作/润色/改写', prompt: '你是一名写作与编辑专家。请帮助用户润色、改写、扩写或提炼内容，保持语气一致，逻辑清晰。' },
            { id: 'summarizer', name: '总结大师', desc: '提炼要点与行动项', prompt: '你擅长把长内容总结成要点、结论与待办清单。回答请先给 TL;DR，再给分点细节。' },
            { id: 'tutor', name: '学习教练', desc: '循序渐进讲解', prompt: '你是一名耐心的老师。请用循序渐进的方式讲解，先给直观解释，再给例子与练习题，并检查用户理解。' },
            { id: 'pm', name: '产品经理', desc: '需求拆解与方案评审', prompt: '你是一名资深产品经理。请帮助用户澄清需求、拆解任务、评估取舍、输出 PRD/验收标准/里程碑。' },
            { id: 'interviewer', name: '面试官', desc: '模拟面试与追问', prompt: '你是一名严谨的面试官。请根据用户目标岗位进行提问与追问，并在每轮后给出改进建议与参考答案。' }
        ],
        mcpServers: []
    };

    try {
        const Store = (await import('electron-store')).default;
        store = new Store({
            defaults: {
                settings: defaultSettings,
                chats: []
            }
        });
    } catch (e) {
        console.warn("Falling back to SimpleStore", e);
        store = new SimpleStore({
            name: 'config',
            defaults: {
                settings: defaultSettings,
                chats: []
            }
        });
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
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
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
}

function getTrayIcon() {
    // Prefer .ico on Windows; fall back to a small empty image if missing.
    const icoPath = path.join(__dirname, 'src', 'assets', 'icon.ico');
    try {
        return nativeImage.createFromPath(icoPath);
    } catch (e) {
        return nativeImage.createEmpty();
    }
}

function createTray() {
    if (tray) return;
    tray = new Tray(getTrayIcon());
    tray.setToolTip('chat-in-one');

    const showMainWindow = () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    };

    const toggleWindow = () => {
        if (!mainWindow) return;
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
}

app.whenReady().then(async () => {
    await initStore();
    createWindow();
    createTray();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    // Keep app running in tray on Windows/Linux. Quit only via tray "退出".
    if (process.platform === 'darwin') app.quit();
});

app.on('before-quit', () => {
    isQuitting = true;
});

// App version (from Electron / package used at build)
ipcMain.handle('get-app-version', () => app.getVersion());

// Auto-update (only when packaged)
let autoUpdater = null;
if (app.isPackaged) {
    try {
        const { autoUpdater: updater } = require('electron-updater');
        autoUpdater = updater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        // 检测网络环境，优先使用 Gitee 源（国内用户）
        const https = require('https');
        function isCNNetwork() {
            return new Promise((resolve) => {
                // 测试连接 Gitee 和 GitHub 的响应时间
                const testSites = [
                    { name: 'gitee', url: 'https://gitee.com' },
                    { name: 'github', url: 'https://github.com' }
                ];
                let completed = 0;
                const results = {};

                testSites.forEach(site => {
                    const startTime = Date.now();
                    https.get(site.url, { timeout: 3000 }, (res) => {
                        results[site.name] = Date.now() - startTime;
                        completed++;
                        if (completed === testSites.length) {
                            // 如果 Gitee 响应时间更短，或者 GitHub 超时，使用 Gitee
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    }).on('error', () => {
                        results[site.name] = Infinity;
                        completed++;
                        if (completed === testSites.length) {
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    }).setTimeout(3000, function() {
                        results[site.name] = Infinity;
                        completed++;
                        if (completed === testSites.length) {
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    });
                });
            });
        }

        // 设置更新源
        async function setupUpdateSource() {
            try {
                const isCN = await isCNNetwork();
                if (isCN) {
                    // 优先使用 Gitee 源
                    autoUpdater.setFeedURL({
                        provider: 'gitee',
                        owner: 'zhtdbobo',
                        repo: 'chat-in-one'
                    });
                    console.log('Using Gitee update source for CN network');
                }
                // 否则使用默认的 GitHub 源
            } catch (e) {
                console.warn('Failed to detect network:', e.message);
                // 失败时使用默认源
            }
        }

        // 注意：不要在启动时主动联网探测，避免离线环境打开时产生额外网络请求/日志。
        // 更新源会在用户点击「检查更新」时再检测并设置（见 check-for-updates handler）。

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

ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) return { ok: false, reason: 'unavailable' };
    try {
        // 每次检查更新前，重新检测网络环境并设置更新源
        const https = require('https');
        function isCNNetwork() {
            return new Promise((resolve) => {
                const testSites = [
                    { name: 'gitee', url: 'https://gitee.com' },
                    { name: 'github', url: 'https://github.com' }
                ];
                let completed = 0;
                const results = {};

                testSites.forEach(site => {
                    const startTime = Date.now();
                    https.get(site.url, { timeout: 3000 }, (res) => {
                        results[site.name] = Date.now() - startTime;
                        completed++;
                        if (completed === testSites.length) {
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    }).on('error', () => {
                        results[site.name] = Infinity;
                        completed++;
                        if (completed === testSites.length) {
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    }).setTimeout(3000, function() {
                        results[site.name] = Infinity;
                        completed++;
                        if (completed === testSites.length) {
                            resolve(!results.github || (results.gitee && results.gitee < results.github));
                        }
                    });
                });
            });
        }

        const isCN = await isCNNetwork();
        if (isCN) {
            autoUpdater.setFeedURL({
                provider: 'gitee',
                owner: 'zhtdbobo',
                repo: 'chat-in-one'
            });
            console.log('Using Gitee update source for CN network');
        }

        await autoUpdater.checkForUpdates();
        // 由于 autoUpdater.checkForUpdates() 不返回结果，而是通过事件通知
        // 我们只需要确认调用成功，具体的更新状态会通过 'update-status' 事件发送
        return { ok: true, message: '检查更新已启动' };
    } catch (e) {
        const errorMessage = e.message || String(e);
        sendUpdateStatus({ type: 'error', message: errorMessage });
        return { ok: false, reason: errorMessage };
    }
});

ipcMain.handle('install-update', () => {
    if (!autoUpdater) return;
    autoUpdater.quitAndInstall(false, true);
});

// Titlebar update handler
ipcMain.on('update-titlebar-theme', (event, theme) => {
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
});

// IPC Handlers for Settings
ipcMain.handle('get-settings', () => {
    return store.get('settings');
});

ipcMain.handle('save-settings', (event, settings) => {
    store.set('settings', settings);
    return true;
});

// IPC Handlers for Chats
ipcMain.handle('get-chats', () => {
    return store.get('chats');
});

ipcMain.handle('save-chats', (event, chats) => {
    store.set('chats', chats);
    return true;
});

// Connection test (for providers that may not support /models)
ipcMain.handle('test-provider-connection', async (event, payload) => {
    const { endpoint, apiKey, modelName } = payload || {};
    if (!endpoint) return { ok: false, error: 'Missing endpoint' };
    if (!apiKey) return { ok: false, error: 'Missing apiKey' };
    if (!modelName) return { ok: false, error: 'Missing modelName' };

    const fetchPath = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;

    const controller = new AbortController();
    const timeoutMs = 12000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const start = Date.now();
    try {
        const resp = await fetch(fetchPath, {
            method: 'POST',
            signal: controller.signal,
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
        });

        const latencyMs = Date.now() - start;
        const text = await resp.text();

        if (!resp.ok) {
            return {
                ok: false,
                status: resp.status,
                latencyMs,
                error: text ? text.slice(0, 500) : `HTTP ${resp.status}`
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
            sample: content ? String(content).slice(0, 200) : ''
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

// Stream Request Handler
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let mcpClients = [];
let toolNameToServerMap = new Map();
let currentStreamController = null;

async function getMcpTools(servers) {
    const allTools = [];
    toolNameToServerMap.clear();
    for (const server of servers) {
        if (!server.command) continue;
        try {
            const transport = new StdioClientTransport({
                command: server.command,
                args: (server.args || '').split(',').map(a => a.trim())
            });
            const client = new Client({ name: "chat-in-one-client", version: "1.0.0" }, { capabilities: {} });
            await client.connect(transport);
            const tools = await client.listTools();
            allTools.push(...tools.tools.map(t => ({ ...t, serverId: server.id })));
            for (const t of tools.tools) {
                toolNameToServerMap.set(t.name, server.id);
            }
            mcpClients.push({ id: server.id, client, transport });
        } catch (e) {
            console.error(`Failed to connect to MCP server ${server.name}:`, e);
        }
    }
    return allTools;
}

ipcMain.on('send-message-stream', async (event, requestData) => {
    const { endpoint, apiKey, modelName, systemPrompt, messages, chatId, enableThinking, enableSearch, temperature, top_p, max_tokens, stream, mcpServers } = requestData;

    try {
        // Cleanup old clients
        for (const c of mcpClients) await c.transport.close();
        mcpClients = [];

        // Create AbortController for this stream
        currentStreamController = new AbortController();

        let tools = [];
        if (mcpServers && mcpServers.length > 0) {
            tools = await getMcpTools(mcpServers);
        }

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const fetchPath = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;

        const body = {
            model: modelName,
            messages: apiMessages,
            stream: stream !== false,
            stream_options: { include_usage: true },
            temperature: temperature || 0.7,
            top_p: top_p || 1,
            max_tokens: max_tokens || 2000,
            ...(enableThinking !== undefined ? { include_reasoning: enableThinking } : {}),
            ...(enableSearch !== undefined ? { web_search: enableSearch, search: enableSearch, enable_search: enableSearch } : {})
        };

        if (tools.length > 0) {
            body.tools = tools.map(t => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema
                }
            }));
            body.tool_choice = "auto";
        }

        const streamStartTime = Date.now();
        const response = await fetch(fetchPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body),
            signal: currentStreamController.signal
        });

        if (!response.ok) {
            const errStr = await response.text();
            event.reply('stream-error', { chatId, error: `API Error: ${response.status} - ${errStr}` });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        event.reply('stream-start', { chatId });

        let toolCalls = [];
        let firstTokenLatency = null;
        let lastUsage = null;
        let lastModel = modelName;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.includes('[DONE]')) break;
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta;
                        if (parsed.model) lastModel = parsed.model;
                        if (parsed.usage && parsed.usage.total_tokens != null) lastUsage = parsed.usage;
                        if (delta) {
                            if (firstTokenLatency == null && (delta.reasoning_content || delta.content)) {
                                firstTokenLatency = Date.now() - streamStartTime;
                            }
                            if (delta.reasoning_content && enableThinking !== false) {
                                event.reply('stream-chunk', { chatId, reasoning_content: delta.reasoning_content });
                            }
                            if (delta.content) {
                                event.reply('stream-chunk', { chatId, content: delta.content });
                            }
                            if (delta.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, name: '', args: '' };
                                    if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
                                    if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
                                }
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        // Handle Tool Calls if any
        if (toolCalls.length > 0) {
            event.reply('stream-chunk', { chatId, content: "\n\n*正在调用工具...*\n" });
            const toolResults = [];
            for (const tc of toolCalls) {
                const serverId = toolNameToServerMap.get(tc.name);
                const clientObj = mcpClients.find(c => c.id === serverId);
                if (clientObj) {
                    try {
                        const result = await clientObj.client.callTool({
                            name: tc.name,
                            arguments: JSON.parse(tc.args)
                        });
                        toolResults.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify(result.content)
                        });
                    } catch (e) {
                        toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${e.message}` });
                    }
                } else {
                    toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Error: 未找到工具 ${tc.name} 对应的 MCP 服务器` });
                }
            }

            // Send tool results back to LLM for final answer
            const toolStreamStart = Date.now();
            const finalResponse = await fetch(fetchPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: modelName,
                    messages: [...apiMessages, { role: "assistant", tool_calls: toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args } })) }, ...toolResults],
                    stream: true,
                    stream_options: { include_usage: true }
                })
            });

            const finalReader = finalResponse.body.getReader();
            let toolFirstTokenLatency = null;
            let toolLastUsage = null;
            let toolLastModel = modelName;
            while (true) {
                const { done, value } = await finalReader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '');
                        if (dataStr === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices?.[0]?.delta;
                            if (parsed.model) toolLastModel = parsed.model;
                            if (parsed.usage && parsed.usage.total_tokens != null) toolLastUsage = parsed.usage;
                            if (delta?.content) {
                                if (toolFirstTokenLatency == null) toolFirstTokenLatency = Date.now() - toolStreamStart;
                                event.reply('stream-chunk', { chatId, content: delta.content });
                            }
                        } catch (e) { }
                    }
                }
            }
            firstTokenLatency = toolFirstTokenLatency;
            lastUsage = toolLastUsage;
            lastModel = toolLastModel;
        }

        const endTime = new Date();
        const timeStr = String(endTime.getHours()).padStart(2, '0') + ':' + String(endTime.getMinutes()).padStart(2, '0');
        event.reply('stream-end', { chatId, usage: lastUsage, model: lastModel, firstTokenLatency, time: timeStr });
    } catch (error) {
        event.reply('stream-error', { chatId, error: error.message });
    } finally {
        // Cleanup controller
        currentStreamController = null;
    }
});

// Stop stream handler
ipcMain.handle('stop-stream', () => {
    if (currentStreamController) {
        currentStreamController.abort();
        currentStreamController = null;
    }
    return true;
});
