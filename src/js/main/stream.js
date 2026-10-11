const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { fetchChatCompletionWithFallback } = require('./network');
const { getStore, resolveProviderRequest } = require('./store');

const { buildSamplingRequestConfig } = require('../modelParameters');
const { MessageTextBuffer } = require('../longText');
const configuredTimeout = Number(process.env.CHAT_IN_ONE_STREAM_IDLE_TIMEOUT_MS);
const STREAM_IDLE_TIMEOUT_MS = configuredTimeout > 0 && Number.isFinite(configuredTimeout) ? configuredTimeout : 180000;


const activeMcpSessions = new Set();

async function closeMcpSession(session) {
    if (!session) return;
    if (session.closePromise) return session.closePromise;
    session.closed = true;
    session.signal?.removeEventListener('abort', session.onAbort);
    session.closePromise = (async () => {
        await Promise.all(session.clients.map(async entry => {
            try { await entry.transport?.close(); }
            catch (error) { console.error('Error closing MCP transport:', error); }
        }));
        activeMcpSessions.delete(session);
    })();
    return session.closePromise;
}

async function cleanupMcpClients() {
    await Promise.all(Array.from(activeMcpSessions, closeMcpSession));
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        const error = new Error('已停止生成');
        error.name = 'AbortError';
        throw error;
    }
}

