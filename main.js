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
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let mcpClients = [];

async function getMcpTools(servers) {
    const allTools = [];
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
            mcpClients.push({ id: server.id, client, transport });
        } catch (e) {
            console.error(`Failed to connect to MCP server ${server.name}:`, e);
        }
    }
    return allTools;
}

ipcMain.on('send-message-stream', async (event, requestData) => {
    const { endpoint, apiKey, modelName, systemPrompt, messages, chatId, enableThinking, enableSearch, mcpServers } = requestData;

    try {
        // Cleanup old clients
        for (const c of mcpClients) await c.transport.close();
        mcpClients = [];

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
            stream: true,
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

        const response = await fetch(fetchPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
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
                        if (delta) {
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
                const clientObj = mcpClients.find(c => true); // In a real app, map tool name to server
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
                }
            }

            // Send tool results back to LLM for final answer
            // (Note: This is a recursive step, simplified for this implementation)
            const finalResponse = await fetch(fetchPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: modelName,
                    messages: [...apiMessages, { role: "assistant", tool_calls: toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args } })) }, ...toolResults],
                    stream: true
                })
            });

            const finalReader = finalResponse.body.getReader();
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
                            if (delta?.content) event.reply('stream-chunk', { chatId, content: delta.content });
                        } catch (e) { }
                    }
                }
            }
        }

        event.reply('stream-end', { chatId });
    } catch (error) {
        event.reply('stream-error', { chatId, error: error.message });
    }
});
