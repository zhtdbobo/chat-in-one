// Initial app state
let state = {
    settings: {}, // will hold endpoint, apiKey, modelName, systemPrompt
    chats: [],    // Array of { id, title, messages: [] }
    currentChatId: null,
    isStreaming: false,
    currentStreamDiv: null
};

// DOM Elements
const chatListEl = document.getElementById('chat-list');
const messageContainer = document.getElementById('message-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const settingsBtn = document.getElementById('settings-btn');

// Settings Modal
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

// Status badging & controls
const currentChatTitle = document.getElementById('current-chat-title');
const welcomeScreen = document.getElementById('welcome-screen');
const toolsRightEl = document.querySelector('.tools-right');

// Configure Marked.js syntax highlighting
marked.setOptions({
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
});

// Helper: Generate UUID
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

// -----------------------------------------
// Initialization
// -----------------------------------------
async function initApp() {
    // 1. Load data via IPC securely
    state.settings = await window.api.getSettings();
    state.chats = await window.api.getChats() || [];

    // Migrate old settings
    if (!state.settings.providers && state.settings.endpoint) {
        state.settings.providers = [{
            id: 'default',
            name: '\u9ed8\u8ba4\u670d\u52a1\u5546',
            endpoint: state.settings.endpoint,
            apiKey: state.settings.apiKey,
            models: state.settings.modelName || ''
        }];
    }
    if (state.settings.enableThinking === undefined) {
        state.settings.enableThinking = true;
    }

    // 2. Setup UI events
    setupEvents();

    // Render loaded data
    updateBadge();
    renderChatList();
    applyTheme(state.settings.theme || 'light');

    // Choose active chat
    if (state.chats.length > 0) {
        switchChat(state.chats[0].id);
    }
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
    if (window.api && window.api.updateTitlebarTheme) {
        window.api.updateTitlebarTheme(theme);
    }
}

function updateBadge() {
    state.settings.providers = state.settings.providers || [];
    renderSearchableModelSelect();
}

// -----------------------------------------
// Searchable Model Select Implementation
// -----------------------------------------
let modelSearchQuery = '';
function renderSearchableModelSelect() {
    const container = document.querySelector('.tools-right');
    container.innerHTML = `
        <div class="searchable-select" id="model-searchable-select">
            <div class="select-trigger">
                <i class="ph ph-cpu"></i>
                <span class="selected-value">选择模型...</span>
                <i class="ph ph-caret-down"></i>
            </div>
            <div class="select-dropdown">
                <div class="select-search">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" placeholder="搜索模型..." id="model-search-input">
                </div>
                <div class="select-options" id="model-options-list"></div>
            </div>
        </div>
    `;

    const trigger = container.querySelector('.select-trigger');
    const dropdown = container.querySelector('.select-dropdown');
    const searchInput = container.querySelector('#model-search-input');
    const optionsList = container.querySelector('#model-options-list');
    const selectedText = container.querySelector('.selected-value');

    const activeChat = state.chats.find(c => c.id === state.currentChatId);
    let currentVal = activeChat ? activeChat.model : '';

    const refreshOptions = () => {
        optionsList.innerHTML = '';
        const query = modelSearchQuery.toLowerCase();
        let firstMatch = null;

        state.settings.providers.forEach(p => {
            const models = (p.models || "").split(',').map(m => m.trim()).filter(m => m);
            const filtered = models.filter(m => m.toLowerCase().includes(query));

            if (filtered.length > 0) {
                const groupLabel = document.createElement('div');
                groupLabel.className = 'option-group-label';
                groupLabel.textContent = p.name || '未命名服务商';
                optionsList.appendChild(groupLabel);

                filtered.forEach(m => {
                    const val = `${p.id}|${m}`;
                    const opt = document.createElement('div');
                    opt.className = `select-option ${val === currentVal ? 'selected' : ''}`;
                    opt.textContent = m;
                    opt.dataset.value = val;
                    if (!firstMatch) firstMatch = opt;

                    if (val === currentVal) {
                        selectedText.textContent = m;
                    }

                    opt.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (!state.currentChatId) return;
                        const chat = state.chats.find(c => c.id === state.currentChatId);
                        if (chat) {
                            chat.model = val;
                            saveChats();
                            currentVal = val;
                            renderSearchableModelSelect();
                            dropdown.classList.remove('show');
                        }
                    });
                    optionsList.appendChild(opt);
                });
            }
        });

        if (!currentVal && firstMatch) {
            // handle initial display if no model selected
        }
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        document.querySelectorAll('.select-dropdown.show').forEach(d => d.classList.remove('show'));
        if (!isOpen) {
            dropdown.classList.add('show');
            searchInput.focus();
            modelSearchQuery = '';
            searchInput.value = '';
            refreshOptions();
        }
    });

    searchInput.addEventListener('input', (e) => {
        modelSearchQuery = e.target.value;
        refreshOptions();
    });

    searchInput.addEventListener('click', e => e.stopPropagation());

    document.addEventListener('click', () => {
        dropdown.classList.remove('show');
    });

    refreshOptions();
}

