// ui.js - UI update functions

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

function updateComparisonToggleState() {
    if (comparisonToggleBtn) {
        if (state.isComparisonMode) {
            comparisonToggleBtn.classList.add('active');
            comparisonToggleBtn.title = '关闭模型对比模式';
            multiModelSelectBtn.style.display = 'flex';
            
            // 同步按钮文字
            if (state.selectedComparisonModels && state.selectedComparisonModels.length > 0) {
                const names = state.selectedComparisonModels.map(id => id.split('|')[1]);
                multiModelSelectBtn.innerHTML = `<i class="ph ph-columns"></i> ${names.join(' vs ')}`;
            } else {
                multiModelSelectBtn.innerHTML = `<i class="ph ph-columns"></i> 未选择模型`;
            }

            const modelSelect = document.getElementById('model-searchable-select');
            if (modelSelect) modelSelect.style.display = 'none';
        } else {
            comparisonToggleBtn.classList.remove('active');
            comparisonToggleBtn.title = '开启模型对比模式';
            multiModelSelectBtn.style.display = 'none';
            const modelSelect = document.getElementById('model-searchable-select');
            if (modelSelect) modelSelect.style.display = 'flex';
        }
    }
}

// -----------------------------------------
// Searchable Model Select Implementation
// -----------------------------------------
let modelSearchQuery = '';
function renderSearchableModelSelect() {
    const container = document.querySelector('.comparison-mode-wrapper'); 
    
    // Check if it already exists
    let searchableSelect = document.getElementById('model-searchable-select');
    if (!searchableSelect) {
        searchableSelect = document.createElement('div');
        searchableSelect.className = 'searchable-select';
        searchableSelect.id = 'model-searchable-select';
        container.appendChild(searchableSelect);
    }

    searchableSelect.innerHTML = `
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
    `;

    const trigger = searchableSelect.querySelector('.select-trigger');
    const dropdown = searchableSelect.querySelector('.select-dropdown');
    const searchInput = searchableSelect.querySelector('#model-search-input');
    const optionsList = searchableSelect.querySelector('#model-options-list');
    const selectedText = searchableSelect.querySelector('.selected-value');

    const activeChat = state.chats.find(c => c.id === state.currentChatId);
    let currentVal = activeChat ? activeChat.model : '';

    const refreshOptions = () => {
        optionsList.innerHTML = '';
        const query = modelSearchQuery.toLowerCase();
        let firstMatch = null;

        state.settings.providers.forEach(p => {
            // Use visibleModels instead of models to only show models enabled in settings
            const models = (p.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
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
                        dropdown.classList.remove('show');

                        if (!state.currentChatId) return;
                        const chat = state.chats.find(c => c.id === state.currentChatId);
                        if (chat) {
                            chat.model = val;
                            state.settings.lastUsedModel = val;
                            window.api.saveSettings(state.settings);
                            saveChats();
                            currentVal = val;

                            // Visual update to avoid completely destroying DOM container in active state
                            const prevSelected = optionsList.querySelector('.select-option.selected');
                            if (prevSelected) prevSelected.classList.remove('selected');
                            opt.classList.add('selected');
                            selectedText.textContent = m;
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
    updateComparisonToggleState();
}

// -----------------------------------------
// Multi-Model Comparison UI Functions
// -----------------------------------------
function openMultiModelModal() {
    renderMultiModelList();
    multiModelModal.style.display = 'flex';
}

function closeMultiModelModal() {
    multiModelModal.style.display = 'none';
}

function renderMultiModelList() {
    multiModelList.innerHTML = '';
    let hasModels = false;

    state.settings.providers.forEach(p => {
        const models = (p.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
        if (models.length > 0) {
            hasModels = true;
            const groupHeader = document.createElement('div');
            groupHeader.className = 'option-group-label';
            groupHeader.textContent = p.name || '未命名服务商';
            multiModelList.appendChild(groupHeader);

            models.forEach(m => {
                const modelId = `${p.id}|${m}`;
                const isChecked = state.selectedComparisonModels.includes(modelId);

                const item = document.createElement('label');
                item.className = 'setting-item-row';
                item.style.cssText = `
                    display: flex; align-items: center; gap: 10px;
                    cursor: pointer; padding: 9px 12px;
                    border-radius: var(--radius-sm);
                    background: ${isChecked ? 'var(--brand-alpha)' : 'var(--bg-surface-elevated)'};
                    border: 1px solid ${isChecked ? 'var(--border-focus)' : 'transparent'};
                    transition: background 0.15s, border-color 0.15s;
                    margin-bottom: 4px;
                `;
                item.innerHTML = `
                    <input type="checkbox" value="${modelId}" ${isChecked ? 'checked' : ''} style="width:15px;height:15px;flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${p.name}</div>
                    </div>
                `;

                const checkbox = item.querySelector('input');
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        if (state.selectedComparisonModels.length >= 4) {
                            checkbox.checked = false;
                            showNotification('最多只能同时对比 4 个模型', 'warning');
                            return;
                        }
                        state.selectedComparisonModels.push(modelId);
                        item.style.background = 'var(--brand-alpha)';
                        item.style.borderColor = 'var(--border-focus)';
                    } else {
                        state.selectedComparisonModels = state.selectedComparisonModels.filter(id => id !== modelId);
                        item.style.background = 'var(--bg-surface-elevated)';
                        item.style.borderColor = 'transparent';
                    }
                    // Update count in header
                    const header = document.querySelector('#multi-model-modal h2');
                    if (header) header.textContent = `选择对比模型 (已选 ${state.selectedComparisonModels.length}/4)`;
                });

                multiModelList.appendChild(item);
            });
        }
    });

    if (!hasModels) {
        multiModelList.innerHTML = '<div style="color:var(--text-muted);padding:16px;text-align:center;">暂无可用模型，请先在设置中配置服务商。</div>';
    }
}

function confirmMultiModelSelection() {
    if (state.selectedComparisonModels.length < 2) {
        showNotification('请至少选择 2 个模型进行对比', 'warning');
        return;
    }

    const names = state.selectedComparisonModels.map(id => id.split('|')[1]);
    closeMultiModelModal();

    // 1. 判断是否需要新建对话
    const currentChat = state.chats.find(c => c.id === state.currentChatId);
    if (currentChat && currentChat.messages.length > 0) {
        if (typeof createNewChat === 'function') createNewChat();
    }
    
    // 2. 获取真正的活跃对话（新建的或原本就在使用的）
    const activeChat = state.chats.find(c => c.id === state.currentChatId);

    // 3. 配置核心对比属性 & 标题
    if (activeChat) {
        activeChat.isComparisonMode = true;
        activeChat.comparisonModels = [...state.selectedComparisonModels];
        activeChat.title = "模型对比: " + names.join(' vs ');
        currentChatTitle.textContent = activeChat.title;
        if (typeof saveChats === 'function') saveChats();
        if (typeof renderChatList === 'function') renderChatList();
    }

    // 4. 应用 UI 状态
    state.isComparisonMode = true;
    messageContainer.classList.add('comparison-layout');
    updateComparisonToggleState();
    
    // 5. 渲染基础视图
    if (typeof renderMessages === 'function') {
        renderMessages(activeChat ? activeChat.messages || [] : []);
    }

    // 6. 窗口最大化处理
    if (window.api && window.api.isMaximized) {
        window.api.isMaximized().then(isMax => {
            state.wasMaximizedBeforeComparison = isMax;
            if (!isMax) window.api.maximizeWindow();
        });
    }
}

function renderComparisonEmptyState() {
    // This is now handled by the logic in renderMessages() which populates columns.
    // We just trigger a re-render to ensure columns are set up correctly.
    const activeChat = state.chats.find(c => c.id === state.currentChatId);
    renderMessages(activeChat ? activeChat.messages : []);
}

// -----------------------------------------
// Notification System (replaces alert)
// -----------------------------------------
function showNotification(message, type = 'info', duration = 3000) {
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        document.body.appendChild(notificationContainer);
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.animation = 'slideIn 0.3s ease-out';

    notificationContainer.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }
}

// -----------------------------------------
// Model Selection Panel
// -----------------------------------------
function showModelSelectionPanel(fetchedModels, provider, onModelsUpdate) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'modal-overlay model-selection-overlay';
    modal.id = 'model-selection-modal';

    const panel = document.createElement('div');
    panel.className = 'model-selection-panel';

    let searchQuery = '';
    const modelsList = document.createElement('div');
    modelsList.className = 'model-selection-list';

    const updateModelsList = () => {
        const query = searchQuery.toLowerCase();
        const visibleModels = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
        
        // 排序：已启用的模型放在最上面
        let filtered = fetchedModels.filter(m => {
            const modelId = m.id || m;
            return modelId.toLowerCase().includes(query);
        });
        filtered.sort((a, b) => {
            const aId = a.id || a;
            const bId = b.id || b;
            const aVisible = visibleModels.includes(aId);
            const bVisible = visibleModels.includes(bId);
            if (aVisible && !bVisible) return -1;
            if (!aVisible && bVisible) return 1;
            return aId.localeCompare(bId);
        });

        modelsList.innerHTML = '';
        filtered.forEach(model => {
            const modelId = model.id || model;
            const isVisible = visibleModels.includes(modelId);
            const caps = model.capabilities || {};
            
            const item = document.createElement('div');
            item.className = `model-selection-item ${isVisible ? 'selected' : ''}`;
            item.innerHTML = `
                <span class="model-name">${modelId}</span>
                <div class="model-capabilities-indicators" style="display: flex; gap: 4px; font-size: 12px;">
                    <span title="视觉" style="opacity: ${caps.vision ? 1 : 0.3};"><i class="ph ph-image"></i></span>
                    <span title="推理" style="opacity: ${caps.reasoning ? 1 : 0.3};"><i class="ph ph-brain"></i></span>
                    <span title="工具" style="opacity: ${caps.tools ? 1 : 0.3};"><i class="ph ph-wrench"></i></span>
                </div>
                <button class="btn btn-sm model-toggle-btn ${isVisible ? 'btn-primary' : 'btn-ghost'}" data-model="${modelId}">
                    <i class="ph ${isVisible ? 'ph-eye' : 'ph-eye-slash'}"></i>
                </button>
            `;

            item.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                const button = e.target.closest('button');
                const modelName = button.dataset.model;
                const currentVisible = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);

                if (currentVisible.includes(modelName)) {
                    const idx = currentVisible.indexOf(modelName);
                    currentVisible.splice(idx, 1);
                    button.innerHTML = '<i class="ph ph-eye-slash"></i>';
                    button.classList.remove('btn-primary');
                    button.classList.add('btn-ghost');
                    item.classList.remove('selected');
                } else {
                    currentVisible.push(modelName);
                    button.innerHTML = '<i class="ph ph-eye"></i>';
                    button.classList.remove('btn-ghost');
                    button.classList.add('btn-primary');
                    item.classList.add('selected');
                }

                provider.visibleModels = currentVisible.join(', ');
                onModelsUpdate();
            });

            modelsList.appendChild(item);
        });

        if (filtered.length === 0) {
            modelsList.innerHTML = '<div class="empty-search-result">未找到匹配的模型</div>';
        }
    };

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'model-search-input';
    searchInput.placeholder = '搜索模型...';
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateModelsList();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost btn-sm model-panel-close';
    closeBtn.innerHTML = '<i class="ph ph-x"></i>';
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });

    panel.appendChild(closeBtn);
    panel.appendChild(searchInput);
    panel.appendChild(modelsList);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    // Close on overlay click and sync data
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Cleanup - sync data when closing
    const originalRemove = modal.remove.bind(modal);
    modal.remove = function () {
        onModelsUpdate();
        originalRemove();
    };

    updateModelsList();
    searchInput.focus();
}

