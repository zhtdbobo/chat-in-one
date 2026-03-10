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

    list.innerHTML = '';

    // 添加默认对话选项
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

    // 获取所有搭档（内置 + 用户自定义），与 companions.js 中的 getAllSkills 保持一致
    const allCompanions = getAllCompanions();

    allCompanions.forEach(c => {
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

// 获取所有搭档（内置默认 + 用户自定义），与 companions.js 保持一致
function getAllCompanions() {
    const defaultCompanions = [
        { id: 'f-1', name: '做图表', desc: '根据数据生成各类精美图表', prompt: '你是一个图表专家。请根据用户提供的数据，生成 Mermaid 代码或建议最适合的图表类型。', isBuiltIn: true },
        { id: 'f-2', name: 'Artifact Preview', desc: '实时预览代码与设计稿', prompt: '你是一个前端预览助手。请以代码块的形式输出代码，并描述其功能。', isBuiltIn: true },
        { id: 'f-3', name: '翻译助手', desc: '支持多国语言互译与地道表达', prompt: '你是一个资深翻译家。请将用户输入的内容翻译成地道的语言。', isBuiltIn: true },
        { id: 'f-4', name: '软件工程师', desc: '代码编写、重构与架构建议', prompt: '你是一个全栈软件工程师。请协助我进行代码开发和架构设计。', isBuiltIn: true },
        { id: 'f-5', name: '夸夸机', desc: '提供情绪价值，全方位赞美', prompt: '你是一个超级夸夸大王。请根据用户的情况，给出非常诚恳且夸张的赞美。', isBuiltIn: true },
        { id: 'f-6', name: '夸夸机2.0', desc: '更高阶的共情与赞美技巧', prompt: '你是一个资深心理辅导师。请提供深刻的共情和温暖的赞美。', isBuiltIn: true },
        { id: 'f-7', name: '正则表达式', desc: '生成、解释与测试正则', prompt: '你是一个正则表达式专家。', isBuiltIn: true },
        { id: 'f-8', name: '起名先生', desc: '宝宝起名、品牌起名与寓意解析', prompt: '你是一个国学起名大师。', isBuiltIn: true },
        { id: 'f-9', name: '命理大师', desc: '八字排盘、运势分析与建议', prompt: '你是一个周易命理大师。', isBuiltIn: true },
        { id: 'f-10', name: '学英语', desc: '单词背诵、语法解析与口语练习', prompt: '你是一个英语老师。', isBuiltIn: true },
        { id: 'f-11', name: 'Midjourney Prompt', desc: '生成高质量的绘图提示词', prompt: '你是一个 AI 艺术创作专家。', isBuiltIn: true },
        { id: 'f-12', name: 'DBA', desc: '数据库设计、SQL 优化与排障', prompt: '你是一个资深数据库管理员。', isBuiltIn: true },
        { id: 'f-13', name: 'IT专家', desc: '电脑故障排除、系统优化与软件推荐', prompt: '你是一个全能 IT 支持工程师。', isBuiltIn: true },
        { id: 'f-14', name: '格言警句', desc: '每日一签，提供精神食粮', prompt: '你是一个博学、深邃的哲学家。', isBuiltIn: true }
    ];

    const userCompanions = state.settings.skills || [];
    const userNames = new Set(userCompanions.map(s => s.name));

    // 合并默认搭档和用户自定义搭档，排除同名的默认搭档
    const allCompanions = [];
    userCompanions.forEach(c => allCompanions.push(c));
    defaultCompanions.forEach(dc => {
        if (!userNames.has(dc.name)) {
            allCompanions.push(dc);
        }
    });

    return allCompanions;
}


// Backward compatibility (older code calls renderSkillsBar)
function renderSkillsBar() {
    renderCompanionsList();
}