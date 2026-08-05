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

const { buildModelRequestConfig, handleStreamRequest, stopStream } = require('../../src/js/main/stream');
const { fetchChatCompletionWithFallback } = require('../../src/js/main/network');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

describe('Stream Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.activeStreamControllers = [];
    });

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
            // When thinking is disabled, the thinking parameter should not be sent
            // to maintain compatibility with endpoints that don't support it
            expect(config).toEqual({
                top_p: 0.95,
                n: 1,
                presence_penalty: 0,
                frequency_penalty: 0
            });
            expect(config.thinking).toBeUndefined();
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

    describe('handleStreamRequest', () => {
        const baseRequest = {
            endpoint: 'https://api.example.com/v1',
            providerId: 'provider-1',
            modelName: 'test-model',
            systemPrompt: 'system',
            messages: [],
            chatId: 'chat-1',
            apiKey: 'test-key',
            stream: false
        };

        test('parses non-streaming JSON responses', async () => {
            fetchChatCompletionWithFallback.mockResolvedValue({
                url: 'https://api.example.com/v1/chat/completions',
                response: {
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue({
                        model: 'test-model',
                        choices: [{ message: { content: 'plain JSON answer' } }],
                        usage: { total_tokens: 12 }
                    })
                }
            });
            const event = { reply: jest.fn() };

            await handleStreamRequest(event, baseRequest);

            expect(event.reply).toHaveBeenCalledWith('stream-chunk', expect.objectContaining({
                chatId: 'chat-1',
                content: 'plain JSON answer'
            }));
            expect(event.reply).toHaveBeenCalledWith('stream-end', expect.objectContaining({
                chatId: 'chat-1',
                usage: { total_tokens: 12 }
            }));
        });

        test('ignores renderer-supplied MCP command objects', async () => {
            fetchChatCompletionWithFallback.mockResolvedValue({
                url: 'https://api.example.com/v1/chat/completions',
                response: {
                    ok: true,
                    status: 200,
                    json: jest.fn().mockResolvedValue({
                        choices: [{ message: { content: 'safe' } }]
                    })
                }
            });
            const event = { reply: jest.fn() };

            await handleStreamRequest(event, {
                ...baseRequest,
                mcpServers: [{ id: 'evil', command: 'powershell.exe', args: '-Command,calc' }]
            });

            expect(StdioClientTransport).not.toHaveBeenCalled();
        });
    });
});
