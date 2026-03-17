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
let updateSource = 'github'; // 'github' or 'gitee'

// 检测网络环境，优先使用 Gitee 源（国内用户）
const https = require('https');
function isCNNetwork() {
    return new Promise((resolve) => {
        const testSites = [
            { name: 'gitee', url: 'https://gitee.com' },
            { name: 'github', url: 'https://github.com' }
        ];
        let completed = 0;
        const results = {};
        let resolved = false;

        // 整体超时保护
        const overallTimeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(true); // 超时默认使用 Gitee
            }
        }, 5000);

        testSites.forEach(site => {
            const startTime = Date.now();
            const req = https.get(site.url, { timeout: 3000 }, (res) => {
                if (resolved) return;
                results[site.name] = Date.now() - startTime;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    resolved = true;
                    resolve(!results.github || (results.gitee && results.gitee < results.github));
                }
            }).on('error', (err) => {
                if (resolved) return;
                console.warn(`Network test failed for ${site.name}:`, err.message);
                results[site.name] = Infinity;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    resolved = true;
                    resolve(!results.github || (results.gitee && results.gitee < results.github));
                }
            });
            
            req.setTimeout(3000, function () {
                if (resolved) return;
                req.destroy();
                results[site.name] = Infinity;
                completed++;
                if (completed === testSites.length) {
                    clearTimeout(overallTimeout);
                    resolved = true;
                    resolve(!results.github || (results.gitee && results.gitee < results.github));
                }
            });
        });
    });
}

// 获取 Gitee 最新 Release 信息
async function getGiteeLatestRelease(owner, repo) {
    return new Promise((resolve, reject) => {
        const url = `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/latest`;
        https.get(url, { timeout: 10000 }, (res) => {
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
        }).on('error', reject).setTimeout(10000, function () {
            reject(new Error('Gitee API timeout'));
        });
    });
}

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

ipcMain.handle('check-for-updates', async () => {
    if (!autoUpdater) return { ok: false, reason: 'unavailable' };
    try {
        let isCN = false;
        try {
            // 检测网络环境，决定使用 GitHub 还是 Gitee
            isCN = await isCNNetwork();
        } catch (networkErr) {
            console.warn('Network detection failed:', networkErr.message);
            // 网络检测失败时默认使用 GitHub
            isCN = false;
        }
        
        if (isCN) {
            // 使用 Gitee 源
            updateSource = 'gitee';
            console.log('Using Gitee update source for CN network');
            
            try {
                // 获取 Gitee 最新 Release
                const release = await getGiteeLatestRelease('zhtdbobo', 'chat-in-one');
                const latestVersion = release.tag_name ? release.tag_name.replace(/^v/, '') : null;
                const currentVersion = app.getVersion();
                
                if (!latestVersion) {
                    throw new Error('无法获取 Gitee 版本信息');
                }
                
                // 比较版本号
                if (latestVersion > currentVersion) {
                    // 找到对应的安装包
                    const asset = release.assets && release.assets.find(a => 
                        a.name && a.name.includes('Setup') && a.name.endsWith('.exe')
                    );
                    
                    if (!asset) {
                        throw new Error('Gitee Release 中未找到安装包');
                    }
                    
                    // 使用 generic provider 指向 Gitee 的下载链接
                    // electron-updater 需要 latest.yml 文件，但 Gitee 不提供
                    // 所以我们手动下载并安装
                    sendUpdateStatus({ 
                        type: 'available', 
                        version: release.tag_name, 
                        releaseNotes: release.body || '' 
                    });
                    
                    // 手动下载更新
                    const downloadUrl = asset.browser_download_url;
                    const userDataPath = app.getPath('userData');
                    const updatePath = path.join(userDataPath, 'update.exe');
                    
                    // 下载文件
                    await new Promise((resolve, reject) => {
                        const file = fs.createWriteStream(updatePath);
                        https.get(downloadUrl, { timeout: 60000 }, (response) => {
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
                            fs.unlink(updatePath, () => {});
                            reject(err);
                        }).setTimeout(60000, function () {
                            fs.unlink(updatePath, () => {});
                            reject(new Error('下载超时'));
                        });
                    });
                    
                    // 下载完成，准备安装
                    sendUpdateStatus({ type: 'downloaded', version: release.tag_name });
                    
                    // 存储更新文件路径供后续安装使用
                    global.updateInstallerPath = updatePath;
                    
                    return { ok: true, message: '更新已下载' };
                } else {
                    sendUpdateStatus({ type: 'not-available' });
                    return { ok: true, message: '当前已是最新版本' };
                }
            } catch (giteeErr) {
                console.warn('Gitee update failed, falling back to GitHub:', giteeErr.message);
                // Gitee 失败时回退到 GitHub
                updateSource = 'github';
            }
        }
        
        // 使用 GitHub 源（默认或回退）
        if (updateSource === 'github') {
            console.log('Using GitHub update source');
            // 使用 package.json 中配置的 publish 设置
            await autoUpdater.checkForUpdates();
        }
        
        return { ok: true, message: '检查更新已启动' };
    } catch (e) {
        const errorMessage = e.message || String(e);
        sendUpdateStatus({ type: 'error', message: errorMessage });
        return { ok: false, reason: errorMessage };
    }
});

