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
        welcomeScreen.style.display = 'none';
        if (companionsPanel) companionsPanel.style.display = 'none';

        messages.forEach(msg => {
            try {
                // msg 常见形态：
                // - { role, content: string|object }
                // - 早期版本可能直接是字符串/对象（无 role）
                const role = msg && typeof msg === 'object' && msg.role ? msg.role : 'assistant';
                const payload = (msg && typeof msg === 'object' && 'content' in msg) ? msg.content : msg;

                const messageItem = renderMessageItem(role, payload);
                if (messageItem) fragment.appendChild(messageItem);
            } catch (e) {
                console.error('Failed to render message item:', e, msg);
            }
        });
    }

    // 核心改进：只清空消息列表，而不是整个消息容器
    messagesList.innerHTML = '';
    messagesList.appendChild(fragment);

    // 手动触发代码高亮（仅当 hljs 可用时，避免在缺少高亮库时导致整段渲染失败）
    if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
        messagesList.querySelectorAll('pre code').forEach((block) => {
            try {
                hljs.highlightElement(block);
            } catch (e) {
                console.error('Highlight error:', e);
            }
        });
    }

    if (typeof attachCodeBlockCopyButtons === 'function') {
        attachCodeBlockCopyButtons(messagesList);
    }

    requestAnimationFrame(() => {
        scrollToBottom();
    });
}

function renderMarkdownSafe(text) {
    const raw = typeof text === 'string' ? text : String(text ?? '');
    try {
        return DOMPurify.sanitize(marked.parse(raw));
    } catch (e) {
        console.error('Markdown render error, fallback to plain text:', e);
        return `<pre class="markdown-body">${escapeHtml(raw)}</pre>`;
    }
}

function renderMessageItem(role, content) {
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
                </div>
            ` : ''}
        </div>
    `;

    if (role === 'assistant' || role === 'user') {
        const copyBtn = wrapper.querySelector('.copy-btn');
        const messageContentEl = wrapper.querySelector('.message-content');
        copyBtn.addEventListener('click', () => copyToClipboard(messageContentEl?.dataset?.raw || '', copyBtn));
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

    // Process User Message
    let messageContent;
    if (attachments.length > 0) {
        // For messages with attachments
        messageContent = {
            content: text,
            attachments: attachments
        };
    } else {
        // For plain text messages, use object format to match assistant messages
        messageContent = {
            content: text
        };
    }

    chat.messages.push({ role: 'user', content: messageContent });
    const userMsgEl = renderMessageItem('user', messageContent);
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

    // Get conversation-specific settings
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
    let messagesToSend = chat.messages;
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

function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Textarea auto-resize - moved to setupEvents() in events.js