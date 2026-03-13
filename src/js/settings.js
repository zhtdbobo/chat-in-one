// settings.js - Settings related functions

// -----------------------------------------
// Settings Logics
// -----------------------------------------
// -----------------------------------------
// Settings Master-Detail Refactoring
// -----------------------------------------
let tempProviders = [];
let currentProviderIndex = -1;
const providerDetailUiState = {};

function openSettings() {
    if (typeof closeAllModals === 'function') closeAllModals();

    tempProviders = JSON.parse(JSON.stringify(state.settings.providers || []));
    currentProviderIndex = tempProviders.length > 0 ? 0 : -1;

    const systemPromptEl = document.getElementById('system-prompt');
    const enableThinkingEl = document.getElementById('enable-thinking');
    const enableSearchEl = document.getElementById('enable-search');

    if (systemPromptEl) systemPromptEl.value = state.settings.systemPrompt || '';
    if (enableThinkingEl) enableThinkingEl.checked = state.settings.enableThinking !== false;
    if (enableSearchEl) enableSearchEl.checked = !!state.settings.enableSearch;

    if (typeof initMCPSettings === 'function') {
        initMCPSettings();
    }

    renderProvidersSidebar();
    renderProviderDetail();

    // Reset tabs
    document.querySelectorAll('.settings-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === 0));

    if (settingsModal) settingsModal.style.display = 'flex';
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

    document.getElementById('add-provider-btn').onclick = () => {
        saveCurrentProviderData();
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
    const uiState = providerDetailUiState[provider.id] || (providerDetailUiState[provider.id] = { modelSearchQuery: '' });
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
            <input
                type="url"
                class="prov-endpoint"
                value="${provider.endpoint || ''}"
                placeholder="例如: https://api.openai.com/v1 或 https://dashscope.aliyuncs.com/v1">
        </div>
        
        <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <label style="margin:0">可见模型列表</label>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-ghost btn-sm" id="test-connection-btn">
                        <i class="ph ph-plug"></i> 测试连接
                    </button>
                    <button type="button" class="btn btn-ghost btn-sm" id="fetch-models-btn">
                        <i class="ph ph-arrows-counter-clockwise"></i> 获取模型
                    </button>
                </div>
            </div>
            <div class="provider-model-tools">
                <input type="text" class="prov-manual-model" placeholder="手动新增模型 ID（用于不支持 /models 的协议）">
                <button type="button" class="btn btn-ghost btn-sm" id="add-manual-model-btn">
                    <i class="ph ph-plus"></i> 新增模型
                </button>
            </div>
            <input type="text" class="prov-model-search" placeholder="搜索模型列表..." />
            <div class="provider-test-result" id="provider-test-result" style="display:none"></div>
            <div class="multi-select-models" id="models-checklist">
                <!-- Checklist will be here -->
            </div>
        </div>
    `;

    // Render Checklist
    const renderChecklist = () => {
        const checklist = container.querySelector('#models-checklist');
        const allModels = (provider.allModels || "").split(',').map(m => m.trim()).filter(m => m);
        const visibleModels = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
        const q = (uiState.modelSearchQuery || '').trim().toLowerCase();
        const filteredModels = q ? allModels.filter(m => (m || '').toLowerCase().includes(q)) : allModels;

        checklist.innerHTML = '';
        if (allModels.length === 0) {
            checklist.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px">暂无模型。可点击“获取模型”或使用上方输入框手动新增。</div>';
            return;
        }
        if (filteredModels.length === 0) {
            checklist.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px">未找到匹配的模型</div>';
            return;
        }

        filteredModels.forEach(m => {
            const isVisible = visibleModels.includes(m);
            const item = document.createElement('div');
            item.className = 'model-check-item';
            item.innerHTML = `
                <input type="checkbox" ${isVisible ? 'checked' : ''} id="chk-${m}" value="${m}">
                <label for="chk-${m}">${m}</label>
            `;
            // Toggle visibility when checkbox changes
            item.querySelector('input').addEventListener('change', (e) => {
                const currentVisible = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
                if (e.target.checked) {
                    if (!currentVisible.includes(m)) currentVisible.push(m);
                } else {
                    const idx = currentVisible.indexOf(m);
                    if (idx > -1) currentVisible.splice(idx, 1);
                }
                provider.visibleModels = currentVisible.join(', ');
            });
            checklist.appendChild(item);
        });
    };
    renderChecklist();

    const modelSearchInput = container.querySelector('.prov-model-search');
    if (modelSearchInput) {
        modelSearchInput.value = uiState.modelSearchQuery || '';
        modelSearchInput.addEventListener('input', () => {
            uiState.modelSearchQuery = modelSearchInput.value || '';
            renderChecklist();
        });
    }

    // Bindings
    container.querySelector('#del-current-provider').onclick = () => {
        showConfirmDialog('确认删除此服务商？', () => {
            delete providerDetailUiState[provider.id];
            tempProviders.splice(currentProviderIndex, 1);
            currentProviderIndex = tempProviders.length > 0 ? 0 : -1;
            renderProvidersSidebar();
            renderProviderDetail();
        });
    };

        container.querySelector('#fetch-models-btn').onclick = async () => {
        // IMPORTANT: Save current inputs to tempProviders before fetching and re-rendering
        saveCurrentProviderData();

        const url = (provider.endpoint || '').trim();
        const key = provider.apiKey;
        if (!url) { showNotification("请先填写Endpoint", "error"); return; }

        try {
            const btn = container.querySelector('#fetch-models-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 请求中...';

            // 统一使用「短链接 Endpoint」，自动拼接常见 /v1/models 变体
            const base = url.replace(/\/+$/, '');
            const lower = base.toLowerCase();
            const candidates = [];

            // 如果用户已经带了 /v1，则优先尝试 /v1/models，其次 /models
            if (lower.endsWith('/v1')) {
                candidates.push(base + '/models');
                candidates.push(base.replace(/\/v1$/i, '') + '/v1/models');
            } else {
                // 根域名形式: https://api.openai.com 或兼容 DashScope 等
                candidates.push(base + '/v1/models');
                candidates.push(base + '/models');
            }

            let lastError = null;
            let data = null;

            for (const fetchPath of Array.from(new Set(candidates))) {
                try {
                    const req = await fetch(fetchPath, { headers: { 'Authorization': 'Bearer ' + key } });
                    if (!req.ok) {
                        lastError = new Error("HTTP " + req.status + " @ " + fetchPath);
                        continue;
                    }
                    data = await req.json();
                    break;
                } catch (err) {
                    lastError = err;
                }
            }

            // 支持多种响应格式
            let ids = [];
            
            if (data.data && Array.isArray(data.data)) {
                // 标准 OpenAI 格式: { data: [{id: 'model-1'}, ...] }
                ids = data.data.map(m => m.id).filter(id => id);
            } else if (Array.isArray(data)) {
                // 某些服务商直接返回数组: [{id: 'model-1'}, ...]
                ids = data.map(m => m.id || m.name || m.model).filter(id => id);
            } else if (data.models && Array.isArray(data.models)) {
                // 另一种常见格式: { models: [...] }
                ids = data.models.map(m => m.id || m.name || m).filter(id => id);
            } else if (data.object === 'list' && Array.isArray(data.data)) {
                // OpenAI 标准格式确认
                ids = data.data.map(m => m.id).filter(id => id);
            }
            
            if (ids.length === 0) {
                throw lastError || new Error("未能从任何候选地址获取模型列表，或返回格式不支持");
            }

            // Store all models in allModels
            provider.allModels = ids.join(', ');
            // Initialize visibleModels as empty (user needs to manually enable)
            if (!provider.visibleModels) {
                provider.visibleModels = '';
            }

            // Show model selection panel
            showModelSelectionPanel(ids, provider, () => {
                renderProviderDetail();
                renderProvidersSidebar();
            });

            showNotification(`成功获取 ${ids.length} 个模型，请在面板中选择要在主界面显示的模型`, "success");

        } catch (e) {
            showNotification("获取失败: " + e.message, "error");
        } finally {
            const btn = container.querySelector('#fetch-models-btn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-arrows-counter-clockwise"></i> 获取模型';
            }
        }
    };

    function showTestModelPicker(models, onPick) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay model-selection-overlay';

        const panel = document.createElement('div');
        panel.className = 'model-selection-panel';

        panel.innerHTML = `
            <button class="btn btn-ghost btn-sm model-panel-close" title="关闭">
                <i class="ph ph-x"></i>
            </button>
            <div style="font-weight:600; margin-bottom:10px;">选择要测试的模型</div>
            <input class="model-search-input" placeholder="搜索模型..." />
            <div class="model-selection-list"></div>
        `;

        const close = () => modal.remove();
        panel.querySelector('.model-panel-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        const searchInput = panel.querySelector('.model-search-input');
        const listEl = panel.querySelector('.model-selection-list');

        const renderList = () => {
            const q = (searchInput.value || '').toLowerCase();
            const filtered = (models || []).filter(m => (m || '').toLowerCase().includes(q));
            listEl.innerHTML = '';
            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px;">没有匹配的模型</div>';
                return;
            }
            filtered.forEach((m) => {
                const item = document.createElement('div');
                item.className = 'model-selection-item';
                item.style.cursor = 'pointer';
                item.innerHTML = `<span class="model-name">${m}</span><span style="font-size:12px; color:var(--text-muted);">点击测试</span>`;
                item.addEventListener('click', () => {
                    close();
                    onPick(m);
                });
                listEl.appendChild(item);
            });
        };

        searchInput.addEventListener('input', renderList);
        renderList();

        modal.appendChild(panel);
        document.body.appendChild(modal);
        setTimeout(() => searchInput.focus(), 0);
    }

    // Manual add model (for endpoints that don't support /models)
    const addManualBtn = container.querySelector('#add-manual-model-btn');
    if (addManualBtn) {
        addManualBtn.onclick = () => {
            saveCurrentProviderData();
            const input = container.querySelector('.prov-manual-model');
            const modelId = (input?.value || '').trim();
            if (!modelId) {
                showNotification("请输入模型 ID", "error");
                return;
            }

            const all = (provider.allModels || "").split(',').map(m => m.trim()).filter(Boolean);
            if (!all.includes(modelId)) all.push(modelId);
            provider.allModels = all.join(', ');

            const visible = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(Boolean);
            if (!visible.includes(modelId)) visible.push(modelId);
            provider.visibleModels = visible.join(', ');

            if (input) input.value = '';
            renderProviderDetail();
            renderProvidersSidebar();
            showNotification(`已新增模型：${modelId}`, "success");
        };
    }

    // Test connection (OpenAI-compatible POST /chat/completions)
    const testBtn = container.querySelector('#test-connection-btn');
    if (testBtn) {
        testBtn.onclick = async () => {
            saveCurrentProviderData();

            const resultEl = container.querySelector('#provider-test-result');
            const manualModel = (container.querySelector('.prov-manual-model')?.value || '').trim();

            const visible = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(Boolean);
            const all = (provider.allModels || "").split(',').map(m => m.trim()).filter(Boolean);
            if (!provider.endpoint) { showNotification("请先填写Endpoint", "error"); return; }
            if (!provider.apiKey) { showNotification("请先填写API Key", "error"); return; }

            const runTest = async (modelToTest) => {
                if (!modelToTest) return;
                try {
                    testBtn.disabled = true;
                    testBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 测试中...';
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.className = 'provider-test-result';
                        resultEl.textContent = `请求中... (model=${modelToTest})`;
                    }

                    const res = await window.api.testProviderConnection({
                        endpoint: provider.endpoint,
                        apiKey: provider.apiKey,
                        modelName: modelToTest
                    });

                    if (res?.ok) {
                        const tokens = res.usage?.total_tokens ?? res.usage?.completion_tokens ?? res.usage?.output_tokens ?? '—';
                        const line = `OK · latency=${res.latencyMs}ms · model=${res.model || modelToTest} · tokens=${tokens}`;
                        if (resultEl) {
                            resultEl.className = 'provider-test-result ok';
                            resultEl.textContent = line;
                        }
                        showNotification("连接成功：" + line, "success");
                    } else {
                        const errLine = `FAIL · latency=${res?.latencyMs ?? '—'}ms · ${res?.status ? 'HTTP ' + res.status + ' · ' : ''}${res?.error || 'Unknown error'}`;
                        if (resultEl) {
                            resultEl.className = 'provider-test-result fail';
                            resultEl.textContent = errLine;
                        }
                        showNotification("连接失败：" + errLine, "error");
                    }
                } catch (e) {
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.className = 'provider-test-result fail';
                        resultEl.textContent = 'FAIL · ' + (e.message || String(e));
                    }
                    showNotification("连接失败: " + (e.message || String(e)), "error");
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="ph ph-plug"></i> 测试连接';
                }
            };

            // Build picker models list: prefer visibleModels, fallback to allModels
            let candidates = [...(visible.length ? visible : all)];
            if (manualModel && !candidates.includes(manualModel)) candidates.unshift(manualModel);
            candidates = candidates.filter(Boolean);

            if (candidates.length === 0) {
                const modelToTest = await showInputDialog({
                    title: '测试模型',
                    placeholder: '请输入要测试的模型 ID（例如：MiniMax-M2.5）'
                });
                if (!modelToTest) return;
                await runTest(modelToTest);
                return;
            }

            showTestModelPicker(candidates, runTest);
        };
    }
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function handleSettingsSave(e) {
    if (e) e.preventDefault();
    saveCurrentProviderData();
    saveCurrentMCPServerData();

    // Use spread to preserve all existing settings (like lastUsedModel, theme, etc.)
    const newSettings = {
        ...state.settings,
        systemPrompt: document.getElementById('system-prompt').value.trim(),
        enableThinking: document.getElementById('enable-thinking').checked,
        enableSearch: document.getElementById('enable-search').checked,
        providers: tempProviders,
        mcpServers: tempMCPServers
    };

    state.settings = newSettings;
    updateSearchBtnState();
    await window.api.saveSettings(newSettings);
    updateBadge();
    if (typeof renderSearchableModelSelect === 'function') {
        renderSearchableModelSelect();
    }
    closeSettings();
}