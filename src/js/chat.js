// chat.js - Chat management functions

// -----------------------------------------
// Chat Management Logics
// -----------------------------------------
function createNewChat() {
    if (typeof closeAllModals === 'function') closeAllModals();
    if (state.isStreaming) return;

    // Clear attachments preview and message input
    const attachmentsPreview = document.getElementById('attachments-preview');
    const attachmentsList = document.getElementById('attachments-list');
    if (attachmentsPreview) attachmentsPreview.style.display = 'none';
    if (attachmentsList) attachmentsList.innerHTML = '';
    if (messageInput) messageInput.value = '';

    // Reset upload inputs to allow re-uploading the same files
    const imageUploadInput = document.getElementById('image-upload-input');
    const fileUploadInput = document.getElementById('file-upload-input');
    if (imageUploadInput) imageUploadInput.value = '';
    if (fileUploadInput) fileUploadInput.value = '';

    // Get default model from last used or first provider
    let defaultModel = state.settings.lastUsedModel || '';
    if (!defaultModel) {
        const providers = state.settings.providers || [];
        if (providers.length > 0) {
            const p = providers[0];
            const models = (p.models || "").split(',').map(m => m.trim()).filter(m => m);
            if (models.length > 0) {
                defaultModel = `${p.id}|${models[0]}`;
            }
        }
    }

    const newChat = {
        id: generateId(),
        title: "新对话",
        model: defaultModel,
        messages: [],
        skillId: null // 默认新对话不使用搭档
    };

    state.activeSkillId = null; // 同时也重置全局激活的搭档状态

    state.chats.unshift(newChat); // Add to top
    state.isNewFreshChat = true;
    state._newlyCreatedId = newChat.id; // temporary tracker
    saveChats();
    renderChatList();
    switchChat(newChat.id);
}

function switchChat(chatId) {
    if (typeof closeAllModals === 'function') closeAllModals();
    if (state.isStreaming) return;

    // Clear attachments preview and message input
    const attachmentsPreview = document.getElementById('attachments-preview');
    const attachmentsList = document.getElementById('attachments-list');
    if (attachmentsPreview) attachmentsPreview.style.display = 'none';
    if (attachmentsList) attachmentsList.innerHTML = '';
    if (messageInput) messageInput.value = '';

    // Reset upload inputs to allow re-uploading the same files
    const imageUploadInput = document.getElementById('image-upload-input');
    const fileUploadInput = document.getElementById('file-upload-input');
    if (imageUploadInput) imageUploadInput.value = '';
    if (fileUploadInput) fileUploadInput.value = '';

    // Only keep flag if we are switching to the chat we just created
    if (state._newlyCreatedId !== chatId) {
        state.isNewFreshChat = false;
    }
    state._newlyCreatedId = null; // consume it

    state.currentChatId = chatId;
    const chat = state.chats.find(c => c.id === chatId);

    if (chat) {
        currentChatTitle.textContent = chat.title;

        // 切换对话时，先隐藏容器并禁用消息动画，避免闪烁
        messageContainer.classList.add('switching');
        messageContainer.classList.add('no-animation');

        // 使用 rAF 确保 switching class 已被应用（容器已隐藏），再渲染消息
        requestAnimationFrame(() => {
            renderMessages(chat.messages);
            scrollToBottom();

            // 等待 DOM 布局完成后再显示（双 rAF 确保浏览器已完成 layout + paint）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // 先移除 switching 显示容器（no-animation 仍然保持，确保没有过渡动画）
                    messageContainer.classList.remove('switching');

                    // 再使用一帧延迟后移除 no-animation，恢复后续新消息的动画
                    requestAnimationFrame(() => {
                        messageContainer.classList.remove('no-animation');
                    });
                });
            });
        });

        // Backward compatibility for old model names without provider id
        if (chat.model && !chat.model.includes('|')) {
            const providers = state.settings.providers || [];
            let found = false;
            for (const p of providers) {
                if (p.models && p.models.includes(chat.model)) {
                    chat.model = `${p.id}|${chat.model}`;
                    found = true; break;
                }
            }
            if (!found && providers.length > 0) {
                chat.model = `${providers[0].id}|${chat.model}`;
            }

        }

        // 同步当前激活的搭档
        state.activeSkillId = chat.skillId || null;
        if (typeof renderCompanionsList === 'function') {
            renderCompanionsList();
        }

        // Sync model dropdown
        renderSearchableModelSelect();
    }

    renderChatList(); // Update active class

    if (window.innerWidth < 768) {
        // Handle mobile sidebar auto-hide could go here
    }
}

