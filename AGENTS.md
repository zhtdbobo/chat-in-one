# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — launch Electron app in dev mode
- `npm test` — run all Jest tests (128 tests, 12 suites)
- `npm run test:electron` — hidden Electron renderer smoke test with isolated userData and mocked IPC
- `npm run test:stress` — hidden Electron client stress test with real preload/IPC, loopback HTTP fixtures and isolated disk storage (8 cases, up to 5 million input/output characters)
- `npm run build:assets` — generate browser-compatible Highlight.js from the installed dependency
- `npm run dist` — build Windows NSIS installer
- `npm run pack` — build unpacked Windows directory
- `npm run clean` — delete `dist/` (Windows `rd /s /q`)

## Architecture

### Process Model

**Main process** (`main.js` + `src/js/main/*.js`) — Electron entry point, window/tray management, IPC handlers, SSE streaming, MCP client lifecycle, auto-update, persistent storage.

**Preload bridge** (`preload.js`) — `contextBridge.exposeInMainWorld('api', ...)` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

**Renderer process** (`index.html` + `src/js/*.js`) — Vanilla JS, no framework/bundler. All modules loaded via `<script>` tags in order. Global mutable `state` object.

### Key Modules

| Module | Role |
|---|---|
| `src/js/main/store.js` | Persistence via electron-store (fallback: SimpleStore JSON file I/O). Schema migration for new fields. |
| `src/js/main/network.js` | URL fallback chain: generates 6+ candidate URLs from a short endpoint, tries each until success. |
| `src/js/main/stream.js` | Automatic SSE/JSON parser, MCP tool integration (2-round: tool call → tool result → final answer), model-specific config builders. |
| `src/js/main/updater.js` | Auto-update via gh-proxy.com generic feed with GitHub electron-updater fallback. |
| `src/js/main/ipc.js` | All IPC handler registration (invoke/handle + send/on patterns). |
| `src/js/main/window.js` | BrowserWindow + Tray creation, titlebar theme, close-to-tray behavior. |
| `src/js/requests.js` | Request IDs, pending/streaming lifecycle, comparison history filtering, attachment conversion. |
| `src/js/longText.js` | Chunked message buffers, bounded plain-text paging and allocation-efficient word counting. |
| `src/js/modelParameters.js` | Shared parameter metadata, override validation and sampling configuration; unspecified numbers use server defaults. |
| `src/js/chat.js` | Chat CRUD, message sending, markdown rendering pipeline. |
| `src/js/events.js` | All DOM event bindings and stream IPC listeners. |
| `src/js/settings.js` | Settings modal, provider management, model capability detection (125+ model DB). |
| `src/js/messageFormatConverter.js` | Provider-specific message format conversion (OpenAI, Claude, Gemini, Qwen, etc.). |

### Data Flow

```
User input → chat.js → window.api.sendMessageStream() (IPC send)
  → ipc.js → stream.js → network.js (fetch with URL fallback)
    → SSE stream → event.reply('stream-chunk') → renderer DOM update
    → tool_calls → MCP client callTool → second LLM request → final response
```

### Testing

- `test/unit/*.test.js` — main process module tests with `jest.mock('electron')`
- `test/integration/*.test.js` — app lifecycle tests
- `test/unit/renderer-regressions.test.js` — VM renderer tests for request state, attachment conversion and compression
- `test/electron/renderer-smoke.cjs` — actual DOM, settings, code controls and sandbox checks (run separately)
- `test/electron/long-text-stress.cjs` — real streaming and JSON responses, large input/output, disk reload, terminal markers, interruption, timeout, cancellation and comparison (run separately)

## Key Patterns

- **Settings persistence**: `electron-store` ESM import with sync `SimpleStore` fallback. Settings saved on "Save" button click. Chats auto-saved after each message.
- **Request identity**: Renderer registers every request before IPC, routes replies by `requestId`, and remains busy until all comparison requests finish. Saved comparison responses use `providerId|modelName`.
- **Preview**: `src/preview/index.html` has a separate CSP; generated code runs in a nested sandbox iframe without the preload bridge.
- **Streaming**: Leave `stream` and `stream_options` omitted to use the service's default; ignore legacy `chat.streamOutput`. Detect SSE versus JSON from response bytes independently in each MCP round. Parse SSE chunks via `response.body.getReader()`. Honor `[DONE]` and `finish_reason` even when HTTP stays open; capture final usage with a one-second finish-reason grace period. Stop after three minutes without incoming data, with no total generation deadline. `CHAT_IN_ONE_STREAM_IDLE_TIMEOUT_MS` overrides inactivity timeout for tests.
- **Long messages**: Keep complete text in chunk buffers outside DOM attributes. Batch IPC and renderer work; above 30,000 characters use plain-text pages of approximately 20,000 characters. Copy/export/save retain complete text. Context estimates warn without blocking or truncating input.
- **Request feedback**: Show first reply fragment latency, total elapsed time and received character count. After 15 seconds without a displayed fragment, show a waiting notice; preserve partial replies and explicit error/length/interruption/cancellation status.
- **MCP**: `StdioClientTransport` spawns user-configured commands. Tools are fetched, injected into LLM requests, results returned in a second round.
- **Model detection**: 125+ model capability database with fuzzy matching fallback for unlisted models.
- **Conversation parameters**: The conversation settings dialog shows only temperature and Top P numeric override inputs (no capability card); save these by provider/model in `chat.modelParameterOverrides`. Fetched model lists keep read-only capability cards (context window, output cap, input types) collapsed behind a per-model expander. Switching models restores that model's sampling overrides, leaving system prompts and other conversation settings shared. Comparison overrides apply to all selected models. Fetch model metadata on opening the dialog; published defaults are hints and missing metadata stays unknown. Fetched model lists retain full capability cards. Ignore removed legacy history-count and output-limit settings (including nested model overrides); send all relevant history without a count limit and omit output-limit parameters to use service defaults. Discard obsolete flat fields on saving or switching models.
- **Theming**: CSS custom properties, toggled via `body.light-theme` / `body.dark-theme` class.

## Platform Notes

- Windows-only target (NSIS installer, no macOS/Linux packaging configured)
- `clean` script uses Windows `rd /s /q` command
- `.npmrc` uses Chinese npm mirror (`npmmirror.com`)
- Electron `titleBarStyle: 'hidden'` with `titleBarOverlay` for frameless window
- Native titlebar updates target the configured main window only; auxiliary windows may not enable the overlay.
