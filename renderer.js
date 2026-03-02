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
const toggleSearchBtn = document.getElementById('toggle-search-btn');

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
    updateThinkingBtnState();
    updateSearchBtnState();
    renderMcpSelectionDropdown();
    renderSkillsBar();

    // 2. Setup UI events
    setupEvents();

    // Render loaded data
    updateBadge();
    renderChatList();
    applyTheme(state.settings.theme || 'light');

    // Choose active chat
    if (state.chats.length > 0) {
        switchChat(state.chats[0].id);
    } else {
        updateWelcomeScreen();
    }
}

function updateWelcomeScreen() {
    if (!welcomeScreen) return;

    // Check if at least one provider has an endpoint and API key
    const providers = state.settings.providers || [];
    const isConfigured = providers.some(p => p.endpoint && p.apiKey);

    const h1 = welcomeScreen.querySelector('h1');
    const p = welcomeScreen.querySelector('p');

    if (isConfigured) {
        h1.textContent = '准备就绪';
        p.textContent = '开启您的 AI 之旅，发送第一条消息吧！';
    } else {
        h1.textContent = '您好，我是您的 AI 助理';
        p.textContent = '请点击左下角「设置」配置 API 以开始使用。';
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
    updateWelcomeScreen();
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
                            state.settings.lastUsedModel = val;
                            window.api.saveSettings(state.settings);
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
    document.getElementById('export-chats-btn').addEventListener('click', enterExportMode);
    document.getElementById('cancel-export-btn').addEventListener('click', exitExportMode);
    document.getElementById('confirm-export-btn').addEventListener('click', confirmExport);
    document.getElementById('select-all-chats').addEventListener('change', toggleSelectAll);

    // MCP Selection Dropdown
    const mcpBtn = document.getElementById('mcp-dropdown-btn');
    if (mcpBtn) {
        mcpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('mcp-selection-dropdown');
            dropdown.classList.toggle('show');
            if (dropdown.classList.contains('show')) {
                renderMcpSelectionDropdown();
            }
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        document.getElementById('mcp-selection-dropdown').classList.remove('show');
    });

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

    // Toggle thinking process
    if (toggleThinkingBtn) {
        toggleThinkingBtn.addEventListener('click', () => {
            state.settings.enableThinking = !state.settings.enableThinking;
            updateThinkingBtnState();
            window.api.saveSettings(state.settings);
            // Sync with settings modal if open
            const thinkingCheckbox = document.getElementById('enable-thinking');
            if (thinkingCheckbox) thinkingCheckbox.checked = state.settings.enableThinking;
        });
    }

    // Toggle web search
    if (toggleSearchBtn) {
        toggleSearchBtn.addEventListener('click', () => {
            state.settings.enableSearch = !state.settings.enableSearch;
            updateSearchBtnState();
            window.api.saveSettings(state.settings);
            // Sync with settings modal if open
            const searchCheckbox = document.getElementById('enable-search');
            if (searchCheckbox) searchCheckbox.checked = !!state.settings.enableSearch;
        });
    }

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
    document.getElementById('enable-search').checked = !!state.settings.enableSearch;

    initMCPSettings();
    initSkillsSettings();

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
    saveCurrentMCPServerData();
    saveCurrentSkillData();

    const newSettings = {
        systemPrompt: document.getElementById('system-prompt').value.trim(),
        enableThinking: document.getElementById('enable-thinking').checked,
        enableSearch: document.getElementById('enable-search').checked,
        theme: state.settings.theme || 'light',
        sidebarWidth: state.settings.sidebarWidth || '260px',
        providers: tempProviders,
        mcpServers: tempMCPServers,
        skills: tempSkills
    };

    state.settings = newSettings;
    updateThinkingBtnState();
    updateSearchBtnState();
    await window.api.saveSettings(newSettings);
    updateBadge();
    closeSettings();
}

// -----------------------------------------
// Export Mode Logics
// -----------------------------------------
function enterExportMode() {
    state.isExportMode = true;
    document.getElementById('sidebar-actions-default').style.display = 'none';
    document.getElementById('sidebar-actions-export').style.display = 'flex';
    document.getElementById('chat-list').classList.add('export-mode');
    document.getElementById('select-all-chats').checked = false;
    updateSelectedCount();
    renderChatList();
}

function exitExportMode() {
    state.isExportMode = false;
    document.getElementById('sidebar-actions-default').style.display = 'flex';
    document.getElementById('sidebar-actions-export').style.display = 'none';
    document.getElementById('chat-list').classList.remove('export-mode');
    renderChatList();
}

