// 模拟electron的app对象
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('C:\\test\\userData')
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
const { SimpleStore, parseDataFile } = require('../../src/js/main/store');

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