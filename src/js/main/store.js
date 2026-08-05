const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('node:path');

let store;
const ENCRYPTED_API_KEY_PREFIX = 'safe:v1:';

function protectApiKey(apiKey) {
    const value = String(apiKey || '');
    if (!value || value.startsWith(ENCRYPTED_API_KEY_PREFIX)) return value;
    if (!safeStorage?.isEncryptionAvailable?.()) return value;
    try {
        return ENCRYPTED_API_KEY_PREFIX + safeStorage.encryptString(value).toString('base64');
    } catch (error) {
        console.error('Failed to protect API key:', error);
        return value;
    }
}

function unprotectApiKey(apiKey) {
    const value = String(apiKey || '');
    if (!value.startsWith(ENCRYPTED_API_KEY_PREFIX)) return value;
    if (!safeStorage?.isEncryptionAvailable?.()) return '';
    try {
        const encrypted = Buffer.from(value.slice(ENCRYPTED_API_KEY_PREFIX.length), 'base64');
        return safeStorage.decryptString(encrypted);
    } catch (error) {
        console.error('Failed to decrypt API key:', error);
        return '';
    }
}

function normalizeHttpEndpoint(endpoint) {
    try {
        const parsed = new URL(String(endpoint || '').trim());
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        if (parsed.username || parsed.password) return '';
        parsed.hash = '';
        return parsed.toString().replace(/\/+$/, '');
    } catch (error) {
        return '';
    }
}

function getEndpointOrigin(endpoint) {
    const normalized = normalizeHttpEndpoint(endpoint);
    return normalized ? new URL(normalized).origin : '';
}

function resolveProviderRequestFromSettings(settings, { providerId, endpoint, apiKey }) {
    const normalizedEndpoint = normalizeHttpEndpoint(endpoint);
    if (!normalizedEndpoint) {
        return { error: 'Invalid API endpoint' };
    }

    const suppliedKey = String(apiKey || '');
    if (suppliedKey && suppliedKey !== '__MASKED__') {
        return { endpoint: normalizedEndpoint, apiKey: suppliedKey };
    }

    const provider = settings?.providers?.find(p => p.id === providerId);
    if (!provider) return { error: 'Unknown provider' };

    const storedEndpoint = normalizeHttpEndpoint(provider.endpoint);
    if (!storedEndpoint || storedEndpoint !== normalizedEndpoint) {
        return { error: 'API endpoint does not match the saved provider' };
    }

    const resolvedKey = unprotectApiKey(provider.apiKey);
    if (!resolvedKey) return { error: 'Missing apiKey' };
    return { endpoint: storedEndpoint, apiKey: resolvedKey };
}

function resolveProviderRequest(request) {
    return resolveProviderRequestFromSettings(getStore()?.get('settings'), request);
}

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
        mcpServers: [
            { id: 'everything', name: 'Everything 官方测试工具箱', command: 'npx', args: '-y, @modelcontextprotocol/server-everything' }
        ]
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

    // Migration: Ensure new default fields exist in old stored settings
    const currentSettings = store.get('settings') || {};
    let settingsChanged = false;

    // Removed: this Chromium-wide switch did not affect main-process API fetches
    // and weakened TLS checks for every page loaded by the application.
    if (Object.prototype.hasOwnProperty.call(currentSettings, 'ignoreCertificateErrors')) {
        delete currentSettings.ignoreCertificateErrors;
        settingsChanged = true;
    }

    for (const provider of currentSettings.providers || []) {
        const protectedKey = protectApiKey(provider.apiKey);
        if (protectedKey !== provider.apiKey) {
            provider.apiKey = protectedKey;
            settingsChanged = true;
        }
    }

    if (!currentSettings.mcpServers || currentSettings.mcpServers.length === 0) {
        currentSettings.mcpServers = defaultSettings.mcpServers;
        settingsChanged = true;
    }

    if (!currentSettings.skills || currentSettings.skills.length === 0) {
        currentSettings.skills = defaultSettings.skills;
        settingsChanged = true;
    }

    if (settingsChanged) {
        store.set('settings', currentSettings);
    }

    return store;
}

function getStore() {
    return store;
}

function resolveApiKey(providerId) {
    if (!providerId) return '';
    const s = getStore();
    if (!s) return '';
    const settings = s.get('settings');
    const provider = settings?.providers?.find(p => p.id === providerId);
    return unprotectApiKey(provider?.apiKey);
}

module.exports = {
    initStore,
    getStore,
    SimpleStore,
    parseDataFile,
    resolveApiKey,
    protectApiKey,
    unprotectApiKey,
    normalizeHttpEndpoint,
    getEndpointOrigin,
    resolveProviderRequestFromSettings,
    resolveProviderRequest
};