function toggleSelectAll(e) {
    const checked = e.target.checked;
    document.querySelectorAll('.chat-item-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const selected = document.querySelectorAll('.chat-item-checkbox:checked').length;
    document.getElementById('selected-count').textContent = `${selected} 已选`;

    const total = document.querySelectorAll('.chat-item-checkbox').length;
    document.getElementById('select-all-chats').checked = total > 0 && selected === total;
}

function confirmExport() {
    const selectedIds = Array.from(document.querySelectorAll('.chat-item-checkbox:checked'))
        .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
        alert("请至少选择一个对话进行导出。");
        return;
    }

    const chatsToExport = state.chats.filter(c => selectedIds.includes(c.id));
    const dataStr = JSON.stringify(chatsToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chats_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    exitExportMode();
}

// -----------------------------------------
// MCP Settings Logics
// -----------------------------------------
let tempMCPServers = [];

// Re-add these to openSettings or call manually
function initMCPSettings() {
    tempMCPServers = JSON.parse(JSON.stringify(state.settings.mcpServers || []));
    renderMCPServers();
}

document.getElementById('add-mcp-server-btn').onclick = () => {
    tempMCPServers.push({ id: generateId(), name: '', command: '', args: '', env: '' });
    renderMCPServers();
};

function renderMCPServers() {
    const container = document.getElementById('mcp-servers-container');
    container.innerHTML = '';
    tempMCPServers.forEach((server, index) => {
        const item = document.createElement('div');
        item.className = 'mcp-server-item';
        // Mock status for now, ideally main process would return connectivity status
        const isConfigured = server.command && server.command.trim().length > 0;
        const statusClass = isConfigured ? 'status-online' : 'status-offline';
        const statusText = isConfigured ? '配置就绪' : '部分配置缺失';

        item.innerHTML = `
            <div class="mcp-server-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="mcp-status-dot ${statusClass}"></span>
                    <h4>服务器 #${index + 1}: ${server.name || '未命名'}</h4>
                </div>
                <div style="display:flex; gap:4px;">
                    <button type="button" class="btn btn-icon btn-ghost btn-sm del-mcp-btn" data-index="${index}">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            <div class="mcp-server-form">
                <div class="form-group">
                    <label>名称 (可选)</label>
                    <input type="text" class="mcp-name" value="${server.name || ''}" placeholder="例如: local-files">
                </div>
                <div class="mcp-server-row">
                    <div class="form-group" style="flex: 2;">
                        <label>执行命令 (Command)</label>
                        <input type="text" class="mcp-command" value="${server.command || ''}" placeholder="npx, python, etc.">
                    </div>
                    <div class="form-group" style="flex: 3;">
                        <label>参数 (Arguments, 逗号分隔)</label>
                        <input type="text" class="mcp-args" value="${server.args || ''}" placeholder="-y, @mcp/server-everything">
                    </div>
                </div>
            </div>
        `;
        item.querySelector('.del-mcp-btn').onclick = () => {
            tempMCPServers.splice(index, 1);
            renderMCPServers();
        };
        container.appendChild(item);
    });
}

// -----------------------------------------
// MCP Runtime Selection Logics
// -----------------------------------------
function renderMcpSelectionDropdown() {
    const list = document.getElementById('mcp-checkbox-list');
    const servers = state.settings.mcpServers || [];

    if (servers.length === 0) {
        list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">尚未配置 MCP 服务器。请前往设置添加。</div>';
        return;
    }

    list.innerHTML = '';
    // Use an array in state to track which ones are enabled for the current session
    if (!state.enabledMcpServerIds) {
        state.enabledMcpServerIds = []; // Default ALL disabled as requested
    }

    servers.forEach(server => {
        const item = document.createElement('div');
        item.className = 'mcp-item';
        const isEnabled = state.enabledMcpServerIds.includes(server.id);
        const statusClass = server.command ? 'status-online' : 'status-offline';

        item.innerHTML = `
            <input type="checkbox" id="mcp-cb-${server.id}" ${isEnabled ? 'checked' : ''}>
            <label for="mcp-cb-${server.id}">${server.name || server.command || '未命名服务器'}</label>
            <span class="mcp-status-dot ${statusClass}"></span>
        `;

        item.querySelector('input').addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.checked) {
                if (!state.enabledMcpServerIds.includes(server.id)) {
                    state.enabledMcpServerIds.push(server.id);
                }
            } else {
                state.enabledMcpServerIds = state.enabledMcpServerIds.filter(id => id !== server.id);
            }
            updateMcpToolBtnState();
        });

        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                item.querySelector('input').click();
            }
        });

        list.appendChild(item);
    });
    updateMcpToolBtnState();
}

