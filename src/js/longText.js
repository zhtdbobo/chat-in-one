// Bound DOM work independently of the full message size; keep every received character.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis, function () {
    const RICH_TEXT_LIMIT = 30000;
    const LONG_TEXT_PAGE_SIZE = 20000;
    class MessageTextBuffer {
        constructor(text = '') { this.chunks = []; this.length = 0; if (text) this.append(text); }
        append(text) { text = String(text); if (text) { this.chunks.push(text); this.length += text.length; } }
        text() { return this.chunks.join(''); }
        slice(start, end = this.length) {
            start = Math.max(0, start); end = Math.min(end, this.length);
            const pieces = []; let position = this.length;
            for (let index = this.chunks.length - 1; index >= 0 && position > start; index--) {
                const chunk = this.chunks[index], chunkStart = position - chunk.length;
                if (chunkStart < end) pieces.push(chunk.slice(Math.max(0, start - chunkStart), Math.min(chunk.length, end - chunkStart)));
                position = chunkStart;
            }
            return pieces.reverse().join('');
        }
    }
    function getMessageRawText(element) {
        return element?.messageTextBuffer?.text() ?? element?.rawText ?? element?.dataset?.raw ?? '';
    }
    function countMessageWords(text) {
        let count = 0, inWord = false;
        for (const char of String(text || '')) {
            const code = char.charCodeAt(0);
            if (code >= 0x4e00 && code <= 0x9fa5) { count++; inWord = false; }
            else if (/\s/u.test(char)) inWord = false;
            else if (!inWord) { count++; inWord = true; }
        }
        return count;
    }
    function createLongTextView(source, followLatest = false) {
        const buffer = typeof source === 'string' ? new MessageTextBuffer(source) : source;
        const element = document.createElement('div'); element.className = 'long-text-view';
        const notice = document.createElement('div'); notice.className = 'long-text-notice';
        const controls = document.createElement('div'); controls.className = 'long-text-controls';
        const previous = document.createElement('button'), next = document.createElement('button'), latest = document.createElement('button');
        for (const button of [previous, next, latest]) { button.type = 'button'; button.className = 'btn btn-ghost btn-sm'; }
        previous.textContent = '上一段'; next.textContent = '下一段'; latest.textContent = '最新内容';
        const pageInput = document.createElement('input'); pageInput.type = 'number'; pageInput.min = '1'; pageInput.step = '1'; pageInput.setAttribute('aria-label', '长文本段落编号');
        const pageCount = document.createElement('span');
        const text = document.createElement('pre'); text.className = 'long-text-content';
        controls.append(previous, pageInput, pageCount, next, latest); element.append(notice, controls, text);
        let page = 0, following = followLatest;
        function update() {
            const count = Math.max(1, Math.ceil(buffer.length / LONG_TEXT_PAGE_SIZE));
            page = following ? count - 1 : Math.min(page, count - 1);
            let start = page * LONG_TEXT_PAGE_SIZE, end = Math.min(buffer.length, start + LONG_TEXT_PAGE_SIZE);
            // Move both adjacent page boundaries past a complete surrogate pair.
            if (start && /[\uDC00-\uDFFF]/.test(buffer.slice(start, start + 1))) start++;
            if (end < buffer.length && /[\uDC00-\uDFFF]/.test(buffer.slice(end, end + 1))) end++;
            text.textContent = buffer.slice(start, end);
            notice.textContent = '长文本分段显示（共 ' + buffer.length.toLocaleString() + ' 字符）。复制、导出包含全部内容。';
            pageInput.value = String(page + 1); pageInput.max = String(count); pageCount.textContent = '/ ' + count + ' 段';
            previous.disabled = page === 0; next.disabled = page === count - 1;
        }
        previous.addEventListener('click', () => { page = Math.max(0, page - 1); following = false; update(); });
        next.addEventListener('click', () => { page++; following = page >= Math.ceil(buffer.length / LONG_TEXT_PAGE_SIZE) - 1; update(); });
        latest.addEventListener('click', () => { following = true; update(); });
        pageInput.addEventListener('change', () => { page = Math.max(0, Math.floor(Number(pageInput.value) || 1) - 1); following = false; update(); });
        update(); return { element, update };
    }
    return { RICH_TEXT_LIMIT, LONG_TEXT_PAGE_SIZE, MessageTextBuffer, getMessageRawText, countMessageWords, createLongTextView };
});
