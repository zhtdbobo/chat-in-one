// Build a list of possible chat completion URLs for a "short" endpoint
function buildChatCompletionCandidates(ep) {
    const trimmed = String(ep || '').trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();

    const base = trimmed.replace(/\/+$/, '');
    const candidates = [];

    // 1) 如果用户已经填了完整路径，先尝试这个长 URL
    if (lower.includes('/chat/completions') || lower.includes('/completions') || lower.includes('/complete')) {
        candidates.push(trimmed);
        // 再从短地址推导一轮候选
        try {
            const u = new URL(trimmed);
            const origin = u.origin;
            const path = u.pathname || '';
            const hasV1 = path.includes('/v1/');
            const shortBases = hasV1 ? [origin + '/v1', origin] : [origin, origin + '/v1'];
            for (const b of shortBases) {
                const sb = b.replace(/\/+$/, '');
                candidates.push(
                    `${sb}/chat/completions`,
                    `${sb}/completions`,
                    `${sb}/complete`
                );
            }
        } catch (e) {
            // 非标准 URL 时退回通用逻辑
        }
    } else {
        // 2) 纯短 endpoint：按常见组合生成候选
        if (base.match(/\/v\d+$/i)) {
            candidates.push(
                `${base}/chat/completions`,
                `${base}/completions`,
                `${base}/complete`
            );
        } else {
            candidates.push(
                `${base}/v1/chat/completions`,
                `${base}/chat/completions`,
                `${base}/v1/completions`,
                `${base}/completions`,
                `${base}/v1/complete`,
                `${base}/complete`
            );
        }
    }

    // 去重
    return Array.from(new Set(candidates));
}

// Try multiple possible URLs until one responds (2xx or meaningful 4xx), for chat completions
async function fetchChatCompletionWithFallback(endpoint, options, controller) {
    const candidates = buildChatCompletionCandidates(endpoint);
    if (candidates.length === 0) {
        throw new Error('Invalid endpoint');
    }

    let lastError = null;
    for (const url of candidates) {
        try {
            const resp = await fetch(url, {
                ...(options || {}),
                signal: controller?.signal
            });

            // If 2xx, or a non-404 error (e.g. 401/400 from API), treat as final
            if (resp.ok || resp.status !== 404) {
                return { response: resp, url };
            }

            lastError = new Error(`HTTP ${resp.status} at ${url}`);
        } catch (e) {
            lastError = e;
            // If aborted, stop immediately
            if (controller?.signal?.aborted) {
                throw e;
            }
        }
    }
    throw lastError || new Error('No valid chat completion URL found');
}

module.exports = {
    buildChatCompletionCandidates,
    fetchChatCompletionWithFallback
};