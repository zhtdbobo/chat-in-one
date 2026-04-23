// 模拟@modelcontextprotocol/sdk模块
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(),
        listTools: jest.fn().mockResolvedValue({
            tools: []
        }),
        callTool: jest.fn().mockResolvedValue({ content: 'Tool result' })
    }))
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: jest.fn().mockImplementation(() => ({
        close: jest.fn().mockResolvedValue()
    }))
}));

// 模拟network模块
jest.mock('../../src/js/main/network', () => ({
    fetchChatCompletionWithFallback: jest.fn()
}));

const { buildModelRequestConfig, stopStream } = require('../../src/js/main/stream');
const { fetchChatCompletionWithFallback } = require('../../src/js/main/network');

describe('Stream Module', () => {
    describe('buildModelRequestConfig', () => {
        test('should return default config for unknown model', () => {
            const config = buildModelRequestConfig('unknown-model');
            expect(config).toEqual({
                temperature: 0.7,
                top_p: 1,
                n: 1
            });
        });

        test('should return config for kimi-k2.6 model', () => {
            const config = buildModelRequestConfig('kimi-k2.6');
            expect(config).toEqual({
                top_p: 0.95,
                n: 1,
                presence_penalty: 0,
                frequency_penalty: 0,
                thinking: { type: 'enabled' }
            });
        });

        test('should return config for kimi-k2-thinking model', () => {
            const config = buildModelRequestConfig('kimi-k2-thinking-v1');
            expect(config).toEqual({
                temperature: 1.0,
                top_p: 1.0,
                n: 1
            });
        });

        test('should return config for kimi-k2 model', () => {
            const config = buildModelRequestConfig('kimi-k2-v1');
            expect(config).toEqual({
                temperature: 0.6,
                top_p: 1.0,
                n: 1
            });
        });

        test('should return config for moonshot-v1 model', () => {
            const config = buildModelRequestConfig('moonshot-v1');
            expect(config).toEqual({
                temperature: 0.0,
                top_p: 1.0,
                n: 1
            });
        });

        test('should use provided temperature and top_p values', () => {
            const config = buildModelRequestConfig('unknown-model', {
                temperature: 0.5,
                top_p: 0.8
            });
            expect(config).toEqual({
                temperature: 0.5,
                top_p: 0.8,
                n: 1
            });
        });

        test('should handle disabled thinking for kimi-k2.6', () => {
            const config = buildModelRequestConfig('kimi-k2.6', {
                enableThinking: false
            });
            expect(config.thinking.type).toBe('disabled');
        });
    });

    describe('stopStream', () => {
        test('should clear active stream controllers', () => {
            const mockAbort1 = jest.fn();
            const mockAbort2 = jest.fn();
            global.activeStreamControllers = [
                { abort: mockAbort1 },
                { abort: mockAbort2 }
            ];
            
            const result = stopStream();
            
            expect(global.activeStreamControllers).toEqual([]);
            expect(mockAbort1).toHaveBeenCalled();
            expect(mockAbort2).toHaveBeenCalled();
            expect(result).toBe(true);
        });

        test('should handle null active stream controllers', () => {
            global.activeStreamControllers = null;
            
            const result = stopStream();
            
            expect(result).toBe(true);
        });

        test('should handle empty active stream controllers', () => {
            global.activeStreamControllers = [];
            
            const result = stopStream();
            
            expect(result).toBe(true);
        });
    });
});