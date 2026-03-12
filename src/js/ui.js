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
        const filtered = fetchedModels.filter(m => m.toLowerCase().includes(query));
        const visibleModels = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);

        modelsList.innerHTML = '';
        filtered.forEach(model => {
            const isVisible = visibleModels.includes(model);
            const item = document.createElement('div');
            item.className = `model-selection-item ${isVisible ? 'selected' : ''}`;
            item.innerHTML = `
                <span class="model-name">${model}</span>
                <button class="btn btn-sm model-toggle-btn ${isVisible ? 'btn-primary' : 'btn-ghost'}" data-model="${model}">
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