// -----------------------------------------
// Events
// -----------------------------------------
function setupEvents() {
    // Settings Tabs Event
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget;
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            target.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const paneId = target.getAttribute('data-tab');
            document.getElementById(paneId).classList.add('active');
        });
    });

    // Settings modal interactions
    document.getElementById('add-provider-btn').addEventListener('click', () => {
        addProviderBlock({ id: generateId(), name: '', endpoint: '', apiKey: '', models: '' });
    });
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);
    settingsForm.addEventListener('submit', handleSettingsSave);

    // Chat actions
    newChatBtn.addEventListener('click', createNewChat);

    // Import / Export
    document.getElementById('export-chats-btn').addEventListener('click', exportChats);
    document.getElementById('import-chats-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importChats);

    // Removed old currentModelSelect listener since it's now handled by the custom select


    // Sidebar Resizer logic
    const resizer = document.getElementById('sidebar-resizer');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        resizer.classList.add('active');
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            resizer.classList.remove('active');
            state.settings.sidebarWidth = document.documentElement.style.getPropertyValue('--sidebar-width');
            window.api.saveSettings(state.settings);
        }
    });

    // Restore sidebar width on init
    if (state.settings.sidebarWidth) {
        document.documentElement.style.setProperty('--sidebar-width', state.settings.sidebarWidth);
    }

    // Messaging
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Stream IPC Listeners
    window.api.onStreamStart((data) => {
        state.isStreaming = true;
        sendBtn.disabled = true;
        const div = renderMessageItem('assistant', '');
        state.currentStreamDiv = div.querySelector('.message-content');
        scrollToBottom();
    });

    window.api.onStreamChunk((data) => {
        if (!state.currentStreamDiv) return;

        if (data.reasoning_content) {
            const currentReasoning = state.currentStreamDiv.dataset.reasoning || '';
            state.currentStreamDiv.dataset.reasoning = currentReasoning + data.reasoning_content;
        }
        if (data.content) {
            const currentRaw = state.currentStreamDiv.dataset.raw || '';
            state.currentStreamDiv.dataset.raw = currentRaw + data.content;
        }

        const rawContent = state.currentStreamDiv.dataset.raw || '';
        const rawReasoning = state.currentStreamDiv.dataset.reasoning || '';

        let finalHtml = '';
        if (rawReasoning && state.settings.enableThinking !== false) {
            const isStreamingComplete = !state.isStreaming;
            const parsedReasoningHtml = marked.parse(rawReasoning);
            finalHtml += `
                <details class="thinking-block" ${!isStreamingComplete ? 'open' : ''}>
                    <summary><i class="ph ph-brain"></i> 思考过程</summary>
                    <div class="thinking-content markdown-body">${DOMPurify.sanitize(parsedReasoningHtml)}</div>
                </details>
            `;
        }

        if (rawContent) {
            const parsedHtml = marked.parse(rawContent);
            finalHtml += `<div class="markdown-body">${DOMPurify.sanitize(parsedHtml)}</div>`;
        }

        state.currentStreamDiv.innerHTML = finalHtml || '<div class="markdown-body"></div>';
        scrollToBottom();
    });

    window.api.onStreamEnd((data) => {
        finalizeStream(data.chatId);
    });

    window.api.onStreamError((data) => {
        if (state.currentStreamDiv) {
            state.currentStreamDiv.innerHTML += `<br><span style="color:red"> [发生错误: ${data.error}]</span>`;
        } else {
            renderMessageItem('system', `API 连接错误: ${data.error}`);
        }
        finalizeStream(data.chatId);
    });
}

