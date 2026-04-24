jest.mock('electron', () => ({
    app: {
        quit: jest.fn()
    },
    BrowserWindow: {
        getAllWindows: jest.fn().mockReturnValue([])
    }
}));

const { runInstallUpdate } = require('../../src/js/main/updater');

describe('Updater install simulation', () => {
    test('点击重启并更新：有本地安装包时拉起安装器并退出', () => {
        const spawnInstaller = jest.fn();
        const quitApp = jest.fn();
        const quitAndInstall = jest.fn();

        const result = runInstallUpdate({
            source: 'gitee',
            installerPath: 'C:/tmp/update.exe',
            existsSync: () => true,
            spawnInstaller,
            quitAndInstall,
            quitApp
        });

        expect(result).toBe('custom-installer');
        expect(spawnInstaller).toHaveBeenCalledWith('C:/tmp/update.exe');
        expect(quitApp).toHaveBeenCalledTimes(1);
        expect(quitAndInstall).not.toHaveBeenCalled();
    });

    test('点击重启并更新：无本地安装包时走 autoUpdater.quitAndInstall', () => {
        const spawnInstaller = jest.fn();
        const quitApp = jest.fn();
        const quitAndInstall = jest.fn();

        const result = runInstallUpdate({
            source: 'github',
            installerPath: null,
            existsSync: () => false,
            spawnInstaller,
            quitAndInstall,
            quitApp
        });

        expect(result).toBe('auto-updater');
        expect(quitAndInstall).toHaveBeenCalledWith(false, true);
        expect(spawnInstaller).not.toHaveBeenCalled();
        expect(quitApp).not.toHaveBeenCalled();
    });

    test('点击重启并更新：无安装器且无 autoUpdater 时兜底退出', () => {
        const spawnInstaller = jest.fn();
        const quitApp = jest.fn();

        const result = runInstallUpdate({
            source: 'github',
            installerPath: null,
            existsSync: () => false,
            spawnInstaller,
            quitAndInstall: null,
            quitApp
        });

        expect(result).toBe('quit-fallback');
        expect(quitApp).toHaveBeenCalledTimes(1);
        expect(spawnInstaller).not.toHaveBeenCalled();
    });
});

