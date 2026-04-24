// sandbox.js - Handles the Frontend UI Rendering Sandbox

// Lazy-loaded DOM elements (may not exist when script loads)
let sandboxArea = null;
let sandboxResizer = null;
let sandboxIframe = null;
let sandboxCloseBtn = null;
let sandboxRefreshBtn = null;

function getSandboxElements() {
    if (!sandboxArea) {
        sandboxArea = document.getElementById('sandbox-area');
        sandboxResizer = document.getElementById('sandbox-resizer');
        sandboxIframe = document.getElementById('sandbox-iframe');
        sandboxCloseBtn = document.getElementById('sandbox-close-btn');
        sandboxRefreshBtn = document.getElementById('sandbox-refresh-btn');
    }
    return { sandboxArea, sandboxResizer, sandboxIframe, sandboxCloseBtn, sandboxRefreshBtn };
}

let currentSandboxContent = '';
let isResizingSandbox = false;
let sandboxFallbackOverlay = null;
let sandboxFallbackIframe = null;

function ensureSandboxFallback() {
    if (sandboxFallbackOverlay && sandboxFallbackIframe) {
        return { overlay: sandboxFallbackOverlay, iframe: sandboxFallbackIframe };
    }

    const overlay = document.createElement('div');
    overlay.id = 'sandbox-fallback-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 48px;
        right: 16px;
        width: min(900px, calc(100vw - 32px));
        height: calc(100vh - 64px);
        background: var(--bg-surface, #111827);
        border: 1px solid var(--border-subtle, #334155);
        border-radius: 12px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.35);
        z-index: 10050;
        display: none;
        overflow: hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
        border-bottom: 1px solid var(--border-subtle, #334155);
        background: var(--bg-surface-elevated, #0f172a);
        color: var(--text-primary, #e2e8f0);
        font-size: 13px;
    `;
    header.innerHTML = `
        <span>Sandbox 预览（兜底窗口）</span>
        <button type="button" id="sandbox-fallback-close" style="border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;">×</button>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:calc(100% - 44px);border:none;background:#fff;';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('csp', "script-src 'unsafe-inline'");

    overlay.appendChild(header);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    const closeBtn = header.querySelector('#sandbox-fallback-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            iframe.srcdoc = '';
        });
    }

    sandboxFallbackOverlay = overlay;
    sandboxFallbackIframe = iframe;
    return { overlay, iframe };
}

function showSandboxFallback(html) {
    const { overlay, iframe } = ensureSandboxFallback();
    iframe.srcdoc = html || '';
    overlay.style.display = 'block';
}

/**
 * Open the sandbox with specific HTML content
 * @param {string} htmlContent The HTML code to render inside the iframe
 */
window.openSandbox = function(htmlContent) {
    // Re-check DOM elements in case they weren't available at script load time
    const sandboxArea = document.getElementById('sandbox-area');
    const sandboxResizer = document.getElementById('sandbox-resizer');
    const sandboxIframe = document.getElementById('sandbox-iframe');
    
    if (!sandboxArea || !sandboxResizer || !sandboxIframe) {
        console.error('Sandbox DOM elements not found, cannot open preview.');
        if (typeof showNotification === 'function') {
            showNotification('❌ Sandbox 未初始化（DOM 元素未找到），请重启应用后再试。', 'error', 4500);
        }
        return;
    }
    
    currentSandboxContent = htmlContent;
    
    // Forced Visibility: Show sandbox area
    sandboxArea.style.display = 'flex';
    
    sandboxResizer.style.display = 'block';
    
    const raw = String(htmlContent || '');
    const low = raw.toLowerCase();
    const looksLikeFullDocument = low.includes('<!doctype') || low.includes('<html');

    // If it's already a full HTML document, render directly via srcdoc.
    // Re-wrapping a full document can cause blank rendering in some cases.
    if (looksLikeFullDocument) {
        sandboxIframe.srcdoc = raw;
        requestAnimationFrame(() => {
            const rect = sandboxArea.getBoundingClientRect();
            const hidden = sandboxArea.style.display === 'none';
            if (hidden || rect.width < 80 || rect.height < 80) {
                showSandboxFallback(raw);
            }
        });
        return;
    }

    // Snippet mode: detection
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(raw);
    const looksLikeJs = !hasHtmlTags && (raw.includes('console.') || raw.includes('let ') || raw.includes('const ') || raw.includes('var ') || raw.includes('function ') || raw.includes('=>'));
    const contentToInject = (looksLikeJs || (!hasHtmlTags && raw.trim().length > 0)) 
        ? `<script>${raw}<\/script>` 
        : raw;

    // Fragment mode: wrap user snippet in a minimal document shell.
    // Use a placeholder to avoid JS template literal interpolation of the user content
    const injectedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: white; color: #333; }
                * { box-sizing: border-box; }
            </style>
            <script>
                window.console = new Proxy(console, {
                    get(target, prop) {
                        if (['log', 'warn', 'error', 'info'].includes(prop)) {
                            return (...args) => {
                                try {
                                    window.parent.postMessage({ type: 'sandbox-console', level: prop, args: args.map(a => String(a)) }, '*');
                                } catch (e) {}
                                target[prop](...args);
                            };
                        }
                        return target[prop];
                    }
                });
                window.onerror = function(message, source, lineno, colno, error) {
                    try {
                        window.parent.postMessage({ type: 'sandbox-error', message, lineno }, '*');
                    } catch (e) {}
                };
            <\/script>
        </head>
        <body>
            __SANDBOX_CONTENT__
        </body>
        </html>
    `.replace('__SANDBOX_CONTENT__', contentToInject);

    sandboxIframe.srcdoc = injectedHtml;
    requestAnimationFrame(() => {
        const rect = sandboxArea.getBoundingClientRect();
        const hidden = sandboxArea.style.display === 'none';
        if (hidden || rect.width < 80 || rect.height < 80) {
            showSandboxFallback(injectedHtml);
        }
    });
};

/**
 * Close the sandbox panel
 */
window.closeSandbox = function() {
    // Re-check DOM elements in case they weren't available at script load time
    const sandboxArea = document.getElementById('sandbox-area');
    const sandboxResizer = document.getElementById('sandbox-resizer');
    const sandboxIframe = document.getElementById('sandbox-iframe');
    
    if (sandboxArea) sandboxArea.style.display = 'none';
    if (sandboxResizer) sandboxResizer.style.display = 'none';
    if (sandboxIframe) sandboxIframe.srcdoc = ''; // Clear memory
    if (sandboxFallbackOverlay && sandboxFallbackIframe) {
        sandboxFallbackOverlay.style.display = 'none';
        sandboxFallbackIframe.srcdoc = '';
    }
    
    currentSandboxContent = '';
};

// Initialize sandbox elements and event listeners (run after DOM is ready)
function initSandbox() {
    const { sandboxArea: sa, sandboxResizer: sr, sandboxIframe: si, sandboxCloseBtn: scb, sandboxRefreshBtn: srb } = getSandboxElements();
    
    // Initialize resizer
    if (sr) {
        sr.addEventListener('mousedown', (e) => {
            isResizingSandbox = true;
            document.body.style.cursor = 'col-resize';
            sr.classList.add('active');
            si.style.pointerEvents = 'none'; // Prevent iframe from capturing mouse events during resize
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizingSandbox) return;
            // Calculate the new width based on window width and mouse X position
            // The sandbox is on the right, so width is (window.innerWidth - e.clientX)
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
                sa.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizingSandbox) {
                isResizingSandbox = false;
                document.body.style.cursor = '';
                sr.classList.remove('active');
                si.style.pointerEvents = 'all'; // Re-enable pointer events
            }
        });
    }

    // Close Sandbox
    if (scb) {
        scb.addEventListener('click', window.closeSandbox);
    }

    // Refresh Sandbox
    if (srb) {
        srb.addEventListener('click', () => {
            if (currentSandboxContent) {
                window.openSandbox(currentSandboxContent);
            }
        });
    }
}

// Run initialization after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSandbox);
} else {
    initSandbox();
}

// Listen for messages from the Sandbox (iframe)
window.addEventListener('message', (event) => {
    try {
        // Only accept messages from our sandbox iframe if it exists
        const { sandboxIframe: si } = getSandboxElements();
        if (!si || event.source !== si.contentWindow) return;
        
        if (event.data && event.data.type === 'sandbox-console') {
            console.log(`[Sandbox ${event.data.level.toUpperCase()}]:`, ...event.data.args);
        } else if (event.data && event.data.type === 'sandbox-error') {
            console.error(`[Sandbox ERROR Line ${event.data.lineno}]:`, event.data.message);
        }
    } catch (e) {
        // Ignore message handling errors
    }
});
