// utils.js - Utility functions

// Helper: Generate UUID (cryptographically secure)
function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const array = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    } else {
        for (let i = 0; i < 16; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
    }
    array[6] = (array[6] & 0x0f) | 0x40;
    array[8] = (array[8] & 0x3f) | 0x80;
    const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, 8) + '-' + hex.substring(8, 12) + '-' + hex.substring(12, 16) + '-' + hex.substring(16, 20) + '-' + hex.substring(20);
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