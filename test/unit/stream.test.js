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
        test('omits sampling parameters when using server defaults', () => {
            expect(buildModelRequestConfig('unknown-model')).toEqual({});
        });
        test('kimi-k2.6 keeps the thinking option without forcing sampling defaults', () => {
            expect(buildModelRequestConfig('kimi-k2.6')).toEqual({ thinking: { type: 'enabled' } });
        });
        test.each(['kimi-k2-thinking-v1', 'kimi-k2-v1', 'moonshot-v1'])('%s uses server sampling defaults', model => {
            expect(buildModelRequestConfig(model)).toEqual({});
        });
        test('preserves explicit temperature and top_p values', () => {
            expect(buildModelRequestConfig('unknown-model', { temperature: 0.5, top_p: 0.8 })).toEqual({ temperature: 0.5, top_p: 0.8 });
        });
        test('disabled thinking does not send a thinking parameter', () => {
            expect(buildModelRequestConfig('kimi-k2.6', { enableThinking: false })).toEqual({});
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
