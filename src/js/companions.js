// companions.js - Companion manager (skills editor) modal

let tempCompanions = [];

function getDefaultSkills() {
    return [
        { id: generateId(), name: '全能助手', desc: '日常咨询、任务规划与知识问答', prompt: '你是一个贴心且博学的全能生活助理。请以礼貌、清晰且实用的风格回答我的问题。如果需要最新信息，请主动通过搜索获取。' },
        { id: generateId(), name: '搜中型调研员', desc: '深度联网搜索、数据对比与总结', prompt: '你是一位资深的信息调研专家。当收到任务时，请优先使用联网搜索功能获取最新、最全面的数据。你的回复应包含事实依据和多维度的对比分析。' },
        { id: generateId(), name: 'Python 架构师', desc: '高效、健壮的 Python 代码设计与调试', prompt: '你是一位资深 Python 开发工程师，专注于编写高效、可维护且符合最佳实践的代码。优先给出 Pythonic 的解决方案。' },
        { id: generateId(), name: '英文翻译润色', desc: '地道翻译、语法检查与风格提升', prompt: '你将担任英语翻译、拼写校对和修辞改进的角色。将我输入的内容翻译为更为优美和精炼的英语，并提供改进建议。' },
        { id: generateId(), name: '周报汇报专家', desc: '工作梳理、进度汇报与 PPT 提纲', prompt: '你是一位高效的职场管家。请协助我整理工作进度，生成逻辑清晰、重点突出的周报或汇报大纲。' },
        { id: generateId(), name: '营销文案大师', desc: '吸引力文案、创意策划与社交媒体推文', prompt: '你是一位顶尖的创意总监。擅长创作引人入胜的营销文案。请基于热点和产品特性，生成具有高度传播价值的内容。' },
        { id: generateId(), name: '学术助手', desc: '论文润色、专业表达与逻辑校对', prompt: '你是一位博学严谨的学术评审。请针对我提供的段落，从逻辑连贯性、表达严谨性及遣词造句方面进行深度润色。' },
        { id: generateId(), name: '心理疏导伙伴', desc: '共情倾听、压力纾解与建议', prompt: '你是一位温柔且具有专业背景的心理咨询师。请耐心地倾听我的述说，并以共情的态度给出正面引导。' },
        { id: generateId(), name: '小红书运营官', desc: '爆款标题、Emoji 排版与热点捕捉', prompt: '你是一位小红书运营大咖。请按照小红书流行风格：吸睛标题、生动 Emoji、接地气语气和标签来创作内容。' },
        { id: generateId(), name: '面试模拟官', desc: '针对性的岗位提问、反馈与优化建议', prompt: '你是一位资深的 HR 经理。请根据我的背景对我进行模拟面试。提出具有挑战性的问题，并给出评价。' }
    ];
}

function openCompanionsManager() {
    closeAllModals();

    const currentSkills = state.settings.skills || [];

    if (currentSkills.length === 0) {
        tempCompanions = getDefaultSkills();
    } else {
        tempCompanions = JSON.parse(JSON.stringify(currentSkills));
    }

    renderCompanionsManager();
    if (companionsModal) companionsModal.style.display = 'flex';
}

function closeCompanionsManager() {
    if (companionsModal) companionsModal.style.display = 'none';
}

function addCompanion() {
    tempCompanions.push({ id: generateId(), name: '', desc: '', prompt: '' });
    renderCompanionsManager();
}

function renderCompanionsManager() {
    const container = document.getElementById('companions-container');
    if (!container) return;
    container.innerHTML = '';

    tempCompanions.forEach((c, index) => {
        const item = document.createElement('div');
        item.className = 'skill-item';
        item.innerHTML = `
            <div class="skill-header">
                <h4><i class="ph ph-users"></i> 搭档 #${index + 1}: ${c.name || '未命名'}</h4>
                <button type="button" class="btn btn-icon btn-ghost btn-sm del-companion-btn" data-index="${index}" title="删除搭档">
                    <i class="ph ph-trash"></i>
                </button>
            </div>
            <div class="skill-form">
                <div class="form-group">
                    <label>搭档名称</label>
                    <input type="text" class="companion-name-input" value="${escapeHtml(c.name || '')}" placeholder="例如：翻译官">
                </div>
                <div class="form-group">
                    <label>简短描述</label>
                    <input type="text" class="companion-desc-input" value="${escapeHtml(c.desc || '')}" placeholder="简单描述一下这个搭档...">
                </div>
                <div class="form-group">
                    <label>系统提示词 (System Prompt)</label>
                    <textarea class="companion-prompt-input" placeholder="设定该搭档的角色性格、回复要求等...">${escapeHtml(c.prompt || '')}</textarea>
                </div>
            </div>
        `;

        item.querySelector('.del-companion-btn').onclick = () => {
            tempCompanions.splice(index, 1);
            renderCompanionsManager();
        };

        container.appendChild(item);
    });
}

function collectCompanionsFromUI() {
    const items = document.querySelectorAll('#companions-container .skill-item');
    items.forEach((item, index) => {
        if (!tempCompanions[index]) return;
        tempCompanions[index].name = item.querySelector('.companion-name-input').value.trim();
        tempCompanions[index].desc = item.querySelector('.companion-desc-input').value.trim();
        tempCompanions[index].prompt = item.querySelector('.companion-prompt-input').value.trim();
        if (!tempCompanions[index].id) tempCompanions[index].id = generateId();
    });
}

async function saveCompanionsManager() {
    collectCompanionsFromUI();

    const cleaned = tempCompanions
        .map(c => ({
            id: c.id || generateId(),
            name: (c.name || '').trim(),
            desc: (c.desc || '').trim(),
            prompt: (c.prompt || '').trim()
        }))
        .filter(c => c.name || c.prompt || c.desc);

    state.settings = {
        ...state.settings,
        skills: cleaned
    };

    if (window.api && window.api.saveSettings) {
        await window.api.saveSettings(state.settings);
    }

    if (typeof renderCompanionsList === 'function') renderCompanionsList();
    closeCompanionsManager();
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

