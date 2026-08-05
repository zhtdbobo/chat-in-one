jest.mock('electron', () => ({
    app: { quit: jest.fn() },
    BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) }
}));

const {
    runInstallUpdate,
    runUpdateCheckWithFallback,
    setUpdateFeed,
    UPDATE_FEEDS
} = require('../../src/js/main/updater');

describe('Updater install safety', () => {
    test('uses only electron-updater for installation', () => {
        const quitAndInstall = jest.fn();

        const result = runInstallUpdate({ quitAndInstall });

        expect(result).toBe('auto-updater');
        expect(quitAndInstall).toHaveBeenCalledWith(false, true);
    });

    test('does not quit or execute a fallback installer when updater is unavailable', () => {
        expect(runInstallUpdate({ quitAndInstall: null })).toBe('unavailable');
    });

    test('configures the gh-proxy.com generic feed for verified release downloads', () => {
        const updater = { setFeedURL: jest.fn() };

        setUpdateFeed(updater, 'proxy');

        expect(updater.setFeedURL).toHaveBeenCalledWith({
            provider: 'generic',
            url: 'https://gh-proxy.com/https://github.com/zhtdbobo/chat-in-one/releases/latest/download'
        });
        expect(UPDATE_FEEDS.github).toEqual(expect.objectContaining({ provider: 'github' }));
    });

    test('falls back to the official GitHub feed when the proxy fails', async () => {
        const updater = {
            setFeedURL: jest.fn(),
            checkForUpdates: jest.fn()
                .mockRejectedValueOnce(new Error('proxy unavailable'))
                .mockResolvedValueOnce({ downloadPromise: Promise.resolve() })
        };
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await runUpdateCheckWithFallback(updater);

        expect(result).toEqual(expect.objectContaining({ ok: true, source: 'github' }));
        expect(updater.setFeedURL).toHaveBeenNthCalledWith(1, UPDATE_FEEDS.proxy);
        expect(updater.setFeedURL).toHaveBeenNthCalledWith(2, UPDATE_FEEDS.github);
        console.warn.mockRestore();
    });
});
