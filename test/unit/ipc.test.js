// 模拟electron模块
jest.mock('electron', () => ({
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn()
    },
    app: {
        getVersion: jest.fn().mockReturnValue('1.0.0')
    }
}));

// 模拟其他模块
jest.mock('../../src/js/main/store', () => ({
    getStore: jest.fn().mockReturnValue({
        get: jest.fn().mockImplementation((key) => {
            if (key === 'settings') {
                return {
                    providers: [
                        { id: 'p1', name: 'Provider 1', endpoint: 'https://api.one.example/v1', apiKey: 'real-key-1' },
                        { id: 'p2', name: 'Provider 2', endpoint: 'https://api.two.example/v1', apiKey: 'real-key-2' }
                    ]
                };
            }
            return { test: 'value' };
        }),
        set: jest.fn()
    }),
    resolveApiKey: jest.fn().mockImplementation((providerId) => {
        const map = { p1: 'real-key-1', p2: 'real-key-2' };
        return map[providerId] || '';
    }),
    protectApiKey: jest.fn(value => value),
    normalizeHttpEndpoint: jest.fn(value => {
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) ? url.toString().replace(/\/+$/, '') : '';
        } catch (error) {
            return '';
        }
    }),
    getEndpointOrigin: jest.fn(value => {
        try { return new URL(value).origin; } catch (error) { return ''; }
    }),
    resolveProviderRequest: jest.fn(({ endpoint, apiKey }) => ({
        endpoint,
        apiKey: apiKey && apiKey !== '__MASKED__' ? apiKey : 'stored-key'
    }))
}));

jest.mock('../../src/js/main/updater', () => ({
    checkForUpdates: jest.fn().mockResolvedValue({ ok: true }),
    installUpdate: jest.fn().mockReturnValue('auto-updater')
}));

jest.mock('../../src/js/main/stream', () => ({
    handleStreamRequest: jest.fn(),
    stopStream: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/js/main/window', () => ({
    updateTitlebarTheme: jest.fn(),
    setIsQuitting: jest.fn(),
    getMainWindow: jest.fn().mockReturnValue({
        isDestroyed: jest.fn().mockReturnValue(false),
        isMaximized: jest.fn().mockReturnValue(false),
        maximize: jest.fn(),
        unmaximize: jest.fn()
    })
}));

jest.mock('../../src/js/main/network', () => ({
    fetchChatCompletionWithFallback: jest.fn()
}));

const { ipcMain, app } = require('electron');
const { setupIpcHandlers } = require('../../src/js/main/ipc');
const { getStore } = require('../../src/js/main/store');
const { checkForUpdates, installUpdate } = require('../../src/js/main/updater');
const { handleStreamRequest, stopStream } = require('../../src/js/main/stream');
const { updateTitlebarTheme, setIsQuitting, getMainWindow } = require('../../src/js/main/window');
const { fetchChatCompletionWithFallback } = require('../../src/js/main/network');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const trustedEvent = {
    senderFrame: {
        url: pathToFileURL(path.resolve(__dirname, '../../index.html')).href,
        parent: null
    }
};

