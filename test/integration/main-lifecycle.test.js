const onHandlers = {};

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('C:\\test\\userData'),
        whenReady: jest.fn(() => Promise.resolve()),
        on: jest.fn((event, handler) => {
            onHandlers[event] = handler;
        }),
        quit: jest.fn(),
        commandLine: { appendSwitch: jest.fn() }
    },
    BrowserWindow: {
        getAllWindows: jest.fn().mockReturnValue([])
    },
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn()
    }
}));

jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn()
}));

const mockTray = {
    removeAllListeners: jest.fn(),
    destroy: jest.fn()
};

jest.mock('../../src/js/main/store', () => ({
    initStore: jest.fn().mockResolvedValue({})
}));

jest.mock('../../src/js/main/window', () => ({
    createWindow: jest.fn(),
    createTray: jest.fn(),
    setIsQuitting: jest.fn(),
    getTray: jest.fn(() => mockTray)
}));

jest.mock('../../src/js/main/updater', () => ({
    initAutoUpdater: jest.fn()
}));

jest.mock('../../src/js/main/ipc', () => ({
    setupIpcHandlers: jest.fn()
}));

jest.mock('../../src/js/main/stream', () => ({
    cleanupMcpClients: jest.fn().mockResolvedValue()
}));

describe('Main lifecycle cleanup', () => {
    beforeEach(() => {
        jest.resetModules();
        Object.keys(onHandlers).forEach((k) => delete onHandlers[k]);
        mockTray.removeAllListeners.mockClear();
        mockTray.destroy.mockClear();
    });

    test('before-quit cleans tray listeners and MCP clients', async () => {
        require('../../main');
        const { setIsQuitting } = require('../../src/js/main/window');
        const { cleanupMcpClients } = require('../../src/js/main/stream');
        expect(typeof onHandlers['before-quit']).toBe('function');

        await onHandlers['before-quit']();

        expect(setIsQuitting).toHaveBeenCalledWith(true);
        expect(mockTray.removeAllListeners).toHaveBeenCalledTimes(1);
        expect(mockTray.destroy).toHaveBeenCalledTimes(1);
        expect(cleanupMcpClients).toHaveBeenCalledTimes(1);
    });
});

