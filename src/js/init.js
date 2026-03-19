// init.js - Initialization functions

// Configure Marked.js syntax highlighting
const renderer = new marked.Renderer();
renderer.code = function (code, lang) {
    let highlighted;
    const escapeForCode = (typeof escapeHtml === 'function')
        ? escapeHtml(code)
        : String(code)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

    // Store the original (unescaped) source for preview/copy.
    // We use base64 to avoid breaking HTML attributes when code contains quotes/newlines.
    let rawB64 = '';
    try {
        if (typeof btoa === 'function') {
            rawB64 = btoa(unescape(encodeURIComponent(String(code))));
        }
    } catch (e) {
        rawB64 = '';
    }

    const hasHljs = typeof hljs !== 'undefined' && hljs && typeof hljs.highlightAuto === 'function';
    if (hasHljs) {
        try {
            if (lang && hljs.getLanguage && hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(code, { language: lang }).value;
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
        } catch (e) {
            // Fallback: always escape raw HTML so it can't be interpreted/executed.
            // (Otherwise `<div>..</div>` / `<style>..</style>` in model output can break layout.)
            highlighted = escapeForCode;
        }
    } else {
        highlighted = escapeForCode;
    }

    const lowLang = (lang || '').toLowerCase();
    const isRenderable = lowLang.includes('html') || lowLang.includes('svg') || lowLang.includes('xml') || 
                        lowLang.includes('javascript') || lowLang.includes('js') || 
                        lowLang.includes('jsx') || lowLang.includes('tsx');

    let previewBtn = '';
    if (isRenderable) {
        previewBtn = `<button type="button" class="code-action-btn code-preview-btn" title="沙盒预览"><i class="ph ph-magic-wand"></i><span>预览</span></button>`;
    }

    return `<div class="code-block">
        <div class="code-actions">
            ${previewBtn}
            <button type="button" class="code-action-btn code-copy-btn" title="复制代码"><i class="ph ph-copy"></i><span>复制</span></button>
        </div>
        <pre><code class="hljs ${lang || ''}" data-raw-b64="${rawB64}">${highlighted}</code></pre>
    </div>`;
};

// If the model outputs raw HTML (not fenced inside ```), marked will normally render
// it as actual markup, which can break the chat layout. We instead treat it as
// "code" so only clicking the preview button will render it inside the right-side
// sandbox iframe.
renderer.html = function (html) {
    return renderer.code(html, 'html');
};

// Provide a lightweight fallback so preview won't silently do nothing
// even if `sandbox.js` fails to load for any reason.
if (typeof window.openSandbox !== 'function') {
    window.openSandbox = function (htmlContent) {
        const sandboxArea = document.getElementById('sandbox-area');
        const sandboxResizer = document.getElementById('sandbox-resizer');
        const sandboxIframe = document.getElementById('sandbox-iframe');
        if (!sandboxArea || !sandboxResizer || !sandboxIframe) {
            console.error('Sandbox DOM not found, cannot open preview.');
            return;
        }
        sandboxArea.style.display = 'flex';
        sandboxResizer.style.display = 'block';
        const injectedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;background:#fff;color:#333}*{box-sizing:border-box}</style></head><body>${htmlContent || ''}</body></html>`;
        sandboxIframe.srcdoc = injectedHtml;
    };
}

marked.setOptions({ renderer });

// Configure DOMPurify to preserve button elements for code preview/copy actions
if (typeof DOMPurify !== 'undefined') {
    const originalSanitize = DOMPurify.sanitize.bind(DOMPurify);
    DOMPurify.sanitize = function(dirty, config) {
        if (typeof dirty !== 'string') {
            return originalSanitize(dirty, config);
        }
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = dirty;
        const buttons = Array.from(tempDiv.querySelectorAll('button'));
        if (buttons.length === 0) {
            return originalSanitize(dirty, config);
        }
        const buttonInfo = buttons.map(btn => ({
            outerHTML: btn.outerHTML,
            className: btn.className,
            innerHTML: btn.innerHTML
        }));
        const result = originalSanitize(dirty, config);
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = result;
        const resultButtons = resultDiv.querySelectorAll('button');
        if (resultButtons.length === 0 && buttonInfo.length > 0) {
            const codeBlock = resultDiv.querySelector('.code-block');
            if (codeBlock) {
                const codeActions = codeBlock.querySelector('.code-actions');
                if (codeActions) {
                    buttonInfo.forEach(info => {
                        const tempBtn = document.createElement('div');
                        tempBtn.innerHTML = info.outerHTML;
                        const btn = tempBtn.firstChild;
                        if (btn) {
                            codeActions.insertBefore(btn, codeActions.firstChild);
                        }
                    });
                }
            }
            return resultDiv.innerHTML;
        }
        return result;
    };
}

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