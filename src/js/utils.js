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
    if (!id) return 131072;

    // 1. Prefer explicit "###k" patterns in model name (e.g. gpt-4-32k, moonshot-v1-128k)
    const kMatch = id.match(/(?:^|[^0-9])(\d{1,3})k(?:[^0-9]|$)/i);
    if (kMatch) {
        const k = parseInt(kMatch[1], 10);
        if (Number.isFinite(k) && k > 0) return k * 1000;
    }

    // 2. Exact "1m" or "1m+" suffix pattern (e.g. gpt-4.1, gemini-2.5-pro-001)
    if (/\b1m(?!\d)/.test(id)) return 1000000;

    // 3. Claude Series (Anthropic) — all Claude 3+ models support 200K
    if (/claude-(3|4|5)/.test(id)) return 200000;
    if (id.includes('claude-2') || id.includes('claude-instant')) return 100000;

    // 4. Gemini Series (Google)
    //    Gemini 3 series (2026)
    if (id.includes('gemini-3') || id.includes('gemini-2.5')) return 1048576;
    if (id.includes('gemini-1.5-pro')) return 2097152;
    if (id.includes('gemini-1.5-flash')) return 1048576;
    //    Gemini 2.0 (DB may use gemini-2.x or gemini-2.0.x)
    if (id.includes('gemini-2.0-pro') || id.includes('gemini-2-pro') || id.includes('gemini-2-ultra')) return 2097152;
    if (id.includes('gemini-2.')) return 1048576;    // all other gemini-2.x variants
    if (id.includes('gemini-2-flash')) return 1048576;
    if (id.includes('gemini-pro') || id.includes('gemini-1.0-pro') || id.includes('gemini-ultra')) return 32768;
    if (id.includes('gemini-vision')) return 32768;

    // 5. GPT Series (OpenAI) — order matters: check specific before generic
    //    GPT-5 series (2025): 128K
    if (id.includes('gpt-5') || id.includes('gpt_5')) return 128000;
    //    GPT-4.1 series: 1M context
    if (id.includes('gpt-4.1') || id.includes('gpt-4_1')) return 1000000;
    //    GPT-4 Vision is based on Turbo (128K), not base GPT-4 (8K)
    if (id.includes('gpt-4-vision') || id.includes('gpt-4-turbo')) return 128000;
    if (id.includes('gpt-4o')) return 128000;
    if (id.includes('gpt-4-32k')) return 32768;
    if (id.includes('gpt-4')) return 8192;
    if (id.includes('gpt-3.5-turbo-16k')) return 16385;
    if (id.includes('gpt-3.5')) return 4096;  // covers gpt-3.5-turbo and gpt-3.5

    // 6. O Series (OpenAI reasoning) — o1/o3/o4 all support 200K
    if (/\bo[1-9]/.test(id)) {
        if (id.includes('mini') || id.includes('preview')) return 128000;
        return 200000;
    }

    // 7. DeepSeek Series
    if (id.includes('deepseek-v3')) return 1000000;
    if (id.includes('deepseek-r1')) return 128000;
    if (id.includes('deepseek-chat') || id.includes('deepseek-coder')) return 128000;
    if (id.includes('deepseek-vl2')) return 131072; // VL2: 128K
    if (id.includes('deepseek-vl')) return 4096;    // original VL: 4K
    if (id.includes('deepseek-math')) return 4096;

    // 8. Qwen Series (Aliyun)
    //    Qwen 3.5+ series (2025-2026): 128K
    if (/qwen[-.]?3\.5/.test(id)) return 131072;
    if (/\bqwen[-.]?3\b/.test(id) || /\bqwen3\b/.test(id)) return 131072;
    if (/qwq/.test(id)) return 131072;
    //    Qwen 2.5: 128K for all size variants
    if (id.includes('qwen2.5')) return 131072;
    //    Qwen VL/vision variants must come before generic qwen2- rule
    if (id.includes('qwen-vl') || id.includes('qwen2-vl') || id.includes('qwen2.5-vl')) return 131072;
    //    Qwen 2 base: 32K
    if (id.includes('qwen2-')) return 32768;
    if (id.includes('qwen') && (id.includes('plus') || id.includes('max') || id.includes('long-context'))) return 131072;
    if (id.includes('qwen-turbo')) return 32768;

    // 9. Kimi / Moonshot Series
    if (id.includes('kimi-k')) return 128000;
    if (id.includes('moonshot')) return 128000;

    // 10. Grok Series (xAI)
    if (id.includes('grok-4') || id.includes('grok-3')) return 131072;
    if (id.includes('grok-2')) return 131072;

    // 11. Llama Series (Meta) — 3.1+ is 128K, 3.0 is 8K, 2 is 4K
    if (/llama[-.]?3\.(1|2)/.test(id)) return 131072;   // Llama 3.1 / 3.2: 128K
    if (/llama[-.]?3\b/.test(id)) return 8192;           // Llama 3.0: 8K
    if (/llama[-.]?2/.test(id)) return 4096;

    // 12. Mistral Series
    if (/mistral-large/.test(id)) return 131072;
    if (/mistral-medium/.test(id)) return 32768;
    if (/mistral-small/.test(id)) return 32768;
    if (/mixtral/.test(id)) return 32768;
    if (id.includes('codestral')) return 32768;

    // 13. Ernie Series (Baidu) — 4.x: 128K, 3.5: 32K, older: 8K
    if (/ernie[-.]?4\.5/.test(id)) return 131072;
    if (/ernie[-.]?4/.test(id)) return 131072;
    if (/ernie[-.]?3\.5/.test(id)) return 32768;
    if (/ernie[-.]?3/.test(id)) return 32768;
    if (id.includes('ernie-pro') || id.includes('ernie-lite') || id.includes('ernie-speed') || id.includes('ernie-text')) return 8192;

    // 14. Hunyuan Series (Tencent)
    if (/hunyuan[-.]?2/.test(id)) return 131072;
    if (/hunyuan/.test(id)) return 32768;

    // 15. Yi Series (01.AI) — large/vision/lightning: 128K, medium/spark: 16K
    if (id.includes('yi-large') || id.includes('yi-vision') || id.includes('yi-lightning')) return 131072;
    if (id.includes('yi-medium') || id.includes('yi-spark')) return 16384;

    // 16. Doubao Series (ByteDance)
    if (id.includes('doubao')) return 131072;

    // 17. MiniMax Series — MiniMax-01: 1M, abab: 128K
    if (id.includes('minimax-01') || id.includes('minimax-vl-01') || id.includes('minimax-text-01')) return 1048576;
    if (id.includes('minimax')) return 131072;

    // 18. Cohere Command-R Series
    if (id.includes('command-r') || id.includes('command-a') || id.includes('command-nightly')) return 131072;

    // 19. Perplexity Sonar Series
    if (id.includes('sonar')) return 131072;

    // 20. 360GPT Series
    if (id.includes('360gpt')) return 131072;

    // 21. StepFun Series
    if (id.includes('step-1v') || id.includes('step-2')) return 131072;

    // 22. Baichuan Series
    if (id.includes('baichuan-3') || id.includes('baichuan-4')) return 131072;

    // 23. InternLM Series
    if (id.includes('internlm2.5') || id.includes('internlm-xcomposer2')) return 32768;

    // 24. Fireworks / Function-calling models
    if (id.includes('firefunction')) return 32768;

    // 25. Open-source legacy models (low context)
    if (id.includes('llava') || id.includes('cogvlm')) return 4096;
    if (id.includes('falcon')) return 2048;
    if (id.includes('vicuna') || id.includes('alpaca')) return 2048;
    if (id.includes('mpt-30b') || id.includes('mpt-7b')) return 8192;
    if (id.includes('starling')) return 8192;

    // 26. Common context hints (catch-all for model names with explicit size)
    if (id.includes('128k')) return 131072;
    if (id.includes('200k')) return 200000;
    if (id.includes('1m')) return 1000000;
    if (id.includes('32k')) return 32768;
    if (id.includes('16k')) return 16384;
    if (id.includes('8k')) return 8192;
    if (id.includes('4k')) return 4096;

    // Modern default: 128K for current-generation models
    return 131072;
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