// export.js - Import/Export functions

// -----------------------------------------
// Export Mode Logics
// -----------------------------------------
function enterExportMode() {
    state.isExportMode = true;
    document.getElementById('sidebar-actions-default').style.display = 'none';
    document.getElementById('sidebar-actions-export').style.display = 'flex';
    document.getElementById('chat-list').classList.add('export-mode');
    document.getElementById('select-all-chats').checked = false;
    updateSelectedCount();
    renderChatList();
}

function exitExportMode() {
    state.isExportMode = false;
    document.getElementById('sidebar-actions-default').style.display = 'flex';
    document.getElementById('sidebar-actions-export').style.display = 'none';
    document.getElementById('chat-list').classList.remove('export-mode');
    renderChatList();
}

function toggleSelectAll(e) {
    const checked = e.target.checked;
    document.querySelectorAll('.chat-item-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const selected = document.querySelectorAll('.chat-item-checkbox:checked').length;
    document.getElementById('selected-count').textContent = `${selected} 已选`;

    const total = document.querySelectorAll('.chat-item-checkbox').length;
    document.getElementById('select-all-chats').checked = total > 0 && selected === total;
}

function confirmExport() {
    const selectedIds = Array.from(document.querySelectorAll('.chat-item-checkbox:checked'))
        .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
        alert("请至少选择一个对话进行导出。");
        return;
    }

    const chatsToExport = state.chats.filter(c => selectedIds.includes(c.id));
    const dataStr = JSON.stringify(chatsToExport, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chats_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    exitExportMode();
}

// -----------------------------------------
// Import / Export Logics
// -----------------------------------------
function exportChats() {
    if (state.chats.length === 0) {
        alert("没有可导出的对话。");
        return;
    }
    const dataStr = JSON.stringify(state.chats, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_history_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importChats(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const importedChats = JSON.parse(event.target.result);
            if (!Array.isArray(importedChats)) {
                throw new Error("Invalid format");
            }

            // Merge or replace options. Here we simply prepend and avoid ID collision.
            const existingIds = new Set(state.chats.map(c => c.id));
            importedChats.forEach(chat => {
                if (!chat.id || !chat.messages) return;
                // Basic validation
                if (existingIds.has(chat.id)) {
                    chat.id = generateId(); // Assign a new ID to avoid conflict
                }
                state.chats.unshift(chat);
            });
            saveChats();
            renderChatList();
            if (state.chats.length > 0) switchChat(state.chats[0].id);
            alert("导入成功！");
        } catch (error) {
            alert("文件格式不正确，导入失败。");
            console.error(error);
        }
        // Reset file input
        e.target.value = '';
    };
    reader.readAsText(file);
}

function exportSingleChat(chatId) {
    if (!chatId) return;
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat || chat.messages.length === 0) {
        alert("当前对话为空，无法导出。");
        return;
    }
    const dataStr = JSON.stringify([chat], null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${chat.title}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showDeleteConfirm(chatItemEl, chatId) {
    // Remove any existing overlays first
    document.querySelectorAll('.delete-confirm-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'delete-confirm-overlay';
    overlay.innerHTML = `
        <button class="btn btn-danger btn-sm confirm-btn">确认删除</button>
        <button class="btn btn-ghost btn-sm cancel-btn">取消</button>
    `;

    overlay.querySelector('.confirm-btn').onclick = (e) => {
        e.stopPropagation();
        executeDeleteChat(chatId);
    };

    overlay.querySelector('.cancel-btn').onclick = (e) => {
        e.stopPropagation();
        overlay.remove();
    };

    chatItemEl.appendChild(overlay);

    // Click outside to cancel
    const onOutsideClick = (e) => {
        if (!overlay.contains(e.target)) {
            overlay.remove();
            document.removeEventListener('mousedown', onOutsideClick);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 0);
}

function executeDeleteChat(chatId) {
    state.chats = state.chats.filter(c => c.id !== chatId);
    saveChats();
    renderChatList();

    if (state.currentChatId === chatId) {
        if (state.chats.length > 0) {
            switchChat(state.chats[0].id);
        } else {
            createNewChat();
        }
    }
}