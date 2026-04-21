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
                    window.openSandbox(codeText);
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
            state.isComparisonMode = !state.isComparisonMode;
            updateComparisonToggleState();

            // If turning off, revert UI
            if (!state.isComparisonMode) {
                messageContainer.classList.remove('comparison-layout');
                const chat = state.chats.find(c => c.id === state.currentChatId);
                if (chat) switchChat(chat.id);
            } else {
                // If turning on and chat is empty, show empty comparison state
                const chat = state.chats.find(c => c.id === state.currentChatId);
                if (chat && chat.messages.length === 0 && state.selectedComparisonModels.length >= 2) {
                    messageContainer.classList.add('comparison-layout');
                    renderComparisonEmptyState();
                } else if (state.selectedComparisonModels.length < 2) {
                    openMultiModelModal();
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

    // Stop button
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            window.api.stopStream();
            if (state.currentStreamDiv) {
                const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
                if (scrollEl) {
                    scrollEl.innerHTML += '<br><span style="color:var(--text-muted)"> [已停止生成]</span>';
                }
            }
            finalizeStream(state.currentChatId, {});
        });
    }

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
            // Close other dropdowns
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
            const est = (typeof getCurrentContextUsageEstimate === 'function')
                ? getCurrentContextUsageEstimate({ includeDraftInput: true })
                : null;

            if (!est) {
                ctxTip.innerHTML = `<div class="muted">无法计算上下文占用（缺少预估器或未选择对话）</div>`;
                return;
            }

            // Keep tooltip simple by default; show details only near limit.
            const used = est.msgTokens ?? 0; // so a fresh chat starts at 0
            const usedPct = est.contextLimit ? Math.min(999, Math.round((used / est.contextLimit) * 100)) : 0;
            const totalPct = est.contextLimit ? Math.min(999, Math.round((est.estimatedTotal / est.contextLimit) * 100)) : 0;
            const cls = totalPct >= 98 ? 'bad' : (totalPct >= 85 ? 'warn' : '');

            const basic = `
                <div><strong>上下文占用</strong></div>
                <div class="${cls}">${usedPct}%（${used}/${est.contextLimit} tokens）</div>
                <div class="muted">点击压缩早期对话</div>
            `;

            if (totalPct < 85) {
                ctxTip.innerHTML = basic;
                return;
            }

            ctxTip.innerHTML = `
                ${basic}
                <div class="muted" style="margin-top:6px;">
                    细节：系统提示词 ${est.promptTokens ?? 0} · 预留输出 ${est.outputReserve} · 总计 ~ ${est.estimatedTotal}/${est.contextLimit}（${totalPct}%）
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

    // Slider event listeners for conversation settings
    const maxMessageCountSlider = document.getElementById('max-message-count');
    const maxMessageCountValue = document.getElementById('max-message-count-value');
    if (maxMessageCountSlider && maxMessageCountValue) {
        maxMessageCountSlider.addEventListener('input', () => {
            const value = parseInt(maxMessageCountSlider.value);
            maxMessageCountValue.textContent = value === 15 ? '无限制' : value;
        });
    }

    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', () => {
            temperatureValue.textContent = temperatureSlider.value;
        });
    }

    const topPSlider = document.getElementById('top-p');
    const topPValue = document.getElementById('top-p-value');
    if (topPSlider && topPValue) {
        topPSlider.addEventListener('input', () => {
            topPValue.textContent = topPSlider.value;
        });
    }

    const maxOutputTokensSlider = document.getElementById('max-output-tokens');
    const maxOutputTokensValue = document.getElementById('max-output-tokens-value');
    if (maxOutputTokensSlider && maxOutputTokensValue) {
        maxOutputTokensSlider.addEventListener('input', () => {
            const val = parseInt(maxOutputTokensSlider.value);
            maxOutputTokensValue.textContent = val >= 8100 ? '无限制' : val;
        });
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

    // Stream IPC Listeners
    window.api.onStreamStart((data) => {
        state.isStreaming = true;
        if (sendBtn) sendBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'flex';

        if (state.isComparisonMode && data.modelName) {
            // Find the model's column body using the modelId stored in data-model-id
            // The column's body id is built from the full modelId (providerId|modelName)
            const matchedModelId = state.selectedComparisonModels.find(id => id.endsWith('|' + data.modelName) || id === data.modelName);
            const safeId = (matchedModelId || data.modelName).replace(/[^a-zA-Z0-9]/g, '-');
            const colId = `comp-body-${safeId}`;
            const colBody = document.getElementById(colId);

            if (colBody) {
                colBody.innerHTML = '<div class="message-content" data-raw="" data-reasoning=""><div class="message-scroll"></div></div>';
                state.comparisonStreams[data.modelName] = colBody.querySelector('.message-content');

                // Update header status
                const col = colBody.closest('.comparison-column');
                if (col) {
                    const status = col.querySelector('.model-status');
                    if (status) {
                        status.textContent = '正在生成...';
                        status.classList.add('streaming');
                    }
                }
            } else {
                console.warn('[Comparison] Could not find column body:', colId, 'for model:', data.modelName);
            }
        } else {
            const div = renderMessageItem('assistant', '');
            if (messagesList) {
                messagesList.appendChild(div);
            } else {
                messageContainer.appendChild(div);
            }
            state.currentStreamDiv = div.querySelector('.message-content');
        }
        scrollToBottom();
    });

    window.api.onStreamChunk((data) => {
        const streamDiv = (state.isComparisonMode && data.modelName)
            ? state.comparisonStreams[data.modelName]
            : state.currentStreamDiv;

        if (!streamDiv) return;

        try {
            if (data.reasoning_content) {
                const currentReasoning = streamDiv.dataset.reasoning || '';
                streamDiv.dataset.reasoning = currentReasoning + data.reasoning_content;
            }
            if (data.content) {
                const currentRaw = streamDiv.dataset.raw || '';
                streamDiv.dataset.raw = currentRaw + data.content;
            }

            const rawContent = streamDiv.dataset.raw || '';
            const rawReasoning = streamDiv.dataset.reasoning || '';

            let finalHtml = '';
            if (rawReasoning && state.settings.enableThinking !== false) {
                const isStreamingComplete = !state.isStreaming;
                const parsedReasoningHtml = marked.parse(rawReasoning);
                finalHtml += `
                    <details class="thinking-block" ${!isStreamingComplete ? 'open' : ''}>
                        <summary><i class="ph ph-brain"></i> 思考过程</summary>
                        <div class="thinking-content markdown-body">${DOMPurify.sanitize(parsedReasoningHtml, { ADD_TAGS: ['button'] })}</div>
                    </details>
                `;
            }

            if (rawContent) {
                const parsedHtml = marked.parse(rawContent);
                finalHtml += `<div class="markdown-body">${DOMPurify.sanitize(parsedHtml, { ADD_TAGS: ['button'] })}</div>`;
            }

            const scrollEl = streamDiv.querySelector('.message-scroll');
            if (scrollEl) {
                scrollEl.innerHTML = finalHtml || '<div class="markdown-body"></div>';

                // Highlighting is now handled by custom marked renderer
            }
            scrollToBottom();
        } catch (e) {
            console.error('Error in onStreamChunk UI update:', e);
        }
    });

    window.api.onStreamEnd((data) => {
        if (state.isComparisonMode && data.modelName) {
            finalizeComparisonColumn(data.chatId, data.modelName, data);
        } else {
            finalizeStream(data.chatId, data);
        }
    });

    window.api.onStreamError((data) => {
        if (state.isComparisonMode && data.modelName) {
            // Show error in the specific model column
            const streamDiv = state.comparisonStreams[data.modelName];
            if (streamDiv) {
                const scrollEl = streamDiv.querySelector('.message-scroll');
                if (scrollEl) {
                    scrollEl.innerHTML = `<div class="markdown-body"><span style="color:var(--color-error, #ef4444)">❌ 发生错误: ${data.error}</span></div>`;
                }
            }
            finalizeComparisonColumn(data.chatId, data.modelName, {});
        } else {
            if (state.currentStreamDiv) {
                const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
                if (scrollEl) {
                    scrollEl.innerHTML += `<br><span style="color:red"> [发生错误: ${data.error}]</span>`;
                }
            } else {
                renderMessageItem('system', `API 连接错误: ${data.error}`);
            }
            finalizeStream(data.chatId, {});
        }
    });
}

/**
 * Finalize a single comparison column when its stream ends.
 * Replaces finalizeStream for comparison mode.
 */
function finalizeComparisonColumn(chatId, modelName, meta) {
    const streamDiv = state.comparisonStreams[modelName];
    if (!streamDiv) return;

    // Final render
    const rawContent = streamDiv.dataset.raw || '';
    const rawReasoning = streamDiv.dataset.reasoning || '';
    const scrollEl = streamDiv.querySelector('.message-scroll');

    if (scrollEl) {
        let finalHtml = '';
        if (rawReasoning && state.settings.enableThinking !== false) {
            finalHtml += `
                <details class="thinking-block">
                    <summary><i class="ph ph-brain"></i> 思考过程</summary>
                    <div class="thinking-content markdown-body">${DOMPurify.sanitize(marked.parse(rawReasoning), { ADD_TAGS: ['button'] })}</div>
                </details>
            `;
        }
        if (rawContent) {
            finalHtml += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(rawContent), { ADD_TAGS: ['button'] })}</div>`;
        }
        scrollEl.innerHTML = finalHtml || '<div class="markdown-body"></div>';
    }

    // Meta info
    const textRawForCount = typeof rawContent === 'string' ? rawContent : String(rawContent || '');
    const zhCount = (textRawForCount.match(/[\u4e00-\u9fa5]/g) || []).length;
    const enCount = textRawForCount.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    const wordCount = zhCount + enCount;
    const tokens = meta.usage?.total_tokens ?? meta.usage?.completion_tokens ?? meta.usage?.output_tokens ?? '—';

    // 获取服务商名称
    const chat = state.chats.find(c => c.id === chatId);
    let providerNameLabel = '';
    if (chat && chat.model && chat.model.includes('|')) {
        const pId = chat.model.split('|')[0];
        const provider = state.settings.providers.find(p => p.id === pId);
        if (provider) providerNameLabel = provider.name;
    }

    const latencyS = meta.firstTokenLatency != null ? (meta.firstTokenLatency / 1000).toFixed(1) + 's' : '';

    const parts = [];
    if (providerNameLabel) {
        parts.push(`${providerNameLabel} (${meta.model || modelName})`);
    } else {
        parts.push(meta.model || modelName);
    }
    parts.push(`${tokens} tokens`);
    parts.push(`${wordCount} words`);
    if (latencyS) parts.push(latencyS);
    if (meta.time) parts.push(meta.time);

    const metaStr = parts.join(' · ');

    const existingMeta = streamDiv.querySelector('.message-meta');
    if (existingMeta) existingMeta.remove();
    if (scrollEl) {
        scrollEl.insertAdjacentHTML('afterend', `<div class="message-meta">${metaStr}</div>`);
    }


    // Update column header status  
    const col = streamDiv.closest('.comparison-column');
    if (col) {
        const status = col.querySelector('.model-status');
        if (status) {
            status.textContent = '✓ 完成';
            status.classList.remove('streaming');
        }
    }

    // Save to chat state
    if (chat) {

        chat.messages.push({
            role: 'assistant',
            content: { content: rawContent, reasoning_content: rawReasoning },
            model: meta.model || modelName,
            comparisonModelName: modelName,
            usage: meta.usage,
            firstTokenLatency: meta.firstTokenLatency,
            time: meta.time
        });
        saveChats();
    }

    // Remove from active streams map
    delete state.comparisonStreams[modelName];

    // Check if all comparison streams are done
    if (Object.keys(state.comparisonStreams).length === 0) {
        state.isStreaming = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = 'flex'; }
        if (stopBtn) stopBtn.style.display = 'none';
        messageInput.focus();

        // Auto-generate title
        if (chat && chat.title === '新对话') {
            chat.title = generateTitleFromContent(chat.messages[0]?.content);
            renderChatList();
            saveChats();
        }
    }
    scrollToBottom();
}

