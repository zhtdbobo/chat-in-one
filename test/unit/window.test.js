const trayInstances = [];
let browserWindowInstance = null;

jest.mock('electron', () => {
    class MockTray {
        constructor() {
            this.handlers = {};
            trayInstances.push(this);
        }
        setToolTip() { }
        on(event, handler) {
            this.handlers[event] = handler;
        }
        setContextMenu() { }
    }

    class MockBrowserWindow {
        constructor() {
            this.handlers = {};
            this.minimized = false;
            this.visible = true;
            this.destroyed = false;
            this.hide = jest.fn(() => { this.visible = false; });
            this.show = jest.fn(() => { this.visible = true; });
            this.focus = jest.fn();
            this.restore = jest.fn(() => { this.minimized = false; });
            this.loadFile = jest.fn();
            this.isMinimized = jest.fn(() => this.minimized);
            this.isVisible = jest.fn(() => this.visible);
            this.isDestroyed = jest.fn(() => this.destroyed);
            this.webContents = {
                handlers: {},
                on: jest.fn((event, handler) => { this.webContents.handlers[event] = handler; }),
                setWindowOpenHandler: jest.fn((handler) => { this.webContents.windowOpenHandler = handler; })
            };
            browserWindowInstance = this;
        }
        on(event, handler) {
            this.handlers[event] = handler;
        }
    }

    return {
        app: { quit: jest.fn() },
        BrowserWindow: MockBrowserWindow,
        Tray: MockTray,
        Menu: { buildFromTemplate: jest.fn(() => ({})) },
        nativeImage: {
            createFromPath: jest.fn(() => ({})),
            createEmpty: jest.fn(() => ({}))
        },
        shell: { openExternal: jest.fn().mockResolvedValue() }
    };
});

describe('Window tray safety', () => {
    beforeEach(() => {
        jest.resetModules();
        trayInstances.length = 0;
        browserWindowInstance = null;
    });

    test('tray click does not crash when main window is destroyed', () => {
        const windowModule = require('../../src/js/main/window');
        windowModule.createWindow();
        windowModule.createTray();

        expect(trayInstances.length).toBe(1);
        const clickHandler = trayInstances[0].handlers.click;
        expect(typeof clickHandler).toBe('function');

        browserWindowInstance.destroyed = true;
        browserWindowInstance.isVisible.mockImplementation(() => {
            throw new Error('isVisible should not be called when destroyed');
        });

        expect(() => clickHandler()).not.toThrow();
    });

    test('window close hides app when not quitting', () => {
        const windowModule = require('../../src/js/main/window');
        windowModule.createWindow();

        const closeHandler = browserWindowInstance.handlers.close;
        const event = { preventDefault: jest.fn() };
        closeHandler(event);

        expect(event.preventDefault).toHaveBeenCalled();
        expect(browserWindowInstance.hide).toHaveBeenCalled();
    });

    test('remote navigation is denied and opened outside the privileged window', () => {
        const { shell } = require('electron');
        const windowModule = require('../../src/js/main/window');
        windowModule.createWindow();

        const event = { preventDefault: jest.fn() };
        browserWindowInstance.webContents.handlers['will-navigate'](event, 'https://example.com/path');

        expect(event.preventDefault).toHaveBeenCalled();
        expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/path');
    });
});