function renderChatList() {
    chatListEl.innerHTML = '';

    state.chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = `chat-item ${chat.id === state.currentChatId ? 'active' : ''}`;

        // 获取图标信息
        let iconHtml = '<i class="ph ph-chat-circle"></i>';
        if (chat.skillId && typeof getCompanionIconInfo === 'function') {
            const allCompanions = getAllCompanions();
            const skill = allCompanions.find(s => s.id === chat.skillId);
            if (skill) {
                const info = getCompanionIconInfo(skill.name);
                iconHtml = `<i class="ph-fill ${info.icon}" style="color: ${info.color}"></i>`;
            }
        }

        div.innerHTML = `
            <input type="checkbox" class="chat-item-checkbox" data-id="${chat.id}">
            ${iconHtml}
            <span class="chat-item-title">${escapeHtml(chat.title)}</span>
            <div class="chat-actions">
                <button class="more-btn" title="更多操作"><i class="ph ph-dots-three-outline"></i></button>
                <div class="chat-actions-menu">
                    <button class="del-btn" title="删除"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;

        const checkbox = div.querySelector('.chat-item-checkbox');
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', updateSelectedCount);

        const moreBtn = div.querySelector('.more-btn');
        const menu = div.querySelector('.chat-actions-menu');

        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other open menus
            document.querySelectorAll('.chat-actions-menu.show').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            menu.classList.toggle('show');
        });

        div.querySelector('.del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.remove('show');
            executeDeleteChat(chat.id);
        });

        div.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-actions')) {
                switchChat(chat.id);
            }
        });

        chatListEl.appendChild(div);
    });
}

let chatMenuCloseHandlerInitialized = false;
function initChatMenuCloseHandler() {
    if (chatMenuCloseHandlerInitialized) return;
    chatMenuCloseHandlerInitialized = true;
    document.addEventListener('click', () => {
        document.querySelectorAll('.chat-actions-menu.show').forEach(m => m.classList.remove('show'));
    });
}

async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
        const icon = btn.querySelector('i');
        const oldClass = icon.className;
        icon.className = 'ph ph-check-circle';
        btn.classList.add('copied');
        setTimeout(() => {
            icon.className = oldClass;
            btn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

function saveChats() {
    window.api.saveChats(state.chats);
}

// -----------------------------------------
// Messaging Logics
// -----------------------------------------
function renderMessages(messages) {
    if (!messagesList) return;
    messagesList.innerHTML = '';

    const fragment = document.createDocumentFragment();
    const companionsPanel = document.getElementById('companions-panel');
    const isNewFresh = (messages.length === 0);

    if (isNewFresh) {
        updateWelcomeScreen();
        renderSkillsBar();
        welcomeScreen.style.display = 'flex';
        if (companionsPanel) {
            companionsPanel.style.display = (state.settings.showCompanionsInNewChat !== false) ? '' : 'none';
        }
    } else {
        // --- Comparison Mode Full History Layout ---
        if (state.isComparisonMode && state.selectedComparisonModels.length >= 2) {
            welcomeScreen.style.display = 'none';
            if (companionsPanel) companionsPanel.style.display = 'none';

            const container = document.createElement('div');
            container.className = 'comparison-grid-container';
            
            // For each model, create a column and render the full history (User messages + this Model's responses)
            state.selectedComparisonModels.forEach(modelId => {
                const [pId, mName] = modelId.split('|');
                const provider = state.settings.providers.find(p => p.id === pId);
                const providerName = provider ? provider.name : pId;

                const col = document.createElement('div');
                col.className = 'comparison-column';
                col.dataset.modelId = modelId;

                // Column Header
                const header = document.createElement('div');
                header.className = 'comparison-header';
                header.innerHTML = `
                    <div class="model-name">
                        <i class="ph ph-cpu"></i>
                        <span title="${providerName} · ${mName}">${mName}</span>
                    </div>
                    <div class="model-status">就绪</div>
                `;
                col.appendChild(header);

                // Column Body (List of messages)
                const body = document.createElement('div');
                body.className = 'comparison-body';
                body.id = `comp-body-${modelId.replace(/[^a-zA-Z0-9]/g, '-')}`;
                
                // Render this specific model's timeline
                messages.forEach(msg => {
                    const role = msg.role || 'assistant';
                    // Show every user message, but only assistant messages aimed at this specific model
                    if (role === 'user' || (role === 'assistant' && (msg.comparisonModelName === mName || msg.comparisonModelName === modelId))) {
                        const payload = (msg && typeof msg === 'object' && 'content' in msg) ? msg.content : msg;
                        const messageItem = renderMessageItem(role, payload, msg);
                        if (messageItem) {
                            messageItem.style.marginBottom = '20px'; // Add some spacing
                            body.appendChild(messageItem);
                        }
                    } else if (role === 'system' && String(msg.content).includes('[对话摘要]')) {
                        // Always show system summaries in all columns
                        const messageItem = renderMessageItem('system', msg.content, msg);
                        if (messageItem) body.appendChild(messageItem);
                    }
                });

                col.appendChild(body);
                container.appendChild(col);
            });

            messagesList.appendChild(container);
        } else {
            // --- Normal Interleaved Layout ---
            welcomeScreen.style.display = 'none';
            if (companionsPanel) companionsPanel.style.display = 'none';

            let i = 0;
            while (i < messages.length) {
                const msg = messages[i];

                // 检查是否为旧版对比模式的历史响应 (打包显示)
                if (msg && typeof msg === 'object' && msg.role === 'assistant' && msg.comparisonModelName) {
                    const compGroup = [];
                    while (i < messages.length && messages[i] && typeof messages[i] === 'object' && messages[i].role === 'assistant' && messages[i].comparisonModelName) {
                        compGroup.push(messages[i]);
                        i++;
                    }

                    const grid = document.createElement('div');
                    grid.className = 'comparison-grid';
                    grid.style.margin = '8px 0 24px 0';
                    grid.style.display = 'flex';
                    grid.style.gap = '12px';
                    grid.style.overflowX = 'auto';

                    compGroup.forEach(cMsg => {
                        const col = document.createElement('div');
                        col.className = 'comparison-column';
                        col.style.flex = '1 1 300px';
                        col.style.minWidth = '300px';
                        col.style.border = '1px solid var(--border-subtle)';
                        col.style.borderRadius = '12px';
                        col.style.display = 'flex';
                        col.style.flexDirection = 'column';

                        const pName = cMsg.comparisonModelName;
                        const cPayload = cMsg.content;
                        const cRaw = (cPayload && typeof cPayload === 'object' && cPayload.content !== undefined) ? cPayload.content : String(cPayload || '');
                        const cReasoning = (cPayload && typeof cPayload === 'object' && cPayload.reasoning_content) ? cPayload.reasoning_content : '';

                        let htmlContent = '';
                        if (cReasoning && state.settings.enableThinking !== false) {
                            htmlContent += `<details class="thinking-block"><summary><i class="ph ph-brain"></i> 思考过程</summary><div class="thinking-content markdown-body">${DOMPurify.sanitize(marked.parse(cReasoning), { ADD_TAGS: ['button'] })}</div></details>`;
                        }
                        if (cRaw) {
                            htmlContent += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(cRaw), { ADD_TAGS: ['button'] })}</div>`;
                        }

                        col.innerHTML = `
                            <div class="comparison-header" style="padding:10px 14px; background:var(--bg-surface-elevated); border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:13px;">
                                <div class="model-name"><strong>${pName}</strong></div>
                                <div class="model-status" style="border:none;">✓ 完成</div>
                            </div>
                            <div class="comparison-body" style="padding:14px; flex:1; overflow-y:auto;">
                                <div class="message-content" style="padding:0; background:transparent;">
                                    ${htmlContent}
                                    <div class="message-meta" style="margin-top:16px;">模型: ${cMsg.model || pName}</div>
                                </div>
                            </div>
                        `;
                        grid.appendChild(col);
                    });
                    fragment.appendChild(grid);
                    continue;
                }

                try {
                    const role = msg && typeof msg === 'object' && msg.role ? msg.role : 'assistant';
                    const payload = (msg && typeof msg === 'object' && 'content' in msg) ? msg.content : msg;
                    const messageItem = renderMessageItem(role, payload, msg);
                    if (messageItem) fragment.appendChild(messageItem);
                } catch (e) {
                    console.error('Failed to render message item:', e, msg);
                }
                i++;
            }
            messagesList.appendChild(fragment);
        }
    }

    // 后续逻辑保持不变
    if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
        messagesList.querySelectorAll('pre code').forEach((block) => {
            try { hljs.highlightElement(block); } catch (e) {}
        });
    }
    updateBadge();
    requestAnimationFrame(() => {
        scrollToBottom();
    });
}

