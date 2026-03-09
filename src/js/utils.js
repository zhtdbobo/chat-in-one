// utils.js - Utility functions

// Helper: Generate UUID
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

async function copyText(text, btn) {
    // Prefer the richer feedback version if available
    if (typeof copyToClipboard === 'function') {
        return copyToClipboard(text, btn);
    }
    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.classList.add('copied');
            const icon = btn.querySelector('i');
            const oldClass = icon ? icon.className : '';
            if (icon) icon.className = 'ph ph-check-circle';
            setTimeout(() => {
                btn.classList.remove('copied');
                if (icon) icon.className = oldClass;
            }, 1500);
        }
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

function attachCodeBlockCopyButtons(root) {
    if (!root) return;

    const pres = root.querySelectorAll('pre');
    pres.forEach((pre) => {
        // Avoid double-wrapping
        if (pre.parentElement && pre.parentElement.classList.contains('code-block')) return;

        const codeEl = pre.querySelector('code');
        const codeText = codeEl ? codeEl.innerText : pre.innerText;

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block';

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-btn';
        btn.title = '复制代码';
        btn.innerHTML = '<i class="ph ph-copy"></i>';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyText(codeText, btn);
        });
        wrapper.appendChild(btn);
    });
}