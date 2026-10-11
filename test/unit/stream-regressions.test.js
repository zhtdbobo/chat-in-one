jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: jest.fn() }));
jest.mock('../../src/js/main/network', () => ({ fetchChatCompletionWithFallback: jest.fn() }));
jest.mock('../../src/js/main/store', () => ({
    getStore: jest.fn(), resolveProviderRequest: jest.fn(() => ({ endpoint: 'https://test.invalid/v1', apiKey: 'test' }))
}));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { getStore } = require('../../src/js/main/store');
const { fetchChatCompletionWithFallback: fetchRound } = require('../../src/js/main/network');
const { handleStreamRequest, stopStream, cleanupMcpClients } = require('../../src/js/main/stream');
const request = { requestId: 'r1', chatId: 'c1', providerId: 'p1', modelName: 'same-model', messages: [],
    stream: false, temperature: 0, top_p: 0.8, max_tokens: 123, mcpServerIds: ['mcp'] };
const toolCall = { id: 'tc1', type: 'function', function: { name: 'tool', arguments: '{"q":1}' } };
const jsonResponse = message => ({ url: 'https://test.invalid', response: { ok: true,
    json: async () => ({ choices: [{ message }], usage: { total_tokens: 12 } }) } });
const flush = async () => { for (let i=0; i<15; i++) await Promise.resolve(); };
let client, transport;
beforeEach(() => {
    jest.clearAllMocks();
    global.activeStreamControllers = [];
    client = { connect: jest.fn().mockResolvedValue(), listTools: jest.fn().mockResolvedValue({
        tools: [{ name: 'tool', description: 'test', inputSchema: { type: 'object' } }] }),
        callTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] }) };
    transport = { close: jest.fn().mockResolvedValue() };
    Client.mockImplementation(() => client);
    StdioClientTransport.mockImplementation(() => transport);
    getStore.mockReturnValue({ get: () => ({ mcpServers: [{ id: 'mcp', command: 'test', args: '' }] }) });
});
afterEach(cleanupMcpClients);

test('MCP JSON second round preserves zero temperature and output limit without overriding response format', async () => {
    fetchRound.mockResolvedValueOnce(jsonResponse({ content: 'checking', tool_calls: [toolCall] }))
        .mockResolvedValueOnce(jsonResponse({ content: 'final answer' }));
    const event = { reply: jest.fn() };
    await handleStreamRequest(event, request);
    const second = JSON.parse(fetchRound.mock.calls[1][1].body);
    expect(second).toMatchObject({ temperature: 0, top_p: 0.8, max_tokens: 123 });
    for (const [, options] of fetchRound.mock.calls) {
        const body = JSON.parse(options.body);
        expect(body).not.toHaveProperty('stream');
        expect(body).not.toHaveProperty('stream_options');
    }
    expect(second.messages[1]).toMatchObject({ role: 'assistant', content: 'checking', tool_calls: [toolCall] });
    expect(client.callTool).toHaveBeenCalledWith({ name: 'tool', arguments: { q: 1 } }, undefined,
        { signal: expect.any(AbortSignal) });
    expect(event.reply).toHaveBeenCalledWith('stream-chunk', expect.objectContaining({ content: 'final answer' }));
    for (const [, data] of event.reply.mock.calls) expect(data).toMatchObject({ requestId: 'r1', providerId: 'p1', chatId: 'c1', modelName: 'same-model' });
    expect(transport.close).toHaveBeenCalledTimes(1);
});

test('stop during a pending tool cancels it, closes transport and prevents the second round', async () => {
    fetchRound.mockResolvedValue(jsonResponse({ tool_calls: [toolCall] }));
    client.callTool.mockImplementation(() => new Promise(() => {}));
    const event = { reply: jest.fn() };
    const pending = handleStreamRequest(event, request);
    while (!client.callTool.mock.calls.length) await flush();
    stopStream(null, ['r1']);
    await pending;
    expect(fetchRound).toHaveBeenCalledTimes(1);
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(client.callTool.mock.calls[0][2].signal.aborted).toBe(true);
    expect(event.reply).toHaveBeenCalledWith('stream-end', expect.objectContaining({ requestId: 'r1', cancelled: true }));
    expect(event.reply).not.toHaveBeenCalledWith('stream-error', expect.anything());
});