function finalizeStream(chatId) {
    state.isStreaming = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // Save to state
    if (state.currentStreamDiv) {
        const finalContent = state.currentStreamDiv.dataset.raw || '';
        const finalReasoning = state.currentStreamDiv.dataset.reasoning || '';

        // After stream is done, close the reasoning details
        const detailsEl = state.currentStreamDiv.querySelector('details.thinking-block');
        if (detailsEl) detailsEl.removeAttribute('open');

        const chat = state.chats.find(c => c.id === chatId);
        if (chat) {
            chat.messages.push({ role: 'assistant', content: finalContent, reasoning_content: finalReasoning });

            // Auto generate title for first message
            if (chat.messages.length === 2) {
                const titleSource = chat.messages[0].content;
                chat.title = titleSource.substring(0, 15) + (titleSource.length > 15 ? '...' : '');
                renderChatList();
            }
            saveChats();
        }
    }
    state.currentStreamDiv = null;
    scrollToBottom();
}

// -----------------------------------------
// Settings Logics
// -----------------------------------------
// -----------------------------------------
// Settings Master-Detail Refactoring
// -----------------------------------------
let tempProviders = [];
let currentProviderIndex = -1;

function openSettings() {
    tempProviders = JSON.parse(JSON.stringify(state.settings.providers || []));
    currentProviderIndex = tempProviders.length > 0 ? 0 : -1;

    document.getElementById('system-prompt').value = state.settings.systemPrompt || '';
    document.getElementById('enable-thinking').checked = state.settings.enableThinking !== false;

    renderProvidersSidebar();
    renderProviderDetail();

    // Reset tabs
    document.querySelectorAll('.settings-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === 0));

    settingsModal.style.display = 'flex';
}

function renderProvidersSidebar() {
    const list = document.getElementById('providers-list-menu');
    list.innerHTML = '';
    tempProviders.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = `provider-menu-item ${index === currentProviderIndex ? 'active' : ''}`;
        item.innerHTML = `
            <i class="ph ph-cloud"></i>
            <span>${p.name || '未命名服务商'}</span>
        `;
        item.addEventListener('click', () => {
            saveCurrentProviderData();
            currentProviderIndex = index;
            renderProvidersSidebar();
            renderProviderDetail();
        });
        list.appendChild(item);
    });

    // Add Provider Button
    document.getElementById('add-provider-btn').onclick = () => {
        const newP = { id: generateId(), name: '', endpoint: '', apiKey: '', models: '' };
        tempProviders.push(newP);
        currentProviderIndex = tempProviders.length - 1;
        renderProvidersSidebar();
        renderProviderDetail();
    };
}

function saveCurrentProviderData() {
    if (currentProviderIndex === -1 || !tempProviders[currentProviderIndex]) return;
    const detail = document.getElementById('provider-detail-container');
    const nameInput = detail.querySelector('.prov-name');
    if (nameInput) {
        tempProviders[currentProviderIndex].name = nameInput.value.trim();
        tempProviders[currentProviderIndex].apiKey = detail.querySelector('.prov-apikey').value.trim();
        tempProviders[currentProviderIndex].endpoint = detail.querySelector('.prov-endpoint').value.trim();
        // Models are updated via checkbox listeners or on fetch
    }
}

