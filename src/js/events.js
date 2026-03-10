// events.js - Event bindings

// -----------------------------------------
// Events
// -----------------------------------------
function setupEvents() {
    // Settings Tabs Event
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const target = e.currentTarget;
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            target.classList.add('active');
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const paneId = target.getAttribute('data-tab');
            document.getElementById(paneId).classList.add('active');
        });
    });

    // Settings modal interactions
    settingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);
    settingsForm.addEventListener('submit', handleSettingsSave);

    // About modal interactions
    aboutBtn.addEventListener('click', openAbout);
    closeAboutBtn.addEventListener('click', closeAbout);

    // Chat actions
    newChatBtn.addEventListener('click', createNewChat);

    // Import / Export
    document.getElementById('export-chats-btn').addEventListener('click', enterExportMode);
    document.getElementById('cancel-export-btn').addEventListener('click', exitExportMode);
    document.getElementById('confirm-export-btn').addEventListener('click', confirmExport);
    document.getElementById('select-all-chats').addEventListener('change', toggleSelectAll);

    // MCP Selection Dropdown
    const mcpBtn = document.getElementById('mcp-dropdown-btn');
    if (mcpBtn) {
        mcpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('mcp-selection-dropdown');
            dropdown.classList.toggle('show');
            if (dropdown.classList.contains('show')) {
                renderMcpSelectionDropdown();
            }
        });
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const mcpDropdown = document.getElementById('mcp-selection-dropdown');
        if (mcpDropdown) mcpDropdown.classList.remove('show');

        document.querySelectorAll('.select-dropdown.show').forEach(d => d.classList.remove('show'));
    });

    document.getElementById('import-chats-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importChats);

    // Removed old currentModelSelect listener since it's now handled by the custom select


    // Sidebar Resizer logic
    const resizer = document.getElementById('sidebar-resizer');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        resizer.classList.add('active');
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 600) newWidth = 600;
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            resizer.classList.remove('active');
            state.settings.sidebarWidth = document.documentElement.style.getPropertyValue('--sidebar-width');
            window.api.saveSettings(state.settings);
        }
    });

    // Restore sidebar width on init
    if (state.settings.sidebarWidth) {
        document.documentElement.style.setProperty('--sidebar-width', state.settings.sidebarWidth);
    }

    // Messaging
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Toggle thinking process
    if (toggleThinkingBtn) {
        toggleThinkingBtn.addEventListener('click', () => {
            state.settings.enableThinking = !state.settings.enableThinking;
            updateThinkingBtnState();
            window.api.saveSettings(state.settings);
            // Sync with settings modal if open
            const thinkingCheckbox = document.getElementById('enable-thinking');
            if (thinkingCheckbox) thinkingCheckbox.checked = state.settings.enableThinking;
        });
    }

    // Toggle web search
    if (toggleSearchBtn) {
        toggleSearchBtn.addEventListener('click', () => {
            state.settings.enableSearch = !state.settings.enableSearch;
            updateSearchBtnState();
            window.api.saveSettings(state.settings);
            // Sync with settings modal if open
            const searchCheckbox = document.getElementById('enable-search');
            if (searchCheckbox) searchCheckbox.checked = !!state.settings.enableSearch;
        });
    }

    // Stream IPC Listeners
    window.api.onStreamStart((data) => {
        state.isStreaming = true;
        sendBtn.disabled = true;
        const div = renderMessageItem('assistant', '');
        state.currentStreamDiv = div.querySelector('.message-content');
        scrollToBottom();
    });

    window.api.onStreamChunk((data) => {
        if (!state.currentStreamDiv) return;

        if (data.reasoning_content) {
            const currentReasoning = state.currentStreamDiv.dataset.reasoning || '';
            state.currentStreamDiv.dataset.reasoning = currentReasoning + data.reasoning_content;
        }
        if (data.content) {
            const currentRaw = state.currentStreamDiv.dataset.raw || '';
            state.currentStreamDiv.dataset.raw = currentRaw + data.content;
        }

        const rawContent = state.currentStreamDiv.dataset.raw || '';
        const rawReasoning = state.currentStreamDiv.dataset.reasoning || '';

        let finalHtml = '';
        if (rawReasoning && state.settings.enableThinking !== false) {
            const isStreamingComplete = !state.isStreaming;
            const parsedReasoningHtml = marked.parse(rawReasoning);
            finalHtml += `
                <details class="thinking-block" ${!isStreamingComplete ? 'open' : ''}>
                    <summary><i class="ph ph-brain"></i> 思考过程</summary>
                    <div class="thinking-content markdown-body">${DOMPurify.sanitize(parsedReasoningHtml)}</div>
                </details>
            `;
        }

        if (rawContent) {
            const parsedHtml = marked.parse(rawContent);
            finalHtml += `<div class="markdown-body">${DOMPurify.sanitize(parsedHtml)}</div>`;
        }

        const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
        if (scrollEl) {
            scrollEl.innerHTML = finalHtml || '<div class="markdown-body"></div>';

            // Syntax highlight + per-code-block copy button
            scrollEl.querySelectorAll('pre code').forEach((block) => {
                try { hljs.highlightElement(block); } catch (e) { }
            });
            if (typeof attachCodeBlockCopyButtons === 'function') {
                attachCodeBlockCopyButtons(scrollEl);
            }
        }
        scrollToBottom();
    });

    window.api.onStreamEnd((data) => {
        finalizeStream(data.chatId, data);
    });

    window.api.onStreamError((data) => {
        if (state.currentStreamDiv) {
            const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
            if (scrollEl) {
                scrollEl.innerHTML += `<br><span style="color:red"> [发生错误: ${data.error}]</span>`;
            }
        } else {
            renderMessageItem('system', `API 连接错误: ${data.error}`);
        }
        finalizeStream(data.chatId, {});
    });
}