test('stop during MCP connect returns promptly and closes the pending transport', async () => {
    client.connect.mockImplementation(() => new Promise(() => {}));
    const pending = handleStreamRequest({ reply: jest.fn() }, request);
    await flush();
    stopStream(null, ['r1']);
    await pending;
    expect(fetchRound).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalledTimes(1);
});

test('stop only aborts the captured IDs and retains a newer request', () => {
    const old = new AbortController(), next = new AbortController();
    old.requestId = 'old'; next.requestId = 'new';
    global.activeStreamControllers = [old, next];
    stopStream(null, ['old']);
    expect(old.signal.aborted).toBe(true);
    expect(next.signal.aborted).toBe(false);
    expect(global.activeStreamControllers).toEqual([next]);
});

test('stop before HTTP headers resolves without stream-start or stale content', async () => {
    fetchRound.mockImplementation(() => new Promise(() => {}));
    const event = { reply: jest.fn() };
    const pending = handleStreamRequest(event, { ...request, mcpServerIds: [] });
    await flush(); stopStream(null, ['r1']); await pending;
    expect(event.reply.mock.calls.map(([name]) => name)).toEqual(['stream-end']);
});

test('SSE fragmented tool calls, UTF-8 and a final line without newline work in both rounds', async () => {
    const sse = lines => {
        const bytes = new TextEncoder().encode(lines.join('\n'));
        let position = 0;
        return { url: 'https://test.invalid', response: { ok: true, body: { getReader: () => ({
            read: async () => { if (position >= bytes.length) return { done: true }; const value = bytes.slice(position,position+7); position+=7; return {done:false,value}; },
            releaseLock: jest.fn()
        }) } } };
    };
    fetchRound.mockResolvedValueOnce(sse([
        'data: '+JSON.stringify({choices:[{delta:{tool_calls:[{ index:0, function:{name:'tool',arguments:'{"q":'} }]}}]}),
        'data: '+JSON.stringify({choices:[{delta:{tool_calls:[{ index:0, id:'tc1', function:{arguments:'1}'} }]}}]})
    ])).mockResolvedValueOnce(sse([
        'data: '+JSON.stringify({ choices:[{delta:{content:'你好'}}] }),
        'data: '+JSON.stringify({ choices:[], usage:{total_tokens:9} })
    ]));
    const event = { reply: jest.fn() };
    await handleStreamRequest(event, { ...request, stream: true });
    expect(client.callTool.mock.calls[0][0]).toEqual({name:'tool',arguments:{q:1}});
    const secondBody = JSON.parse(fetchRound.mock.calls[1][1].body);
    expect(secondBody).toMatchObject({max_tokens:123});
    expect(secondBody).not.toHaveProperty('stream');
    expect(secondBody).not.toHaveProperty('stream_options');
    expect(event.reply).toHaveBeenCalledWith('stream-chunk', expect.objectContaining({content:'你好'}));
    expect(event.reply).toHaveBeenCalledWith('stream-end', expect.objectContaining({usage:{total_tokens:9}}));
});

test('API failure reports the request identity and never emits successful completion', async () => {
    fetchRound.mockResolvedValue({ url:'https://test.invalid', response:{ok:false,status:500,text:async()=> 'failed'} });
    const event={reply:jest.fn()};
    await handleStreamRequest(event,{...request,mcpServerIds:[]});
    expect(event.reply).toHaveBeenCalledWith('stream-error',expect.objectContaining({requestId:'r1',providerId:'p1',error:expect.stringContaining('500')}));
    expect(event.reply).not.toHaveBeenCalledWith('stream-end',expect.anything());
    expect(global.activeStreamControllers).toEqual([]);
});

test('shutdown cleanup waits for a transport already being closed by cancellation', async () => {
    fetchRound.mockResolvedValue(jsonResponse({tool_calls:[toolCall]}));
    client.callTool.mockImplementation(()=>new Promise(()=>{}));
    let finishClose;transport.close.mockImplementation(()=>new Promise(resolve=>finishClose=resolve));
    const pending=handleStreamRequest({reply:jest.fn()},request);
    while(!client.callTool.mock.calls.length) await flush();
    stopStream(null,['r1']);
    let closed=false;const cleanup=cleanupMcpClients().then(()=>{closed=true;});
    await flush();expect(closed).toBe(false);expect(transport.close).toHaveBeenCalledTimes(1);
    finishClose();await Promise.all([pending,cleanup]);expect(closed).toBe(true);
});

