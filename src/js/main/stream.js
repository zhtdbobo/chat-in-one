const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { fetchChatCompletionWithFallback } = require('./network');
const { getStore, resolveApiKey } = require('./store');

let mcpClients = [];
let toolNameToServerMap = new Map();
let currentStreamController = null;

async function cleanupMcpClients() {
    for (const c of mcpClients) {
        try {
            if (c.transport) {
                await c.transport.close();
            }
        } catch (closeErr) {
            console.error(`Error closing MCP transport:`, closeErr);
        }
    }
    mcpClients = [];
    toolNameToServerMap.clear();
}

async function getMcpTools(servers) {
    const allTools = [];
    toolNameToServerMap.clear();
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
            allTools.push(...tools.tools.map(t => ({ ...t, serverId: server.id })));
            for (const t of tools.tools) {
                toolNameToServerMap.set(t.name, server.id);
            }
            mcpClients.push({ id: server.id, client, transport });
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
    return allTools;
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
        cfg.thinking = { type: req.enableThinking === false ? 'disabled' : 'enabled' };
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
    const { endpoint, apiKey, modelName, systemPrompt, messages, chatId, enableThinking, enableSearch, temperature, top_p, max_tokens, stream, mcpServers, providerId } = requestData;

    // Resolve API key from store if masked (keys never persist in renderer)
    let resolvedApiKey = (apiKey && apiKey !== '__MASKED__') ? apiKey : resolveApiKey(providerId);

    let thisController;
    try {
        // Cleanup old clients (only on non-comparison to avoid cancelling siblings)
        if (!requestData.isComparisonStream) {
            await cleanupMcpClients();
        }

        // Create AbortController for this stream and register it
        thisController = new AbortController();
        currentStreamController = thisController;
        if (!global.activeStreamControllers) global.activeStreamControllers = [];
        global.activeStreamControllers.push(thisController);

        let tools = [];
        if (mcpServers && mcpServers.length > 0) {
            tools = await getMcpTools(mcpServers);
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        event.reply('stream-start', { chatId, modelName });

        let toolCalls = [];
        let firstTokenLatency = null;
        let lastUsage = null;
        let lastModel = modelName;

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
                const serverId = toolNameToServerMap.get(tc.name);
                const clientObj = mcpClients.find(c => c.id === serverId);
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
                currentStreamController
            );

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
        // Cleanup MCP clients when stream ends (only for non-comparison mode)
        if (!requestData.isComparisonStream) {
            await cleanupMcpClients();
        }
    }
}

function stopStream() {
    if (global.activeStreamControllers && global.activeStreamControllers.length > 0) {
        global.activeStreamControllers.forEach(c => c.abort());
        global.activeStreamControllers = [];
    }
    if (currentStreamController) {
        currentStreamController.abort();
        currentStreamController = null;
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