function finalizeStream(chatId, meta) {
    state.isStreaming = false;
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.display = 'flex';
    }
    if (stopBtn) stopBtn.style.display = 'none';
    messageInput.focus();

    // Save to state
    if (state.currentStreamDiv) {
        const finalContent = state.currentStreamDiv.dataset.raw || '';
        const finalReasoning = state.currentStreamDiv.dataset.reasoning || '';

        // After stream is done, close the reasoning details
        const detailsEl = state.currentStreamDiv.querySelector('details.thinking-block');
        if (detailsEl) detailsEl.removeAttribute('open');

        const rawContent = state.currentStreamDiv.dataset.raw || '';
        const rawReasoning = state.currentStreamDiv.dataset.reasoning || '';
        const scrollEl = state.currentStreamDiv.querySelector('.message-scroll');
        if (scrollEl) {
            let finalHtml = '';
            if (rawReasoning && state.settings.enableThinking !== false) {
                finalHtml += `
                    <details class="thinking-block">
                        <summary><i class="ph ph-brain"></i> 思考过程</summary>
                        <div class="thinking-content markdown-body">${DOMPurify.sanitize(marked.parse(rawReasoning), { ADD_TAGS: ['button'] })}</div>
                    </details>
                `;
            }
            if (rawContent) {
                finalHtml += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(rawContent), { ADD_TAGS: ['button'] })}</div>`;
            }
            scrollEl.innerHTML = finalHtml || '<div class="markdown-body"></div>';
        }

        // Append message meta
        const textRawForCount = typeof finalContent === 'string' ? finalContent : String(finalContent || '');
        const zhCount = (textRawForCount.match(/[\u4e00-\u9fa5]/g) || []).length;
        const enCount = textRawForCount.replace(/[\u4e00-\u9fa5]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
        const wordCount = zhCount + enCount;
        const tokens = meta.usage?.total_tokens ?? meta.usage?.completion_tokens ?? meta.usage?.output_tokens ?? '—';
        const latencyS = meta.firstTokenLatency != null ? (meta.firstTokenLatency / 1000).toFixed(1) + 's' : '';

        // 获取服务商名称
        const chat = state.chats.find(c => c.id === chatId);
        let providerNameLabel = '';
        if (chat && chat.model && chat.model.includes('|')) {
            const pId = chat.model.split('|')[0];
            const provider = state.settings.providers.find(p => p.id === pId);
            if (provider) providerNameLabel = provider.name;
        }

        const parts = [];
        if (providerNameLabel) {
            parts.push(`${providerNameLabel} (${meta.model || '—'})`);
        } else {
            parts.push(meta.model || '—');
        }
        parts.push(`${tokens} tokens`);
        parts.push(`${wordCount} words`);
        if (latencyS) parts.push(latencyS);
        if (meta.time) parts.push(meta.time);

        const metaStr = parts.join(' · ');

        const metaHtml = `<div class="message-meta">${metaStr}</div>`;

        const existingMeta = state.currentStreamDiv.querySelector('.message-meta');
        if (existingMeta) existingMeta.remove();

        if (scrollEl) {
            scrollEl.insertAdjacentHTML('afterend', metaHtml);
        } else {
            state.currentStreamDiv.insertAdjacentHTML('beforeend', metaHtml);
        }

        if (chat) {

            chat.messages.push({ role: 'assistant', content: { content: finalContent, reasoning_content: finalReasoning }, model: meta.model, usage: meta.usage, firstTokenLatency: meta.firstTokenLatency, time: meta.time });

            // Auto generate title for first message
            if (chat.messages.length === 2 && chat.title === '新对话') {
                chat.title = generateTitleFromContent(chat.messages[0].content);
                renderChatList();
            }
            saveChats();
        }
    }

    state.currentStreamDiv = null;
    scrollToBottom();
}

// Conversation Settings Functions
function openConversationSettings() {
    if (conversationSettingsModal) {
        // Get current chat
        const activeChat = state.chats.find(c => c.id === state.currentChatId);
        if (activeChat) {
            // Set conversation name
            const nameInput = document.getElementById('conversation-name');
            if (nameInput) {
                nameInput.value = activeChat.title || 'Untitled';
            }

            // Set system prompt
            const promptInput = document.getElementById('conversation-prompt');
            if (promptInput) {
                promptInput.value = activeChat.systemPrompt || state.settings.systemPrompt || 'You are a helpful assistant.';
            }

            // Set max message count
            const maxMessageCountSlider = document.getElementById('max-message-count');
            const maxMessageCountValue = document.getElementById('max-message-count-value');
            if (maxMessageCountSlider && maxMessageCountValue) {
                const value = activeChat.maxMessageCount || 15;
                maxMessageCountSlider.value = value;
                maxMessageCountValue.textContent = value === 15 ? '无限制' : value;
            }

            // Set temperature
            const temperatureSlider = document.getElementById('temperature');
            const temperatureValue = document.getElementById('temperature-value');
            if (temperatureSlider && temperatureValue) {
                const value = activeChat.temperature || 0.7;
                temperatureSlider.value = value;
                temperatureValue.textContent = value;
            }

            // Set top P
            const topPSlider = document.getElementById('top-p');
            const topPValue = document.getElementById('top-p-value');
            if (topPSlider && topPValue) {
                const value = activeChat.topP || 1;
                topPSlider.value = value;
                topPValue.textContent = value;
            }

            // Set max output tokens
            const maxOutputTokensSlider = document.getElementById('max-output-tokens');
            const maxOutputTokensValue = document.getElementById('max-output-tokens-value');
            if (maxOutputTokensSlider && maxOutputTokensValue) {
                // If 0, null, or 8100, treat as infinite (8100)
                const value = (activeChat.maxOutputTokens === 0 || !activeChat.maxOutputTokens || activeChat.maxOutputTokens >= 8100) ? 8100 : activeChat.maxOutputTokens;
                maxOutputTokensSlider.value = value;
                maxOutputTokensValue.textContent = value >= 8100 ? '无限制' : value;
            }

            // Set stream output
            const streamOutputToggle = document.getElementById('stream-output');
            if (streamOutputToggle) {
                streamOutputToggle.checked = activeChat.streamOutput !== false;
            }
        }

        conversationSettingsModal.style.display = 'flex';
    }
}

function closeConversationSettings() {
    if (conversationSettingsModal) {
        conversationSettingsModal.style.display = 'none';
    }
}

function saveConversationSettings() {
    if (!state.currentChatId) return;

    const activeChat = state.chats.find(c => c.id === state.currentChatId);
    if (activeChat) {
        // Save conversation name
        const nameInput = document.getElementById('conversation-name');
        if (nameInput) {
            activeChat.title = nameInput.value.trim() || 'Untitled';
        }

        // Save system prompt
        const promptInput = document.getElementById('conversation-prompt');
        if (promptInput) {
            activeChat.systemPrompt = promptInput.value.trim();
        }

        // Save max message count
        const maxMessageCountSlider = document.getElementById('max-message-count');
        if (maxMessageCountSlider) {
            activeChat.maxMessageCount = parseInt(maxMessageCountSlider.value);
        }

        // Save temperature
        const temperatureSlider = document.getElementById('temperature');
        if (temperatureSlider) {
            activeChat.temperature = parseFloat(temperatureSlider.value);
        }

        // Save top P
        const topPSlider = document.getElementById('top-p');
        if (topPSlider) {
            activeChat.topP = parseFloat(topPSlider.value);
        }

        // Save max output tokens
        const maxOutputTokensSlider = document.getElementById('max-output-tokens');
        if (maxOutputTokensSlider) {
            activeChat.maxOutputTokens = parseInt(maxOutputTokensSlider.value);
        }

        // Save stream output
        const streamOutputToggle = document.getElementById('stream-output');
        if (streamOutputToggle) {
            activeChat.streamOutput = streamOutputToggle.checked;
        }

        // Save changes
        saveChats();
        renderChatList();

        // Update current chat title
        if (currentChatTitle) {
            currentChatTitle.textContent = activeChat.title;
        }

        closeConversationSettings();
        showNotification('对话设置已保存', 'success');
    }
}

function resetModelSettings() {
    // Reset sliders to default values
    const maxMessageCountSlider = document.getElementById('max-message-count');
    const maxMessageCountValue = document.getElementById('max-message-count-value');
    if (maxMessageCountSlider && maxMessageCountValue) {
        maxMessageCountSlider.value = 15;
        maxMessageCountValue.textContent = '无限制';
    }

    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    if (temperatureSlider && temperatureValue) {
        temperatureSlider.value = 0.7;
        temperatureValue.textContent = '0.7';
    }

    const topPSlider = document.getElementById('top-p');
    const topPValue = document.getElementById('top-p-value');
    if (topPSlider && topPValue) {
        topPSlider.value = 1;
        topPValue.textContent = '1.0';
    }

    const maxOutputTokensSlider = document.getElementById('max-output-tokens');
    const maxOutputTokensValue = document.getElementById('max-output-tokens-value');
    if (maxOutputTokensSlider && maxOutputTokensValue) {
        maxOutputTokensSlider.value = 8100;
        maxOutputTokensValue.textContent = '无限制';
    }

    const streamOutputToggle = document.getElementById('stream-output');
    if (streamOutputToggle) {
        streamOutputToggle.checked = true;
    }
}
