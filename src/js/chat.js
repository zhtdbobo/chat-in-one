// chat.js - Chat management functions

// -----------------------------------------
// Chat Management Logics
// -----------------------------------------
function createNewChat() {
    closeAllModals();
    if (state.isStreaming) return;

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
    closeAllModals();
    if (state.isStreaming) return;

    // Only keep flag if we are switching to the chat we just created
    if (state._newlyCreatedId !== chatId) {
        state.isNewFreshChat = false;
    }
    state._newlyCreatedId = null; // consume it

    state.currentChatId = chatId;
    const chat = state.chats.find(c => c.id === chatId);

    if (chat) {
        currentChatTitle.textContent = chat.title;
        renderMessages(chat.messages);

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
            const skill = (state.settings.skills || []).find(s => s.id === chat.skillId);
            if (skill) {
                const info = getCompanionIconInfo(skill.name);
                iconHtml = `<i class="ph-fill ${info.icon}" style="color: ${info.color}"></i>`;
            }
        }

        div.innerHTML = `
            <input type="checkbox" class="chat-item-checkbox" data-id="${chat.id}">
            ${iconHtml}
            <span class="chat-item-title">${chat.title}</span>
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

    // Close menus when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.chat-actions-menu.show').forEach(m => m.classList.remove('show'));
    }, { once: true });
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
    messageContainer.innerHTML = '';

    const companionsPanel = document.getElementById('companions-panel');

    if (messages.length === 0) {
        updateWelcomeScreen();
        renderSkillsBar(); // Ensure bar is updated for new chat
        welcomeScreen.style.display = 'flex';
        messageContainer.appendChild(welcomeScreen);
        // Show companions panel on new/empty chat if enabled in settings
        if (companionsPanel) {
            companionsPanel.style.display = (state.settings.showCompanionsInNewChat !== false) ? '' : 'none';
        }
    } else {
        welcomeScreen.style.display = 'none';
        // Hide companions panel when there are messages
        if (companionsPanel) companionsPanel.style.display = 'none';
        messages.forEach(msg => {
            renderMessageItem(msg.role, msg.content);
        });

        // Format syntax highlighting manually on full render
        messageContainer.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
        if (typeof attachCodeBlockCopyButtons === 'function') {
            attachCodeBlockCopyButtons(messageContainer);
        }
        scrollToBottom();
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
        htmlContent = `<div class="markdown-body">${content}</div>`;
    } else if (role === 'assistant' || role === 'user') {
        const rawContent = content.content !== undefined ? content.content : content;
        const rawReasoning = content.reasoning_content || '';

        if (rawReasoning && state.settings.enableThinking !== false) {
            htmlContent += `
                <details class="thinking-block">
                    <summary><i class="ph ph-brain"></i> 思考过程</summary>
                    <div class="thinking-content markdown-body">${DOMPurify.sanitize(marked.parse(rawReasoning))}</div>
                </details>
            `;
        }
        if (rawContent) {
            htmlContent += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(rawContent))}</div>`;
        }
    }

    const dataRaw = content?.content !== undefined ? content.content : content;
    const dataReasoning = content?.reasoning_content || '';

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

    messageContainer.appendChild(wrapper);
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
    if (!text) return;

    // Process User Message
    chat.messages.push({ role: 'user', content: text });
    renderMessageItem('user', { content: text });

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

    saveChats();

    let finalSystemPrompt = state.settings.systemPrompt || '';

    // Skill Override
    if (state.activeSkillId) {
        chat.skillId = state.activeSkillId; // 把搭档关联到当前对话
        const skill = (state.settings.skills || []).find(s => s.id === state.activeSkillId);
        if (skill && skill.prompt) {
            finalSystemPrompt = skill.prompt;
        }
    }

    if (state.settings.enableSearch) {
        finalSystemPrompt += "\n\n[System Nudge: Web Search is ENABLED. Please use your online search capabilities or tools to provide the most up-to-date information if the user's request requires it. If you don't have direct tools, acknowledge the current date and provide the best available knowledge.]";
    }

    // Dispatch to Electron Main Process
    window.api.sendMessageStream({
        endpoint: provider.endpoint,
        apiKey: provider.apiKey,
        modelName: modelName,
        systemPrompt: finalSystemPrompt,
        messages: chat.messages,
        chatId: chat.id,
        enableThinking: state.settings.enableThinking !== false,
        enableSearch: !!state.settings.enableSearch,
        mcpServers: (state.settings.mcpServers || []).filter(s =>
            (state.enabledMcpServerIds || []).includes(s.id)
        )
    });
}

function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Textarea auto-resize
messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});