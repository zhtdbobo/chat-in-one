// ui.js - UI update functions

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
        // Close other dropdowns
        document.querySelectorAll('.select-dropdown.show, .mcp-dropdown.show').forEach(d => d.classList.remove('show'));

        if (!isOpen) {
            dropdown.classList.add('show');
            setTimeout(() => searchInput.focus(), 10);
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

    // Outside click handler is now handled globally in setupEvents
    refreshOptions();
}