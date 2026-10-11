// chat.js - Chat management functions

// -----------------------------------------
// Chat Management Logics
// -----------------------------------------
function createNewChat() {
    if (typeof closeAllModals === 'function') closeAllModals();
    if (isChatBusy()) return;

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

    // -------------------------------------------------------------
    // 重置对比模式状态，确保新对话开始时是干净的
    // -------------------------------------------------------------
    state.isComparisonMode = false;
    state.selectedComparisonModels = [];
    messageContainer.classList.remove('comparison-layout');
    if (typeof updateComparisonToggleState === 'function') updateComparisonToggleState();
    
    // 同时也尝试还原窗口（如果之前是对比模式强制最大化的）
    if (state.wasMaximizedBeforeComparison === false && window.api && window.api.unmaximizeWindow) {
        window.api.unmaximizeWindow();
        state.wasMaximizedBeforeComparison = null;
    }

    state.chats.unshift(newChat); // Add to top
    state.isNewFreshChat = true;
    state._newlyCreatedId = newChat.id; // temporary tracker
    saveChats();
    renderChatList();
    switchChat(newChat.id);
}

function switchChat(chatId) {
    if (typeof closeAllModals === 'function') closeAllModals();
    if (isChatBusy()) return;

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

        requestAnimationFrame(() => {
            if (state.currentChatId !== chat.id) return;
            scrollToBottom();

            // 等待 DOM 布局完成后再显示（双 rAF 确保浏览器已完成 layout + paint）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (state.currentChatId !== chat.id) return;
                    // 先移除 switching 显示容器（no-animation 仍然保持，确保没有过渡动画）
                    messageContainer.classList.remove('switching');

                    // 再使用一帧延迟后移除 no-animation，恢复后续新消息的动画
                    requestAnimationFrame(() => {
                        if (state.currentChatId !== chat.id) return;
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

        // -------------------------------------------------------------
        // NEW: Per-chat Multi-Model Comparison Handling
        // -------------------------------------------------------------
        const wasComparison = state.isComparisonMode;
        
        // Check if the chat we are switching to has comparison enabled
        if (chat.isComparisonMode && chat.comparisonModels && chat.comparisonModels.length >= 2) {
            state.isComparisonMode = true;
            state.selectedComparisonModels = [...chat.comparisonModels];
            messageContainer.classList.add('comparison-layout');
            
            // Sync toggle button and select btn
            if (typeof updateComparisonToggleState === 'function') updateComparisonToggleState();
            const names = state.selectedComparisonModels.map(id => id.split('|')[1]);
            if (multiModelSelectBtn) multiModelSelectBtn.innerHTML = `<i class="ph ph-columns"></i> ${escapeHtml(names.join(' vs '))}`;

            // Force maximize for best view (with restoration support)
            if (window.api && window.api.isMaximized) {
                window.api.isMaximized().then(isMax => {
                    if (state.currentChatId !== chat.id || !state.isComparisonMode) return;
                    // Only record original state if we weren't already in comparison mode
                    if (!wasComparison) state.wasMaximizedBeforeComparison = isMax;
                    if (!isMax) window.api.maximizeWindow();
                });
            }
        } else {
            // Revert comparison mode if switching to a normal chat
            state.isComparisonMode = false;
            messageContainer.classList.remove('comparison-layout');
            if (typeof updateComparisonToggleState === 'function') updateComparisonToggleState();

            // Restore window if we previously forced maximize for comparison
            if (wasComparison && state.wasMaximizedBeforeComparison === false && window.api && window.api.unmaximizeWindow) {
                window.api.unmaximizeWindow();
                state.wasMaximizedBeforeComparison = null; // reset
            }
        }
        // Sync the layout first, then replace history before a send can append a live reply.
        renderMessages(chat.messages);
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
            <input type="checkbox" class="chat-item-checkbox" data-id="${escapeHtml(chat.id)}">
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
    return window.api.saveChats(state.chats).then(saved => {
        if (saved === false) throw new Error('未能写入对话文件');
        return saved;
    }).catch(error => {
        showNotification('对话保存失败：' + error.message + '。当前页面内容仍保留，请先导出对话。', 'error', 10000);
        return false;
    });
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
                        <span title="${escapeHtml(providerName)} · ${escapeHtml(mName)}">${escapeHtml(mName)}</span>
                    </div>
                    <div class="model-status">就绪</div>
                `;
                col.appendChild(header);

                // Column Body (List of messages)
                const body = document.createElement('div');
                body.className = 'comparison-body';
                body.id = comparisonColumnId(modelId);
                
                // Render this specific model's timeline
                messages.forEach(msg => {
                    const role = msg.role || 'assistant';
                    // Show every user message, but only assistant messages aimed at this specific model
                    if (role === 'user' || role === 'system' || (role === 'assistant' && (msg.comparisonModelId ? msg.comparisonModelId === modelId : (msg.comparisonModelName === mName || msg.comparisonModelName === modelId)))) {
                        const payload = (msg && typeof msg === 'object' && 'content' in msg) ? msg.content : msg;
                        const messageItem = renderMessageItem(role, payload, msg);
                        if (messageItem) {
                            messageItem.style.marginBottom = '20px'; // Add some spacing
                            body.appendChild(messageItem);
                        }
                    }
                });

                const lastResponse = messages.filter(msg => msg.role === 'assistant' && (msg.comparisonModelId
                    ? msg.comparisonModelId === modelId
                    : msg.comparisonModelName === mName || msg.comparisonModelName === modelId)).at(-1);
                if (lastResponse) header.querySelector('.model-status').textContent = { error: '发生错误', cancelled: '已停止', truncated: '达到输出上限', interrupted: '回复中断' }[lastResponse.status] || '✓ 完成';
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
                if (msg && typeof msg === 'object' && msg.role === 'assistant' && (msg.comparisonModelId || msg.comparisonModelName)) {
                    const compGroup = [];
                    while (i < messages.length && messages[i] && typeof messages[i] === 'object' && messages[i].role === 'assistant' && (messages[i].comparisonModelId || messages[i].comparisonModelName)) {
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
                        const status = { error: '发生错误', cancelled: '已停止', truncated: '达到输出上限', interrupted: '回复中断' }[cMsg.status] || '✓ 完成';
                        const header = document.createElement('div');
                        header.className = 'comparison-header';
                        header.innerHTML = '<div class="model-name"><strong>' + escapeHtml(pName) + '</strong></div><div class="model-status">' + status + '</div>';
                        const body = document.createElement('div');
                        body.className = 'comparison-body';
                        body.appendChild(renderMessageItem('assistant', cMsg.content, cMsg));
                        col.append(header, body);
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
    if (raw.length > RICH_TEXT_LIMIT) return '<pre class="long-text-content">' + escapeHtml(raw) + '</pre>';
    try {
        const sanitized = DOMPurify.sanitize(marked.parse(raw), {
            FORBID_TAGS: ['button', 'form', 'input', 'textarea', 'select', 'option', 'style'],
            FORBID_ATTR: ['id', 'name', 'style']
        });
        // Create application controls only after untrusted Markdown is sanitized.
        const root = document.createElement('div');
        root.innerHTML = sanitized;
        root.querySelectorAll('.code-block > pre > code[data-raw-b64]').forEach(code => {
            const block = code.closest('.code-block');
            let actions = block.querySelector('.code-actions');
            if (!actions) { actions = document.createElement('div'); actions.className = 'code-actions'; block.prepend(actions); }
            actions.replaceChildren();
            for (const [name, icon, label] of [['preview', 'play', '预览'], ['copy', 'copy', '复制']]) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'code-action-btn code-' + name + '-btn';
                button.title = label + '代码';
                button.innerHTML = '<i class="ph ph-' + icon + '"></i><span>' + label + '</span>';
                actions.appendChild(button);
            }
        });
        return root.innerHTML;
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
                    <div class="thinking-content markdown-body">${rawReasoning.length > RICH_TEXT_LIMIT ? '<div class="long-reasoning-slot"></div>' : renderMarkdownSafe(rawReasoning)}</div>
                </details>
            `;
        }
        if (rawContent != null && rawContent !== '') {
            htmlContent += rawContent.length > RICH_TEXT_LIMIT ? '<div class="long-content-slot"></div>' : `<div class="markdown-body">${renderMarkdownSafe(rawContent)}</div>`;
        }

        // Add attachments
        const attachments = (content && typeof content === 'object' && content.attachments) ? content.attachments : [];
        if (attachments.length > 0) {
            htmlContent += '<div class="attachments-container" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">';
            attachments.forEach(attachment => {
                const attachmentType = String(attachment?.type || '');
                const attachmentName = escapeHtml(attachment?.name || '附件');
                const attachmentData = String(attachment?.data || '');
                const isImage = attachmentType.startsWith('image/');
                const safeImageData = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(attachmentData)
                    ? escapeHtml(attachmentData)
                    : '';
                if (isImage) {
                    htmlContent += `
                        <div style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle);">
                            ${safeImageData ? `<img src="${safeImageData}" style="width: 100%; height: 100%; object-fit: cover;">` : '<i class="ph ph-image-broken"></i>'}
                            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, 0.6); color: white; font-size: 10px; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${attachmentName}
                            </div>
                        </div>
                    `;
                } else {
                    htmlContent += `
                        <div style="position: relative; width: 80px; height: 80px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-surface-elevated); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <i class="ph ph-file" style="font-size: 24px; color: var(--text-muted);"></i>
                            <div style="font-size: 10px; color: var(--text-secondary); text-align: center; padding: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 90%;">
                                ${attachmentName}
                            </div>
                        </div>
                    `;
                }
            });
            htmlContent += '</div>';
        }
    }

    if (fullMsgObj?.error) htmlContent += '<div class="message-error">❌ ' + escapeHtml(fullMsgObj.error) + '</div>';
    if (fullMsgObj?.warning) htmlContent += '<div class="message-warning">' + escapeHtml(fullMsgObj.warning) + '</div>';
    if (fullMsgObj?.status === 'cancelled') htmlContent += '<div class="tool-status">已停止生成</div>';

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
            ${role === 'assistant' && !fullMsgObj ? '<div class="request-status" role="status"></div>' : ''}
        </div>
    `;

    wrapper.querySelector('.long-content-slot')?.append(createLongTextView(String(dataRaw)).element);
    wrapper.querySelector('.long-reasoning-slot')?.append(createLongTextView(String(dataReasoning)).element);

    // Attempt to render history meta info if available
    if (fullMsgObj) {
        const textRawForCount = typeof dataRaw === 'string' ? dataRaw : String(dataRaw || '');
        const wordCount = countMessageWords(textRawForCount);

        if (role === 'assistant') {
            const tokens = fullMsgObj.usage?.total_tokens ?? fullMsgObj.usage?.completion_tokens ?? fullMsgObj.usage?.output_tokens ?? '—';
            const latencyS = fullMsgObj.firstTokenLatency != null ? (fullMsgObj.firstTokenLatency / 1000).toFixed(1) + 's' : '';

            let providerNameLabel = '';
            if (fullMsgObj.model && state.chats) {
                // Determine model provider name if available
                const chat = state.chats.find(c => c.id === state.currentChatId);
                if (chat && chat.model && chat.model.includes('|')) {
                    const pId = fullMsgObj.providerId || chat.model.split('|')[0];
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
            if (latencyS) parts.push('首个回复片段 ' + latencyS);
            if (fullMsgObj.totalDurationMs != null) parts.push('总耗时 ' + (fullMsgObj.totalDurationMs / 1000).toFixed(1) + 's');
            if (fullMsgObj.time) parts.push(fullMsgObj.time);

            const metaStr = parts.join(' · ');
            const messageContentEl = wrapper.querySelector('.message-content');
            if (messageContentEl) {
                const metaEl = document.createElement('div');
                metaEl.className = 'message-meta';
                metaEl.textContent = metaStr;
                messageContentEl.appendChild(metaEl);
            }
        } else if (role === 'user') {
            const parts = [`${wordCount} words`];
            if (fullMsgObj.time) parts.push(fullMsgObj.time);
            const metaStr = parts.join(' · ');
            const messageContentEl = wrapper.querySelector('.message-content');
            if (messageContentEl) {
                const metaEl = document.createElement('div');
                metaEl.className = 'message-meta';
                metaEl.style.textAlign = 'right';
                metaEl.textContent = metaStr;
                messageContentEl.appendChild(metaEl);
            }
        }
    }

    if (role === 'assistant' || role === 'user') {
        const copyBtn = wrapper.querySelector('.copy-btn');
        const messageContentEl = wrapper.querySelector('.message-content');
        copyBtn.addEventListener('click', () => copyToClipboard(getMessageRawText(messageContentEl), copyBtn));

        // Edit & resend for user messages
        const editBtn = wrapper.querySelector('.edit-msg-btn');
        if (editBtn && role === 'user') {
            editBtn.addEventListener('click', function handleEditClick() {
                if (isChatBusy()) return;
                const currentText = getMessageRawText(messageContentEl);
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
                    if (isChatBusy()) return;
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
        messageContentEl.rawText = dataRaw ?? '';
        if (String(dataRaw ?? '').length <= RICH_TEXT_LIMIT) messageContentEl.dataset.raw = dataRaw ?? '';
        if (String(dataReasoning ?? '').length <= RICH_TEXT_LIMIT) messageContentEl.dataset.reasoning = dataReasoning ?? '';
    }

    return wrapper;
}

function sendMessage() {
    if (isChatBusy()) return;
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (!chat) return;
    const comparison = state.isComparisonMode && state.selectedComparisonModels.length >= 2;
    const modelIds = comparison ? state.selectedComparisonModels : [chat.model];
    const text = messageInput.value.trim();
    const attachmentsList = document.getElementById('attachments-list');
    const attachments = Array.from(attachmentsList?.querySelectorAll('[data-file-name]') || []).map(item => ({
        name: item.dataset.fileName, type: item.dataset.fileType,
        size: parseInt(item.dataset.fileSize, 10), data: item.dataset.fileData
    }));
    if (!text && attachments.length === 0) return;
    const messageContent = { content: text, ...(attachments.length ? { attachments } : {}) };
    let finalSystemPrompt = chat.systemPrompt ?? state.settings.systemPrompt ?? '';
    const overrides = getConversationNumericOverrides(chat);
    const enableThinking = chat.enableThinking ?? (state.settings.enableThinking !== false);
    const skill = state.activeSkillId && getAllCompanions().find(s => s.id === state.activeSkillId);
    if (skill?.prompt) finalSystemPrompt = skill.prompt;
    if (state.settings.enableSearch) finalSystemPrompt += '\n\n[System Nudge: Web Search is ENABLED. Use available search tools when needed.]';
    const requests = [];
    try {
        for (const modelId of modelIds) {
            const [providerId, modelName] = String(modelId || '').split('|');
            const provider = (state.settings.providers || []).find(p => p.id === providerId);
            if (!provider || !modelName || !provider.endpoint || !provider.apiKey) {
                throw new Error('请先配置所有选中模型的服务商、API Key 和模型 ID。');
            }
            const parameterInfo = getModelParameterInfo(getConversationModelMetadata(provider, modelName));
            validateModelParameterOverrides(overrides, parameterInfo);
            const messages = prepareMessagesForModel([...chat.messages, { role: 'user', content: messageContent }], provider, modelName, comparison);
            if (typeof estimateConversationTokens === 'function') {
                const est = estimateConversationTokens({ systemPrompt: finalSystemPrompt, messages, modelName,
                    contextLimitTokens: getContextWindowTokensFromProvider(provider, modelName) });
                if (est.estimatedTotal > Math.floor(est.contextLimit * 0.98)) showNotification('模型「' + modelName + '」输入可能超过上下文上限（估算）。完整输入仍会发送，实际限制由服务端校验。', 'warning', 8000);
                if (est.estimatedTotal > Math.floor(est.contextLimit * 0.85)) showNotification('模型「' + modelName + '」接近上下文上限。', 'warning');
            }
            requests.push({ requestId: generateId(), endpoint: provider.endpoint, providerId, modelName,
                systemPrompt: finalSystemPrompt, messages, chatId: chat.id, isComparisonStream: comparison,
                enableThinking, ...Object.fromEntries(['temperature', 'top_p'].filter(key => overrides[key] !== undefined).map(key => [key, overrides[key]])),
                mcpServerIds: (state.settings.mcpServers || []).filter(s => (state.enabledMcpServerIds || []).includes(s.id)).map(s => s.id) });
        }
    } catch (error) {
        showNotification(error.message, 'error', 6000);
        return;
    }
    chat.skillId = state.activeSkillId || null;
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


    if (attachmentsList) attachmentsList.innerHTML = '';
    const attachmentsPreview = document.getElementById('attachments-preview');
    if (attachmentsPreview) attachmentsPreview.style.display = 'none';
    for (const id of ['image-upload-input', 'file-upload-input']) {
        const input = document.getElementById(id);
        if (input) input.value = '';
    }
    if (comparison) renderComparisonEmptyState();
    beginChatRequests(requests);
    for (const request of requests) {
        try { window.api.sendMessageStream(request); }
        catch (error) { finishChatRequest({ ...request, error: error.message }); }
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
    return getModelParameterInfo(getConversationModelMetadata(provider, modelName)).contextWindowTokens || null;
}

function buildMessagesForModelPreview(chat, extraUserText = '') {
    if (!chat) return [];
    const { provider, modelName } = getCurrentChatProviderAndModel(chat);
    let messages = chat.messages || [];
    const trimmed = String(extraUserText || '').trim();
    if (trimmed) messages = [...messages, { role: 'user', content: { content: trimmed } }];
    if (!provider) return messages;
    try {
        return prepareMessagesForModel(messages, provider, modelName, !!chat.isComparisonMode);
    } catch (_) {
        // Estimation remains available even if a model cannot accept a stored attachment.
        return messages;
    }
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

    const draft = includeDraftInput ? (messageInput?.value || '') : '';
    const messagesForModel = buildMessagesForModelPreview(chat, draft);

    if (typeof estimateConversationTokens !== 'function') return null;
    return estimateConversationTokens({
        systemPrompt,
        messages: messagesForModel,
        modelName,
        contextLimitTokens
    });
}

async function compressCurrentChatContext() {
    if (isChatBusy()) return;
    const chat = state.chats.find(c => c.id === state.currentChatId);
    if (!chat) return;
    const { modelName, provider } = getCurrentChatProviderAndModel(chat);
    if (!provider?.apiKey || !provider?.endpoint) {
        showNotification('请先配置当前模型的服务商', 'error');
        return;
    }
    const keepLast = 6;
    const snapshot = chat.messages.slice();
    if (snapshot.length <= keepLast + 2) {
        showNotification('当前对话内容较少，无需压缩。', 'info');
        return;
    }
    const older = snapshot.slice(0, -keepLast);
    const transcript = older.map(m => {
        const payload = m.content;
        const text = Array.isArray(payload)
            ? payload.filter(part => part?.type === 'text').map(part => part.text).join(' ')
            : typeof payload === 'string' ? payload : (payload?.content || '');
        const files = (payload?.attachments || []).map(a => '[附件: ' + a.name + ']').join(' ');
        const model = m.comparisonModelId || m.comparisonModelName;
        return m.role + (model ? ' (' + model + ')' : '') + ': ' + text + ' ' + files;
    }).join('\n');
    state.isCompressing = true;
    updateRequestControls();
    try {
        showNotification('正在压缩上下文…', 'info');
        const res = await window.api.summarizeChat({ endpoint: provider.endpoint, providerId: provider.id, modelName,
            systemPrompt: 'You are a helpful assistant.', temperature: 0.2, max_tokens: 800,
            messages: [{ role: 'user', content: '请把下列对话及已有摘要合并成中文长期记忆摘要。保留关键事实、目标、约束和待办，不要编造。\n\n' + transcript }] });
        if (!res?.ok || !res.summary) throw new Error(res?.error || '未收到摘要');
        // Do not overwrite edits or deleted conversations. Preserve any appended messages.
        if (!state.chats.includes(chat) || !snapshot.every((m, i) => chat.messages[i] === m)) throw new Error('对话已发生变化，请重新压缩。');
        const appended = chat.messages.slice(snapshot.length);
        chat.messages = [{ role: 'system', content: '[对话摘要] (' + new Date().toLocaleString() + ')\n' + res.summary }, ...snapshot.slice(-keepLast), ...appended];
        saveChats();
        if (state.currentChatId === chat.id) { renderMessages(chat.messages); scrollToBottom(); }
        showNotification('已压缩早期对话，保留最近 ' + keepLast + ' 条消息。', 'success');
    } catch (error) {
        showNotification('压缩失败：' + error.message, 'error', 6000);
    } finally {
        state.isCompressing = false;
        updateRequestControls();
    }
}

// Textarea auto-resize - moved to setupEvents() in events.js