function renderMarkdownSafe(text) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    try {
        return DOMPurify.sanitize(marked.parse(raw), { ADD_TAGS: ['button'] });
    } catch (e) {
        console.error('Markdown render error, fallback to plain text:', e);
        return `<pre class="markdown-body">${escapeHtml(raw)}</pre>`;
    }
}

function renderMessageItem(role, content, fullMsgObj = null) {
    welcomeScreen.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    let icon = role === 'user' ? '<i class="ph ph-user"></i>' : '<i class="ph ph-robot"></i>';
    if (role === 'system') icon = '<i class="ph ph-warning"></i>';

    let htmlContent = '';
    if (role === 'system') {
        htmlContent = `<div class="markdown-body">${escapeHtml(typeof content === 'string' ? content : String(content ?? ''))}</div>`;
    } else if (role === 'assistant' || role === 'user') {
        // Backward-compatible: allow both string content and object payloads
        const rawContent = (content && typeof content === 'object' && content.content !== undefined) ? content.content : content;
        const rawReasoning = (content && typeof content === 'object' && content.reasoning_content) ? content.reasoning_content : '';

        if (rawReasoning && state.settings.enableThinking !== false) {
            htmlContent += `
                <details class="thinking-block">
                    <summary><i class="ph ph-brain"></i> 思考过程</summary>
                    <div class="thinking-content markdown-body">${renderMarkdownSafe(rawReasoning)}</div>
                </details>
            `;
        }
        if (rawContent != null && rawContent !== '') {
            htmlContent += `<div class="markdown-body">${renderMarkdownSafe(rawContent)}</div>`;
        }

        // Add attachments
        const attachments = (content && typeof content === 'object' && content.attachments) ? content.attachments : [];
        if (attachments.length > 0) {
            htmlContent += '<div class="attachments-container" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">';
            attachments.forEach(attachment => {
                const isImage = attachment.type.startsWith('image/');
                if (isImage) {
                    htmlContent += `
                        <div style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle);">
                            <img src="${attachment.data}" style="width: 100%; height: 100%; object-fit: cover;">
                            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, 0.6); color: white; font-size: 10px; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${attachment.name}
                            </div>
                        </div>
                    `;
                } else {
                    htmlContent += `
                        <div style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-surface-elevated); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <i class="ph ph-file" style="font-size: 24px; color: var(--text-muted);"></i>
                            <div style="font-size: 10px; color: var(--text-secondary); text-align: center; padding: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90%;">
                                ${attachment.name}
                            </div>
                        </div>
                    `;
                }
            });
            htmlContent += '</div>';
        }
    }

    const dataRaw = (content && typeof content === 'object' && content.content !== undefined) ? content.content : content;
    const dataReasoning = (content && typeof content === 'object' && content.reasoning_content) ? content.reasoning_content : '';

    wrapper.innerHTML = `
        <div class="avatar">${icon}</div>
        <div class="message-content">
            <div class="message-scroll">
                ${htmlContent || '<div class="markdown-body"></div>'}
            </div>
            ${(role === 'assistant' || role === 'user') ? `
                <div class="message-actions">
                    <button class="message-action-btn copy-btn" title="复制内容">
                        <i class="ph ph-copy"></i>
                    </button>
                    ${role === 'user' ? '<button class="message-action-btn edit-msg-btn" title="编辑并重新发送"><i class="ph ph-pencil-simple"></i></button>' : ''}
                </div>
            ` : ''}
        </div>
    `;

    // Attempt to render history meta info if available
    if (fullMsgObj) {
        const textRawForCount = typeof dataRaw === 'string' ? dataRaw : String(dataRaw || '');
        const zhCount = (textRawForCount.match(/[\u4e00-\u9fa5]/g) || []).length;
        const enCount = textRawForCount.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        const wordCount = zhCount + enCount;

        if (role === 'assistant') {
            const tokens = fullMsgObj.usage?.total_tokens ?? fullMsgObj.usage?.completion_tokens ?? fullMsgObj.usage?.output_tokens ?? '—';
            const latencyS = fullMsgObj.firstTokenLatency != null ? (fullMsgObj.firstTokenLatency / 1000).toFixed(1) + 's' : '';

            let providerNameLabel = '';
            if (fullMsgObj.model && state.chats) {
                // Determine model provider name if available
                const chat = state.chats.find(c => c.id === state.currentChatId);
                if (chat && chat.model && chat.model.includes('|')) {
                    const pId = chat.model.split('|')[0];
                    const provider = state.settings.providers.find(p => p.id === pId);
                    if (provider) providerNameLabel = provider.name;
                }
            }

            const parts = [];
            if (providerNameLabel) {
                parts.push(`${providerNameLabel} (${fullMsgObj.model || '—'})`);
            } else {
                parts.push(fullMsgObj.model || '—');
            }
            if (tokens !== '—' || fullMsgObj.usage) parts.push(`${tokens} tokens`);
            parts.push(`${wordCount} words`);
            if (latencyS) parts.push(latencyS);
            if (fullMsgObj.time) parts.push(fullMsgObj.time);

            const metaStr = parts.join(' · ');
            const messageContentEl = wrapper.querySelector('.message-content');
            if (messageContentEl) messageContentEl.insertAdjacentHTML('beforeend', `<div class="message-meta">${metaStr}</div>`);
        } else if (role === 'user') {
            const parts = [`${wordCount} words`];
            if (fullMsgObj.time) parts.push(fullMsgObj.time);
            const metaStr = parts.join(' · ');
            const messageContentEl = wrapper.querySelector('.message-content');
            if (messageContentEl) messageContentEl.insertAdjacentHTML('beforeend', `<div class="message-meta" style="text-align:right;">${metaStr}</div>`);
        }
    }

    if (role === 'assistant' || role === 'user') {
        const copyBtn = wrapper.querySelector('.copy-btn');
        const messageContentEl = wrapper.querySelector('.message-content');
        copyBtn.addEventListener('click', () => copyToClipboard(messageContentEl?.dataset?.raw || '', copyBtn));

        // Edit & resend for user messages
        const editBtn = wrapper.querySelector('.edit-msg-btn');
        if (editBtn && role === 'user') {
            editBtn.addEventListener('click', function handleEditClick() {
                if (state.isStreaming) return;
                const currentText = messageContentEl.dataset.raw || '';
                const messageScroll = wrapper.querySelector('.message-scroll');
                const actionsEl = wrapper.querySelector('.message-actions');
                const metaEl = wrapper.querySelector('.message-meta');

                // Build edit UI via DOM (avoids template literal nesting issues)
                var editContainer = document.createElement('div');
                editContainer.className = 'edit-message-container';

                var ta = document.createElement('textarea');
                ta.className = 'edit-msg-textarea';
                ta.style.cssText = 'width:100%;max-height:300px;padding:0;border:none;background:transparent;color:var(--text-primary);font-family:inherit;font-size:14px;line-height:1.6;resize:none;outline:none;overflow:hidden;';
                ta.value = currentText;

                // Auto-resize textarea height to fit content
                function autoResize() {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                }
                ta.addEventListener('input', autoResize);

                var btnRow = document.createElement('div');
                btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-subtle);';

                var cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn-ghost';
                cancelBtn.style.cssText = 'padding:5px 14px;font-size:12px;border-radius:6px;';
                cancelBtn.textContent = '取消';

                var submitBtn = document.createElement('button');
                submitBtn.className = 'btn btn-primary';
                submitBtn.style.cssText = 'padding:5px 14px;font-size:12px;border-radius:6px;';
                submitBtn.textContent = '保存并发送';

                btnRow.appendChild(cancelBtn);
                btnRow.appendChild(submitBtn);
                editContainer.appendChild(ta);
                editContainer.appendChild(btnRow);

                // Hide original display, show editor
                messageScroll.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                if (metaEl) metaEl.style.display = 'none';
                messageContentEl.appendChild(editContainer);

                ta.focus();
                ta.selectionStart = ta.selectionEnd = ta.value.length;
                // Initial resize to fit existing content
                requestAnimationFrame(autoResize);

                cancelBtn.addEventListener('click', function() {
                    editContainer.remove();
                    messageScroll.style.display = '';
                    if (actionsEl) actionsEl.style.display = '';
                    if (metaEl) metaEl.style.display = '';
                });

                submitBtn.addEventListener('click', function() {
                    var newText = ta.value.trim();
                    if (!newText) return;

                    var chat = state.chats.find(function(c) { return c.id === state.currentChatId; });
                    if (!chat || !fullMsgObj) return;

                    var msgIndex = chat.messages.indexOf(fullMsgObj);
                    if (msgIndex === -1) {
                        // fallback: find by reference equality via findIndex
                        msgIndex = chat.messages.findIndex(function(m) { return m === fullMsgObj; });
                    }
                    if (msgIndex === -1) return;

                    // Truncate history from this user message onward (remove it + all following)
                    chat.messages.splice(msgIndex);
                    saveChats();
                    renderMessages(chat.messages);

                    // Put edited text into the input box and send
                    messageInput.value = newText;
                    messageInput.style.height = 'auto';
                    sendMessage();
                });
            });
        }
    }

    const messageContentEl = wrapper.querySelector('.message-content');
    if (messageContentEl) {
        messageContentEl.dataset.raw = dataRaw ?? '';
        messageContentEl.dataset.reasoning = dataReasoning ?? '';
    }

    return wrapper;
}

