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

/**
 * Generate a title from message content
 * @param {string|object} content - Message content
 * @param {number} maxLength - Maximum title length (default: 15)
 * @returns {string} Generated title
 */
function generateTitleFromContent(content, maxLength = 15) {
    let titleSource = content;

    // Handle message content as object
    if (typeof titleSource === 'object' && titleSource.content) {
        titleSource = titleSource.content;
    }

    // If still not a string, use placeholder
    if (typeof titleSource !== 'string') {
        // Check if there are attachments
        if (content && typeof content === 'object' && content.attachments && content.attachments.length > 0) {
            titleSource = '附件消息';
        } else {
            titleSource = '无标题';
        }
    }

    let titleText = '';
    if (titleSource.length > maxLength) {
        // Count characters for better truncation, especially for Chinese
        let charCount = 0;
        for (let i = 0; i < titleSource.length; i++) {
            const char = titleSource.charAt(i);
            // Check if it's a Chinese character or other full-width char
            const isFullWidth = /[\u4e00-\u9fa5]/.test(char);
            charCount += isFullWidth ? 1 : 0.5; // Full-width chars count as 1, half-width as 0.5

            if (charCount >= maxLength) {
                titleText = titleSource.substring(0, i) + '...';
                break;
            }
        }
        if (!titleText) titleText = titleSource.substring(0, maxLength * 2) + '...';
    } else {
        titleText = titleSource;
    }

    // Remove markdown formatting and extra whitespace
    titleText = titleText.replace(/[#*`\[\]]/g, '').trim();
    if (!titleText) titleText = '无标题';

    return titleText;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}


// -----------------------------------------
// Context length / token estimation helpers
// -----------------------------------------

function getModelContextWindowTokens(modelName) {
    const id = String(modelName || '').toLowerCase();
    if (!id) return 8192;

    // Prefer explicit "###k" patterns in model name
    const kMatch = id.match(/(?:^|[^0-9])(\d{1,3})k(?:[^0-9]|$)/i);
    if (kMatch) {
        const k = parseInt(kMatch[1], 10);
        if (Number.isFinite(k) && k > 0) return k * 1000;
    }

    // Common context hints
    if (id.includes('128k')) return 128000;
    if (id.includes('200k')) return 200000;
    if (id.includes('32k')) return 32000;
    if (id.includes('16k')) return 16000;
    if (id.includes('8k')) return 8000;
    if (id.includes('4k')) return 4000;

    // Reasonable modern default
    return 8192;
}

function estimateTokensFromText(text) {
    const s = String(text ?? '');
    if (!s) return 0;

    // Heuristic:
    // - CJK chars ~ 1 token / char
    // - Non-CJK ~ 1 token / 4 chars
    // This is only for warning UI; providers differ.
    const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    const nonCjkChars = Math.max(0, s.length - cjk);
    return Math.ceil(cjk * 1.0 + nonCjkChars / 4);
}

function estimateTokensFromMessageContent(content) {
    if (content == null) return 0;

    // Neutral content array (text + image blocks)
    if (Array.isArray(content)) {
        let sum = 0;
        for (const item of content) {
            if (!item) continue;
            const t = String(item.type || '').toLowerCase();
            if (t === 'text') {
                sum += estimateTokensFromText(item.text || '');
            } else if (t === 'image' || t === 'image_url') {
                // Images are not tokenized like text, but they do consume context budget.
                // Use a conservative fixed cost so we can warn early.
                sum += 1000;
            } else {
                sum += estimateTokensFromText(JSON.stringify(item));
            }
        }
        return sum;
    }

    if (typeof content === 'string') return estimateTokensFromText(content);

    if (typeof content === 'object') {
        // Our internal payload: { content, attachments, reasoning_content }
        let sum = 0;
        if (content.content != null) sum += estimateTokensFromText(content.content);
        if (content.reasoning_content != null) sum += estimateTokensFromText(content.reasoning_content);
        if (Array.isArray(content.attachments)) {
            // Attachments may be images (already checked via model capabilities). Count conservatively.
            const imgCount = content.attachments.filter(a => String(a?.type || '').startsWith('image/')).length;
            sum += imgCount * 1000;
        }
        // If the object has more fields, include a small overhead
        const keys = Object.keys(content);
        if (keys.length > 3) sum += Math.min(200, keys.length * 10);
        return sum;
    }

    return estimateTokensFromText(String(content));
}

function estimateTokensFromMessages(messages) {
    if (!Array.isArray(messages)) return 0;
    let sum = 0;
    for (const msg of messages) {
        if (!msg) continue;
        // Role overhead (very small, but keeps estimate a bit safer)
        sum += 4;
        sum += estimateTokensFromMessageContent(msg.content);
    }
    return sum;
}

function estimateConversationTokens({ systemPrompt, messages, maxOutputTokens, modelName, contextLimitTokens }) {
    const contextLimit = (contextLimitTokens && Number.isFinite(contextLimitTokens) && contextLimitTokens > 0)
        ? contextLimitTokens
        : getModelContextWindowTokens(modelName);
    const promptTokens = estimateTokensFromText(systemPrompt || '');
    const msgTokens = estimateTokensFromMessages(messages || []);

    // If user sets "无限制" (0), the provider will still cap it; reserve a decent default
    const outputReserve = (maxOutputTokens && maxOutputTokens > 0) ? maxOutputTokens : 2048;

    const estimatedInput = promptTokens + msgTokens;
    const estimatedTotal = estimatedInput + outputReserve;

    return {
        contextLimit,
        promptTokens,
        msgTokens,
        estimatedInput,
        estimatedTotal,
        outputReserve
    };
}