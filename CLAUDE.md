# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — launch Electron app in dev mode
- `npm test` — run all Jest tests (57 tests, 8 suites)
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
| `src/js/main/stream.js` | SSE parser, MCP tool integration (2-round: tool call → tool result → final answer), model-specific config builders. |
| `src/js/main/updater.js` | Auto-update via gh-proxy.com generic feed with GitHub electron-updater fallback. |
| `src/js/main/ipc.js` | All IPC handler registration (invoke/handle + send/on patterns). |
| `src/js/main/window.js` | BrowserWindow + Tray creation, titlebar theme, close-to-tray behavior. |
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
- No renderer tests exist (vanilla JS DOM-dependent code)

## Key Patterns

- **Settings persistence**: `electron-store` ESM import with sync `SimpleStore` fallback. Settings saved on "Save" button click. Chats auto-saved after each message.
- **Streaming**: SSE chunks parsed via `response.body.getReader()`. Accumulated in `dataset.raw`/`dataset.reasoning` attributes, DOM re-parsed per chunk.
- **MCP**: `StdioClientTransport` spawns user-configured commands. Tools are fetched, injected into LLM requests, results returned in a second round.
- **Model detection**: 125+ model capability database with fuzzy matching fallback for unlisted models.
- **Theming**: CSS custom properties, toggled via `body.light-theme` / `body.dark-theme` class.

## Platform Notes

- Windows-only target (NSIS installer, no macOS/Linux packaging configured)
- `clean` script uses Windows `rd /s /q` command
- `.npmrc` uses Chinese npm mirror (`npmmirror.com`)
- Electron `titleBarStyle: 'hidden'` with `titleBarOverlay` for frameless window
