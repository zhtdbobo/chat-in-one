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
            });
        }
        

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
            maxMessageCountValue.textContent = value === 15 ? 'No Limit' : value;
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
            maxOutputTokensValue.textContent = maxOutputTokensSlider.value;
        });
    }

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
        const div = renderMessageItem('assistant', '');
        if (messagesList) {
            messagesList.appendChild(div);
        } else {
            messageContainer.appendChild(div);
        }
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
            chat.messages.push({ role: 'assistant', content: { content: finalContent, reasoning_content: finalReasoning } });

            // Auto generate title for first message
            if (chat.messages.length === 2) {
                let titleSource = chat.messages[0].content;
                // Handle message content as object
                if (typeof titleSource === 'object' && titleSource.content) {
                    titleSource = titleSource.content;
                }
                // If still not a string, use placeholder
                if (typeof titleSource !== 'string') {
                    titleSource = '附件消息';
                }
                chat.title = titleSource.substring(0, 15) + (titleSource.length > 15 ? '...' : '');
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
                maxMessageCountValue.textContent = value === 15 ? 'No Limit' : value;
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
                const value = activeChat.maxOutputTokens || 2000;
                maxOutputTokensSlider.value = value;
                maxOutputTokensValue.textContent = value;
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
        maxMessageCountValue.textContent = 'No Limit';
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
        maxOutputTokensSlider.value = 2000;
        maxOutputTokensValue.textContent = '2000';
    }
    
    const streamOutputToggle = document.getElementById('stream-output');
    if (streamOutputToggle) {
        streamOutputToggle.checked = true;
    }
}