function sendMessage() {
    if (state.isStreaming) return;

    // Get current chat model
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (!chat) return;

    let providerId, modelName;
    if (chat.model && chat.model.includes('|')) {
        [providerId, modelName] = chat.model.split('|').map(s => s.trim());
    } else {
        // Fallback to first available provider/model if not set
        const providers = state.settings.providers || [];
        if (providers.length > 0) {
            providerId = providers[0].id;
            const models = (providers[0].models || "").split(',').map(m => m.trim()).filter(m => m);
            modelName = models[0];
        }
    }

    if (!providerId || !modelName) {
        alert("请先在设置中选择或配置一个有效的模型。");
        return;
    }

    const provider = state.settings.providers.find(p => p.id === providerId);
    if (!provider) {
        alert("找不到与此模型对应的服务商配置，请检查设置。");
        return;
    }
    if (!provider.apiKey || !provider.endpoint) {
        alert("当前模型所属的服务商未配置完整（Base URL 或 API Key 缺失），请在设置中配置。");
        openSettings();
        return;
    }

    const text = messageInput.value.trim();

    // Get attachments
    const attachmentsList = document.getElementById('attachments-list');
    const attachments = [];

    if (attachmentsList) {
        const attachmentItems = attachmentsList.querySelectorAll('[data-file-name]');
        attachmentItems.forEach(item => {
            attachments.push({
                name: item.dataset.fileName,
                type: item.dataset.fileType,
                size: parseInt(item.dataset.fileSize),
                data: item.dataset.fileData
            });
        });
    }

    // 检查模型是否支持所有附件类型
    if (attachments.length > 0) {
        // 检查模型vision能力
        const modelCapabilities = detectModelCapabilities(modelName, {});

        if (!modelCapabilities.vision) {
            showNotification(`❌ 模型 "${modelName}" 不支持图片上传。请选择支持视觉能力的模型。`, 'error');
            console.warn(`Model ${modelName} does not support vision capabilities`);
            return;
        }

        console.log(`✓ 模型 "${modelName}" 支持视觉能力，可以发送图片消息`);
    }

    if (!text && attachments.length === 0) return;

    // Process User Message (do NOT mutate chat yet; we may block due to context length)
    const messageContent = attachments.length > 0
        ? { content: text, attachments }
        : { content: text };

    // Get conversation-specific settings (needed for context estimation and sending)
    let finalSystemPrompt = chat.systemPrompt || state.settings.systemPrompt || '';
    const temperature = chat.temperature || 0.7;
    const topP = chat.topP || 1;
    let maxOutputTokens = chat.maxOutputTokens || 0;
    if (maxOutputTokens >= 8100) maxOutputTokens = 0;
    const streamOutput = chat.streamOutput !== false;

    // Skill Override
    if (state.activeSkillId) {
        chat.skillId = state.activeSkillId; // 把搭档关联到当前对话
        const allCompanions = getAllCompanions();
        const skill = allCompanions.find(s => s.id === state.activeSkillId);
        if (skill && skill.prompt) {
            finalSystemPrompt = skill.prompt;
        }
    }

    if (state.settings.enableSearch) {
        finalSystemPrompt += "\n\n[System Nudge: Web Search is ENABLED. Please use your online search capabilities or tools to provide the most up-to-date information if the user's request requires it. If you don't have direct tools, acknowledge the current date and provide the best available knowledge.]";
    }

    // Apply max message count if set
    let messagesToSend = [...chat.messages, { role: 'user', content: messageContent }];
    if (chat.maxMessageCount && chat.maxMessageCount < 15) {
        messagesToSend = messagesToSend.slice(-chat.maxMessageCount);
    }

    // Prepare messages for model - include attachments for models that support them
    let messagesForModel = messagesToSend.map(msg => {
        try {
            if (typeof msg.content === 'object' && msg.content !== null) {
                // For user messages with attachments or assistant messages with reasoning
                if (msg.content.content !== undefined) {
                    // Check if there are attachments
                    if (msg.content.attachments && msg.content.attachments.length > 0) {
                        // For messages with attachments, create a content array that includes both text and attachments
                        // Using a neutral format that will be converted by messageFormatConverter
                        const contentArray = [];

                        // Add text content if it exists
                        if (msg.content.content) {
                            contentArray.push({
                                type: "text",
                                text: msg.content.content
                            });
                        }

                        // Add attachments in neutral format
                        msg.content.attachments.forEach(attachment => {
                            const base64Data = attachment.data.includes(',')
                                ? attachment.data.split(',')[1]
                                : attachment.data;

                            contentArray.push({
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: attachment.type,
                                    data: base64Data
                                }
                            });
                        });

                        return {
                            role: msg.role,
                            content: contentArray
                        };
                    } else {
                        // For messages without attachments
                        return {
                            role: msg.role,
                            content: msg.content.content
                        };
                    }
                } else if (msg.content.reasoning_content !== undefined) {
                    // For assistant messages with reasoning
                    return {
                        role: msg.role,
                        content: msg.content.content || ''
                    };
                }
                // Fallback for any other object format
                return {
                    role: msg.role,
                    content: JSON.stringify(msg.content)
                };
            } else if (typeof msg.content === 'string') {
                // For plain text messages
                return msg;
            } else {
                // Fallback for any other type
                return {
                    role: msg.role,
                    content: String(msg.content)
                };
            }
        } catch (error) {
            console.error('Error processing message:', error);
            // Fallback to avoid breaking the entire process
            return {
                role: msg.role,
                content: 'Error processing message'
            };
        }
    });

    // Convert messages to provider-specific format before sending
    try {
        if (typeof convertMessageForProvider === 'function' && providerId) {
            messagesForModel = convertMessageForProvider(providerId, messagesForModel, provider.endpoint);
            console.log(`✓ 已将消息转换为 ${provider.name} 格式`);
        }
    } catch (e) {
        console.warn('消息格式转换失败，使用原始格式:', e);
    }

    // Context length warning / blocking (best-effort heuristic)
    try {
        if (typeof estimateConversationTokens === 'function') {
            const contextLimitTokens = (typeof getContextWindowTokensFromProvider === 'function')
                ? getContextWindowTokensFromProvider(provider, modelName)
                : null;
            const est = estimateConversationTokens({
                systemPrompt: finalSystemPrompt,
                messages: messagesForModel,
                maxOutputTokens,
                modelName,
                contextLimitTokens
            });

            const hardBlockAt = Math.floor(est.contextLimit * 0.98);
            const warnAt = Math.floor(est.contextLimit * 0.85);

            if (est.estimatedTotal > hardBlockAt) {
                showNotification(
                    `❌ 上下文过长：预计 ${est.estimatedTotal} tokens（上限约 ${est.contextLimit}）。请减少历史消息/设置“最大消息数”或缩短输入后再发送。`,
                    'error',
                    6000
                );
                return;
            }
            if (est.estimatedTotal > warnAt) {
                showNotification(
                    `⚠️ 接近上下文上限：预计 ${est.estimatedTotal}/${est.contextLimit} tokens。若发送失败，请减少历史消息或缩短输入。`,
                    'warning',
                    5000
                );
            }
        }
    } catch (e) {
        console.warn('Context estimation failed:', e);
    }

    // Now commit the user message to UI/state
    const d = new Date();
    const timeStr = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

    const userMsgObj = { role: 'user', content: messageContent, time: timeStr };
    chat.messages.push(userMsgObj);
    const userMsgEl = renderMessageItem('user', messageContent, userMsgObj);
    if (messagesList) {
        messagesList.appendChild(userMsgEl);
    } else {
        messageContainer.appendChild(userMsgEl);
    }

    // Hide welcome elements once first message is sent
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    const companionsPanel = document.getElementById('companions-panel');
    if (companionsPanel) companionsPanel.style.display = 'none';
    const skillSection = document.querySelector('.skills-section');
    if (skillSection) skillSection.style.display = 'none';
    state.isNewFreshChat = false;

    messageInput.value = '';
    messageInput.style.height = 'auto'; // reset textarea height
    scrollToBottom();

    // Try to generate title after first user message
    if (chat.messages.length === 1 && chat.title === "新对话") {
        chat.title = generateTitleFromContent(messageContent);
        currentChatTitle.textContent = chat.title;
        renderChatList();
    }

    saveChats();

    // Check if model supports attachments (after conversion)
    const hasAttachments = messagesForModel.some(msg => Array.isArray(msg.content));
    if (!hasAttachments && attachments.length > 0) {
        // Model doesn't have attachments but user tried to send them
    }

    // Clear attachments after sending
    if (attachmentsList) {
        attachmentsList.innerHTML = '';
        const attachmentsPreview = document.getElementById('attachments-preview');
        if (attachmentsPreview) {
            attachmentsPreview.style.display = 'none';
        }

        // Also reset upload inputs to allow uploading again immediately
        const imageUploadInput = document.getElementById('image-upload-input');
        const fileUploadInput = document.getElementById('file-upload-input');
        if (imageUploadInput) imageUploadInput.value = '';
        if (fileUploadInput) fileUploadInput.value = '';
    }

    // Dispatch to Electron Main Process
    if (state.isComparisonMode && state.selectedComparisonModels.length >= 2) {
        // Parallel multi-model comparison
        messageContainer.classList.add('comparison-layout');

        // Reset streams tracking map
        state.comparisonStreams = {};

        // Render columns FIRST so they exist when stream-start arrives
        renderComparisonEmptyState();

        state.selectedComparisonModels.forEach(modelId => {
            const [pId, mName] = modelId.split('|');
            const prov = state.settings.providers.find(p => p.id === pId);
            if (!prov) return;

            // Convert messages for each provider
            let messagesForThisModel = messagesToSend.map(msg => {
                if (typeof msg.content === 'object' && msg.content !== null) {
                    return { role: msg.role, content: msg.content.content || '' };
                }
                return msg;
            });

            if (typeof convertMessageForProvider === 'function') {
                try {
                    messagesForThisModel = convertMessageForProvider(pId, messagesForThisModel, prov.endpoint);
                } catch (e) {
                    console.warn('Message format conversion failed for', pId, e);
                }
            }

            window.api.sendMessageStream({
                endpoint: prov.endpoint,
                apiKey: prov.apiKey,
                modelName: mName,
                systemPrompt: finalSystemPrompt,
                messages: messagesForThisModel,
                chatId: chat.id,
                isComparisonStream: true,  // Flag to prevent aborting sibling streams
                enableThinking: state.settings.enableThinking !== false,
                enableSearch: !!state.settings.enableSearch,
                temperature: temperature,
                top_p: topP,
                max_tokens: maxOutputTokens,
                stream: streamOutput,
                mcpServers: (state.settings.mcpServers || []).filter(s =>
                    (state.enabledMcpServerIds || []).includes(s.id)
                )
            });
        });
    } else {
        // Normal single model sending
        window.api.sendMessageStream({
            endpoint: provider.endpoint,
            apiKey: provider.apiKey,
            modelName: modelName,
            systemPrompt: finalSystemPrompt,
            messages: messagesForModel,
            chatId: chat.id,
            enableThinking: state.settings.enableThinking !== false,
            enableSearch: !!state.settings.enableSearch,
            temperature: temperature,
            top_p: topP,
            max_tokens: maxOutputTokens,
            stream: streamOutput,
            mcpServers: (state.settings.mcpServers || []).filter(s =>
                (state.enabledMcpServerIds || []).includes(s.id)
            )
        });
    }
}