function updateMcpToolBtnState() {
    const btn = document.getElementById('mcp-dropdown-btn');
    if (!btn) return;
    const activeCount = state.enabledMcpServerIds ? state.enabledMcpServerIds.length : 0;
    if (activeCount > 0) {
        btn.classList.add('active');
        btn.title = `MCP工具开启中 (${activeCount})`;
    } else {
        btn.classList.remove('active');
        btn.title = "MCP 工具盒 (未开启)";
    }
}

function saveCurrentMCPServerData() {
    const items = document.querySelectorAll('.mcp-server-item');
    items.forEach((item, index) => {
        if (tempMCPServers[index]) {
            tempMCPServers[index].name = item.querySelector('.mcp-name').value.trim();
            tempMCPServers[index].command = item.querySelector('.mcp-command').value.trim();
            tempMCPServers[index].args = item.querySelector('.mcp-args').value.trim();
        }
    });
}

// -----------------------------------------
// Skills Settings Logics
// -----------------------------------------
let tempSkills = [];

function initSkillsSettings() {
    tempSkills = JSON.parse(JSON.stringify(state.settings.skills || []));
    if (tempSkills.length === 0 && (!state.settings.skills || state.settings.skills.length === 0)) {
        // Add a default skill if empty
        tempSkills.push({ id: 'default-all', name: '全能助手', desc: '默认的通用对话模式', prompt: '你是一个智能、高效且有帮助的助理。' });
    }
    renderSkillsSettings();
}

document.getElementById('add-skill-btn').onclick = () => {
    tempSkills.push({ id: generateId(), name: '', desc: '', prompt: '' });
    renderSkillsSettings();
};

function renderSkillsSettings() {
    const container = document.getElementById('skills-container');
    container.innerHTML = '';
    tempSkills.forEach((skill, index) => {
        const item = document.createElement('div');
        item.className = 'skill-item';
        item.innerHTML = `
            <div class="skill-header">
                <h4><i class="ph ph-sparkle"></i> 技能 #${index + 1}: ${skill.name || '未命名'}</h4>
                <button type="button" class="btn btn-icon btn-ghost btn-sm del-skill-btn" data-index="${index}">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
            <div class="skill-form">
                <div class="form-group">
                    <label>技能名称</label>
                    <input type="text" class="skill-name-input" value="${skill.name || ''}" placeholder="例如: 翻译官">
                </div>
                <div class="form-group">
                    <label>简短描述</label>
                    <input type="text" class="skill-desc-input" value="${skill.desc || ''}" placeholder="简单描述一下这个技能...">
                </div>
                <div class="form-group">
                    <label>系统提示词 (System Prompt)</label>
                    <textarea class="skill-prompt-input" placeholder="设定该技能的角色性格、回复要求等...">${skill.prompt || ''}</textarea>
                </div>
            </div>
        `;
        item.querySelector('.del-skill-btn').onclick = () => {
            tempSkills.splice(index, 1);
            renderSkillsSettings();
        };
        container.appendChild(item);
    });
}

function saveCurrentSkillData() {
    const items = document.querySelectorAll('.skill-item');
    items.forEach((item, index) => {
        if (tempSkills[index]) {
            tempSkills[index].name = item.querySelector('.skill-name-input').value.trim();
            tempSkills[index].desc = item.querySelector('.skill-desc-input').value.trim();
            tempSkills[index].prompt = item.querySelector('.skill-prompt-input').value.trim();
        }
    });
}

