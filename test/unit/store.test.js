// 模拟electron的app对象
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('C:\\test\\userData')
    },
    safeStorage: {
        isEncryptionAvailable: jest.fn().mockReturnValue(true),
        encryptString: jest.fn(value => Buffer.from(`encrypted:${value}`, 'utf8')),
        decryptString: jest.fn(buffer => buffer.toString('utf8').replace(/^encrypted:/, ''))
    }
}));

// 模拟fs模块
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn()
}));

const fs = require('fs');
const {
    SimpleStore,
    parseDataFile,
    protectApiKey,
    unprotectApiKey,
    resolveApiKey,
    normalizeHttpEndpoint,
    resolveProviderRequestFromSettings
} = require('../../src/js/main/store');

describe('Store Module', () => {
    beforeEach(() => {
        // 重置所有mock
        jest.clearAllMocks();
    });

    describe('parseDataFile', () => {
        test('should return defaults when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const defaults = { test: 'default' };
            const result = parseDataFile('test.json', defaults);
            expect(result).toEqual(defaults);
        });

        test('should return parsed data when file exists and is valid JSON', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify({ test: 'data' }));
            const defaults = { test: 'default' };
            const result = parseDataFile('test.json', defaults);
            expect(result).toEqual({ test: 'data' });
        });

        test('should return defaults when file exists but is invalid JSON', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');
            const defaults = { test: 'default' };
            const result = parseDataFile('test.json', defaults);
            expect(result).toEqual(defaults);
        });
    });

    describe('SimpleStore', () => {
        test('should initialize with defaults when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const store = new SimpleStore({
                name: 'test',
                defaults: { test: 'default' }
            });
            expect(store.get('test')).toBe('default');
        });

        test('should initialize with data from file when file exists', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify({ test: 'data' }));
            const store = new SimpleStore({
                name: 'test',
                defaults: { test: 'default' }
            });
            expect(store.get('test')).toBe('data');
        });

        test('should save data to file when set is called', () => {
            fs.existsSync.mockReturnValue(false);
            const store = new SimpleStore({
                name: 'test',
                defaults: { test: 'default' }
            });
            store.set('test', 'new value');
            expect(store.get('test')).toBe('new value');
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        test('should handle write errors gracefully', () => {
            fs.existsSync.mockReturnValue(false);
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });
            console.error = jest.fn();
            const store = new SimpleStore({
                name: 'test',
                defaults: { test: 'default' }
            });
            store.set('test', 'new value');
            expect(console.error).toHaveBeenCalledWith('Failed to write to store:', expect.any(Error));
        });
    });
});

describe('resolveApiKey', () => {
    test('should return empty string if no providerId given', () => {
        const result = resolveApiKey('');
        expect(result).toBe('');
    });

    test('should return empty string if store is not initialized', () => {
        const result = resolveApiKey('some-id');
        expect(result).toBe('');
    });
});

describe('API key protection', () => {
    test('encrypts and decrypts API keys using Electron safeStorage', () => {
        const protectedValue = protectApiKey('secret-key');

        expect(protectedValue).toMatch(/^safe:v1:/);
        expect(unprotectApiKey(protectedValue)).toBe('secret-key');
    });

    test('only releases a stored key to its saved endpoint', () => {
        const encryptedKey = protectApiKey('secret-key');
        const settings = {
            providers: [{ id: 'p1', endpoint: 'https://api.example.com/v1/', apiKey: encryptedKey }]
        };

        expect(resolveProviderRequestFromSettings(settings, {
            providerId: 'p1',
            endpoint: 'https://api.example.com/v1',
            apiKey: '__MASKED__'
        })).toEqual({ endpoint: 'https://api.example.com/v1', apiKey: 'secret-key' });

        expect(resolveProviderRequestFromSettings(settings, {
            providerId: 'p1',
            endpoint: 'https://attacker.example/v1',
            apiKey: '__MASKED__'
        })).toEqual({ error: 'API endpoint does not match the saved provider' });
    });

    test('rejects non-HTTP API endpoints and embedded credentials', () => {
        expect(normalizeHttpEndpoint('file:///tmp/config')).toBe('');
        expect(normalizeHttpEndpoint('https://user:pass@example.com/v1')).toBe('');
    });
});