test('default sampling values stay omitted in both MCP rounds', async () => {
    fetchRound.mockResolvedValueOnce(jsonResponse({tool_calls:[toolCall]})).mockResolvedValueOnce(jsonResponse({content:'done'}));
    const defaults={...request};delete defaults.temperature;delete defaults.top_p;delete defaults.max_tokens;
    await handleStreamRequest({reply:jest.fn()},defaults);
    for(const [,options]of fetchRound.mock.calls){const body=JSON.parse(options.body);for(const key of ['temperature','top_p','max_tokens','n','presence_penalty','frequency_penalty','stream','stream_options'])expect(body).not.toHaveProperty(key);}
});

test.each(['max_completion_tokens','max_output_tokens'])('explicit output limits use %s in both MCP rounds', async parameter => {
    fetchRound.mockResolvedValueOnce(jsonResponse({tool_calls:[toolCall]})).mockResolvedValueOnce(jsonResponse({content:'done'}));
    await handleStreamRequest({reply:jest.fn()},{...request,max_tokens:16384,maxTokenParameter:parameter});
    for(const [,options]of fetchRound.mock.calls){const body=JSON.parse(options.body);expect(body[parameter]).toBe(16384);expect(body).not.toHaveProperty('max_tokens');}
});

function stalledSseReader(lines) {
    let index=0;
    const reader={read:jest.fn(()=>index<lines.length?Promise.resolve({done:false,value:new TextEncoder().encode(lines[index++])}):new Promise(()=>{})),cancel:jest.fn().mockResolvedValue(),releaseLock:jest.fn()};
    return {reader,response:{url:'https://test.invalid',response:{ok:true,body:{getReader:()=>reader}}}};
}

test('DONE terminates a response whose HTTP connection remains open and retains final usage', async () => {
    const {reader,response}=stalledSseReader([
        'data: '+JSON.stringify({choices:[{delta:{content:'hello'}}]})+'\n\n',
        'data: '+JSON.stringify({choices:[],usage:{total_tokens:10}})+'\n\ndata: [DONE]\n\n'
    ]);
    fetchRound.mockResolvedValue(response);const event={reply:jest.fn()};
    await handleStreamRequest(event,{...request,mcpServerIds:[]});
    expect(reader.read).toHaveBeenCalledTimes(2);expect(reader.cancel).toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith('stream-end',expect.objectContaining({usage:{total_tokens:10},totalDurationMs:expect.any(Number),firstTokenLatency:expect.any(Number)}));
});

function fragmentedBody(text) {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    const reader = { read: jest.fn(async () => {
        if (offset >= bytes.length) return { done: true };
        const value = bytes.slice(offset, offset + 3); offset += 3;
        return { done: false, value };
    }), cancel: jest.fn().mockResolvedValue(), releaseLock: jest.fn() };
    return { url: 'https://test.invalid', response: { ok: true,
        headers: { get: () => 'text/event-stream' }, body: { getReader: () => reader } } };
}

test('JSON is detected from fragmented body bytes even when headers and a legacy stream flag disagree', async () => {
    fetchRound.mockResolvedValue(fragmentedBody('\ufeff \n' + JSON.stringify({ model: 'returned-model',
        choices: [{ message: { content: '你好🙂', reasoning_content: '思考' }, finish_reason: 'length' }], usage: { total_tokens: 15 } })));
    const event = { reply: jest.fn() };
    await handleStreamRequest(event, { ...request, stream: true, mcpServerIds: [] });
    expect(event.reply).toHaveBeenCalledWith('stream-chunk', expect.objectContaining({ content: '你好🙂', reasoning_content: '思考' }));
    expect(event.reply).toHaveBeenCalledWith('stream-end', expect.objectContaining({ model: 'returned-model', finishReason: 'length', usage: { total_tokens: 15 }, warning: undefined }));
    expect(event.reply).not.toHaveBeenCalledWith('stream-error', expect.anything());
});

