// sandbox.js - Handles the Frontend UI Rendering Sandbox

let currentSandboxContent = '';
let isResizingSandbox = false;

// Lazy DOM refs
let _els = null;
function els() {
    if (!_els) {
        _els = {
            area: document.getElementById('sandbox-area'),
            resizer: document.getElementById('sandbox-resizer'),
            iframe: document.getElementById('sandbox-iframe'),
            closeBtn: document.getElementById('sandbox-close-btn'),
            refreshBtn: document.getElementById('sandbox-refresh-btn'),
            consolePanel: document.getElementById('sandbox-console'),
            consoleOutput: document.getElementById('sandbox-console-output'),
            consoleToggle: document.getElementById('sandbox-console-toggle'),
            consoleClear: document.getElementById('sandbox-console-clear'),
            titleSpan: document.querySelector('.sandbox-title'),
        };
    }
    return _els;
}

// -----------------------------------------
// Console output
// -----------------------------------------
function addConsoleEntry(level, message) {
    const out = document.getElementById('sandbox-console-output');
    if (!out) return;
    const entry = document.createElement('div');
    entry.className = 'console-entry console-' + level;
    entry.textContent = message;
    out.appendChild(entry);
    out.scrollTop = out.scrollHeight;
}

// -----------------------------------------
// Content type detection
// -----------------------------------------
function detectType(raw) {
    const low = raw.toLowerCase();
    if (low.includes('<!doctype') || low.includes('<html')) return 'full-html';

    const hasHtmlTags = /<[a-z][\s\S]*?>/i.test(raw);
    if (hasHtmlTags) return 'html-fragment';

    // CSS: selector blocks or at-rules
    if (/[.#@\w]\s*\{[\s\S]*\}/i.test(raw) || /@(media|keyframes|import|font-face|supports|layer)/i.test(raw)) return 'css';

    // JS: common keywords / expressions
    if (/(console\.|let |const |var |function |=>|import |export |class |new Promise)/.test(raw)) return 'js';

    return 'text';
}

// Build full HTML document for srcdoc
function buildDoc(content, type) {
    if (type === 'full-html') return content;

    const proxy = `<script>
window.console = new Proxy(console, {
    get(t, p) {
        if (['log','warn','error','info'].includes(p)) {
            return (...a) => { try { window.parent.postMessage({type:'sandbox-console',level:p,args:a.map(String)},'*'); }catch(e){} t[p](...a); };
        }
        return t[p];
    }
});
window.onerror = (m,s,l) => { try { window.parent.postMessage({type:'sandbox-error',message:String(m),lineno:l},'*'); }catch(e){} };
window.addEventListener('unhandledrejection', e => { try { window.parent.postMessage({type:'sandbox-error',message:'Unhandled Promise: '+String(e.reason),lineno:0},'*'); }catch(e){} });
<\/script>`;

    const baseStyle = `body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;background:#fff;color:#222;box-sizing:border-box;}
*{box-sizing:border-box;}
@media(prefers-color-scheme:dark){body{background:#1a1a2e;color:#e0e0e0;}}`;

    if (type === 'css') {
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + content + '</style></head><body><div style="padding:16px;color:#888;font-size:13px;font-family:sans-serif;">CSS 预览 — 样式已应用到此页面</div></body></html>';
    }

    if (type === 'js') {
        // Escape </script> inside user code to prevent premature closing
        const safe = content.replace(/<\/script>/gi, '<\\/script>');
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + baseStyle + '</style>' + proxy + '</head><body>' + proxy + '<script>' + safe + '<\/script></body></html>';
    }

    if (type === 'text') {
        const safe = content.replace(/<\/script>/gi, '<\\/script>');
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + baseStyle + '</style>' + proxy + '</head><body>' + proxy + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;"><code>' + safe.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</code></pre></body></html>';
    }

    // html-fragment
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + baseStyle + '</style>' + proxy + '</head><body>' + proxy + content + '</body></html>';
}

// -----------------------------------------
// Public API
// -----------------------------------------
window.openSandbox = function (htmlContent) {
    const e = els();
    if (!e.area || !e.resizer || !e.iframe) {
        if (typeof showNotification === 'function') showNotification('Sandbox 未初始化', 'error');
        return;
    }

    currentSandboxContent = htmlContent;
    const raw = String(htmlContent || '');

    // Clear console
    if (e.consoleOutput) e.consoleOutput.innerHTML = '';
    // Expand console panel
    if (e.consolePanel) e.consolePanel.classList.remove('collapsed');
    if (e.consoleToggle) e.consoleToggle.textContent = '控制台';

    // Show
    e.area.style.display = 'flex';
    e.resizer.style.display = 'block';

    // Detect & build
    const type = detectType(raw);
    const doc = buildDoc(raw, type);

    // Update type badge
    const label = { 'full-html': 'HTML', 'html-fragment': 'HTML', css: 'CSS', js: 'JS', text: '文本' }[type] || '代码';
    if (e.titleSpan) {
        let badge = e.titleSpan.querySelector('.sandbox-type-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'sandbox-type-badge';
            e.titleSpan.appendChild(badge);
        }
        badge.textContent = label;
    }

    e.iframe.srcdoc = doc;

    // Guard: if panel is too small, notify
    requestAnimationFrame(() => {
        const r = e.area.getBoundingClientRect();
        if (r.width < 80 || r.height < 80) {
            if (typeof showNotification === 'function') showNotification('Sandbox 面板宽度不足，请拖拽调整', 'info', 3000);
        }
    });
};

window.closeSandbox = function () {
    const e = els();
    if (e.area) e.area.style.display = 'none';
    if (e.resizer) e.resizer.style.display = 'none';
    if (e.iframe) e.iframe.srcdoc = '';
    if (e.consoleOutput) e.consoleOutput.innerHTML = '';
    currentSandboxContent = '';
};

// -----------------------------------------
// Init
// -----------------------------------------
function initSandbox() {
    const e = els();

    // Resizer
    if (e.resizer) {
        e.resizer.addEventListener('mousedown', () => {
            isResizingSandbox = true;
            document.body.style.cursor = 'col-resize';
            e.resizer.classList.add('active');
            if (e.iframe) e.iframe.style.pointerEvents = 'none';
        });
        document.addEventListener('mousemove', (ev) => {
            if (!isResizingSandbox) return;
            const w = window.innerWidth - ev.clientX;
            if (w > 300 && w < window.innerWidth * 0.8) {
                e.area.style.width = w + 'px';
            }
        });
        document.addEventListener('mouseup', () => {
            if (isResizingSandbox) {
                isResizingSandbox = false;
                document.body.style.cursor = '';
                e.resizer.classList.remove('active');
                if (e.iframe) e.iframe.style.pointerEvents = 'all';
            }
        });
    }

    if (e.closeBtn) e.closeBtn.addEventListener('click', window.closeSandbox);
    if (e.refreshBtn) {
        e.refreshBtn.addEventListener('click', () => {
            if (currentSandboxContent) window.openSandbox(currentSandboxContent);
        });
    }

    // Console toggle (expand/collapse)
    if (e.consoleToggle && e.consolePanel) {
        e.consoleToggle.addEventListener('click', () => {
            const collapsed = e.consolePanel.classList.toggle('collapsed');
            e.consoleToggle.textContent = collapsed ? '展开' : '控制台';
        });
    }

    // Console clear
    if (e.consoleClear && e.consoleOutput) {
        e.consoleClear.addEventListener('click', () => { e.consoleOutput.innerHTML = ''; });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSandbox);
} else {
    initSandbox();
}

// Listen for sandbox iframe messages
window.addEventListener('message', (event) => {
    const iframe = document.getElementById('sandbox-iframe');
    if (!iframe || event.source !== iframe.contentWindow) return;

    const d = event.data || {};
    if (d.type === 'sandbox-console') {
        addConsoleEntry(d.level, d.args.join(' '));
    } else if (d.type === 'sandbox-error') {
        addConsoleEntry('error', '第 ' + d.lineno + ' 行: ' + d.message);
    }
});
