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
        get: jest.fn().mockReturnValue({ test: 'value' }),
        set: jest.fn()
    })
}));

jest.mock('../../src/js/main/updater', () => ({
    checkForUpdates: jest.fn().mockResolvedValue({ ok: true }),
    installUpdate: jest.fn()
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

describe('IPC Module', () => {
    beforeEach(() => {
        // 重置所有mock
        jest.clearAllMocks();
    });

    test('should setup all IPC handlers', () => {
        setupIpcHandlers();

        // 验证ipcMain.handle被调用
        expect(ipcMain.handle).toHaveBeenCalledWith('get-app-version', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('check-for-updates', checkForUpdates);
        expect(ipcMain.handle).toHaveBeenCalledWith('install-update', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('get-settings', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('save-settings', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('get-chats', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('save-chats', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('stop-stream', stopStream);
        expect(ipcMain.handle).toHaveBeenCalledWith('is-maximized', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('maximize-window', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('unmaximize-window', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('test-provider-connection', expect.any(Function));
        expect(ipcMain.handle).toHaveBeenCalledWith('summarize-chat', expect.any(Function));

        // 验证ipcMain.on被调用
        expect(ipcMain.on).toHaveBeenCalledWith('send-message-stream', handleStreamRequest);
        expect(ipcMain.on).toHaveBeenCalledWith('update-titlebar-theme', expect.any(Function));
    });

    test('should handle get-app-version correctly', () => {
        setupIpcHandlers();
        
        // 找到get-app-version的处理函数
        const getAppVersionCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-app-version');
        expect(getAppVersionCall).toBeDefined();
        
        const handler = getAppVersionCall[1];
        const result = handler();
        expect(result).toBe('1.0.0');
        expect(app.getVersion).toHaveBeenCalled();
    });

    test('should handle install-update correctly', () => {
        setupIpcHandlers();
        
        // 找到install-update的处理函数
        const installUpdateCall = ipcMain.handle.mock.calls.find(call => call[0] === 'install-update');
        expect(installUpdateCall).toBeDefined();
        
        const handler = installUpdateCall[1];
        handler();
        
        expect(setIsQuitting).toHaveBeenCalledWith(true);
        expect(installUpdate).toHaveBeenCalled();
    });

    test('should handle get-settings correctly', () => {
        setupIpcHandlers();
        
        // 找到get-settings的处理函数
        const getSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'get-settings');
        expect(getSettingsCall).toBeDefined();
        
        const handler = getSettingsCall[1];
        const result = handler();
        
        expect(getStore).toHaveBeenCalled();
        expect(getStore().get).toHaveBeenCalledWith('settings');
        expect(result).toEqual({ test: 'value' });
    });

    test('should handle save-settings correctly', () => {
        setupIpcHandlers();
        
        // 找到save-settings的处理函数
        const saveSettingsCall = ipcMain.handle.mock.calls.find(call => call[0] === 'save-settings');
        expect(saveSettingsCall).toBeDefined();
        
        const handler = saveSettingsCall[1];
        const settings = { test: 'new value' };
        const result = handler(null, settings);
        
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
        handler(null, theme);
        
        expect(updateTitlebarTheme).toHaveBeenCalledWith(theme);
    });
});