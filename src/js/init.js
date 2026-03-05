// init.js - Initialization functions

// Configure Marked.js syntax highlighting
marked.setOptions({
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
});

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

    updateThinkingBtnState();
    updateSearchBtnState();
    renderMcpSelectionDropdown();
    renderSkillsBar();

    // 2. Setup UI events
    setupEvents();

    // Render loaded data
    updateBadge();
    renderChatList();
    applyTheme(state.settings.theme || 'light');

    // Choose active chat
    if (state.chats.length > 0) {
        switchChat(state.chats[0].id);
    } else {
        updateWelcomeScreen();
    }
}

function updateWelcomeScreen() {
    if (!welcomeScreen) return;

    // Check if at least one provider has an endpoint and API key
    const providers = state.settings.providers || [];
    const isConfigured = providers.some(p => p.endpoint && p.apiKey);

    const h1 = welcomeScreen.querySelector('h1');
    const p = welcomeScreen.querySelector('p');

    if (isConfigured) {
        h1.textContent = '准备就绪';
        p.textContent = '开启您的 AI 之旅，发送第一条消息吧！';
    } else {
        h1.textContent = '您好，我是您的 AI 助理';
        p.textContent = '请点击左下角「设置」配置 API 以开始使用。';
    }
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