// -----------------------------------------
// Confirmation Dialog
// -----------------------------------------
function showConfirmDialog(message, onConfirm, onCancel) {
    const dialog = document.createElement('div');
    dialog.className = 'simple-confirm-dialog';
    dialog.innerHTML = `
        <div class="confirm-dialog-message">${message}</div>
        <div class="confirm-dialog-buttons">
            <button class="btn btn-ghost btn-sm" id="confirm-cancel">取消</button>
            <button class="btn btn-danger btn-sm" id="confirm-ok">删除</button>
        </div>
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#confirm-cancel');
    const okBtn = dialog.querySelector('#confirm-ok');
    let isHandled = false;

    const cleanup = () => {
        if (isHandled) return;
        isHandled = true;
        dialog.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (dialog.parentElement) {
                dialog.remove();
            }
        }, 300);
    };

    cancelBtn.addEventListener('click', () => {
        cleanup();
        if (onCancel) onCancel();
    });

    okBtn.addEventListener('click', () => {
        cleanup();
        if (onConfirm) onConfirm();
    });
}

// -----------------------------------------
// Custom Input Dialog (replaces prompt() for Electron)
// -----------------------------------------
function showInputDialog(options) {
    return new Promise((resolve) => {
        const { title = '请输入', placeholder = '', defaultValue = '', multiline = false } = options;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10003';

        const panel = document.createElement('div');
        panel.className = 'model-selection-panel';
        panel.style.maxWidth = '400px';
        panel.style.width = '90%';

        panel.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 16px; font-size: 16px;">${title}</div>
            ${multiline
                ? `<textarea class="model-search-input" placeholder="${placeholder}" rows="5" style="resize: vertical; min-height: 100px;">${defaultValue}</textarea>`
                : `<input type="text" class="model-search-input" placeholder="${placeholder}" value="${defaultValue}">`
            }
            <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="input-dialog-cancel">取消</button>
                <button class="btn btn-primary btn-sm" id="input-dialog-ok">确定</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const inputEl = panel.querySelector(multiline ? 'textarea' : 'input');
        const cancelBtn = panel.querySelector('#input-dialog-cancel');
        const okBtn = panel.querySelector('#input-dialog-ok');

        // Focus input
        setTimeout(() => inputEl.focus(), 0);

        // Handle enter key for single line input
        if (!multiline) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    okBtn.click();
                }
            });
        }

        const cleanup = () => {
            overlay.remove();
        };

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        okBtn.addEventListener('click', () => {
            const value = inputEl.value.trim();
            cleanup();
            resolve(value || null);
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
    });
}

// Multi-field input dialog for creating/editing companions
function showCompanionDialog(options) {
    return new Promise((resolve) => {
        const { title = '创建搭档', name = '', prompt: promptText = '', isEdit = false } = options;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '10003';

        const panel = document.createElement('div');
        panel.className = 'model-selection-panel';
        panel.style.maxWidth = '480px';
        panel.style.width = '90%';

        panel.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 16px; font-size: 16px;">${title}</div>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">名称</label>
                <input type="text" id="companion-name-input" class="model-search-input" placeholder="请输入搭档名称" value="${escapeHtml(name)}">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">系统提示词 (Prompt)</label>
                <textarea id="companion-prompt-input" class="model-search-input" placeholder="请输入系统提示词，定义搭档的行为和角色" rows="4" style="resize: vertical; min-height: 80px;">${escapeHtml(promptText)}</textarea>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button class="btn btn-ghost btn-sm" id="companion-dialog-cancel">取消</button>
                <button class="btn btn-primary btn-sm" id="companion-dialog-ok">${isEdit ? '保存' : '创建'}</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const nameInput = panel.querySelector('#companion-name-input');
        const promptInput = panel.querySelector('#companion-prompt-input');
        const cancelBtn = panel.querySelector('#companion-dialog-cancel');
        const okBtn = panel.querySelector('#companion-dialog-ok');

        // Focus name input
        setTimeout(() => nameInput.focus(), 0);

        // Handle enter key in name input to move to prompt
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                promptInput.focus();
            }
        });

        const cleanup = () => {
            overlay.remove();
        };

        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        okBtn.addEventListener('click', () => {
            const nameValue = nameInput.value.trim();
            const promptValue = promptInput.value.trim();
            if (!nameValue) {
                showNotification('请输入搭档名称', 'error');
                return;
            }
            cleanup();
            resolve({ name: nameValue, prompt: promptValue });
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
    });
}

/**
 * 互斥关闭所有覆盖层弹窗，确保侧边栏功能切换流畅
 */
function closeAllModals() {
    if (typeof closeSettings === 'function') closeSettings();
    if (typeof closeAbout === 'function') closeAbout();
    if (typeof closeCompanionsManager === 'function') closeCompanionsManager();

    // 同时也通过 DOM 强制清理 (以防万一)
    const modals = ['settings-modal', 'about-modal', 'companions-modal'];
    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}