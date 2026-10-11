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
                multiModelSelectBtn.innerHTML = `<i class="ph ph-columns"></i> ${escapeHtml(names.join(' vs '))}`;
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
            const filtered = models.filter(m => m.toLowerCase().includes(query)
                || getModelDisplayName(p, m).toLowerCase().includes(query));

            if (filtered.length > 0) {
                const groupLabel = document.createElement('div');
                groupLabel.className = 'option-group-label';
                groupLabel.textContent = p.name || '未命名服务商';
                optionsList.appendChild(groupLabel);

                filtered.forEach(m => {
                    const val = `${p.id}|${m}`;
                    const label = getModelDisplayName(p, m);
                    const opt = document.createElement('div');
                    opt.className = `select-option ${val === currentVal ? 'selected' : ''}`;
                    opt.textContent = label;
                    opt.title = label === m ? m : `${label} (${m})`;
                    opt.dataset.value = val;
                    if (!firstMatch) firstMatch = opt;

                    if (val === currentVal) {
                        selectedText.textContent = label;
                    }

                    opt.addEventListener('click', (e) => {
                        if (isChatBusy()) return;
                        e.stopPropagation();
                        dropdown.classList.remove('show');

                        if (!state.currentChatId) return;
                        const chat = state.chats.find(c => c.id === state.currentChatId);
                        if (chat) {
                            changeConversationModel(chat, val);
                            refreshOpenConversationModelSettings(chat);
                            state.settings.lastUsedModel = val;
                            window.api.saveSettings(state.settings);
                            saveChats();
                            currentVal = val;

                            // Visual update to avoid completely destroying DOM container in active state
                            const prevSelected = optionsList.querySelector('.select-option.selected');
                            if (prevSelected) prevSelected.classList.remove('selected');
                            opt.classList.add('selected');
                            selectedText.textContent = label;
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
    if (isChatBusy()) return;
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
                const label = getModelDisplayName(p, m);

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
                    <input type="checkbox" value="${escapeHtml(modelId)}" ${isChecked ? 'checked' : ''} style="width:15px;height:15px;flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label)}</div>
                        <div style="font-size:11px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(label === m ? (p.name || '') : `${m} · ${p.name || ''}`)}</div>
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
    if (isChatBusy()) return;
    if (state.selectedComparisonModels.length < 2) {
        showNotification('请至少选择 2 个模型进行对比', 'warning');
        return;
    }

    const names = state.selectedComparisonModels.map(id => id.split('|')[1]);
    closeMultiModelModal();

    const selectedModelsBackup = [...state.selectedComparisonModels];

    // 1. 判断是否需要新建对话
    const currentChat = state.chats.find(c => c.id === state.currentChatId);
    if (currentChat && currentChat.messages.length > 0) {
        if (typeof createNewChat === 'function') createNewChat();
        state.selectedComparisonModels = [...selectedModelsBackup];
    }
    
    // 2. 获取真正的活跃对话（新建的或原本就在使用的）
    const activeChat = state.chats.find(c => c.id === state.currentChatId);

    // 3. 配置核心对比属性 & 标题
    if (activeChat) {
        activeChat.isComparisonMode = true;
        activeChat.comparisonModels = [...selectedModelsBackup];
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
let modelCapabilityFieldId = 0;
function createModelCapabilityCard(model) {
    const info = getModelCapabilityInfo(typeof model === 'object' ? model : {});
    const card = document.createElement('section'); card.className = 'model-capability-card';
    const fields = document.createElement('div'); fields.className = 'model-capability-fields';
    for (const [labelText, value] of [['上下文窗口（Token）', info.contextWindowTokens], ['最大输出上限（Token）', info.maxOutputTokens]]) {
        const item = document.createElement('div'); item.className = 'setting-item';
        const label = document.createElement('label'); label.textContent = labelText;
        const field = document.createElement('input'); field.type = 'text'; field.readOnly = true;
        field.className = 'model-number-input'; field.id = 'model-capability-field-' + ++modelCapabilityFieldId; label.htmlFor = field.id;
        field.value = value === undefined ? '未提供' : String(value); field.setAttribute('aria-label', labelText);
        item.append(label, field); fields.append(item);
        if (value === undefined) {
            const hint = document.createElement('p'); hint.className = 'parameter-hint';
            hint.textContent = labelText.startsWith('最大输出') ? '未获取到输出上限；实际限制以服务端为准。' : '未获取到模型上下文窗口。';
            field.title = hint.textContent; item.append(hint);
        }
    }
    card.append(fields);
    const types = document.createElement('div'); types.className = 'model-input-types';
    const title = document.createElement('div'); title.className = 'model-input-label'; title.textContent = '输入类型'; types.append(title);
    const options = document.createElement('div'); options.className = 'model-input-options'; types.append(options);
    if (!info.inputTypes) {
        const unknown = document.createElement('span'); unknown.textContent = '未提供（暂无法确认）'; options.append(unknown);
        const hint = document.createElement('p'); hint.className = 'parameter-hint';
        hint.textContent = '未获取到支持的输入格式；这不表示模型不支持图片。'; types.append(hint);
    }
    else {
        const names = { text: '文本', image: '图片', audio: '音频', video: '视频', file: '文件' };
        for (const type of [...new Set(['text', 'image', ...info.inputTypes])]) {
            const label = document.createElement('label'), check = document.createElement('input');
            check.type = 'checkbox'; check.disabled = true; check.checked = info.inputTypes.includes(type);
            label.append(check, document.createTextNode(names[type] || type)); options.append(label);
        }
    }
    card.append(types);
    return card;
}

// Dialog shown right after fetching a provider's model list: pick the models to add to the directory.
// onDone(selectedModels) receives the ticked models; onDone(null) means the user cancelled.
function showModelSelectionPanel(fetchedModels, provider, onDone) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay model-selection-overlay';
    modal.id = 'model-selection-modal';

    const panel = document.createElement('div');
    panel.className = 'model-selection-panel';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost btn-sm model-panel-close';
    closeBtn.title = '关闭';
    closeBtn.innerHTML = '<i class="ph ph-x"></i>';

    const title = document.createElement('div');
    title.className = 'model-selection-title';
    title.textContent = '选择要添加的模型';

    const subtitle = document.createElement('p');
    subtitle.className = 'model-selection-subtitle';
    subtitle.textContent = '以下是模型提供商的可用模型，勾选要添加的模型。';

    const toolbar = document.createElement('div');
    toolbar.className = 'model-selection-toolbar';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'model-search-input';
    searchInput.placeholder = '搜索模型';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'btn-link model-select-all';
    selectAllBtn.textContent = '全选';
    toolbar.append(searchInput, selectAllBtn);

    const listEl = document.createElement('div');
    listEl.className = 'model-selection-list';

    const footer = document.createElement('div');
    footer.className = 'model-selection-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = '取消';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = '添加所选';
    footer.append(cancelBtn, confirmBtn);

    panel.append(closeBtn, title, subtitle, toolbar, listEl, footer);
    modal.appendChild(panel);

    const modelId = model => String(model?.id || model || '').trim();
    const listedIds = new Set((typeof getProviderModelDirectory === 'function'
        ? getProviderModelDirectory(provider) : []).map(model => model.id));
    const selectedIds = new Set(fetchedModels.map(modelId).filter(id => listedIds.has(id)));
    let searchQuery = '';
    let settled = false;

    const matchingModels = () => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return fetchedModels;
        return fetchedModels.filter(model => {
            const id = modelId(model).toLowerCase();
            const name = String(model?.name || '').toLowerCase();
            return id.includes(query) || name.includes(query);
        });
    };

    const updateSelectAllLabel = models => {
        const allPicked = models.length > 0 && models.every(model => selectedIds.has(modelId(model)));
        selectAllBtn.textContent = allPicked ? '取消全选' : '全选';
        selectAllBtn.disabled = models.length === 0;
    };

    const renderList = () => {
        const models = matchingModels();
        listEl.innerHTML = '';
        if (models.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-search-result';
            empty.textContent = '未找到匹配的模型';
            listEl.appendChild(empty);
        }
        models.forEach(model => {
            const id = modelId(model);
            const name = String(model?.name || '');
            const item = document.createElement('label');
            item.className = 'model-selection-item';
            item.dataset.modelId = id;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'model-select-checkbox';
            checkbox.checked = selectedIds.has(id);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedIds.add(id); else selectedIds.delete(id);
                updateSelectAllLabel(matchingModels());
            });

            const nameEl = document.createElement('span');
            nameEl.className = 'model-name';
            nameEl.textContent = id;

            item.append(checkbox, nameEl);
            if (name && name !== id) {
                const displayEl = document.createElement('span');
                displayEl.className = 'model-display-name';
                displayEl.textContent = name;
                item.appendChild(displayEl);
            }
            listEl.appendChild(item);
        });
        updateSelectAllLabel(models);
    };

    const close = result => {
        if (settled) return;
        settled = true;
        modal.remove();
        if (onDone) onDone(result);
    };

    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value;
        renderList();
    });

    selectAllBtn.addEventListener('click', () => {
        const models = matchingModels();
        const allPicked = models.length > 0 && models.every(model => selectedIds.has(modelId(model)));
        models.forEach(model => {
            if (allPicked) selectedIds.delete(modelId(model)); else selectedIds.add(modelId(model));
        });
        renderList();
    });

    cancelBtn.addEventListener('click', () => close(null));
    closeBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => {
        const picked = fetchedModels.filter(model => selectedIds.has(modelId(model)));
        if (picked.length === 0) {
            showNotification('请至少勾选一个模型', 'warning');
            return;
        }
        close(picked);
    });

    modal.addEventListener('click', e => {
        if (e.target === modal) close(null);
    });

    document.body.appendChild(modal);
    renderList();
    searchInput.focus();
}

// -----------------------------------------
// Confirmation Dialog
// -----------------------------------------
function showConfirmDialog(message, onConfirm, onCancel, options = {}) {
    const { confirmText = '删除', cancelText = '取消' } = options;
    const dialog = document.createElement('div');
    dialog.className = 'simple-confirm-dialog';
    dialog.innerHTML = `
        <div class="confirm-dialog-message">${escapeHtml(message)}</div>
        <div class="confirm-dialog-buttons">
            <button class="btn btn-ghost btn-sm" id="confirm-cancel">${escapeHtml(cancelText)}</button>
            <button class="btn btn-danger btn-sm" id="confirm-ok">${escapeHtml(confirmText)}</button>
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
            <div style="font-weight: 600; margin-bottom: 16px; font-size: 16px;">${escapeHtml(title)}</div>
            ${multiline
                ? `<textarea class="model-search-input" placeholder="${escapeHtml(placeholder)}" rows="5" style="resize: vertical; min-height: 100px;">${escapeHtml(defaultValue)}</textarea>`
                : `<input type="text" class="model-search-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}">`
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
            <div style="font-weight: 600; margin-bottom: 16px; font-size: 16px;">${escapeHtml(title)}</div>
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