function finalizeStream(chatId, meta) {
    state.isStreaming = false;
    sendBtn.disabled = false;
    messageInput.focus();

    // Save to state
    if (state.currentStreamDiv) {
        const finalContent = state.currentStreamDiv.dataset.raw || '';
        const finalReasoning = state.currentStreamDiv.dataset.reasoning || '';

        // After stream is done, close the reasoning details
        const detailsEl = state.currentStreamDiv.querySelector('details.thinking-block');
        if (detailsEl) detailsEl.removeAttribute('open');

        // Append message meta (word count, tokens, latency, model, time)
        const wordCount = (finalContent || '').trim().split(/\s+/).filter(Boolean).length;
        const parts = [];
        parts.push('word count: ' + wordCount);
        const tokens = meta.usage?.total_tokens ?? meta.usage?.completion_tokens ?? meta.usage?.output_tokens ?? '—';
        parts.push('tokens used: ' + tokens);
        parts.push(meta.firstTokenLatency != null ? 'first token latency: ' + meta.firstTokenLatency + 'ms' : null);
        parts.push('model: ' + (meta.model || '—'));
        parts.push('time: ' + (meta.time || '—'));
        const metaStr = parts.filter(Boolean).join(', ');
        const metaHtml = `<div class="message-meta">${metaStr}</div>`;

        // Insert meta under the horizontal scrollbar (outside .message-scroll)
        const existingMeta = state.currentStreamDiv.querySelector('.message-meta');
        if (existingMeta) existingMeta.remove();
        const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
        if (scrollEl) {
            scrollEl.insertAdjacentHTML('afterend', metaHtml);
        } else {
            state.currentStreamDiv.insertAdjacentHTML('beforeend', metaHtml);
        }

        const chat = state.chats.find(c => c.id === chatId);
        if (chat) {
            chat.messages.push({ role: 'assistant', content: finalContent, reasoning_content: finalReasoning });

            // Auto generate title for first message
            if (chat.messages.length === 2) {
                const titleSource = chat.messages[0].content;
                chat.title = titleSource.substring(0, 15) + (titleSource.length > 15 ? '...' : '');
                renderChatList();
            }
            saveChats();
        }
    }
    state.currentStreamDiv = null;
    scrollToBottom();
}