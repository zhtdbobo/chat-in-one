// skills.js - Skills related functions

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

    const updatePromptPreview = () => {
        const preview = document.getElementById('skill-prompt-preview');
        const promptText = document.getElementById('skill-prompt-text');
        if (!preview || !promptText) return;
        if (state.activeSkillId) {
            const skill = skills.find(s => s.id === state.activeSkillId);
            if (skill && skill.prompt) {
                promptText.textContent = `提示词预览: ${skill.prompt}`;
                preview.style.display = 'flex';
            } else {
                preview.style.display = 'none';
            }
        } else {
            preview.style.display = 'none';
        }
    };

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
            state.activeSkillId = (state.activeSkillId === skill.id) ? null : skill.id;
            renderSkillsBar();
        };
        bar.appendChild(card);
    });

    updatePromptPreview();

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