// Race even non-cooperative transports against cancellation, while observing late rejections.
async function withAbort(action, signal) {
    throwIfAborted(signal);
    let onAbort;
    const cancellation = new Promise((_, reject) => {
        onAbort = () => {
            const error = new Error('已停止生成');
            error.name = 'AbortError';
            reject(error);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
    try {
        return await Promise.race([Promise.resolve().then(() => {
            throwIfAborted(signal);
            return action();
        }), cancellation]);
    } finally {
        signal?.removeEventListener('abort', onAbort);
    }
}

async function getMcpTools(servers, signal) {
    const allTools = [];
    const session = { clients: [], toolNameToServerMap: new Map(), closed: false, signal };
    session.onAbort = () => { void closeMcpSession(session); };
    activeMcpSessions.add(session);
    signal?.addEventListener('abort', session.onAbort, { once: true });
    try {
        throwIfAborted(signal);
        for (const server of servers) {
            throwIfAborted(signal);
            if (!server.command) continue;
            let entry;
            try {
                const transport = new StdioClientTransport({
                    command: server.command,
                    args: (server.args || '').split(',').map(a => a.trim()).filter(Boolean)
                });
                const client = new Client({ name: 'chat-in-one-client', version: '1.0.0' }, { capabilities: {} });
                entry = { id: server.id, client, transport };
                // Register before connect so stopping an in-flight connection can close it.
                session.clients.push(entry);
                await withAbort(() => client.connect(transport), signal);
                const result = await withAbort(() => client.listTools(undefined, { signal }), signal);
                throwIfAborted(signal);
                for (const tool of result.tools) {
                    if (session.toolNameToServerMap.has(tool.name)) {
                        console.warn('Skipping duplicate MCP tool name:', tool.name);
                        continue;
                    }
                    session.toolNameToServerMap.set(tool.name, server.id);
                    allTools.push({ ...tool, serverId: server.id });
                }
            } catch (error) {
                if (signal?.aborted || error.name === 'AbortError') throw error;
                console.error('Failed to connect to MCP server ' + server.name + ':', error);
                if (entry) {
                    session.clients = session.clients.filter(c => c !== entry);
                    await entry.transport.close().catch(() => {});
                }
            }
        }
        return { tools: allTools, session };
    } catch (error) {
        await closeMcpSession(session);
        throw error;
    }
}

function buildModelRequestConfig(modelName, req = {}) {
    return buildSamplingRequestConfig(modelName, req);
}

// A deadline applies to inactivity, not the full duration of a long generation.
async function withReadTimeout(action, controller) {
    const timer = setTimeout(() => {
        const reason = new Error('服务端连续 ' + Math.round(STREAM_IDLE_TIMEOUT_MS / 1000) + ' 秒未返回数据，连接已停止。已收到的内容已保留，可稍后继续。');
        reason.name = 'TimeoutError'; controller.abort(reason);
    }, STREAM_IDLE_TIMEOUT_MS);
    try { return await withAbort(action, controller.signal); }
    finally { clearTimeout(timer); }
}
function createStreamEmitter(reply) {
    let content = [], reasoning = [], length = 0, timer, firstTokenLatency;
    function flush() {
        clearTimeout(timer); timer = null;
        if (length) reply('stream-chunk', { ...(content.length ? {content:content.join('')} : {}),
            ...(reasoning.length ? {reasoning_content:reasoning.join('')} : {}), firstTokenLatency });
        content = []; reasoning = []; length = 0;
    }
    function emit(channel, data = {}) {
        if (channel !== 'stream-chunk' || data.tool_call || (!data.content && !data.reasoning_content)) { flush(); reply(channel, data); return; }
        if (data.content) { content.push(data.content); length += data.content.length; }
        if (data.reasoning_content) { reasoning.push(data.reasoning_content); length += data.reasoning_content.length; }
        firstTokenLatency ??= data.firstTokenLatency;
        if (length >= 4096) flush();
        else if (!timer) timer = setTimeout(flush, 32);
    }
    return { emit, flush };
}
// Honor application-level terminal signals even when a proxy leaves HTTP open.
async function consumeResponse(response, reply, controller, enableThinking, modelName, startTime) {
    const signal = controller.signal;
    const result = { toolCalls: [], usage: null, model: modelName, firstTokenLatency: null, finishReason: null };
    const content = new MessageTextBuffer(), reasoning = new MessageTextBuffer();
    let doneMarker = false, terminalDeadline = null;
    function processFrame(parsed, partial) {
        if (parsed.error) throw new Error('服务端错误：' + (parsed.error.message || (typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error))));
        if (parsed.model) result.model = parsed.model;
        if (parsed.usage) result.usage = parsed.usage;
        const choice = parsed.choices?.[0];
        if (choice?.finish_reason) { result.finishReason = choice.finish_reason; terminalDeadline ??= Date.now() + 1000; }
        const message = partial ? choice?.delta : choice?.message;
        if (!message) return;
        if (result.firstTokenLatency == null && (message.content || (enableThinking !== false && message.reasoning_content))) result.firstTokenLatency = Date.now() - startTime;
        if (message.reasoning_content) {
            reasoning.append(message.reasoning_content);
            if (enableThinking !== false) reply('stream-chunk', { reasoning_content:message.reasoning_content, firstTokenLatency:result.firstTokenLatency });
        }
        if (message.content) { content.append(message.content); reply('stream-chunk', {content:message.content, firstTokenLatency:result.firstTokenLatency}); }
        for (const [position, tc] of (message.tool_calls || []).entries()) {
            const index = partial ? (tc.index ?? position) : position;
            const call = result.toolCalls[index] ||= { id: '', name: '', args: '' };
            if (tc.id) call.id = tc.id;
            if (tc.function?.name) call.name += tc.function.name;
            if (tc.function?.arguments) call.args += tc.function.arguments;
        }
    }
    if (!response.body?.getReader) {
        const parsed = await withReadTimeout(() => response.json(), controller);
        throwIfAborted(signal); processFrame(parsed, false);
    } else {
        const reader = response.body.getReader(), decoder = new TextDecoder('utf-8'); let buffer = '';
        const jsonBody = new MessageTextBuffer(); let format;
        function processLine(line) {
            if (doneMarker) return;
            throwIfAborted(signal); let data = line.trim();
            if (data.startsWith('data:')) data = data.slice(5).trim();
            if (data === '[DONE]') { doneMarker = true; return; }
            if (!data || !data.startsWith('{')) return;
            let parsed;
            try { parsed = JSON.parse(data); }
            catch (_) { throw new Error('服务端返回了无法解析的回复片段，已收到的内容已保留。'); }
            processFrame(parsed, true);
        }
        try {
            while (!doneMarker) {
                let completionTimer;
                const packet = await withReadTimeout(async () => {
                    try {
                        const read = reader.read();
                        return terminalDeadline ? await Promise.race([read, new Promise(resolve => {
                            completionTimer = setTimeout(() => resolve({done:true}), Math.max(0, terminalDeadline - Date.now()));
                        })]) : await read;
                    } finally { clearTimeout(completionTimer); }
                }, controller);
                throwIfAborted(signal);
                const decoded = packet.done ? decoder.decode() : decoder.decode(packet.value, {stream:true});
                if (format === 'json') jsonBody.append(decoded);
                else {
                    buffer += decoded;
                    const first = buffer.trimStart()[0];
                    if (!format && first) {
                        format = first === '{' || first === '[' ? 'json' : 'sse';
                        if (format === 'json') { jsonBody.append(buffer); buffer = ''; }
                    }
                }
                if (format === 'json') {
                    if (packet.done) {
                        let parsed;
                        try { parsed = JSON.parse(jsonBody.text()); }
                        catch (_) { throw new Error('服务端返回了无法解析的 JSON 回复。'); }
                        processFrame(parsed, false); break;
                    }
                    continue;
                }
                const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''; lines.forEach(processLine);
                if (packet.done) { if (buffer.trim()) processLine(buffer); break; }
            }
        } finally {
            try { void reader.cancel?.().catch(() => {}); } catch (_) {}
            try { reader.releaseLock?.(); } catch (_) {}
        }
        // A single JSON reply completes when its HTTP body ends.
        if (format !== 'json' && !doneMarker && !result.finishReason) result.warning = '服务端连接已结束，但未提供完成标记，回答可能不完整。已收到的内容已保留。';
    }
    result.content = content.text(); result.reasoning = reasoning.text(); result.toolCalls = result.toolCalls.filter(Boolean);
    return result;
}

async function handleStreamRequest(event, requestData) {
    const requestStartedAt = Date.now();
    let firstTokenLatency = null;
    const { endpoint: requestedEndpoint, apiKey, modelName, systemPrompt, messages, chatId, requestId,
        enableThinking, temperature, top_p, max_tokens, maxTokenParameter, mcpServerIds, providerId } = requestData;
    const reply = (channel, data = {}) => event.reply(channel, { chatId, requestId, providerId, modelName, ...data });
    const emitter = createStreamEmitter(reply);
    const controller = new AbortController();
    controller.requestId = requestId;
    global.activeStreamControllers ||= [];
    global.activeStreamControllers.push(controller);
    let mcpSession;
    try {
        const credentials = resolveProviderRequest({ providerId, endpoint: requestedEndpoint, apiKey });
        if (credentials.error) throw new Error(credentials.error);
        const { endpoint, apiKey: resolvedApiKey } = credentials;
        let tools = [];
        const requestedMcpIds = new Set(Array.isArray(mcpServerIds) ? mcpServerIds.map(String) : []);
        if (requestedMcpIds.size) {
            const configuredServers = getStore()?.get('settings')?.mcpServers || [];
            const selectedServers = configuredServers.filter(server => requestedMcpIds.has(String(server.id)));
            const mcpResult = await getMcpTools(selectedServers, controller.signal);
            tools = mcpResult.tools;
            mcpSession = mcpResult.session;
        }
        throwIfAborted(controller.signal);
        const apiMessages = [{ role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))];
        const outputTokenKey = ['max_tokens', 'max_completion_tokens', 'max_output_tokens'].includes(maxTokenParameter)
            ? maxTokenParameter : 'max_tokens';
        const body = {
            model: modelName, messages: apiMessages,
            ...buildModelRequestConfig(modelName, { temperature, top_p, enableThinking }),
            ...(max_tokens > 0 ? { [outputTokenKey]: max_tokens } : {})
        };
        if (tools.length) {
            body.tools = tools.map(t => ({ type: 'function', function: {
                name: t.name, description: t.description, parameters: t.inputSchema
            } }));
            body.tool_choice = 'auto';
        }
        async function fetchRound(roundBody) {
            throwIfAborted(controller.signal);
            const { response, url } = await withReadTimeout(() => fetchChatCompletionWithFallback(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resolvedApiKey },
                body: JSON.stringify(roundBody)
            }, controller), controller);
            throwIfAborted(controller.signal);
            if (!response.ok) {
                const errorBody = await withReadTimeout(() => response.text(), controller);
                throw new Error('API Error: ' + response.status + ' - ' + errorBody + ' (' + url + ')');
            }
            return response;
        }
        const startTime = requestStartedAt;
        const response = await fetchRound(body);
        reply('stream-start');
        let result = await consumeResponse(response, emitter.emit, controller, enableThinking, modelName, startTime);
        firstTokenLatency ??= result.firstTokenLatency;
        emitter.flush();
        if (result.toolCalls.length) {
            emitter.emit('stream-chunk', { tool_call: 'calling' });
            const toolResults = [];
            for (const call of result.toolCalls) {
                throwIfAborted(controller.signal);
                const serverId = mcpSession?.toolNameToServerMap.get(call.name);
                const entry = mcpSession?.clients.find(c => c.id === serverId);
                let content;
                try {
                    if (!entry) throw new Error('未找到工具 ' + call.name + ' 对应的 MCP 服务器');
                    const toolResult = await withAbort(() => entry.client.callTool({
                        name: call.name, arguments: JSON.parse(call.args || '{}')
                    }, undefined, { signal: controller.signal }), controller.signal);
                    content = JSON.stringify(toolResult.content);
                } catch (error) {
                    if (controller.signal.aborted || error.name === 'AbortError') throw error;
                    content = 'Error: ' + error.message;
                }
                toolResults.push({ role: 'tool', tool_call_id: call.id, content });
            }
            throwIfAborted(controller.signal);
            const assistant = { role: 'assistant', content: result.content || null,
                tool_calls: result.toolCalls.map(call => ({ id: call.id, type: 'function',
                    function: { name: call.name, arguments: call.args || '{}' } })) };
            if (result.reasoning) assistant.reasoning_content = result.reasoning;
            // Preserve sampling and output limits; each response decides its own format.
            const finalBody = { ...body, messages: [...apiMessages, assistant, ...toolResults] };
            delete finalBody.tools;
            delete finalBody.tool_choice;
            const finalResponse = await fetchRound(finalBody);
            reply('stream-chunk', { tool_call: 'responding' });
            result = await consumeResponse(finalResponse, emitter.emit, controller, enableThinking, modelName, requestStartedAt);
        }
        throwIfAborted(controller.signal);
        emitter.flush();
        firstTokenLatency ??= result.firstTokenLatency;
        const end = new Date();
        const time = String(end.getMonth() + 1).padStart(2, '0') + '-' + String(end.getDate()).padStart(2, '0') + ' ' +
            String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
        reply('stream-end', { usage: result.usage, model: result.model, firstTokenLatency, totalDurationMs:Date.now() - requestStartedAt, finishReason:result.finishReason, warning:result.warning, time });
    } catch (error) {
        emitter.flush();
        if (controller.signal.aborted && controller.signal.reason?.name === 'TimeoutError') reply('stream-error', {error:controller.signal.reason.message, totalDurationMs:Date.now() - requestStartedAt});
        else if (controller.signal.aborted || error.name === 'AbortError') reply('stream-end', {cancelled:true, totalDurationMs:Date.now() - requestStartedAt});
        else reply('stream-error', {error:error.message, totalDurationMs:Date.now() - requestStartedAt});
    } finally {
        global.activeStreamControllers = (global.activeStreamControllers || []).filter(c => c !== controller);
        await closeMcpSession(mcpSession);
    }
}

function stopStream(event, requestIds) {
    const ids = Array.isArray(requestIds) ? new Set(requestIds) : null;
    const controllers = global.activeStreamControllers || [];
    for (const controller of controllers) {
        if (!ids || ids.has(controller.requestId)) controller.abort();
    }
    global.activeStreamControllers = controllers.filter(c => ids && !ids.has(c.requestId));
    return true;
}

module.exports = { handleStreamRequest, stopStream, getMcpTools, buildModelRequestConfig, cleanupMcpClients };
