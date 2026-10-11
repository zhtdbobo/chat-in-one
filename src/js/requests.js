// Register identities before sending IPC. Keep text outside DOM attributes and batch display work.
let requestStatusTimer = null;
function isChatBusy() { return state.isStreaming || state.isCompressing; }
function comparisonColumnId(modelId) { return 'comp-body-' + encodeURIComponent(modelId); }
function updateRequestControls() {
    state.isStreaming = Object.keys(state.activeRequests || {}).length > 0;
    sendBtn.disabled = isChatBusy(); sendBtn.style.display = state.isStreaming ? 'none' : 'flex';
    stopBtn.style.display = state.isStreaming ? 'flex' : 'none';
    const comparisonBtn = document.getElementById('comparison-toggle-btn');
    if (comparisonBtn) comparisonBtn.disabled = isChatBusy();
    if (state.isStreaming && !requestStatusTimer) requestStatusTimer = setInterval(() => {
        Object.values(state.activeRequests).forEach(updateActiveRequestStatus);
    }, 1000);
    if (!state.isStreaming && requestStatusTimer) { clearInterval(requestStatusTimer); requestStatusTimer = null; }
}
function beginChatRequests(requests) {
    state.activeRequests = {};
    for (const request of requests) {
        const element = renderMessageItem('assistant', '');
        const contentDiv = element.querySelector('.message-content');
        const column = request.isComparisonStream ? document.getElementById(comparisonColumnId(request.providerId + '|' + request.modelName)) : messagesList;
        (column || messagesList).appendChild(element);
        const active = { ...request, element, contentDiv, startedAt: Date.now(), lastActivityAt: Date.now(),
            phase: '正在等待响应', content: new MessageTextBuffer(), reasoning: new MessageTextBuffer() };
        contentDiv.messageTextBuffer = active.content;
        state.activeRequests[request.requestId] = active;
        renderActiveRequest(active); updateActiveRequestStatus(active); scrollRequestToBottom(active);
    }
    updateRequestControls();
}
function scrollRequestToBottom(request) {
    const column = request.element.closest('.comparison-body');
    if (column) column.scrollTop = column.scrollHeight;
    scrollToBottom();
}
function getActiveRequest(data) {
    const request = state.activeRequests?.[data.requestId];
    return request && request.chatId === data.chatId ? request : null;
}
function updateActiveRequestStatus(request) {
    const elapsed = Math.max(0, Date.now() - request.startedAt), idle = Date.now() - request.lastActivityAt;
    const first = request.firstTokenLatency == null ? '等待首个回复片段' : '首个回复片段 ' + (request.firstTokenLatency / 1000).toFixed(1) + 's';
    const phase = idle >= 15000 ? '等待服务端继续回复（' + Math.floor(idle / 1000) + 's 未收到新片段，可停止）' : request.phase;
    const text = phase + ' · ' + first + ' · 总耗时 ' + (elapsed / 1000).toFixed(1) + 's · 已接收 ' + (request.content.length + request.reasoning.length).toLocaleString() + ' 字符';
    const node = request.contentDiv.querySelector('.request-status');
    if (node) { node.textContent = text; if (node.classList) node.classList.toggle('waiting', idle >= 15000); }
    const columnStatus = request.element.closest('.comparison-column')?.querySelector('.model-status');
    if (columnStatus) { columnStatus.textContent = phase; columnStatus.classList.add('streaming'); }
}
function renderActiveRequest(request) {
    const div = request.contentDiv, scroll = div.querySelector('.message-scroll');
    if (!scroll) return;
    if (request.content.length + request.reasoning.length > RICH_TEXT_LIMIT) {
        if (!request.longViews) {
            scroll.innerHTML = '';
            request.longViews = [];
            if (request.enableThinking !== false && state.settings.enableThinking !== false) {
                const details = document.createElement('details'); details.className = 'thinking-block';
                const summary = document.createElement('summary'); summary.textContent = '思考过程'; details.append(summary);
                const view = createLongTextView(request.reasoning, true); details.append(view.element); scroll.append(details);
                request.longViews.push({ view, container: details, buffer: request.reasoning });
            }
            const view = createLongTextView(request.content, true); scroll.append(view.element);
            request.longViews.push({ view, container: view.element, buffer: request.content });
            delete div.dataset.raw; delete div.dataset.reasoning;
        }
        for (const item of request.longViews) { item.container.hidden = !item.buffer.length; if (item.buffer.length) item.view.update(); }
    } else {
        div.dataset.raw = request.content.text(); div.dataset.reasoning = request.reasoning.text();
        let html = '';
        if (request.reasoning.length && request.enableThinking !== false && state.settings.enableThinking !== false) html += '<details class="thinking-block" open><summary>思考过程</summary><div class="thinking-content markdown-body">' + renderMarkdownSafe(div.dataset.reasoning) + '</div></details>';
        if (request.content.length) html += '<div class="markdown-body">' + renderMarkdownSafe(div.dataset.raw) + '</div>';
        scroll.innerHTML = html || '<div class="tool-status">' + request.phase + '...</div>';
    }
    updateActiveRequestStatus(request);
}
function flushActiveRequest(request) {
    clearTimeout(request.renderTimer); request.renderTimer = null;
    renderActiveRequest(request); scrollRequestToBottom(request);
}
function handleStreamStart(data) {
    const request = getActiveRequest(data); if (!request) return;
    request.phase = '等待首个回复片段'; request.lastActivityAt = Date.now(); updateActiveRequestStatus(request);
}
function handleStreamChunk(data) {
    const request = getActiveRequest(data); if (!request) return;
    request.lastActivityAt = Date.now();
    if (data.tool_call) request.phase = data.tool_call === 'calling' ? '正在调用工具' : '正在生成回答';
    if (data.content) { request.content.append(data.content); request.phase = '正在生成'; }
    if (data.reasoning_content) { request.reasoning.append(data.reasoning_content); if (!request.content.length) request.phase = '正在思考'; }
    if (request.firstTokenLatency == null && (data.content || data.reasoning_content)) request.firstTokenLatency = data.firstTokenLatency ?? Date.now() - request.startedAt;
    if (!request.renderTimer) request.renderTimer = setTimeout(() => flushActiveRequest(request), 100);
}
function finishReasonNotice(reason) {
    return { length: '已达到服务端或本次设置的输出长度上限，回答可能未完成。内容已保留，可发送“继续”或按章节生成。',
        content_filter: '服务端因内容过滤结束了回复，已收到的内容已保留。',
        insufficient_system_resource: '服务端因资源不足中断了生成，已收到的内容已保留，可稍后继续。',
        aborted: '服务端中断了生成，已收到的内容已保留。' }[reason];
}
function finishChatRequest(data) {
    const request = getActiveRequest(data); if (!request) return;
    clearTimeout(request.renderTimer);
    const chat = state.chats.find(c => c.id === request.chatId);
    const warning = finishReasonNotice(data.finishReason) || data.warning;
    const status = data.error ? 'error' : data.cancelled ? 'cancelled' : data.finishReason === 'length' ? 'truncated' : warning ? 'interrupted' : 'complete';
    const message = { role: 'assistant', content: { content: request.content.text(), reasoning_content: request.reasoning.text() },
        requestId: request.requestId, providerId: request.providerId, model: data.model || request.modelName,
        ...(request.isComparisonStream ? { comparisonModelId: request.providerId + '|' + request.modelName, comparisonModelName: request.modelName } : {}),
        status, warning, error: data.error, usage: data.usage, finishReason: data.finishReason,
        firstTokenLatency: data.firstTokenLatency ?? request.firstTokenLatency,
        totalDurationMs: data.totalDurationMs ?? Math.max(0, Date.now() - request.startedAt), time: data.time };
    const columnStatus = request.element.closest('.comparison-column')?.querySelector('.model-status');
    if (columnStatus) columnStatus.textContent = { error: '发生错误', cancelled: '已停止', truncated: '达到输出上限', interrupted: '回复中断', complete: '✓ 完成' }[status];
    columnStatus?.classList.remove('streaming');
    const replacement = renderMessageItem('assistant', message.content, message);
    request.element.replaceWith(replacement); request.element = replacement;
    if (chat) { chat.messages.push(message); saveChats(); }
    delete state.activeRequests[data.requestId]; updateRequestControls();
    if (data.error || warning) showNotification(data.error || warning, 'warning', 8000);
    if (!isChatBusy()) messageInput.focus(); scrollRequestToBottom(request);
}
function stopChatRequests() {
    const requests = Object.values(state.activeRequests || {}), ids = requests.map(r => r.requestId);
    window.api.stopStream(ids).catch(error => showNotification(error.message, 'error'));
    for (const request of requests) finishChatRequest({ requestId: request.requestId, chatId: request.chatId, cancelled: true });
}

