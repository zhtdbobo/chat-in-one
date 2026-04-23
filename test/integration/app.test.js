// 模拟electron模块
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('C:\\test\\userData'),
        getVersion: jest.fn().mockReturnValue('1.0.0'),
        whenReady: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        quit: jest.fn(),
        commandLine: {
            appendSwitch: jest.fn()
        }
    },
    BrowserWindow: {
        getAllWindows: jest.fn().mockReturnValue([])
    },
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn()
    }
}));

// 模拟fs模块
jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(false),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn()
}));

// 模拟其他模块
jest.mock('../../src/js/main/store', () => ({
    initStore: jest.fn().mockResolvedValue({}),
    getStore: jest.fn().mockReturnValue({})
}));

jest.mock('../../src/js/main/window', () => ({
    createWindow: jest.fn(),
    createTray: jest.fn(),
    setIsQuitting: jest.fn(),
    getIsQuitting: jest.fn()
}));

jest.mock('../../src/js/main/updater', () => ({
    initAutoUpdater: jest.fn()
}));

jest.mock('../../src/js/main/ipc', () => ({
    setupIpcHandlers: jest.fn()
}));

describe('App Integration', () => {
    test('should import main.js without errors', () => {
        // 模拟electron模块
        jest.mock('electron', () => ({
            app: {
                getPath: jest.fn().mockReturnValue('C:\\test\\userData'),
                getVersion: jest.fn().mockReturnValue('1.0.0'),
                whenReady: jest.fn().mockResolvedValue(),
                on: jest.fn(),
                quit: jest.fn(),
                commandLine: {
                    appendSwitch: jest.fn()
                }
            },
            BrowserWindow: {
                getAllWindows: jest.fn().mockReturnValue([])
            },
            ipcMain: {
                handle: jest.fn(),
                on: jest.fn()
            }
        }));
        
        // 模拟fs模块
        jest.mock('fs', () => ({
            existsSync: jest.fn().mockReturnValue(false),
            mkdirSync: jest.fn(),
            writeFileSync: jest.fn(),
            readFileSync: jest.fn()
        }));
        
        // 模拟其他模块
        jest.mock('../../src/js/main/store', () => ({
            initStore: jest.fn().mockResolvedValue({}),
            getStore: jest.fn().mockReturnValue({})
        }));
        
        jest.mock('../../src/js/main/window', () => ({
            createWindow: jest.fn(),
            createTray: jest.fn(),
            setIsQuitting: jest.fn(),
            getIsQuitting: jest.fn()
        }));
        
        jest.mock('../../src/js/main/updater', () => ({
            initAutoUpdater: jest.fn()
        }));
        
        jest.mock('../../src/js/main/ipc', () => ({
            setupIpcHandlers: jest.fn()
        }));
        
        // 导入main.js
        expect(() => {
            require('../../main');
        }).not.toThrow();
    });
});