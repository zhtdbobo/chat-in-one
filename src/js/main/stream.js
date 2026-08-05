const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { fetchChatCompletionWithFallback } = require('./network');
const { getStore, resolveProviderRequest } = require('./store');

const activeMcpSessions = new Set();

async function closeMcpSession(session) {
    if (!session || session.closed) return;
    session.closed = true;
    for (const clientEntry of session.clients) {
        try {
            await clientEntry.transport?.close();
        } catch (closeErr) {
            console.error('Error closing MCP transport:', closeErr);
        }
    }
    activeMcpSessions.delete(session);
}

async function cleanupMcpClients() {
    await Promise.all(Array.from(activeMcpSessions, closeMcpSession));
}

async function getMcpTools(servers) {
    const allTools = [];
    const session = {
        clients: [],
        toolNameToServerMap: new Map(),
        closed: false
    };
    activeMcpSessions.add(session);

    for (const server of servers) {
        if (!server.command) continue;
        let transport = null;
        let client = null;
        try {
            transport = new StdioClientTransport({
                command: server.command,
                args: (server.args || '').split(',').map(a => a.trim())
            });
            client = new Client({ name: "chat-in-one-client", version: "1.0.0" }, { capabilities: {} });
            await client.connect(transport);
            const tools = await client.listTools();
            for (const t of tools.tools) {
                if (session.toolNameToServerMap.has(t.name)) {
                    console.warn(`Skipping duplicate MCP tool name: ${t.name}`);
                    continue;
                }
                session.toolNameToServerMap.set(t.name, server.id);
                allTools.push({ ...t, serverId: server.id });
            }
            session.clients.push({ id: server.id, client, transport });
        } catch (e) {
            console.error(`Failed to connect to MCP server ${server.name}:`, e);
            // 清理资源
            if (transport) {
                try {
                    await transport.close();
                } catch (closeErr) {
                    console.error(`Error closing MCP transport:`, closeErr);
                }
            }
        }
    }
    return { tools: allTools, session };
}

function buildModelRequestConfig(modelName, req = {}) {
    const model = String(modelName || '').trim().toLowerCase();
    const cfg = {
        temperature: req.temperature,
        top_p: req.top_p,
        n: 1
    };

    // Moonshot Kimi k2.6: fixed sampling params + thinking control.
    if (model === 'kimi-k2.6') {
        delete cfg.temperature;
        cfg.top_p = 0.95;
        cfg.n = 1;
        cfg.presence_penalty = 0;
        cfg.frequency_penalty = 0;
        if (req.enableThinking === false) {
            // 不发送 thinking 参数，兼容不支持 thinking 的 API 端点
        } else {
            cfg.thinking = { type: 'enabled' };
        }
        return cfg;
    }

    if (model.startsWith('kimi-k2-thinking')) {
        cfg.temperature = (req.temperature != null ? req.temperature : 1.0);
        cfg.top_p = 1.0;
        return cfg;
    }

    if (model.startsWith('kimi-k2')) {
        cfg.temperature = (req.temperature != null ? req.temperature : 0.6);
        cfg.top_p = 1.0;
        return cfg;
    }

    if (model.startsWith('moonshot-v1')) {
        cfg.temperature = (req.temperature != null ? req.temperature : 0.0);
        cfg.top_p = 1.0;
        return cfg;
    }

    // Generic OpenAI-compatible fallback.
    cfg.temperature = (req.temperature != null ? req.temperature : 0.7);
    cfg.top_p = (req.top_p != null ? req.top_p : 1);
    return cfg;
}

