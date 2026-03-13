// init.js - Initialization functions

// Configure Marked.js syntax highlighting
const renderer = new marked.Renderer();
renderer.code = function (code, lang) {
    let highlighted;
    try {
        if (lang && hljs.getLanguage(lang)) {
            highlighted = hljs.highlight(code, { language: lang }).value;
        } else {
            highlighted = hljs.highlightAuto(code).value;
        }
    } catch (e) {
        console.error('Highlight.js error:', e);
        highlighted = code;
    }

    return `<div class="code-block">
        <pre><code class="hljs ${lang || ''}">${highlighted}</code></pre>
        <button type="button" class="code-copy-btn" title="复制代码"><i class="ph ph-copy"></i></button>
    </div>`;
};

marked.setOptions({ renderer });

// -----------------------------------------
// Initialization
// -----------------------------------------
async function initApp() {
    // 1. Load data via IPC securely
    state.settings = await window.api.getSettings();
    state.chats = await window.api.getChats() || [];

    // Migrate old settings
    const hasProviders = state.settings.providers && state.settings.providers.length > 0;
    const hasOldSettings = state.settings.endpoint || state.settings.apiKey;

    // Even if providers exists, if it looks like defaults and we have old top-level settings, migrate them
    const isDefaultProvider = hasProviders && state.settings.providers.length === 1 && state.settings.providers[0].id === 'default' && !state.settings.providers[0].apiKey;

    if ((!hasProviders || isDefaultProvider) && hasOldSettings) {
        state.settings.providers = [{
            id: 'default',
            name: '默认服务商',
            endpoint: state.settings.endpoint || "https://api.openai.com/v1",
            apiKey: state.settings.apiKey || "",
            models: state.settings.modelName || 'gpt-3.5-turbo, deepseek-chat'
        }];
        // Clean up old top-level settings to avoid repeated migration
        delete state.settings.endpoint;
        delete state.settings.apiKey;
        delete state.settings.modelName;
    }

    if (state.settings.enableThinking === undefined) {
        state.settings.enableThinking = true;
    }

    if (state.settings.showCompanionsInNewChat === undefined) {
        state.settings.showCompanionsInNewChat = true;
    }

    if (!state.settings.skills || state.settings.skills.length === 0) {
        // 初始化默认技能
        state.settings.skills = [];
        window.api.saveSettings(state.settings);
    }

    updateSearchBtnState();
    renderMcpSelectionDropdown();
    renderSkillsBar();

    // 2. Setup UI events
    setupEvents();
    initChatMenuCloseHandler();

    // Render loaded data
    updateBadge();
    renderChatList();
    applyTheme(state.settings.theme || 'light');

    // Choose active chat
    if (state.chats.length > 0) {
        switchChat(state.chats[0].id);
    } else {
        // Create a new chat when no chats exist
        createNewChat();
    }
}

function updateWelcomeScreen() {
    if (!welcomeScreen) return;

    // 获取当前对话
    const chat = state.chats.find(c => c.id === state.currentChatId);
    // 只有在没有消息的新对话中才显示增强欢迎页
    const isNewFresh = !chat || (chat.messages.length === 0);

    if (!isNewFresh) {
        welcomeScreen.style.display = 'none';
        return;
    }

    welcomeScreen.style.display = 'flex';

    // 如果选了搭档
    if (state.activeSkillId) {
        // 从所有搭档（内置 + 用户自定义）中查找
        const allCompanions = typeof getAllCompanions === 'function' ? getAllCompanions() : [];
        const skill = allCompanions.find(s => s.id === state.activeSkillId);
        if (skill) {
            const info = typeof getCompanionIconInfo === 'function' ? getCompanionIconInfo(skill.name) : { icon: 'ph-robot', color: 'var(--brand-color)' };

            welcomeScreen.innerHTML = `
                <div class="logo-circle" style="background: ${info.color}15; border: 2px solid ${info.color}">
                    <i class="ph-fill ${info.icon}" style="color: ${info.color}; font-size: 40px;"></i>
                </div>
                <h1 style="color: ${info.color}">${skill.name}</h1>
                <p style="font-weight: 500; opacity: 0.9;">${skill.desc || '已就绪'}</p>
                <div class="prompt-preview" style="margin-top: 20px; padding: 16px; background: var(--bg-surface-elevated); border-radius: 12px; border: 1px solid var(--border-subtle); max-width: 80%; width: 400px; text-align: left;">
                    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; font-style: italic;">"${skill.prompt}"</div>
                </div>
            `;
            return;
        }
    }

    // 默认欢迎状态
    const providers = state.settings.providers || [];
    const isConfigured = providers.some(p => p.endpoint && p.apiKey);

    welcomeScreen.innerHTML = `
        <div class="logo-circle"><i class="ph ph-robot"></i></div>
        <h1>${isConfigured ? '准备就绪' : '您好，我是您的 AI 助理'}</h1>
        <p>${isConfigured ? '开启您的 AI 之旅，发送第一条消息吧！' : '请点击左下角「设置」配置 API 以开始使用。'}</p>
    `;
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }
    if (window.api && window.api.updateTitlebarTheme) {
        window.api.updateTitlebarTheme(theme);
    }
}

function updateBadge() {
    state.settings.providers = state.settings.providers || [];
    renderSearchableModelSelect();
    updateWelcomeScreen();
}