// companions.js - Companion manager (skills editor) modal

function getDefaultSkills() {
    return [
        { id: 'f-1', name: '做图表', desc: '根据数据生成各类精美图表', prompt: '你是一个图表专家。请根据用户提供的数据，生成 Mermaid 代码或建议最适合的图表类型。' },
        { id: 'f-2', name: 'Artifact Preview', desc: '实时预览代码与设计稿', prompt: '你是一个前端预览助手。请以代码块的形式输出代码，并描述其功能。' },
        { id: 'f-3', name: '翻译助手', desc: '支持多国语言互译与地道表达', prompt: '你是一个资深翻译家。请将用户输入的内容翻译成地道的语言。' },
        { id: 'f-4', name: '软件工程师', desc: '代码编写、重构与架构建议', prompt: '你是一个全栈软件工程师。请协助我进行代码开发和架构设计。' },
        { id: 'f-5', name: '夸夸机', desc: '提供情绪价值，全方位赞美', prompt: '你是一个超级夸夸大王。请根据用户的情况，给出非常诚恳且夸张的赞美。' },
        { id: 'f-6', name: '夸夸机2.0', desc: '更高阶的共情与赞美技巧', prompt: '你是一个资深心理辅导师。请提供深刻的共情和温暖的赞美。' },
        { id: 'f-7', name: '正则表达式', desc: '生成、解释与测试正则', prompt: '你是一个正则表达式专家。' },
        { id: 'f-8', name: '起名先生', desc: '宝宝起名、品牌起名与寓意解析', prompt: '你是一个国学起名大师。' },
        { id: 'f-9', name: '命理大师', desc: '八字排盘、运势分析与建议', prompt: '你是一个周易命理大师。' },
        { id: 'f-10', name: '学英语', desc: '单词背诵、语法解析与口语练习', prompt: '你是一个英语老师。' },
        { id: 'f-11', name: 'Midjourney Prompt', desc: '生成高质量的绘图提示词', prompt: '你是一个 AI 艺术创作专家。' },
        { id: 'f-12', name: 'DBA', desc: '数据库设计、SQL 优化与排障', prompt: '你是一个资深数据库管理员。' },
        { id: 'f-13', name: 'IT专家', desc: '电脑故障排除、系统优化与软件推荐', prompt: '你是一个全能 IT 支持工程师。' },
        { id: 'f-14', name: '格言警句', desc: '每日一签，提供精神食粮', prompt: '你是一个博学、深邃的哲学家。' }
    ];
}

function openCompanionsManager() {
    closeAllModals();
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

function addCompanion() {
    const name = prompt('请输入新搭档的名称：');
    if (!name) return;

    const newComp = {
        id: generateId(),
        name: name,
        desc: '自定义搭档',
        prompt: '你是一个有用的助理。'
    };

    if (!state.settings.skills) state.settings.skills = [];
    state.settings.skills.push(newComp);

    saveSettingsSilently().then(() => {
        renderCompanionsManager();
        if (typeof renderCompanionsList === 'function') renderCompanionsList();
    });
}

function renderCompanionsManager() {
    const myContainer = document.getElementById('my-companions-container');
    const featuredContainer = document.getElementById('featured-companions-container');

    if (myContainer) {
        myContainer.innerHTML = '';
        const myCompanions = state.settings.skills || [];
        myCompanions.forEach((c, index) => {
            myContainer.appendChild(createCompanionCard(c, true, index));
        });
    }

    if (featuredContainer) {
        featuredContainer.innerHTML = '';
        const featured = getDefaultSkills();
        featured.forEach(c => {
            featuredContainer.appendChild(createCompanionCard(c, false));
        });
    }
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
        ` : `
        <div class="card-actions">
            <button class="btn btn-icon btn-ghost btn-sm pin-comp-btn" title="添加到我的搭档">
                <i class="ph ph-plus-circle"></i>
            </button>
        </div>
        `}
    `;

    card.onclick = (e) => {
        if (e.target.closest('button')) return;

        // Selection logic: add to "Used" list if from library
        if (!isUserCreated) {
            const alreadyExists = (state.settings.skills || []).some(s => s.name === c.name);
            if (!alreadyExists) {
                const newPinned = { ...c, id: generateId() };
                if (!state.settings.skills) state.settings.skills = [];
                state.settings.skills.push(newPinned);
                saveSettingsSilently().then(renderCompanionsManager);
            }
        }

        state.activeSkillId = c.id;
        if (typeof renderCompanionsList === 'function') renderCompanionsList();
        if (typeof updateWelcomeScreen === 'function') updateWelcomeScreen();
        closeCompanionsManager();
    };

    if (isUserCreated) {
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
    } else {
        card.querySelector('.pin-comp-btn').onclick = (e) => {
            e.stopPropagation();
            const alreadyExists = (state.settings.skills || []).some(s => s.name === c.name);
            if (alreadyExists) {
                showNotification('已在我的搭档中');
                return;
            }
            const newComp = { ...c, id: generateId() };
            if (!state.settings.skills) state.settings.skills = [];
            state.settings.skills.push(newComp);
            saveSettingsSilently().then(() => {
                renderCompanionsManager();
                if (typeof renderCompanionsList === 'function') renderCompanionsList();
                showNotification('已添加到我的搭档');
            });
        };
    }

    return card;
}

function editCompanion(index) {
    const c = state.settings.skills[index];
    const newName = prompt('修改搭档名称：', c.name);
    if (newName === null) return;

    const newDesc = prompt('修改简短描述：', c.desc);
    if (newDesc === null) return;

    const newPrompt = prompt('修改系统提示词 (Prompt)：', c.prompt);
    if (newPrompt === null) return;

    state.settings.skills[index] = {
        ...c,
        name: newName || '未命名',
        desc: newDesc || '',
        prompt: newPrompt || ''
    };

    saveSettingsSilently().then(() => {
        renderCompanionsManager();
        if (typeof renderCompanionsList === 'function') renderCompanionsList();
    });
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

