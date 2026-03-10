// skills.js - Companions (runtime) related functions

function getCompanionIconInfo(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('翻译') || n.includes('translate')) return { icon: 'ph-translate', color: '#3b82f6' };
    if (n.includes('代码') || n.includes('code') || n.includes('架构') || n.includes('python') || n.includes('软件工程师') || n.includes('artifact')) return { icon: 'ph-code', color: '#10b981' };
    if (n.includes('写作') || n.includes('文案') || n.includes('营销') || n.includes('创意')) return { icon: 'ph-pencil-circle', color: '#f59e0b' };
    if (n.includes('总结') || n.includes('汇报') || n.includes('周报')) return { icon: 'ph-text-aa', color: '#8b5cf6' };
    if (n.includes('学习') || n.includes('老师') || n.includes('英文') || n.includes('学英语')) return { icon: 'ph-chalkboard-teacher', color: '#ec4899' };
    if (n.includes('心理') || n.includes('情绪') || n.includes('咨询') || n.includes('夸夸')) return { icon: 'ph-heart-straight', color: '#ef4444' };
    if (n.includes('小红书') || n.includes('运营')) return { icon: 'ph-instagram-logo', color: '#f43f5e' };
    if (n.includes('面试') || n.includes('hr')) return { icon: 'ph-microphone-stage', color: '#06b6d4' };
    if (n.includes('调研') || n.includes('搜索') || n.includes('信息')) return { icon: 'ph-magnifying-glass', color: '#6366f1' };
    if (n.includes('全能') || n.includes('助理') || n.includes('默认')) return { icon: 'ph-mask-happy', color: '#14b8a6' };
    if (n.includes('图表') || n.includes('chart')) return { icon: 'ph-chart-bar', color: '#0ea5e9' };
    if (n.includes('正则')) return { icon: 'ph-brackets-curly', color: '#8b5cf6' };
    if (n.includes('命理') || n.includes('大师') || n.includes('命理大师')) return { icon: 'ph-hand-pointing', color: '#fbbf24' };
    if (n.includes('起名')) return { icon: 'ph-text-t', color: '#10b981' };
    if (n.includes('midjourney') || n.includes('绘图')) return { icon: 'ph-palette', color: '#f43f5e' };
    if (n.includes('dba') || n.includes('数据库')) return { icon: 'ph-database', color: '#64748b' };
    if (n.includes('it专家') || n.includes('故障')) return { icon: 'ph-desktop', color: '#3b82f6' };
    if (n.includes('格言') || n.includes('哲理')) return { icon: 'ph-quotes', color: '#94a3b8' };

    return { icon: 'ph-sparkle', color: '#fbbf24' };
}

function renderCompanionsList() {
    const list = document.getElementById('companions-list-right') || document.getElementById('companions-list');
    if (!list) return;

    const companions = state.settings.skills || [];
    list.innerHTML = '';

    const defaultItem = document.createElement('div');
    defaultItem.className = `companion-item ${!state.activeSkillId ? 'active' : ''}`;
    const defaultIconInfo = getCompanionIconInfo('默认');
    defaultItem.innerHTML = `
        <i class="ph-fill ${defaultIconInfo.icon}" style="color: ${defaultIconInfo.color}"></i>
        <span class="companion-name">默认对话</span>
    `;
    defaultItem.onclick = () => {
        state.activeSkillId = null;
        renderCompanionsList();
        if (typeof updateWelcomeScreen === 'function') updateWelcomeScreen();
    };
    list.appendChild(defaultItem);

    companions.forEach(c => {
        const item = document.createElement('div');
        item.className = `companion-item ${state.activeSkillId === c.id ? 'active' : ''}`;
        const iconInfo = getCompanionIconInfo(c.name);
        item.innerHTML = `
            <i class="ph-fill ${iconInfo.icon}" style="color: ${iconInfo.color}"></i>
            <span class="companion-name">${c.name || '未命名搭档'}</span>
        `;
        item.title = c.desc || c.name || '';
        item.onclick = () => {
            state.activeSkillId = (state.activeSkillId === c.id) ? null : c.id;
            renderCompanionsList();
            if (typeof updateWelcomeScreen === 'function') updateWelcomeScreen();
        };
        list.appendChild(item);
    });
}


// Backward compatibility (older code calls renderSkillsBar)
function renderSkillsBar() {
    renderCompanionsList();
}