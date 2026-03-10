// companions.js - Companion manager (skills editor) modal
// Note: Built-in skills list is now defined in skills.js as getAllCompanions() to avoid duplication

function openCompanionsManager() {
    if (typeof closeAllModals === 'function') closeAllModals();
    renderCompanionsManager();
    const modal = document.getElementById('companions-modal');
    if (modal) modal.style.display = 'flex';

    // Init toggle state
    const toggle = document.getElementById('show-companions-new-chat-toggle');
    if (toggle) {
        toggle.checked = state.settings.showCompanionsInNewChat !== false; // Default true
        toggle.onchange = (e) => {
            state.settings.showCompanionsInNewChat = e.target.checked;
            saveSettingsSilently();
        };
    }
}

function closeCompanionsManager() {
    const modal = document.getElementById('companions-modal');
    if (modal) modal.style.display = 'none';
}

async function addCompanion() {
    try {
        const result = await showCompanionDialog({
            title: '创建新搭档',
            name: '',
            prompt: '你是一个有用的助理。'
        });
        if (!result) return;

        const newComp = {
            id: generateId(),
            name: result.name,
            desc: '自定义搭档',
            prompt: result.prompt || '你是一个有用的助理。'
        };

        if (!state.settings.skills) state.settings.skills = [];
        state.settings.skills.push(newComp);

        await saveSettingsSilently();
        renderCompanionsManager();
        if (typeof renderCompanionsList === 'function') renderCompanionsList();
        if (typeof showNotification === 'function') {
            showNotification('搭档创建成功', 'success');
        }
    } catch (err) {
        console.error('Error in addCompanion:', err);
        if (typeof showNotification === 'function') {
            showNotification('创建搭档失败：' + err.message, 'error');
        } else {
            alert('创建搭档失败：' + err.message);
        }
    }
}

function renderCompanionsManager() {
    const myContainer = document.getElementById('my-companions-container');
    if (!myContainer) return;

    myContainer.innerHTML = '';

    // 使用 skills.js 中的 getAllCompanions 获取所有搭档（内置 + 用户自定义）
    const allCompanions = typeof getAllCompanions === 'function' ? getAllCompanions() : [];
    const userSkills = state.settings.skills || [];
    const userSkillIds = new Set(userSkills.map(s => s.id));

    // 标记哪些是用户创建的
    const allSkills = allCompanions.map((c, idx) => {
        const isUserCreated = userSkillIds.has(c.id);
        const userIndex = isUserCreated ? userSkills.findIndex(s => s.id === c.id) : -1;
        return { ...c, _isUserCreated: isUserCreated, _userIndex: userIndex >= 0 ? userIndex : undefined };
    });

    if (allSkills.length === 0) {
        myContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">暂无搭档，点击上方按钮创建</div>';
        return;
    }

    allSkills.forEach((c) => {
        myContainer.appendChild(createCompanionCard(c, c._isUserCreated, c._userIndex));
    });
}

function createCompanionCard(c, isUserCreated, index) {
    const card = document.createElement('div');
    card.className = 'companion-card-v2';

    const iconInfo = (typeof getCompanionIconInfo === 'function') ? getCompanionIconInfo(c.name) : { icon: 'ph-sparkle', color: '#fbbf24' };

    card.innerHTML = `
        <div class="card-icon" style="color: ${iconInfo.color}">
            <i class="ph-fill ${iconInfo.icon}"></i>
        </div>
        <div class="card-content">
            <div class="card-name">${escapeHtml(c.name)}</div>
            <div class="card-desc">${escapeHtml(c.desc || '')}</div>
        </div>
        ${isUserCreated ? `
        <div class="card-actions">
            <button class="btn btn-icon btn-ghost btn-sm edit-comp-btn" title="编辑">
                <i class="ph ph-pencil-simple"></i>
            </button>
            <button class="btn btn-icon btn-ghost btn-sm del-comp-btn" title="删除" style="color: #ef4444">
                <i class="ph ph-trash"></i>
            </button>
        </div>
        ` : ''}
    `;

    card.onclick = (e) => {
        if (e.target.closest('button')) return;
        state.activeSkillId = c.id;
        if (typeof renderCompanionsList === 'function') renderCompanionsList();
        if (typeof updateWelcomeScreen === 'function') updateWelcomeScreen();
        closeCompanionsManager();
    };

    if (isUserCreated && typeof index === 'number') {
        card.querySelector('.edit-comp-btn').onclick = (e) => {
            e.stopPropagation();
            editCompanion(index);
        };
        card.querySelector('.del-comp-btn').onclick = (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除搭档 "${c.name}" 吗？`)) {
                state.settings.skills.splice(index, 1);
                saveSettingsSilently().then(() => {
                    renderCompanionsManager();
                    if (typeof renderCompanionsList === 'function') renderCompanionsList();
                });
            }
        };
    }

    return card;
}

async function editCompanion(index) {
    const c = state.settings.skills[index];

    const result = await showCompanionDialog({
        title: '编辑搭档',
        name: c.name,
        prompt: c.prompt,
        isEdit: true
    });
    if (!result) return;

    state.settings.skills[index] = {
        ...c,
        name: result.name,
        prompt: result.prompt
    };

    await saveSettingsSilently();
    renderCompanionsManager();
    if (typeof renderCompanionsList === 'function') renderCompanionsList();
    if (typeof showNotification === 'function') {
        showNotification('搭档修改成功', 'success');
    }
}

async function saveSettingsSilently() {
    if (window.api && window.api.saveSettings) {
        await window.api.saveSettings(state.settings);
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