function renderProviderDetail() {
    const container = document.getElementById('provider-detail-container');
    if (currentProviderIndex === -1) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-selection-plus"></i>
                <p>请从左侧选择一个服务商，或点击添加按钮</p>
            </div>
        `;
        return;
    }

    const provider = tempProviders[currentProviderIndex];
    container.innerHTML = `
        <div class="provider-detail-header">
            <h3>服务商配置</h3>
            <button type="button" class="btn btn-ghost btn-danger btn-sm" id="del-current-provider">
                <i class="ph ph-trash"></i> 删除该服务商
            </button>
        </div>
        <div class="form-group">
            <label>服务商名称</label>
            <input type="text" class="prov-name" value="${provider.name || ''}" placeholder="例如: OpenAI">
        </div>
        <div class="form-group">
            <label>API Key</label>
            <input type="password" class="prov-apikey" value="${provider.apiKey || ''}" placeholder="sk-...">
        </div>
        <div class="form-group">
            <label>API Endpoint</label>
            <input type="url" class="prov-endpoint" value="${provider.endpoint || ''}" placeholder="https://api.openai.com/v1">
        </div>
        
        <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label style="margin:0">可见模型列表</label>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-ghost btn-sm" id="fetch-models-btn">
                        <i class="ph ph-arrows-counter-clockwise"></i> 获取模型
                    </button>
                </div>
            </div>
            <div class="multi-select-models" id="models-checklist">
                <!-- Checklist will be here -->
            </div>
        </div>
    `;

    // Render Checklist
    const renderChecklist = () => {
        const checklist = container.querySelector('#models-checklist');
        const models = (provider.models || "").split(',').map(m => m.trim()).filter(m => m);
        checklist.innerHTML = models.length === 0 ? '<div style="font-size:12px; color:var(--text-muted); padding:8px">暂无模型。请点击获取。</div>' : '';

        models.forEach(m => {
            const item = document.createElement('div');
            item.className = 'model-check-item';
            item.innerHTML = `
                <input type="checkbox" checked id="chk-${m}" value="${m}">
                <label for="chk-${m}">${m}</label>
            `;
            // If we had a mechanism to unselect, we'd use it here. 
            // For now, provider.models IS the list of selected models.
            // When we fetch, we append.
            item.querySelector('input').addEventListener('change', (e) => {
                const currentModels = (provider.models || "").split(',').map(m => m.trim()).filter(m => m);
                if (e.target.checked) {
                    if (!currentModels.includes(m)) currentModels.push(m);
                } else {
                    const idx = currentModels.indexOf(m);
                    if (idx > -1) currentModels.splice(idx, 1);
                }
                provider.models = currentModels.join(', ');
            });
            checklist.appendChild(item);
        });
    };
    renderChecklist();

    // Bindings
    container.querySelector('#del-current-provider').onclick = () => {
        if (confirm('确认删除此服务商？')) {
            tempProviders.splice(currentProviderIndex, 1);
            currentProviderIndex = tempProviders.length > 0 ? 0 : -1;
            renderProvidersSidebar();
            renderProviderDetail();
        }
    };

    container.querySelector('#fetch-models-btn').onclick = async () => {
        const url = container.querySelector('.prov-endpoint').value.trim();
        const key = container.querySelector('.prov-apikey').value.trim();
        if (!url) { alert("请先填写Endpoint"); return; }

        try {
            const btn = container.querySelector('#fetch-models-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 请求中...';

            const fetchPath = url.endsWith('/') ? url + 'models' : url + '/models';
            const req = await fetch(fetchPath, { headers: { 'Authorization': 'Bearer ' + key } });
            if (!req.ok) throw new Error("HTTP " + req.status);
            const data = await req.json();
            if (data && data.data) {
                const ids = data.data.map(m => m.id).filter(id => id);
                const existing = (provider.models || "").split(',').map(m => m.trim()).filter(m => m);
                const merged = [...new Set([...existing, ...ids])];
                provider.models = merged.join(', ');
                renderProviderDetail();
                alert(`成功获取并合并了 ${ids.length} 个模型！`);
            }
        } catch (e) {
            alert("获取失败: " + e.message);
        } finally {
            const btn = container.querySelector('#fetch-models-btn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-arrows-counter-clockwise"></i> 获取模型';
            }
        }
    };
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function handleSettingsSave(e) {
    e.preventDefault();
    saveCurrentProviderData();

    const newSettings = {
        systemPrompt: document.getElementById('system-prompt').value.trim(),
        enableThinking: document.getElementById('enable-thinking').checked,
        theme: state.settings.theme || 'light',
        sidebarWidth: state.settings.sidebarWidth || '260px',
        providers: tempProviders
    };

    state.settings = newSettings;
    await window.api.saveSettings(newSettings);
    updateBadge();
    closeSettings();
}

// -----------------------------------------
// Import / Export Logics
// -----------------------------------------
function exportChats() {
    if (state.chats.length === 0) {
        alert("没有可导出的对话。");
        return;
    }
    const dataStr = JSON.stringify(state.chats, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_history_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importChats(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const importedChats = JSON.parse(event.target.result);
            if (!Array.isArray(importedChats)) {
                throw new Error("Invalid format");
            }

            // Merge or replace options. Here we simply prepend and avoid ID collision.
            const existingIds = new Set(state.chats.map(c => c.id));
            importedChats.forEach(chat => {
                if (!chat.id || !chat.messages) return;
                // Basic validation
                if (existingIds.has(chat.id)) {
                    chat.id = generateId(); // Assign a new ID to avoid conflict
                }
                state.chats.unshift(chat);
            });
            saveChats();
            renderChatList();
            if (state.chats.length > 0) switchChat(state.chats[0].id);
            alert("导入成功！");
        } catch (error) {
            alert("文件格式不正确，导入失败。");
            console.error(error);
        }
        // Reset file input
        e.target.value = '';
    };
    reader.readAsText(file);
}

function exportSingleChat(chatId) {
    if (!chatId) return;
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || chat.messages.length === 0) {
        alert("当前对话为空，无法导出。");
        return;
    }
    const dataStr = JSON.stringify([chat], null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${chat.title}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function deleteSingleChat(chatId) {
    if (!chatId) return;
    if (confirm("确定要删除当前对话吗？此操作不可恢复。")) {
        state.chats = state.chats.filter(c => c.id !== chatId);
        saveChats();
        renderChatList();

        if (state.currentChatId === chatId) {
            if (state.chats.length > 0) {
                switchChat(state.chats[0].id);
            } else {
                createNewChat();
            }
        }
    }
}

// -----------------------------------------
// Chat Management Logics
// -----------------------------------------
function createNewChat() {
    if (state.isStreaming) return;

    // Get default model from first provider if available
    let defaultModel = '';
    const providers = state.settings.providers || [];
    if (providers.length > 0) {
        const p = providers[0];
        const models = (p.models || "").split(',').map(m => m.trim()).filter(m => m);
        if (models.length > 0) {
            defaultModel = `${p.id}|${models[0]}`;
        }
    }

    const newChat = {
        id: generateId(),
        title: "新对话",
        model: defaultModel,
        messages: []
    };

    state.chats.unshift(newChat); // Add to top
    saveChats();
    renderChatList();
    switchChat(newChat.id);
}

function switchChat(chatId) {
    if (state.isStreaming) return;

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
                    chat.model = `${p.id} | ${chat.model}`;
                    found = true; break;
                }
            }
            if (!found && providers.length > 0) {
                chat.model = `${providers[0].id} | ${chat.model}`;
            }
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

        div.innerHTML = `
            <i class="ph ph-chat-circle"></i>
            <span class="chat-item-title">${chat.title}</span>
            <div class="chat-actions">
                <button class="export-btn" title="导出"><i class="ph ph-export"></i></button>
                <button class="del-btn" title="删除"><i class="ph ph-trash"></i></button>
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (e.target.closest('.export-btn')) {
                exportSingleChat(chat.id);
            } else if (e.target.closest('.del-btn')) {
                deleteSingleChat(chat.id);
            } else {
                switchChat(chat.id);
            }
        });

        chatListEl.appendChild(div);
    });
}