function getStoredModelCapabilities(provider, modelName) {
    const model = getConversationModelMetadata(provider, modelName);
    const capabilities = model?.capabilities && !Array.isArray(model.capabilities) ? model.capabilities : detectModelCapabilities(modelName, model);
    const inputTypes = getModelCapabilityInfo(model).inputTypes;
    return { ...capabilities, ...(inputTypes ? {vision:inputTypes.includes('image')} : {}) };
}

function attachmentContentPart(attachment) {
    const type = String(attachment.type || '').toLowerCase();
    const data = String(attachment.data || '');
    const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
    if (/^image\/(png|jpe?g|gif|webp)$/.test(type)) {
        return { type: 'image', source: { type: 'base64', media_type: type, data: base64 } };
    }
    if (type === 'application/pdf' || /\.pdf$/i.test(attachment.name || '')) {
        return { type: 'file', file: { filename: attachment.name || 'attachment.pdf', file_data: `data:application/pdf;base64,${base64}` } };
    }
    if (type.startsWith('text/') || /^(application\/(json|xml|javascript|x-yaml))$/.test(type) || /\.(txt|md|csv|tsv|json|jsonl|xml|yaml|yml|js|ts|py|java|c|cpp|h|css|html|sql|log)$/i.test(attachment.name || '')) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return { type: 'text', text: `[附件: ${attachment.name || '文本文件'}]\n${text}` };
    }
    throw new Error(`暂不支持附件「${attachment.name || type}」的格式，请转换为图片、PDF 或 UTF-8 文本。`);
}