async function handleStreamRequest(event, requestData) {
    const { endpoint: requestedEndpoint, apiKey, modelName, systemPrompt, messages, chatId, enableThinking, temperature, top_p, max_tokens, stream, mcpServerIds, providerId } = requestData;

    const credentials = resolveProviderRequest({ providerId, endpoint: requestedEndpoint, apiKey });
    if (credentials.error) {
        event.reply('stream-error', { chatId, modelName, error: credentials.error });
        return;
    }
    const { endpoint, apiKey: resolvedApiKey } = credentials;

    let thisController;
    let mcpSession = null;
    try {
        // Create AbortController for this stream and register it
        thisController = new AbortController();
        if (!global.activeStreamControllers) global.activeStreamControllers = [];
        global.activeStreamControllers.push(thisController);

        let tools = [];
        const requestedMcpIds = Array.isArray(mcpServerIds) ? new Set(mcpServerIds.map(String)) : new Set();
        if (requestedMcpIds.size > 0) {
            const configuredServers = getStore()?.get('settings')?.mcpServers || [];
            const selectedServers = configuredServers.filter(server => requestedMcpIds.has(String(server.id)));
            const mcpResult = await getMcpTools(selectedServers);
            tools = mcpResult.tools;
            mcpSession = mcpResult.session;
        }

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const modelConfig = buildModelRequestConfig(modelName, {
            temperature,
            top_p,
            enableThinking
        });

        const body = {
            model: modelName,
            messages: apiMessages,
            stream: stream !== false,
            ...modelConfig,
            max_tokens: max_tokens || undefined
        };

        if (body.stream) {
            body.stream_options = { include_usage: true };
        }


        if (tools.length > 0) {
            body.tools = tools.map(t => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema
                }
            }));
            body.tool_choice = "auto";
        }

        const streamStartTime = Date.now();
        const { response, url: usedUrl } = await fetchChatCompletionWithFallback(
            endpoint,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedApiKey}`
                },
                body: JSON.stringify(body)
            },
            thisController
        );

        if (!response.ok) {
            const errStr = await response.text();
            event.reply('stream-error', { chatId, modelName, error: `API Error: ${response.status} - ${errStr}`, url: usedUrl });
            return;
        }

        const decoder = new TextDecoder('utf-8');

        event.reply('stream-start', { chatId, modelName });

        let toolCalls = [];
        let firstTokenLatency = null;
        let lastUsage = null;
        let lastModel = modelName;

        if (body.stream) {
            const reader = response.body.getReader();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (buffer.trim()) processSSELine(buffer, true);
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                    processSSELine(line);
                }
            }
        } else {
            const parsed = await response.json();
            const message = parsed.choices?.[0]?.message || {};
            lastModel = parsed.model || modelName;
            lastUsage = parsed.usage || null;
            if (message.reasoning_content && enableThinking !== false) {
                event.reply('stream-chunk', { chatId, modelName, reasoning_content: message.reasoning_content });
            }
            if (message.content) {
                event.reply('stream-chunk', { chatId, modelName, content: message.content });
            }
            if (message.reasoning_content || message.content) {
                firstTokenLatency = Date.now() - streamStartTime;
            }
            toolCalls = (message.tool_calls || []).map((tc) => ({
                id: tc.id,
                name: tc.function?.name || '',
                args: tc.function?.arguments || '{}'
            }));
        }

        function processSSELine(line, isFinal = false) {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // Check for DONE before extracting data
            if (trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') {
                return;
            }

            let dataStr = '';
            if (trimmedLine.startsWith('data: ')) {
                dataStr = trimmedLine.substring(6).trim();
            } else if (trimmedLine.startsWith('data:')) {
                dataStr = trimmedLine.substring(5).trim();
            } else if (trimmedLine.startsWith('{')) {
                dataStr = trimmedLine;
            }

            if (!dataStr || dataStr === '[DONE]') return;

            try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta;
                if (parsed.model) lastModel = parsed.model;
                if (parsed.usage && (parsed.usage.total_tokens != null || parsed.usage.output_tokens != null)) lastUsage = parsed.usage;
                if (delta) {
                    if (firstTokenLatency == null && (delta.reasoning_content || delta.content)) {
                        firstTokenLatency = Date.now() - streamStartTime;
                    }
                    if (delta.reasoning_content && enableThinking !== false) {
                        event.reply('stream-chunk', { chatId, modelName, reasoning_content: delta.reasoning_content });
                    }
                    if (delta.content) {
                        event.reply('stream-chunk', { chatId, modelName, content: delta.content });
                    }
                    if (delta.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id, name: '', args: '' };
                            if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
                            if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
                        }
                    }
                }
            } catch (e) {
                // Only log if it's not a known non-JSON line
                if (!isFinal && !trimmedLine.includes('[DONE]')) {
                    console.error('Error parsing SSE chunk:', e, 'Raw Line:', trimmedLine);
                }
            }
        }

        // Handle Tool Calls if any
        if (toolCalls.length > 0) {
            event.reply('stream-chunk', { chatId, tool_call: "calling" });
            const toolResults = [];
            for (const tc of toolCalls.filter(Boolean)) {
                const serverId = mcpSession?.toolNameToServerMap.get(tc.name);
                const clientObj = mcpSession?.clients.find(c => c.id === serverId);
                if (clientObj) {
                    try {
                        const result = await clientObj.client.callTool({
                            name: tc.name,
                            arguments: JSON.parse(tc.args)
                        });
                        toolResults.push({
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify(result.content)
                        });
                    } catch (e) {
                        toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${e.message}` });
                    }
                } else {
                    toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Error: 未找到工具 ${tc.name} 对应的 MCP 服务器` });
                }
            }

            // Send tool results back to LLM for final answer（沿用相同 endpoint 及回退机制）
            const toolStreamStart = Date.now();
            const toolRoundModelConfig = buildModelRequestConfig(modelName, {
                temperature,
                top_p,
                enableThinking
            });
            const { response: finalResponse } = await fetchChatCompletionWithFallback(
                endpoint,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resolvedApiKey}` },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [...apiMessages, { role: "assistant", tool_calls: toolCalls.filter(Boolean).map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args } })) }, ...toolResults],
                        ...toolRoundModelConfig,
                        stream: true,
                        stream_options: { include_usage: true }
                    })
                },
                thisController
            );

            if (!finalResponse.ok) {
                const errorBody = await finalResponse.text();
                event.reply('stream-error', {
                    chatId,
                    modelName,
                    error: `Tool response API Error: ${finalResponse.status} - ${errorBody}`
                });
                return;
            }

            // Once the second request starts, we can clear the calling status
            event.reply('stream-chunk', { chatId, tool_call: "responding" });

            const finalReader = finalResponse.body.getReader();
            let toolFirstTokenLatency = null;
            let toolLastUsage = null;
            let toolLastModel = modelName;
            let toolBuffer = '';
            while (true) {
                const { done, value } = await finalReader.read();
                if (done) {
                    if (toolBuffer.trim()) processToolSSELine(toolBuffer);
                    break;
                }

                toolBuffer += decoder.decode(value, { stream: true });
                let lines = toolBuffer.split(/\r?\n/);
                toolBuffer = lines.pop() || '';

                for (const line of lines) {
                    processToolSSELine(line);
                }
            }

            function processToolSSELine(line) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine === 'data: [DONE]' || trimmedLine === '[DONE]') return;

                let dataStr = '';
                if (trimmedLine.startsWith('data: ')) {
                    dataStr = trimmedLine.substring(6).trim();
                } else if (trimmedLine.startsWith('data:')) {
                    dataStr = trimmedLine.substring(5).trim();
                } else if (trimmedLine.startsWith('{')) {
                    dataStr = trimmedLine;
                }

                if (!dataStr || dataStr === '[DONE]') return;

                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta;
                    if (parsed.model) toolLastModel = parsed.model;
                    if (parsed.usage && (parsed.usage.total_tokens != null || parsed.usage.output_tokens != null)) toolLastUsage = parsed.usage;
                    if (delta) {
                        if (delta.reasoning_content && enableThinking !== false) {
                            if (toolFirstTokenLatency == null) toolFirstTokenLatency = Date.now() - toolStreamStart;
                            event.reply('stream-chunk', { chatId, modelName, reasoning_content: delta.reasoning_content });
                        }
                        if (delta.content) {
                            if (toolFirstTokenLatency == null) toolFirstTokenLatency = Date.now() - toolStreamStart;
                            event.reply('stream-chunk', { chatId, modelName, content: delta.content });
                        }
                    }
                } catch (e) {
                    if (!trimmedLine.includes('[DONE]')) {
                        console.error('Error parsing Tool SSE chunk:', e, 'Raw Line:', trimmedLine);
                    }
                }
            }
            firstTokenLatency = toolFirstTokenLatency;
            lastUsage = toolLastUsage;
            lastModel = toolLastModel;
        }

        const endTime = new Date();
        const timeStr = String(endTime.getMonth() + 1).padStart(2, '0') + '-' + String(endTime.getDate()).padStart(2, '0') + ' ' + String(endTime.getHours()).padStart(2, '0') + ':' + String(endTime.getMinutes()).padStart(2, '0');
        event.reply('stream-end', { chatId, modelName, usage: lastUsage, model: lastModel, firstTokenLatency, time: timeStr });
    } catch (error) {
        if (error.name !== 'AbortError') {
            event.reply('stream-error', { chatId, modelName, error: error.message });
        }
    } finally {
        // Cleanup this controller from the active list
        if (global.activeStreamControllers) {
            global.activeStreamControllers = global.activeStreamControllers.filter(c => c !== thisController);
        }
        await closeMcpSession(mcpSession);
    }
}

function stopStream() {
    if (global.activeStreamControllers && global.activeStreamControllers.length > 0) {
        global.activeStreamControllers.forEach(c => c.abort());
        global.activeStreamControllers = [];
    }
    return true;
}

module.exports = {
    handleStreamRequest,
    stopStream,
    getMcpTools,
    buildModelRequestConfig,
    cleanupMcpClients
};
