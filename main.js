const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// Ignore SSL errors (e.g. net_error -100) on startup for proxy or local environments
app.commandLine.appendSwitch('ignore-certificate-errors');

// We will use electron-store or a simpler file-based store if store fails
let store;

// Simple fallback JSON store in user paths if electron-store is not available during dev
const fs = require('fs');
class SimpleStore {
    constructor(opts) {
        const userDataPath = app.getPath('userData');
        this.path = path.join(userDataPath, opts.name + '.json');
        this.data = parseDataFile(this.path, opts.defaults);
    }
    get(key) { return this.data[key]; }
    set(key, val) {
        this.data[key] = val;
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }
}
function parseDataFile(filePath, defaults) {
    try { return JSON.parse(fs.readFileSync(filePath)); } catch (error) { return defaults; }
}

async function initStore() {
    try {
        const Store = (await import('electron-store')).default;
        store = new Store({
            defaults: {
                settings: {
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
                    ]
                },
                chats: []
            }
        });
    } catch (e) {
        console.warn("Falling back to SimpleStore", e);
        store = new SimpleStore({
            name: 'config',
            defaults: {
                settings: {
                    theme: "light",
                    systemPrompt: "You are a helpful assistant.",
                    providers: [
                        { id: "default", name: "默认服务商", endpoint: "https://api.openai.com/v1", apiKey: "", models: "gpt-3.5-turbo, deepseek-chat" }
                    ]
                },
                chats: []
            }
        });
    }
}


function createWindow() {
    const mainWindow = new BrowserWindow({
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
}

app.whenReady().then(async () => {
    await initStore();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
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

// Stream Request Handler
ipcMain.on('send-message-stream', async (event, requestData) => {
    const { endpoint, apiKey, modelName, systemPrompt, messages, chatId } = requestData;

    try {
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const fetchPath = endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`;

        const response = await fetch(fetchPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: apiMessages,
                stream: true
            })
        });

        if (!response.ok) {
            const errStr = await response.text();
            event.reply('stream-error', { chatId, error: `API Error: ${response.status} - ${errStr}` });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        event.reply('stream-start', { chatId });

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                event.reply('stream-end', { chatId });
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.includes('[DONE]')) {
                    event.reply('stream-end', { chatId });
                    return;
                }
                if (line.startsWith('data: ')) {
                    const dataStr = line.replace('data: ', '');
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.choices && parsed.choices.length > 0) {
                            const delta = parsed.choices[0].delta;
                            if (delta) {
                                let content = "";
                                if (delta.reasoning_content) {
                                    event.reply('stream-chunk', { chatId, reasoning_content: delta.reasoning_content });
                                }
                                if (delta.content) {
                                    event.reply('stream-chunk', { chatId, content: delta.content });
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error parsing stream line:", line, e);
                    }
                }
            }
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        event.reply('stream-error', { chatId, error: error.message });
    }
});