function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// -----------------------------------------
// Context usage + compression helpers (UI button)
// -----------------------------------------

function getCurrentChatProviderAndModel(chat) {
    let providerId, modelName;
    if (chat?.model && chat.model.includes('|')) {
        [providerId, modelName] = chat.model.split('|').map(s => s.trim());
    } else {
        const providers = state.settings.providers || [];
        if (providers.length > 0) {
            providerId = providers[0].id;
            const models = (providers[0].models || "").split(',').map(m => m.trim()).filter(m => m);
            modelName = models[0];
        }
    }
    const provider = (state.settings.providers || []).find(p => p.id === providerId);
    return { providerId, modelName, provider };
}

function getContextWindowTokensFromProvider(provider, modelName) {
    if (!provider || !modelName) return null;
    let allModels = [];
    try {
        const parsed = JSON.parse(provider.allModels || '[]');
        allModels = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        allModels = [];
    }
    const hit = allModels.find(m => (m?.id || m?.name) === modelName) || allModels.find(m => String(m?.id || '').toLowerCase() === String(modelName).toLowerCase());
    if (!hit) return null;

    const candidates = [
        hit.contextWindowTokens,
        hit.context_window,
        hit.contextWindow,
        hit.context_length,
        hit.contextLength,
        hit.max_context_tokens,
        hit.maxContextTokens,
        hit.max_input_tokens,
        hit.maxInputTokens,
        hit.input_tokens,
        hit.inputTokens
    ];
    for (const v of candidates) {
        const n = typeof v === 'string' ? parseInt(v, 10) : v;
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function buildMessagesForModelPreview(chat, extraUserText = '') {
    if (!chat) return [];
    let msgs = chat.messages || [];
    if (chat.maxMessageCount && chat.maxMessageCount < 15) {
        msgs = msgs.slice(-chat.maxMessageCount);
    }

    // Optional preview includes current input (not committed yet)
    const trimmed = String(extraUserText || '').trim();
    if (trimmed) {
        msgs = [...msgs, { role: 'user', content: { content: trimmed } }];
    }

    // Convert to model format used by sendMessage() (best-effort; for estimation only)
    return msgs.map(msg => {
        if (msg && typeof msg.content === 'object' && msg.content !== null) {
            if (msg.content.content !== undefined) {
                if (msg.content.attachments && msg.content.attachments.length > 0) {
                    const contentArray = [];
                    if (msg.content.content) contentArray.push({ type: "text", text: msg.content.content });
                    msg.content.attachments.forEach(att => {
                        const base64Data = att.data?.includes(',') ? att.data.split(',')[1] : att.data;
                        contentArray.push({
                            type: "image",
                            source: { type: "base64", media_type: att.type, data: base64Data }
                        });
                    });
                    return { role: msg.role, content: contentArray };
                }
                return { role: msg.role, content: msg.content.content };
            }
            if (msg.content.reasoning_content !== undefined) {
                return { role: msg.role, content: msg.content.content || '' };
            }
            return { role: msg.role, content: JSON.stringify(msg.content) };
        }
        if (typeof msg?.content === 'string') return msg;
        return { role: msg?.role || 'user', content: String(msg?.content ?? '') };
    });
}

function getCurrentContextUsageEstimate({ includeDraftInput = false } = {}) {
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (!chat) return null;

    const { modelName, provider } = getCurrentChatProviderAndModel(chat);
    const contextLimitTokens = getContextWindowTokensFromProvider(provider, modelName);

    let systemPrompt = chat.systemPrompt || state.settings.systemPrompt || '';
    if (state.activeSkillId) {
        const allCompanions = getAllCompanions();
        const skill = allCompanions.find(s => s.id === state.activeSkillId);
        if (skill?.prompt) systemPrompt = skill.prompt;
    }
    if (state.settings.enableSearch) {
        systemPrompt += "\n\n[System Nudge: Web Search is ENABLED. Please use your online search capabilities or tools to provide the most up-to-date information if the user's request requires it. If you don't have direct tools, acknowledge the current date and provide the best available knowledge.]";
    }

    let maxOutputTokens = chat.maxOutputTokens || 0;
    if (maxOutputTokens >= 8100) maxOutputTokens = 0;

    const draft = includeDraftInput ? (messageInput?.value || '') : '';
    const messagesForModel = buildMessagesForModelPreview(chat, draft);

    if (typeof estimateConversationTokens !== 'function') return null;
    return estimateConversationTokens({
        systemPrompt,
        messages: messagesForModel,
        maxOutputTokens,
        modelName,
        contextLimitTokens
    });
}

async function compressCurrentChatContext() {
    if (state.isStreaming) return;

    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (!chat) return;

    const { modelName, provider } = getCurrentChatProviderAndModel(chat);
    if (!provider?.apiKey || !provider?.endpoint) {
        showNotification('请先在设置中配置当前模型的服务商（Endpoint / API Key）', 'error', 4000);
        openSettings();
        return;
    }

    const keepLast = 6; // keep recent turns intact
    if ((chat.messages || []).length <= keepLast + 2) {
        showNotification('当前对话内容较少，无需压缩。', 'info', 2500);
        return;
    }

    // Build transcript from older messages (exclude existing summaries to avoid snowball)
    const older = (chat.messages || [])
        .filter(m => !(m?.role === 'system' && typeof m?.content === 'string' && m.content.includes('[对话摘要]')))
        .slice(0, Math.max(0, (chat.messages.length - keepLast)));

    const recent = (chat.messages || []).slice(-keepLast);

    const transcriptLines = [];
    for (const m of older) {
        const role = m?.role || 'assistant';
        let c = m?.content;
        if (Array.isArray(c)) {
            const parts = c.map(p => p?.type === 'text' ? p.text : '[image]').filter(Boolean).join(' ');
            transcriptLines.push(`${role}: ${parts}`);
        } else if (c && typeof c === 'object') {
            const text = c.content != null ? String(c.content) : JSON.stringify(c);
            const imgCount = Array.isArray(c.attachments) ? c.attachments.filter(a => String(a?.type || '').startsWith('image/')).length : 0;
            transcriptLines.push(`${role}: ${text}${imgCount ? ` [images:${imgCount}]` : ''}`);
        } else {
            transcriptLines.push(`${role}: ${String(c ?? '')}`);
        }
    }

    const instruction = [
        "你是一个对话压缩器。请把“对话记录”压缩成可用于后续继续对话的长期记忆摘要。",
        "要求：",
        "- 保留关键事实、用户目标、偏好、约束、已做过的尝试、结论、待办/未解决问题、重要上下文。",
        "- 用中文输出，结构化为要点列表，尽量短但信息密度高。",
        "- 不要编造未出现的信息；不需要客套。",
        "",
        "对话记录：",
        transcriptLines.join('\n')
    ].join('\n');

    showNotification('正在压缩上下文…', 'info', 1800);

    const res = await window.api.summarizeChat({
        endpoint: provider.endpoint,
        apiKey: provider.apiKey,
        modelName,
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.2,
        max_tokens: 800,
        messages: [{ role: 'user', content: instruction }]
    });

    if (!res?.ok || !res?.summary) {
        showNotification('压缩失败：' + (res?.error || 'Unknown error'), 'error', 6000);
        return;
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const summaryMsg = {
        role: 'system',
        content: `[对话摘要] (${stamp})\n${res.summary}`
    };

    chat.messages = [summaryMsg, ...recent];
    saveChats();
    renderMessages(chat.messages);
    scrollToBottom();
    showNotification('已压缩：早期对话已替换为摘要（保留最近 ' + keepLast + ' 条消息）', 'success', 3500);
}

// Textarea auto-resize - moved to setupEvents() in events.js