// settings.js - Settings related functions

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
        const allModels = (provider.allModels || "").split(',').map(m => m.trim()).filter(m => m);
        const visibleModels = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(m => m);
        
        checklist.innerHTML = allModels.length === 0 ? '<div style="font-size:12px; color:var(--text-muted); padding:8px">暂无模型。请点击获取。</div>' : '';

        allModels.forEach(m => {
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

    // Bindings
    container.querySelector('#del-current-provider').onclick = () => {
        showConfirmDialog('确认删除此服务商？', () => {
            tempProviders.splice(currentProviderIndex, 1);
            currentProviderIndex = tempProviders.length > 0 ? 0 : -1;
            renderProvidersSidebar();
            renderProviderDetail();
        });
    };

    container.querySelector('#fetch-models-btn').onclick = async () => {
        // IMPORTANT: Save current inputs to tempProviders before fetching and re-rendering
        saveCurrentProviderData();

        const url = provider.endpoint;
        const key = provider.apiKey;
        if (!url) { showNotification("请先填写Endpoint", "error"); return; }

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
            }

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
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function handleSettingsSave(e) {
    if (e) e.preventDefault();
    saveCurrentProviderData();
    saveCurrentMCPServerData();
    saveCurrentSkillData();

    // Use spread to preserve all existing settings (like lastUsedModel, theme, etc.)
    const newSettings = {
        ...state.settings,
        systemPrompt: document.getElementById('system-prompt').value.trim(),
        enableThinking: document.getElementById('enable-thinking').checked,
        enableSearch: document.getElementById('enable-search').checked,
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