describe('IPC Module', () => {
    beforeEach(() => {
        // 重置所有mock
        jest.clearAllMocks();
    });

    test('should setup all IPC handlers', () => {
        setupIpcHandlers();

        // 验证ipcMain.handle被调用
        expect(ipcMain.handle).toHaveBeenCalledWith('get-app-version', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('check-for-updates', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('install-update', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('get-settings', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('save-settings', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('get-chats', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('save-chats', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('stop-stream', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('is-maximized', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('maximize-window', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('unmaximize-window', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('test-provider-connection', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('summarize-chat', expect.any(Function));

        // 验证ipcMain.on被调用
        expect(ipcMain.on).toHaveBeenCalledWith('send-message-stream', expect.any(Function));
        expect(ipcMain.on).toHaveBeenCalledWith('update-titlebar-theme', expect.any(Function));
    });

    test('should handle get-app-version correctly', () => {
        setupIpcHandlers();
        
        // 找到get-app-version的处理函数
        const getAppVersionCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-app-version');
        expect(getAppVersionCall).toBeDefined();
        
        const handler = getAppVersionCall[1];
        const result = handler(trustedEvent);
        expect(result).toBe('1.0.0');
        expect(app.getVersion).toHaveBeenCalled();
    });

    test('should handle install-update correctly', () => {
        setupIpcHandlers();
        
        // 找到install-update的处理函数
        const installUpdateCall = ipcMain.handle.mock.calls.find(call => call[0] === 'install-update');
        expect(installUpdateCall).toBeDefined();
        
        const handler = installUpdateCall[1];
        const result = handler(trustedEvent);
        
        expect(setIsQuitting).toHaveBeenCalledWith(true);
        expect(installUpdate).toHaveBeenCalled();
        expect(result).toBe('auto-updater');
    });

    test('should handle get-settings and mask API keys', () => {
        setupIpcHandlers();

        // 找到get-settings的处理函数
        const getSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-settings');
        expect(getSettingsCall).toBeDefined();

        const handler = getSettingsCall[1];
        const result = handler(trustedEvent);

        expect(getStore).toHaveBeenCalled();
        expect(getStore().get).toHaveBeenCalledWith('settings');
        // API keys should be masked
        expect(result.providers[0].apiKey).toBe('__MASKED__');
        expect(result.providers[1].apiKey).toBe('__MASKED__');
        expect(result.providers[0].name).toBe('Provider 1');
    });

    test('should handle save-settings correctly', () => {
        setupIpcHandlers();
        
        // 找到save-settings的处理函数
        const saveSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'save-settings');
        expect(saveSettingsCall).toBeDefined();
        
        const handler = saveSettingsCall[1];
        const settings = { test: 'new value', providers: [] };
        const result = handler(trustedEvent, settings);
        
        expect(getStore).toHaveBeenCalled();
        expect(getStore().set).toHaveBeenCalledWith('settings', settings);
        expect(result).toBe(true);
    });

    test('should handle update-titlebar-theme correctly', () => {
        setupIpcHandlers();
        
        // 找到update-titlebar-theme的处理函数
        const updateTitlebarThemeCall = ipcMain.on.mock.calls.find(call => call[0] === 'update-titlebar-theme');
        expect(updateTitlebarThemeCall).toBeDefined();
        
        const handler = updateTitlebarThemeCall[1];
        const theme = 'dark';
        handler(trustedEvent, theme);
        
        expect(updateTitlebarTheme).toHaveBeenCalledWith(theme);
    });

    test('should restore masked API keys on save-settings', () => {
        setupIpcHandlers();

        const saveSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'save-settings');
        expect(saveSettingsCall).toBeDefined();
        const handler = saveSettingsCall[1];

        const newSettings = {
            providers: [
                { id: 'p1', name: 'Provider 1', apiKey: '__MASKED__' },
                { id: 'p2', name: 'Provider 2', apiKey: '__MASKED__' },
                { id: 'p3', name: 'Provider 3', apiKey: 'new-key-3' }
            ]
        };
        const result = handler(trustedEvent, newSettings);

        // p1 and p2 should have their keys restored from old settings; p3 should keep its new key
        expect(getStore().set).toHaveBeenCalledWith('settings', {
            providers: [
                { id: 'p1', name: 'Provider 1', apiKey: 'real-key-1' },
                { id: 'p2', name: 'Provider 2', apiKey: 'real-key-2' },
                { id: 'p3', name: 'Provider 3', apiKey: 'new-key-3' }
            ]
        });
        expect(result).toBe(true);
    });

    test('should not expose an IPC handler that returns plaintext provider keys', () => {
        setupIpcHandlers();

        const exportCall = ipcMain.handle.mock.calls.find(call => call[0] === 'export-providers');
        expect(exportCall).toBeUndefined();
    });

    test('should reject IPC from remote pages', () => {
        setupIpcHandlers();
        const getSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-settings');
        expect(() => getSettingsCall[1]({ senderFrame: { url: 'https://attacker.example/' } }))
            .toThrow('Blocked IPC from untrusted sender');
    });

    test('should reject IPC from a different local file', () => {
        setupIpcHandlers();
        const getSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-settings');
        expect(() => getSettingsCall[1]({ senderFrame: { url: 'file:///tmp/other.html', parent: null } }))
            .toThrow('Blocked IPC from untrusted sender');
    });

    test('should restore normal close behavior if update installation throws', () => {
        installUpdate.mockImplementationOnce(() => { throw new Error('install failed'); });
        setupIpcHandlers();
        const installCall = ipcMain.handle.mock.calls.find(call => call[0] === 'install-update');

        expect(() => installCall[1](trustedEvent)).toThrow('install failed');
        expect(setIsQuitting).toHaveBeenLastCalledWith(false);
    });

    test('should require the API key again when a saved provider host changes', () => {
        setupIpcHandlers();
        const saveCall = ipcMain.handle.mock.calls.find(call => call[0] === 'save-settings');
        const result = saveCall[1](trustedEvent, {
            providers: [{
                id: 'p1',
                name: 'Provider 1',
                endpoint: 'https://attacker.example/v1',
                apiKey: '__MASKED__'
            }]
        });

        expect(result).toEqual(expect.objectContaining({ ok: false }));
        expect(getStore().set).not.toHaveBeenCalled();
    });

    test('should handle fetch-provider-models with missing endpoint', () => {
        setupIpcHandlers();

        const fetchCall = ipcMain.handle.mock.calls.find(call => call[0] === 'fetch-provider-models');
        expect(fetchCall).toBeDefined();
        const handler = fetchCall[1];

        // No endpoint → should immediately fail
        return handler(trustedEvent, { apiKey: 'test', providerId: 'p1' }).then(result => {
            expect(result.ok).toBe(false);
            expect(result.error).toContain('Missing endpoint');
        });
    });
});