test.each(['sse-first', 'json-first'])('MCP independently detects each round when the service switches response format: %s', async format => {
    const sseTool = fragmentedBody('data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [toolCall] }, finish_reason: 'tool_calls' }] }) + '\n\ndata: [DONE]\n\n');
    const sseFinal = fragmentedBody('data: ' + JSON.stringify({ choices: [{ delta: { content: 'final🙂' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    fetchRound.mockResolvedValueOnce(format === 'sse-first' ? sseTool : jsonResponse({ tool_calls: [toolCall] }))
        .mockResolvedValueOnce(format === 'sse-first' ? fragmentedBody(JSON.stringify({ choices: [{ message: { content: 'final🙂' }, finish_reason: 'stop' }] })) : sseFinal);
    const event = { reply: jest.fn() };
    await handleStreamRequest(event, request);
    expect(client.callTool).toHaveBeenCalledTimes(1);
    expect(event.reply).toHaveBeenCalledWith('stream-chunk', expect.objectContaining({ content: 'final🙂' }));
    expect(event.reply).toHaveBeenCalledWith('stream-end', expect.objectContaining({ finishReason: 'stop', warning: undefined }));
    expect(event.reply).not.toHaveBeenCalledWith('stream-error', expect.anything());
});

test('a prematurely closed JSON body reports a parsing error and never successful completion', async () => {
    fetchRound.mockResolvedValue(fragmentedBody('{"choices":[{"message":{"content":"partial'));
    const event = { reply: jest.fn() };
    await handleStreamRequest(event, { ...request, mcpServerIds: [] });
    expect(event.reply).toHaveBeenCalledWith('stream-error', expect.objectContaining({ error: expect.stringContaining('无法解析的 JSON') }));
    expect(event.reply).not.toHaveBeenCalledWith('stream-end', expect.anything());
});

test('finish_reason length completes after a short grace period even without DONE or EOF', async () => {
    jest.useFakeTimers();
    try {
        const {response}=stalledSseReader(['data: '+JSON.stringify({choices:[{delta:{content:'partial'},finish_reason:'length'}]})+'\n\n']);
        fetchRound.mockResolvedValue(response);const event={reply:jest.fn()};
        const pending=handleStreamRequest(event,{...request,stream:true,mcpServerIds:[]});
        await jest.advanceTimersByTimeAsync(1100);await pending;
        expect(event.reply).toHaveBeenCalledWith('stream-end',expect.objectContaining({finishReason:'length'}));
        expect(event.reply).not.toHaveBeenCalledWith('stream-error',expect.anything());
    }finally{jest.useRealTimers();}
});

test('idle stream times out as an error while preserving buffered output', async () => {
    jest.useFakeTimers();
    try {
        const {response}=stalledSseReader(['data: '+JSON.stringify({choices:[{delta:{content:'partial'}}]})+'\n\n']);
        fetchRound.mockResolvedValue(response);const event={reply:jest.fn()};
        const pending=handleStreamRequest(event,{...request,stream:true,mcpServerIds:[]});
        await jest.advanceTimersByTimeAsync(180001);await pending;
        expect(event.reply).toHaveBeenCalledWith('stream-chunk',expect.objectContaining({content:'partial'}));
        expect(event.reply).toHaveBeenCalledWith('stream-error',expect.objectContaining({error:expect.stringContaining('未返回数据')}));
        expect(event.reply).not.toHaveBeenCalledWith('stream-end',expect.objectContaining({cancelled:true}));
    }finally{jest.useRealTimers();}
});

test('HTTP 200 SSE error frames are reported instead of silently treated as successful EOF', async () => {
    const {response}=stalledSseReader(['data: '+JSON.stringify({error:{message:'context limit'}})+'\n\n']);
    fetchRound.mockResolvedValue(response);const event={reply:jest.fn()};
    await handleStreamRequest(event,{...request,stream:true,mcpServerIds:[]});
    expect(event.reply).toHaveBeenCalledWith('stream-error',expect.objectContaining({error:expect.stringContaining('context limit')}));
});

test('total elapsed time includes tool execution while first fragment timing is preserved across rounds', async () => {
    jest.useFakeTimers();
    try {
        fetchRound.mockResolvedValueOnce(jsonResponse({content:'first',tool_calls:[toolCall]})).mockResolvedValueOnce(jsonResponse({content:'final'}));
        client.callTool.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({content:[]}),1000)));
        const event={reply:jest.fn()},pending=handleStreamRequest(event,request);
        await jest.advanceTimersByTimeAsync(1001);await pending;
        const data=event.reply.mock.calls.find(([name])=>name==='stream-end')[1];
        expect(data.firstTokenLatency).toBe(0);expect(data.totalDurationMs).toBeGreaterThanOrEqual(1000);
    }finally{jest.useRealTimers();}
});