function prepareMessagesForModel(messages, provider, modelName, comparison = false) {
    const modelId = `${provider.id}|${modelName}`;
    const selected = messages.filter(message => {
        if (message.role !== 'assistant') return true;
        if (message.status === 'error' || (message.status === 'cancelled' && !message.content?.content)) return false;
        if (!comparison) return true;
        if (message.comparisonModelId) return message.comparisonModelId === modelId;
        // Legacy messages did not save provider identity; match their recorded model.
        return !message.comparisonModelName || message.comparisonModelName === modelId || message.comparisonModelName === modelName;
    });
    const capabilities = getStoredModelCapabilities(provider, modelName);
    const neutral = selected.map(message => {
        const payload = message.content;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { role: message.role, content: payload };
        const parts = [];
        if (payload.content) parts.push({ type: 'text', text: payload.content });
        for (const attachment of payload.attachments || []) {
            const part = attachmentContentPart(attachment);
            if ((part.type === 'image' || part.type === 'file') && !capabilities.vision) {
                throw new Error(`模型「${modelName}」不支持图片或 PDF，请选择支持视觉能力的模型。`);
            }
            parts.push(part);
        }
        // Text attachments also work with text-only models and APIs expecting a string.
        const content = parts.every(part => part.type === 'text')
            ? parts.map(part => part.text).join('\n\n') : parts;
        return { role: message.role, content };
    });
    return convertMessageForProvider(provider.id, neutral, provider.endpoint);
}
