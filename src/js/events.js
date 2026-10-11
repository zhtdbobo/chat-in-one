// events.js - Event bindings

// -----------------------------------------
// Events
// -----------------------------------------
function setupEvents() {
    function decodeBase64Utf8(b64) {
        try {
            const bin = atob(b64);
            // Convert binary string -> Uint8Array -> UTF-8 string
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            if (typeof TextDecoder !== 'undefined') {
                return new TextDecoder('utf-8').decode(bytes);
            }
            // Fallback: best-effort
            return decodeURIComponent(escape(bin));
        } catch (e) {
            return '';
        }
    }

    function getCodeElementFromActionButton(actionBtn) {
        if (!actionBtn) return null;
        // Preferred structure:
        // .code-block
        //   .code-actions (button lives here)
        //   pre > code
        // But sanitize steps may strip class names. Fallback to nearby structural lookup.
        return (
            actionBtn.closest('.code-block')?.querySelector('code') ||
            actionBtn.closest('.code-actions')?.nextElementSibling?.querySelector?.('code') ||
            actionBtn.parentElement?.nextElementSibling?.querySelector?.('code') ||
            actionBtn.closest('pre')?.querySelector('code') ||
            actionBtn.closest('.message-content')?.querySelector('pre code')
        );
    }

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

    // Companions modal interactions
    companionsBtn.addEventListener('click', openCompanionsManager);
    if (closeCompanionsBtn) closeCompanionsBtn.addEventListener('click', closeCompanionsManager);

    // Add companion button - re-query to ensure element is found
    const addCompanionBtnEl = document.getElementById('add-companion-btn');
    if (addCompanionBtnEl) {
        addCompanionBtnEl.addEventListener('click', addCompanion);
    }

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

        const addDropdown = document.getElementById('add-dropdown');
        if (addDropdown) addDropdown.classList.remove('show');

        document.querySelectorAll('.select-dropdown.show').forEach(d => d.classList.remove('show'));
    });

    document.getElementById('import-chats-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', importChats);
    
    // Model Provider Import / Export
    const exportProvBtn = document.getElementById('export-providers-btn');
    if (exportProvBtn) exportProvBtn.addEventListener('click', exportProviders);

    const importProvBtn = document.getElementById('import-providers-btn');
    if (importProvBtn) {
        importProvBtn.addEventListener('click', () => {
            document.getElementById('import-providers-input').click();
        });
    }
    const importProvInput = document.getElementById('import-providers-input');
    if (importProvInput) importProvInput.addEventListener('change', importProviders);

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

    // Delegation for Dynamically Created Buttons in Code Blocks
    if (messageContainer) {
        messageContainer.addEventListener('click', (e) => {
            if (e.__chatInOneCodeActionHandled) return;

            // Handle Preview button
            const previewBtn = e.target.closest('.code-preview-btn');
            if (previewBtn) {
                e.__chatInOneCodeActionHandled = true;
                const codeEl = getCodeElementFromActionButton(previewBtn);
                if (!codeEl) return;
                const codeText = codeEl?.dataset?.rawB64 ? decodeBase64Utf8(codeEl.dataset.rawB64) : (codeEl?.innerText || '');
                if (typeof window.openSandbox === 'function') {
                    const language = Array.from(codeEl.classList).find(name => name !== 'hljs') || '';
                    window.openSandbox(codeText, language);
                }
                return;
            }

            // Handle Copy button
            const copyBtn = e.target.closest('.code-copy-btn');
            if (copyBtn) {
                e.__chatInOneCodeActionHandled = true;
                const codeEl = getCodeElementFromActionButton(copyBtn);
                if (!codeEl) return;
                const codeText = codeEl?.dataset?.rawB64 ? decodeBase64Utf8(codeEl.dataset.rawB64) : (codeEl?.innerText || '');
                if (typeof copyText === 'function') {
                    copyText(codeText, copyBtn);
                }
                return;
            }
        });
    }

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

    // Textarea auto-resize
    messageInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });


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

    // Comparison Mode Toggle
    if (comparisonToggleBtn) {
        comparisonToggleBtn.addEventListener('click', () => {
            if (isChatBusy()) return;
            state.isComparisonMode = !state.isComparisonMode;
            
            // Update the state of the specific chat
            const chat = state.chats.find(c => c.id === state.currentChatId);
            if (chat) {
                chat.isComparisonMode = state.isComparisonMode;
                if (state.isComparisonMode) {
                    chat.comparisonModels = [...state.selectedComparisonModels];
                }
                saveChats();
            }

            updateComparisonToggleState();

            // If turning off, create a new chat
            if (!state.isComparisonMode) {
                messageContainer.classList.remove('comparison-layout');
                if (typeof createNewChat === 'function') {
                    createNewChat();
                }
            // If turning on
            } else {
                if (state.selectedComparisonModels.length < 2) {
                    openMultiModelModal();
                } else {
                    // 已有模型，直接开启。逻辑收拢到 confirm 函数中执行以保证原子性
                    if (typeof confirmMultiModelSelection === 'function') {
                        confirmMultiModelSelection();
                    }
                }
            }
        });
    }

    if (multiModelSelectBtn) {
        multiModelSelectBtn.addEventListener('click', openMultiModelModal);
    }

    if (closeMultiModelBtn) closeMultiModelBtn.addEventListener('click', closeMultiModelModal);
    if (cancelMultiModelBtn) cancelMultiModelBtn.addEventListener('click', closeMultiModelModal);
    if (confirmMultiModelBtn) confirmMultiModelBtn.addEventListener('click', confirmMultiModelSelection);

    // Stop both pending and streaming requests.
    if (stopBtn) stopBtn.addEventListener('click', stopChatRequests);

    // Conversation settings button
    if (conversationSettingsBtn) {
        conversationSettingsBtn.addEventListener('click', openConversationSettings);
    }

    // Add button dropdown
    const addBtn = document.getElementById('add-btn');
    const addDropdown = document.getElementById('add-dropdown');
    if (addBtn && addDropdown) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addDropdown.classList.toggle('show');
            document.getElementById('mcp-selection-dropdown').classList.remove('show');
        });

        // Add dropdown items click handlers
        const addDropdownItems = addDropdown.querySelectorAll('.add-dropdown-item');
        addDropdownItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                addDropdown.classList.remove('show');
                const action = item.textContent.trim();
                if (action.includes('图片')) {
                    // Add image functionality
                    document.getElementById('image-upload-input').click();
                } else if (action.includes('文件')) {
                    // Add file functionality
                    document.getElementById('file-upload-input').click();
                }
            });
        });

        // Attachments preview functionality
        const attachmentsPreview = document.getElementById('attachments-preview');
        const attachmentsList = document.getElementById('attachments-list');

        function addAttachment(file, isImage = false) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const previewUrl = event.target.result;

                // Create attachment item
                const attachmentItem = createAttachmentItem();

                if (isImage) {
                    // Image preview
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    img.style.cssText = `
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    `;
                    attachmentItem.appendChild(img);
                } else {
                    // File preview
                    const fileIcon = document.createElement('i');
                    fileIcon.className = 'ph ph-file';
                    fileIcon.style.cssText = `
                        font-size: 20px;
                        color: var(--text-muted);
                    `;
                    attachmentItem.appendChild(fileIcon);
                }

                // Add file data to attachment item
                attachmentItem.dataset.fileName = file.name;
                attachmentItem.dataset.fileType = file.type;
                attachmentItem.dataset.fileSize = file.size;
                attachmentItem.dataset.fileData = previewUrl; // Base64 data

                // Add delete button
                addDeleteButton(attachmentItem);

                // Add to attachments list
                attachmentsList.appendChild(attachmentItem);
                attachmentsPreview.style.display = 'block';

                // Don't add file name to message input, just show preview
                // messageInput.value remains unchanged, user can still type text
                messageInput.dispatchEvent(new Event('input'));
                messageInput.focus();
            };
            // Only read as data URL for preview, not for message input
            reader.readAsDataURL(file);
        }

        function createAttachmentItem() {
            const attachmentItem = document.createElement('div');
            attachmentItem.style.cssText = `
                position: relative;
                width: 48px;
                height: 48px;
                border-radius: var(--radius-sm);
                overflow: hidden;
                border: 1px solid var(--border-subtle);
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--bg-surface-elevated);
            `;
            return attachmentItem;
        }

        function addDeleteButton(attachmentItem) {
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
            deleteBtn.style.cssText = `
                position: absolute;
                top: 2px;
                right: 2px;
                width: 16px;
                height: 16px;
                border: none;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                font-size: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.2s;
                z-index: 10;
            `;
            // Show delete button when hovering over the entire attachment item
            attachmentItem.addEventListener('mouseenter', () => {
                deleteBtn.style.opacity = '1';
            });
            // Hide delete button when mouse leaves the attachment item
            attachmentItem.addEventListener('mouseleave', () => {
                deleteBtn.style.opacity = '0';
            });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                attachmentItem.remove();
                if (attachmentsList.children.length === 0) {
                    attachmentsPreview.style.display = 'none';
                }
            });
            attachmentItem.appendChild(deleteBtn);
        }

        // Image upload handler
        const imageUploadInput = document.getElementById('image-upload-input');
        if (imageUploadInput) {
            imageUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    addAttachment(file, true);
                }
                // 重置input，使得下一次选择同样的文件仍然能触发change事件
                e.target.value = '';
            });
        }

        // File upload handler
        const fileUploadInput = document.getElementById('file-upload-input');
        if (fileUploadInput) {
            fileUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    addAttachment(file, false);
                }
                // 重置input，使得下一次选择同样的文件仍然能触发change事件
                e.target.value = '';
            });
        }


    }

    // Context usage tooltip + compression button
    const ctxBtn = document.getElementById('context-compress-btn');
    const ctxTip = document.getElementById('context-usage-tooltip');
    if (ctxBtn && ctxTip) {
        let rafId = null;

        const renderTip = () => {
            const currentChat = state.chats.find(c => c.id === state.currentChatId);
            const modelInfo = (typeof getCurrentChatProviderAndModel === 'function') 
                ? getCurrentChatProviderAndModel(currentChat) 
                : { modelName: 'Unknown' };

            const est = (typeof getCurrentContextUsageEstimate === 'function')
                ? getCurrentContextUsageEstimate({ includeDraftInput: true })
                : null;

            if (!est) {
                ctxTip.innerHTML = `<div class="muted">无法计算上下文占用（缺少预估器或未选择对话）</div>`;
                return;
            }

            // Keep tooltip simple by default; show details only near limit.
            const used = est.msgTokens ?? 0; // so a fresh chat starts at 0
            
            // Calculate percentage with one decimal place for better precision
            const calcPct = (val, limit) => limit ? (val / limit * 100).toFixed(limit > 100000 ? 2 : 1) : "0";
            const usedPct = calcPct(used, est.contextLimit);
            const totalPct = calcPct(est.estimatedTotal, est.contextLimit);
            const totalPctNum = parseFloat(totalPct);
            const cls = totalPctNum >= 98 ? 'bad' : (totalPctNum >= 85 ? 'warn' : '');

            const usedStr = used.toLocaleString();
            const limitStr = est.contextLimit.toLocaleString();

            const basic = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>上下文占用</strong>
                    <span style="font-size:10px; opacity:0.7;">${escapeHtml(modelInfo.modelName)}</span>
                </div>
                <div class="${cls}" style="font-size: 13px; margin: 4px 0;">${usedPct}%（${usedStr}/${limitStr} tokens）</div>
                <div class="muted">点击压缩早期对话</div>
            `;

            if (totalPctNum < 85) {
                ctxTip.innerHTML = basic;
                return;
            }

            const promptTokensStr = (est.promptTokens ?? 0).toLocaleString();
            const outputReserveStr = est.outputReserve.toLocaleString();
            const estimatedTotalStr = est.estimatedTotal.toLocaleString();

            ctxTip.innerHTML = `
                ${basic}
                <div class="muted" style="margin-top:6px; font-size:11px; border-top:1px solid var(--border-subtle); padding-top:6px;">
                    细节：系统词 ${promptTokensStr} · 预留 ${outputReserveStr} · 总计 ~ ${estimatedTotalStr}/${limitStr}（${totalPct}%）
                </div>
            `;
        };

        const show = () => {
            renderTip();
            ctxTip.style.display = 'block';
            const loop = () => {
                renderTip();
                rafId = requestAnimationFrame(loop);
            };
            rafId = requestAnimationFrame(loop);
        };

        const hide = () => {
            ctxTip.style.display = 'none';
            if (rafId) cancelAnimationFrame(rafId);
            rafId = null;
        };

        ctxBtn.addEventListener('mouseenter', show);
        ctxBtn.addEventListener('mouseleave', hide);
        ctxBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            hide();
            if (typeof compressCurrentChatContext === 'function') {
                await compressCurrentChatContext();
            }
        });
    }

    // Conversation settings modal interactions
    if (closeConversationSettingsBtn) {
        closeConversationSettingsBtn.addEventListener('click', closeConversationSettings);
    }
    if (cancelConversationSettingsBtn) {
        cancelConversationSettingsBtn.addEventListener('click', closeConversationSettings);
    }
    if (saveConversationSettingsBtn) {
        saveConversationSettingsBtn.addEventListener('click', saveConversationSettings);
    }

    // Global event delegation for code block copy buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.code-copy-btn');
        if (btn) {
            const codeEl = btn.parentElement.querySelector('pre code') || btn.parentElement.querySelector('pre');
            if (codeEl) {
                const text = codeEl.innerText;
                if (typeof copyText === 'function') {
                    copyText(text, btn);
                }
            }
        }
    });

    // Reset model settings button
    const resetModelSettingsBtn = document.getElementById('reset-model-settings-btn');
    if (resetModelSettingsBtn) {
        resetModelSettingsBtn.addEventListener('click', resetModelSettings);
    }

    // MCP Add Server Button (moved from mcp.js to avoid duplicate bindings)
    const addMcpBtn = document.getElementById('add-mcp-server-btn');
    if (addMcpBtn) {
        addMcpBtn.addEventListener('click', () => {
            if (typeof tempMCPServers !== 'undefined') {
                tempMCPServers.push({ id: generateId(), name: '', command: '', args: '', env: '' });
                if (typeof renderMCPServers === 'function') renderMCPServers();
            }
        });
    }

    // Events are routed by request identity, including errors before HTTP headers arrive.
    window.api.onStreamStart(handleStreamStart);
    window.api.onStreamChunk(handleStreamChunk);
    window.api.onStreamEnd(finishChatRequest);
    window.api.onStreamError(finishChatRequest);
}

// Conversation settings: form values are overrides; server defaults are hints only.
let conversationSettingsRevision = 0;
let conversationSettingsChatId = null;
const conversationMetadataRequests = new Map();
const conversationNumberFields = [
    { id: 'temperature', key: 'temperature', chatKey: 'temperature', label: '温度' },
    { id: 'top-p', key: 'top_p', chatKey: 'topP', label: 'Top P' }
];

function getConversationSettingsTargets(chat) {
    const ids = chat.isComparisonMode && chat.comparisonModels?.length >= 2 ? chat.comparisonModels : [chat.model];
    return ids.map(id => {
        const [providerId, modelName] = String(id || '').split('|');
        const provider = (state.settings.providers || []).find(item => item.id === providerId);
        return provider && modelName ? { provider, modelName,
            info: getModelParameterInfo(getConversationModelMetadata(provider, modelName)) } : null;
    }).filter(Boolean);
}

function updateConversationParameterHints(chat) {
    const targets = getConversationSettingsTargets(chat);
    document.querySelector('.model-override-hint').textContent = targets.length > 1
        ? '对比模式的温度与 Top P 同时用于所选模型；留空时各模型使用各自的服务端默认。发送全部历史，输出长度由各服务端决定。'
        : '温度与 Top P 按模型分别保存；留空使用服务端默认。发送全部历史，输出长度由服务端决定。';
    document.getElementById('thinking-setting').style.display = targets.some(target => target.modelName.toLowerCase() === 'kimi-k2.6') ? '' : 'none';
    for (const field of conversationNumberFields) {
        const input = document.getElementById(field.id);
        const hint = document.getElementById(field.id + '-hint');
        const limits = targets.map(target => target.info.parameters[field.key]);
        const unsupported = limits.some(limit => limit.supported === false);
        const fixed = limits.length > 0 && limits.every(limit => limit.fixed);
        input.disabled = unsupported || fixed;
        if (input.disabled) input.value = '';
        const minValues = limits.map(limit => limit.min).filter(value => value !== undefined);
        const maxValues = limits.map(limit => limit.max).filter(value => value !== undefined);
        input.min = String(minValues.length ? Math.max(...minValues) : 0);
        if (maxValues.length) input.max = String(Math.min(...maxValues));
        else input.removeAttribute('max');
        const defaults = limits.map(limit => limit.defaultValue);
        const sameDefault = defaults.length > 0 && defaults.every(value => value !== undefined && value === defaults[0]);
        input.placeholder = unsupported ? '当前模型不支持' : fixed && sameDefault ? '服务端固定：' + defaults[0]
            : sameDefault ? '服务端默认：' + defaults[0] + '（留空）' : '服务端默认（留空）';
        let message = unsupported ? '所选模型不支持此参数，使用服务端行为。'
            : sameDefault ? '服务端' + (fixed ? '固定值' : '默认值') + '：' + defaults[0] + '。'
            : limits.some(limit => limit.defaultValue !== undefined)
                ? targets.map(target => target.provider.name + ' / ' + target.modelName + '：' + (target.info.parameters[field.key].defaultValue ?? '默认值未提供')).join('；')
                : '服务端默认值未提供；留空由服务端决定。';
        if (maxValues.length && !fixed) message += ' 可设置上限：' + Math.min(...maxValues) + '。';
        hint.textContent = message;
    }
}

function refreshOpenConversationModelSettings(chat) {
    if (conversationSettingsChatId !== chat.id || conversationSettingsModal.style.display === 'none') return;
    const values = getConversationNumericOverrides(chat);
    for (const field of conversationNumberFields) {
        document.getElementById(field.id).value = values[field.key] ?? '';
    }
    updateConversationParameterHints(chat);
    const revision = ++conversationSettingsRevision;
    void refreshConversationParameterMetadata(chat, revision);
}

async function refreshConversationParameterMetadata(chat, revision) {
    const providers = [...new Map(getConversationSettingsTargets(chat).map(target => [JSON.stringify([target.provider.id, target.provider.endpoint]), { ...target.provider }])).values()];
    const status = document.getElementById('model-parameter-status');
    if (!providers.length || providers.some(provider => !provider.endpoint || !provider.apiKey)) {
        status.textContent = '配置服务商后可自动读取默认参数；数值留空时使用服务端默认。';
        return;
    }
    status.textContent = '正在读取服务端模型参数…';
    const results = await Promise.all(providers.map(provider => {
        const key = JSON.stringify([provider.id, provider.endpoint]);
        if (!conversationMetadataRequests.has(key)) {
            const request = Promise.resolve().then(() => window.api.fetchProviderModels({
                providerId: provider.id, endpoint: provider.endpoint, apiKey: provider.apiKey
            })).then(result => {
                if (result?.ok && Array.isArray(result.models)) rememberProviderModelMetadata(provider, result.models);
                return result;
            }).catch(() => ({ ok: false })).finally(() => conversationMetadataRequests.delete(key));
            conversationMetadataRequests.set(key, request);
        }
        return conversationMetadataRequests.get(key);
    }));
    // A late response must not alter another chat's form or overwrite typed values.
    if (revision !== conversationSettingsRevision || state.currentChatId !== chat.id || conversationSettingsModal.style.display === 'none') return;
    updateConversationParameterHints(chat);
    status.textContent = results.every(result => result?.ok)
        ? '已读取模型信息。默认值和参数范围以服务端公开的信息为准；留空使用服务端默认。'
        : '服务端模型信息读取失败，显示已缓存的信息；留空仍使用服务端默认。';
}

function openConversationSettings() {
    const chat = state.chats.find(item => item.id === state.currentChatId);
    if (!chat || !conversationSettingsModal) return;
    conversationSettingsChatId = chat.id;
    const revision = ++conversationSettingsRevision;
    document.getElementById('conversation-name').value = chat.title || '未命名';
    document.getElementById('conversation-prompt').value = chat.systemPrompt ?? state.settings.systemPrompt ?? 'You are a helpful assistant.';
    const values = getConversationNumericOverrides(chat);
    for (const field of conversationNumberFields) {
        const input = document.getElementById(field.id);
        input.value = values[field.key] ?? '';
    }
    const thinking = document.getElementById('conversation-enable-thinking');
    thinking.checked = chat.enableThinking ?? (state.settings.enableThinking !== false);
    document.getElementById('thinking-setting').style.display = getConversationSettingsTargets(chat)
        .some(target => target.modelName.toLowerCase() === 'kimi-k2.6') ? '' : 'none';
    updateConversationParameterHints(chat);
    conversationSettingsModal.style.display = 'flex';
    void refreshConversationParameterMetadata(chat, revision);
}

function closeConversationSettings() {
    conversationSettingsRevision++;
    conversationSettingsChatId = null;
    if (conversationSettingsModal) conversationSettingsModal.style.display = 'none';
}

function saveConversationSettings() {
    const chat = state.chats.find(item => item.id === state.currentChatId);
    if (!chat || chat.id !== conversationSettingsChatId) return;
    const values = {};
    try {
        for (const field of conversationNumberFields) {
            const input = document.getElementById(field.id);
            if (input.disabled) continue;
            if (!input.checkValidity()) { input.reportValidity(); throw new Error('请检查' + field.label + '的输入范围。'); }
            if (input.value.trim()) {
                const value = parameterNumber(input.value);
                if (value === undefined) throw new Error(field.label + '必须是有效数字。');
                values[field.key] = value;
            }
        }
        const targets = getConversationSettingsTargets(chat);
        if (targets.length) targets.forEach(target => validateModelParameterOverrides(values, target.info));
        else validateModelParameterOverrides(values);
    } catch (error) {
        showNotification(error.message, 'error');
        return;
    }
    // Validate the whole form before mutating or saving any chat settings.
    chat.title = document.getElementById('conversation-name').value.trim() || '未命名';
    chat.systemPrompt = document.getElementById('conversation-prompt').value.trim();
    for (const field of conversationNumberFields) {
        if (values[field.key] === undefined) delete chat[field.chatKey];
        else chat[field.chatKey] = values[field.key];
    }
    chat.modelSettingsVersion = 2;
    delete chat.maxMessageCount;
    delete chat.maxOutputTokens;
    rememberConversationModelOverrides(chat);
    delete chat.streamOutput;
    if (document.getElementById('thinking-setting').style.display !== 'none') {
        chat.enableThinking = document.getElementById('conversation-enable-thinking').checked;
    }
    saveChats();
    renderChatList();
    currentChatTitle.textContent = chat.title;
    closeConversationSettings();
    showNotification('对话设置已保存', 'success');
}

function resetModelSettings() {
    for (const field of conversationNumberFields) document.getElementById(field.id).value = '';
    document.getElementById('conversation-enable-thinking').checked = state.settings.enableThinking !== false;
}