function saveChats() {
    window.api.saveChats(state.chats);
}

// -----------------------------------------
// Messaging Logics
// -----------------------------------------
function renderMessages(messages) {
    messageContainer.innerHTML = '';

    if (messages.length === 0) {
        welcomeScreen.style.display = 'flex';
        messageContainer.appendChild(welcomeScreen);
    } else {
        welcomeScreen.style.display = 'none';
        messages.forEach(msg => {
            renderMessageItem(msg.role, msg.content);
        });

        // Format syntax highlighting manually on full render
        messageContainer.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
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

    const dataRaw = encodeURIComponent(content.content !== undefined ? content.content : content);
    const dataReasoning = content.reasoning_content ? encodeURIComponent(content.reasoning_content) : '';

    wrapper.innerHTML = `
        <div class="avatar">${icon}</div>
        <div class="message-content" data-raw="${decodeURIComponent(dataRaw)}" data-reasoning="${decodeURIComponent(dataReasoning)}">
            ${htmlContent || '<div class="markdown-body"></div>'}
        </div>
    `;

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

    messageInput.value = '';
    messageInput.style.height = 'auto'; // reset textarea height
    scrollToBottom();

    saveChats();

    // Dispatch to Electron Main Process
    window.api.sendMessageStream({
        endpoint: provider.endpoint,
        apiKey: provider.apiKey,
        modelName: modelName,
        systemPrompt: state.settings.systemPrompt,
        messages: chat.messages,
        chatId: chat.id
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

// Boot the app
document.addEventListener('DOMContentLoaded', initApp);
