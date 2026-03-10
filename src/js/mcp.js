// mcp.js - MCP related functions

// -----------------------------------------
// MCP Settings Logics
// -----------------------------------------
let tempMCPServers = [];

// Re-add these to openSettings or call manually
function initMCPSettings() {
    tempMCPServers = JSON.parse(JSON.stringify(state.settings.mcpServers || []));
    renderMCPServers();
}

// Note: addMcpBtn event binding moved to setupEvents() in events.js to avoid duplicate bindings

function renderMCPServers() {
    const container = document.getElementById('mcp-servers-container');
    container.innerHTML = '';
    tempMCPServers.forEach((server, index) => {
        const item = document.createElement('div');
        item.className = 'mcp-server-item';
        // Mock status for now, ideally main process would return connectivity status
        const isConfigured = server.command && server.command.trim().length > 0;
        const statusClass = isConfigured ? 'status-online' : 'status-offline';
        const statusText = isConfigured ? '配置就绪' : '部分配置缺失';

        item.innerHTML = `
            <div class="mcp-server-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="mcp-status-dot ${statusClass}"></span>
                    <h4>服务器 #${index + 1}: ${server.name || '未命名'}</h4>
                </div>
                <div style="display:flex; gap:4px;">
                    <button type="button" class="btn btn-icon btn-ghost btn-sm del-mcp-btn" data-index="${index}">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            <div class="mcp-server-form">
                <div class="form-group">
                    <label>名称 (可选)</label>
                    <input type="text" class="mcp-name" value="${server.name || ''}" placeholder="例如: local-files">
                </div>
                <div class="mcp-server-row">
                    <div class="form-group" style="flex: 2;">
                        <label>执行命令 (Command)</label>
                        <input type="text" class="mcp-command" value="${server.command || ''}" placeholder="npx, python, etc.">
                    </div>
                    <div class="form-group" style="flex: 3;">
                        <label>参数 (Arguments, 逗号分隔)</label>
                        <input type="text" class="mcp-args" value="${server.args || ''}" placeholder="-y, @mcp/server-everything">
                    </div>
                </div>
            </div>
        `;
        item.querySelector('.del-mcp-btn').onclick = () => {
            tempMCPServers.splice(index, 1);
            renderMCPServers();
        };
        container.appendChild(item);
    });
}

// -----------------------------------------
// MCP Runtime Selection Logics
// -----------------------------------------
function renderMcpSelectionDropdown() {
    const list = document.getElementById('mcp-checkbox-list');
    const servers = state.settings.mcpServers || [];

    if (servers.length === 0) {
        list.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--text-muted);">尚未配置 MCP 服务器。请前往设置添加。</div>';
        return;
    }

    list.innerHTML = '';
    // Use an array in state to track which ones are enabled for the current session
    if (!state.enabledMcpServerIds) {
        state.enabledMcpServerIds = []; // Default ALL disabled as requested
    }

    servers.forEach(server => {
        const item = document.createElement('div');
        item.className = 'mcp-item';
        const isEnabled = state.enabledMcpServerIds.includes(server.id);
        const statusClass = server.command ? 'status-online' : 'status-offline';

        item.innerHTML = `
            <input type="checkbox" id="mcp-cb-${server.id}" ${isEnabled ? 'checked' : ''}>
            <label for="mcp-cb-${server.id}">${server.name || server.command || '未命名服务器'}</label>
            <span class="mcp-status-dot ${statusClass}"></span>
        `;

        item.querySelector('input').addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.checked) {
                if (!state.enabledMcpServerIds.includes(server.id)) {
                    state.enabledMcpServerIds.push(server.id);
                }
            } else {
                state.enabledMcpServerIds = state.enabledMcpServerIds.filter(id => id !== server.id);
            }
            updateMcpToolBtnState();
        });

        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                item.querySelector('input').click();
            }
        });

        list.appendChild(item);
    });
    updateMcpToolBtnState();
}

function updateMcpToolBtnState() {
    const btn = document.getElementById('mcp-dropdown-btn');
    if (!btn) return;
    const activeCount = state.enabledMcpServerIds ? state.enabledMcpServerIds.length : 0;
    if (activeCount > 0) {
        btn.classList.add('active');
        btn.title = `MCP工具开启中 (${activeCount})`;
    } else {
        btn.classList.remove('active');
        btn.title = "MCP 工具盒 (未开启)";
    }
}

function saveCurrentMCPServerData() {
    const items = document.querySelectorAll('.mcp-server-item');
    items.forEach((item, index) => {
        if (tempMCPServers[index]) {
            tempMCPServers[index].name = item.querySelector('.mcp-name').value.trim();
            tempMCPServers[index].command = item.querySelector('.mcp-command').value.trim();
            tempMCPServers[index].args = item.querySelector('.mcp-args').value.trim();
        }
    });
}