// -----------------------------------------
// Skills Runtime Chips Bar Logics
// -----------------------------------------
function renderSkillsBar() {
    const bar = document.getElementById('skills-bar');
    if (!bar) return;

    const skills = state.settings.skills || [];
    bar.innerHTML = '';

    const getIconClass = (name) => {
        const n = name.toLowerCase();
        if (n.includes('翻译') || n.includes('translate')) return 'ph-translate';
        if (n.includes('代码') || n.includes('code') || n.includes('工程师')) return 'ph-code';
        if (n.includes('写作') || n.includes('文案') || n.includes('pencil')) return 'ph-pencil-circle';
        if (n.includes('做图') || n.includes('图表') || n.includes('chart')) return 'ph-chart-bar';
        if (n.includes('artifact') || n.includes('预览')) return 'ph-play-circle';
        if (n.includes('全能') || n.includes('助') || n.includes('夸夸')) return 'ph-mask-happy';
        return 'ph-sparkle';
    };

    // "None" (Default) Card
    const defaultCard = document.createElement('div');
    defaultCard.className = `skill-card ${!state.activeSkillId ? 'active' : ''}`;
    defaultCard.innerHTML = `
        <i class="ph-fill ph-mask-happy"></i>
        <div class="skill-info">
            <div class="skill-name">默认对话</div>
        </div>
    `;
    defaultCard.onclick = () => {
        state.activeSkillId = null;
        renderSkillsBar();
    };
    bar.appendChild(defaultCard);

    skills.forEach(skill => {
        const card = document.createElement('div');
        card.className = `skill-card ${state.activeSkillId === skill.id ? 'active' : ''}`;
        const iconClass = getIconClass(skill.name);
        card.innerHTML = `
            <i class="ph-fill ${iconClass}"></i>
            <div class="skill-info">
                <div class="skill-name">${skill.name}</div>
            </div>
        `;
        card.onclick = () => {
            state.activeSkillId = skill.id;
            renderSkillsBar();
        };
        bar.appendChild(card);
    });

    // Setup nav buttons once
    const prevBtn = document.getElementById('skills-prev');
    const nextBtn = document.getElementById('skills-next');
    if (prevBtn && nextBtn) {
        prevBtn.onclick = (e) => {
            e.preventDefault();
            bar.scrollBy({ left: -250, behavior: 'smooth' });
        };
        nextBtn.onclick = (e) => {
            e.preventDefault();
            bar.scrollBy({ left: 250, behavior: 'smooth' });
        };
    }
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



function showDeleteConfirm(chatItemEl, chatId) {
    // Remove any existing overlays first
    document.querySelectorAll('.delete-confirm-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'delete-confirm-overlay';
    overlay.innerHTML = `
        <button class="btn btn-danger btn-sm confirm-btn">确认删除</button>
        <button class="btn btn-ghost btn-sm cancel-btn">取消</button>
    `;

    overlay.querySelector('.confirm-btn').onclick = (e) => {
        e.stopPropagation();
        executeDeleteChat(chatId);
    };

    overlay.querySelector('.cancel-btn').onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
    };

    chatItemEl.appendChild(overlay);

    // Click outside to cancel
    const onOutsideClick = (e) => {
        if (!overlay.contains(e.target)) {
            overlay.remove();
            document.removeEventListener('mousedown', onOutsideClick);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
}

function executeDeleteChat(chatId) {
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

// -----------------------------------------
// Chat Management Logics
// -----------------------------------------
function createNewChat() {
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
        messages: []
    };

    state.chats.unshift(newChat); // Add to top
    state.isNewFreshChat = true;
    state._newlyCreatedId = newChat.id; // temporary tracker
    saveChats();
    renderChatList();
    switchChat(newChat.id);
}

function switchChat(chatId) {
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
            <input type="checkbox" class="chat-item-checkbox" data-id="${chat.id}">
            <i class="ph ph-chat-circle"></i>
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
            showDeleteConfirm(div, chat.id);
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

    if (messages.length === 0) {
        updateWelcomeScreen();
        const skillSec = welcomeScreen.querySelector('.skills-section');
        if (skillSec) skillSec.style.display = state.isNewFreshChat ? 'block' : 'none';

        renderSkillsBar(); // Ensure bar is updated for new chat
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

function updateThinkingBtnState() {
    if (toggleThinkingBtn) {
        if (state.settings.enableThinking !== false) {
            toggleThinkingBtn.classList.add('active');
            toggleThinkingBtn.title = '思考过程已开启';
        } else {
            toggleThinkingBtn.classList.remove('active');
            toggleThinkingBtn.title = '思考过程已关闭';
        }
    }
}

function updateSearchBtnState() {
    if (toggleSearchBtn) {
        if (state.settings.enableSearch) {
            toggleSearchBtn.classList.add('active');
            toggleSearchBtn.title = '联网搜索已开启';
        } else {
            toggleSearchBtn.classList.remove('active');
            toggleSearchBtn.title = '联网搜索已关闭';
        }
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

    const dataRaw = content.content !== undefined ? content.content : content;
    const dataReasoning = content.reasoning_content || '';

    wrapper.innerHTML = `
        <div class="avatar">${icon}</div>
        <div class="message-content" data-raw="${encodeURIComponent(dataRaw)}" data-reasoning="${encodeURIComponent(dataReasoning)}">
            ${htmlContent || '<div class="markdown-body"></div>'}
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
        copyBtn.addEventListener('click', () => copyToClipboard(dataRaw, copyBtn));
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
    state.isNewFreshChat = false;

    messageInput.value = '';
    messageInput.style.height = 'auto'; // reset textarea height
    scrollToBottom();

    saveChats();

    let finalSystemPrompt = state.settings.systemPrompt || '';

    // Skill Override
    if (state.activeSkillId) {
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

// Boot the app
document.addEventListener('DOMContentLoaded', initApp);
