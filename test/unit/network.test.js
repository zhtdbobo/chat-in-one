const { buildChatCompletionCandidates, fetchChatCompletionWithFallback } = require('../../src/js/main/network');

describe('Network Module', () => {
    describe('buildChatCompletionCandidates', () => {
        test('should return empty array for empty endpoint', () => {
            const result = buildChatCompletionCandidates('');
            expect(result).toEqual([]);
        });

        test('should return empty array for null endpoint', () => {
            const result = buildChatCompletionCandidates(null);
            expect(result).toEqual([]);
        });

        test('should return empty array for undefined endpoint', () => {
            const result = buildChatCompletionCandidates(undefined);
            expect(result).toEqual([]);
        });

        test('should handle full chat completions URL', () => {
            const endpoint = 'https://api.openai.com/v1/chat/completions';
            const result = buildChatCompletionCandidates(endpoint);
            expect(result).toContain('https://api.openai.com/v1/chat/completions');
            expect(result).toContain('https://api.openai.com/v1/chat/completions');
            expect(result).toContain('https://api.openai.com/v1/completions');
            expect(result).toContain('https://api.openai.com/v1/complete');
            expect(result).toContain('https://api.openai.com/chat/completions');
            expect(result).toContain('https://api.openai.com/completions');
            expect(result).toContain('https://api.openai.com/complete');
        });

        test('should handle short endpoint with v1', () => {
            const endpoint = 'https://api.openai.com/v1';
            const result = buildChatCompletionCandidates(endpoint);
            expect(result).toContain('https://api.openai.com/v1/chat/completions');
            expect(result).toContain('https://api.openai.com/v1/completions');
            expect(result).toContain('https://api.openai.com/v1/complete');
        });

        test('should handle short endpoint without v1', () => {
            const endpoint = 'https://api.openai.com';
            const result = buildChatCompletionCandidates(endpoint);
            expect(result).toContain('https://api.openai.com/v1/chat/completions');
            expect(result).toContain('https://api.openai.com/chat/completions');
            expect(result).toContain('https://api.openai.com/v1/completions');
            expect(result).toContain('https://api.openai.com/completions');
            expect(result).toContain('https://api.openai.com/v1/complete');
            expect(result).toContain('https://api.openai.com/complete');
        });
    });

    describe('fetchChatCompletionWithFallback', () => {
        // 模拟fetch函数
        const originalFetch = global.fetch;

        beforeEach(() => {
            global.fetch = jest.fn();
        });

        afterAll(() => {
            global.fetch = originalFetch;
        });

        test('should throw error for empty candidates', async () => {
            await expect(fetchChatCompletionWithFallback('')).rejects.toThrow('Invalid endpoint');
        });

        test('should return first successful response', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue('{}')
            };
            global.fetch.mockResolvedValue(mockResponse);

            const result = await fetchChatCompletionWithFallback('https://api.openai.com');
            expect(result.response).toBe(mockResponse);
            expect(result.url).toBeDefined();
        });

        test('should try next candidate on 404 error', async () => {
            const mock404Response = {
                ok: false,
                status: 404,
                text: jest.fn().mockResolvedValue('Not Found')
            };
            const mockSuccessResponse = {
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue('{}')
            };
            global.fetch.mockResolvedValueOnce(mock404Response).mockResolvedValueOnce(mockSuccessResponse);

            const result = await fetchChatCompletionWithFallback('https://api.openai.com');
            expect(result.response).toBe(mockSuccessResponse);
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        test('should throw error if all candidates fail', async () => {
            const mockError = new Error('Network error');
            global.fetch.mockRejectedValue(mockError);

            await expect(fetchChatCompletionWithFallback('https://api.openai.com')).rejects.toThrow('Network error');
        });

        test('should respect AbortController signal', async () => {
            const controller = new AbortController();
            const mockResponse = {
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue('{}')
            };
            global.fetch.mockResolvedValue(mockResponse);

            const result = await fetchChatCompletionWithFallback('https://api.openai.com', {}, controller);
            expect(result.response).toBe(mockResponse);
        });
    });
});