ipcMain.handle('install-update', () => {
    if (updateSource === 'gitee' && global.updateInstallerPath && fs.existsSync(global.updateInstallerPath)) {
        // 使用 Gitee 下载的更新文件进行安装
        const { spawn } = require('child_process');
        const installerPath = global.updateInstallerPath;
        
        // 启动安装程序并退出当前应用
        spawn(installerPath, ['/S'], {
            detached: true,
            stdio: 'ignore'
        }).unref();
        
        app.quit();
    } else if (autoUpdater) {
        // 使用 electron-updater 的默认安装方式（GitHub）
        autoUpdater.quitAndInstall(false, true);
    }
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

// Build a list of possible chat completion URLs for a "short" endpoint
function buildChatCompletionCandidates(ep) {
    const trimmed = String(ep || '').trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();

    const base = trimmed.replace(/\/+$/, '');
    const candidates = [];

    // 1) 如果用户已经填了完整路径，先尝试这个长 URL
    if (lower.includes('/chat/completions') || lower.includes('/completions') || lower.includes('/complete')) {
        candidates.push(trimmed);
        // 再从短地址推导一轮候选
        try {
            const u = new URL(trimmed);
            const origin = u.origin;
            const path = u.pathname || '';
            const hasV1 = path.includes('/v1/');
            const shortBases = hasV1 ? [origin + '/v1', origin] : [origin, origin + '/v1'];
            for (const b of shortBases) {
                const sb = b.replace(/\/+$/, '');
                candidates.push(
                    `${sb}/chat/completions`,
                    `${sb}/completions`,
                    `${sb}/complete`
                );
            }
        } catch (e) {
            // 非标准 URL 时退回通用逻辑
        }
    } else {
        // 2) 纯短 endpoint：按常见组合生成候选
        if (base.endsWith('/v1')) {
            candidates.push(
                `${base}/chat/completions`,
                `${base}/completions`,
                `${base}/complete`
            );
        } else {
            candidates.push(
                `${base}/v1/chat/completions`,
                `${base}/chat/completions`,
                `${base}/v1/completions`,
                `${base}/completions`,
                `${base}/v1/complete`,
                `${base}/complete`
            );
        }
    }

    // 去重
    return Array.from(new Set(candidates));
}

// Try multiple possible URLs until one responds (2xx or meaningful 4xx), for chat completions
async function fetchChatCompletionWithFallback(endpoint, options, controller) {
    const candidates = buildChatCompletionCandidates(endpoint);
    if (candidates.length === 0) {
        throw new Error('Invalid endpoint');
    }

    let lastError = null;
    for (const url of candidates) {
        try {
            const resp = await fetch(url, {
                ...(options || {}),
                signal: controller?.signal
            });

            // If 2xx, or a non-404 error (e.g. 401/400 from API), treat as final
            if (resp.ok || resp.status !== 404) {
                return { response: resp, url };
            }

            lastError = new Error(`HTTP ${resp.status} at ${url}`);
        } catch (e) {
            lastError = e;
            // If aborted, stop immediately
            if (controller?.signal?.aborted) {
                throw e;
            }
        }
    }
    throw lastError || new Error('No valid chat completion URL found');
}

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

        const body = {
            model: modelName,
            messages: apiMessages,
            stream: stream !== false,
            stream_options: { include_usage: true },
            temperature: temperature || 0.7,
            top_p: top_p || 1,
            max_tokens: max_tokens || undefined,
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
        const { response, url: usedUrl } = await fetchChatCompletionWithFallback(
            endpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(body)
            },
            currentStreamController
        );

        if (!response.ok) {
            const errStr = await response.text();
            event.reply('stream-error', { chatId, error: `API Error: ${response.status} - ${errStr}`, url: usedUrl });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        event.reply('stream-start', { chatId });

        let toolCalls = [];
        let firstTokenLatency = null;
        let lastUsage = null;
        let lastModel = modelName;

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) processSSELine(buffer, true);
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
                processSSELine(line);
            }
        }

        function processSSELine(line, isFinal = false) {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // Check for DONE before extracting data
            if (trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') {
                return;
            }

            let dataStr = '';
            if (trimmedLine.startsWith('data: ')) {
                dataStr = trimmedLine.substring(6).trim();
            } else if (trimmedLine.startsWith('data:')) {
                dataStr = trimmedLine.substring(5).trim();
            } else if (trimmedLine.startsWith('{')) {
                dataStr = trimmedLine;
            }

            if (!dataStr || dataStr === '[DONE]') return;

            try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta;
                if (parsed.model) lastModel = parsed.model;
                if (parsed.usage && (parsed.usage.total_tokens != null || parsed.usage.output_tokens != null)) lastUsage = parsed.usage;
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
            } catch (e) {
                // Only log if it's not a known non-JSON line
                if (!isFinal && !trimmedLine.includes('[DONE]')) {
                    console.error('Error parsing SSE chunk:', e, 'Raw Line:', trimmedLine);
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

            // Send tool results back to LLM for final answer（沿用相同 endpoint 及回退机制）
            const toolStreamStart = Date.now();
            const { response: finalResponse } = await fetchChatCompletionWithFallback(
                endpoint,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [...apiMessages, { role: "assistant", tool_calls: toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args } })) }, ...toolResults],
                        stream: true,
                        stream_options: { include_usage: true }
                    })
                },
                currentStreamController
            );

            const finalReader = finalResponse.body.getReader();
            let toolFirstTokenLatency = null;
            let toolLastUsage = null;
            let toolLastModel = modelName;
            let toolBuffer = '';
            while (true) {
                const { done, value } = await finalReader.read();
                if (done) {
                    if (toolBuffer.trim()) processToolSSELine(toolBuffer);
                    break;
                }

                toolBuffer += decoder.decode(value, { stream: true });
                let lines = toolBuffer.split(/\r?\n/);
                toolBuffer = lines.pop() || '';

                for (const line of lines) {
                    processToolSSELine(line);
                }
            }

            function processToolSSELine(line) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') return;

                let dataStr = '';
                if (trimmedLine.startsWith('data: ')) {
                    dataStr = trimmedLine.substring(6).trim();
                } else if (trimmedLine.startsWith('data:')) {
                    dataStr = trimmedLine.substring(5).trim();
                } else if (trimmedLine.startsWith('{')) {
                    dataStr = trimmedLine;
                }

                if (!dataStr || dataStr === '[DONE]') return;

                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta;
                    if (parsed.model) toolLastModel = parsed.model;
                    if (parsed.usage && (parsed.usage.total_tokens != null || parsed.usage.output_tokens != null)) toolLastUsage = parsed.usage;
                    if (delta?.content) {
                        if (toolFirstTokenLatency == null) toolFirstTokenLatency = Date.now() - toolStreamStart;
                        event.reply('stream-chunk', { chatId, content: delta.content });
                    }
                } catch (e) {
                    if (!trimmedLine.includes('[DONE]')) {
                        console.error('Error parsing Tool SSE chunk:', e, 'Raw Line:', trimmedLine);
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
