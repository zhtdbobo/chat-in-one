// sandbox.js - Handles the Frontend UI Rendering Sandbox

const sandboxArea = document.getElementById('sandbox-area');
const sandboxResizer = document.getElementById('sandbox-resizer');
const sandboxIframe = document.getElementById('sandbox-iframe');
const sandboxCloseBtn = document.getElementById('sandbox-close-btn');
const sandboxRefreshBtn = document.getElementById('sandbox-refresh-btn');

let currentSandboxContent = '';
let isResizingSandbox = false;

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
        } else {
            alert('Sandbox 未初始化（DOM 元素未找到），请重启应用后再试。');
        }
        return;
    }
    
    currentSandboxContent = htmlContent;
    sandboxArea.style.display = 'flex';
    sandboxResizer.style.display = 'block';
    
    // Create the final HTML structure to inject
    // We inject a basic script to relay console logs back to the main window
    const injectedHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: white; color: #333; }
                /* Reset defaults that might look weird in a container */
                * { box-sizing: border-box; }
            </style>
            <script>
                // Proxy console methods to parent
                window.console = new Proxy(console, {
                    get(target, prop) {
                        if (['log', 'warn', 'error', 'info'].includes(prop)) {
                            return (...args) => {
                                try {
                                    window.parent.postMessage({ type: 'sandbox-console', level: prop, args: args.map(a => String(a)) }, '*');
                                } catch (e) {
                                    // Ignore postMessage errors in sandbox
                                }
                                target[prop](...args);
                            };
                        }
                        return target[prop];
                    }
                });
                
                window.onerror = function(message, source, lineno, colno, error) {
                    try {
                        window.parent.postMessage({ type: 'sandbox-error', message, lineno }, '*');
                    } catch (e) {
                        // Ignore postMessage errors in sandbox
                    }
                };
            <\/script>
        </head>
        <body>
            ${htmlContent}
        </body>
        </html>
    `;

    sandboxIframe.srcdoc = injectedHtml;
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
    
    currentSandboxContent = '';
};

// Initialize resizer
if (sandboxResizer) {
    sandboxResizer.addEventListener('mousedown', (e) => {
        isResizingSandbox = true;
        document.body.style.cursor = 'col-resize';
        sandboxResizer.classList.add('active');
        sandboxIframe.style.pointerEvents = 'none'; // Prevent iframe from capturing mouse events during resize
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingSandbox) return;
        // Calculate the new width based on window width and mouse X position
        // The sandbox is on the right, so width is (window.innerWidth - e.clientX)
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
            sandboxArea.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingSandbox) {
            isResizingSandbox = false;
            document.body.style.cursor = '';
            sandboxResizer.classList.remove('active');
            sandboxIframe.style.pointerEvents = 'all'; // Re-enable pointer events
        }
    });
}

// Close Sandbox
if (sandboxCloseBtn) {
    sandboxCloseBtn.addEventListener('click', window.closeSandbox);
}

// Refresh Sandbox
if (sandboxRefreshBtn) {
    sandboxRefreshBtn.addEventListener('click', () => {
        if (currentSandboxContent) {
            window.openSandbox(currentSandboxContent);
        }
    });
}

// Listen for messages from the Sandbox (iframe)
window.addEventListener('message', (event) => {
    try {
        // Only accept messages from our sandbox iframe if it exists
        if (!sandboxIframe || event.source !== sandboxIframe.contentWindow) return;
        
        if (event.data && event.data.type === 'sandbox-console') {
            console.log(`[Sandbox ${event.data.level.toUpperCase()}]:`, ...event.data.args);
        } else if (event.data && event.data.type === 'sandbox-error') {
            console.error(`[Sandbox ERROR Line ${event.data.lineno}]:`, event.data.message);
        }
    } catch (e) {
        // Ignore message handling errors
    }
});
