## chat-in-one 桌面客户端

一个支持多家大模型服务商、OpenAI 兼容协议、MCP 工具和技能系统的本地桌面聊天应用，基于 Electron + 原生 JS 实现。

### 功能特性

- **多服务商 / 多模型**
  - 在「设置 → 模型服务商」中配置任意数量的 Provider（OpenAI、DeepSeek、阿里云 DashScope、MiniMax 等）
  - 支持 OpenAI 兼容的 `/v1/chat/completions` 接口
  - 支持从 `/models` 自动拉取模型列表，或手动录入模型 ID
  - 主界面右下角可搜索切换当前会话使用的模型

- **流式对话体验**
  - 采用 SSE 流式输出，边生成边显示
  - 支持「思考过程」展示（针对 R1 等 reasoning 模型）
  - 支持联网搜索开关（有能力的模型可以用它获取最新信息）

- **响应统计信息**
  - 每条助手回复结尾会显示一行统计：
    - `word count`：本条消息的词数
    - `tokens used`：本次请求消耗的 token（来自接口返回的 `usage`）
    - `first token latency`：首个 token 延迟（请求发出到第一 token 抵达的毫秒数）
    - `model`：实际使用的模型名
    - `time`：回复完成的本地时间（HH:mm）

- **代码阅读友好**
  - Markdown 渲染 + Highlight.js 代码高亮
  - **每个代码块右上角有单独的复制按钮**，只复制该段代码
  - 整条消息右侧还有整体复制按钮，复制整条回复内容

- **对话管理**
  - 支持多会话侧边栏、会话重命名（首条消息自动生成标题）
  - 支持对话导出 / 导入（JSON）

- **MCP & 技能系统**
  - MCP：在设置中添加 MCP 服务器，为模型提供外部工具能力（搜索、文件等）
  - Skills：预设系统提示（System Prompt），在主界面快速切换「搭档」人格

---

### 环境与运行

#### 依赖

- Node.js（建议 18+）
- npm 或 pnpm
- Windows / macOS / Linux（Electron 跨平台）

#### 安装依赖

在项目根目录（本 README 所在目录）执行：

```bash
npm install
```

#### 开发模式运行

```bash
npm start
```

将启动 Electron 应用并加载本地前端。

#### 打包（如有配置）

如果 `package.json` 中配置了打包脚本，可以类似：

```bash
npm run build
```

> 具体打包命令以 `package.json` 为准，如需可自行调整。

---

### 配置模型服务商

1. 打开应用右下角「设置」，进入 `模型服务商` 标签页。
2. 左侧点击「+」添加一个服务商，右侧填写：
   - **服务商名称**：自定义显示名，例如 `OpenAI`、`DeepSeek`、`阿里云 Coding Plan`
   - **API Key**：对应服务商的密钥
   - **API Endpoint**：
     - OpenAI：`https://api.openai.com/v1`
     - 阿里云 Coding Plan：`https://coding.dashscope.aliyuncs.com/v1`
     - 其他 OpenAI 兼容服务请填写它们的 `/v1` 根路径

3. 模型列表有两种获取方式：
   - **自动获取**：点击「获取模型」，会调用 `{endpoint}/models` 拉取模型列表（仅对支持该协议的服务商有效）
   - **手动新增模型**：
     - 在「手动新增模型 ID」输入框中填入模型 ID（如 `MiniMax-M2.5`、`qwen2.5-coder` 等），点击「新增模型」
     - 新增后会出现在可选模型列表中

4. 在「可见模型列表」中勾选你希望在主界面模型选择器中出现的模型。

#### 测试连接（用于不确定是否真正兼容的服务）

在服务商配置中点击 **「测试连接」**：

- 会弹出一个**模型选择弹窗**，列出当前服务商可见 / 所有模型（以及你手动输入的模型 ID）
- 点击某个模型即发起一次测试请求：
  - `POST {endpoint}/chat/completions`
  - Body：`{ model, messages:[{role:"user",content:"ping"}], max_tokens:1, stream:false }`
- 结果会展示在表单下方，包括：
  - 成功或失败（OK / FAIL）
  - 往返延迟（latency）
  - 实际返回的 `model`
  - `usage`（如果服务端有返回）

> 如果服务商不是 OpenAI 兼容协议（路径、鉴权或字段完全不同），测试会失败，这属于预期情况，可以据此判断是否需要写单独的适配层。

---

### 聊天界面说明

- **模型选择**：主界面输入框下方右侧，可搜索所有可见模型；选择后仅影响当前会话。
- **思考过程开关**：
  - 输入框下方左侧「大脑」图标
  - 开启后，如果模型返回 `reasoning_content`，会以可折叠的「思考过程」区块显示。
- **联网搜索开关**：
  - 输入框下方左侧「地球」图标
  - 开启后，系统 Prompt 会注入提示，引导模型使用联网能力（具体是否生效取决于后端模型与工具）。
- **统计信息**：
  - 每条助手消息底部会有一行：
    - `word count, tokens used, first token latency, model, time`
  - 不参与复制代码块的内容，只是可视化信息。

---

### MCP 与技能（可选）

- **MCP（Model Context Protocol）**
  - 在「设置 → MCP 服务器」中添加 MCP server（命令 + 参数）
  - 主进程会通过 MCP SDK 连接、拉取工具列表，并在请求时作为 `tools` 提供给模型

- **技能（Skills）**
  - 「设置 → AI 技能」中可以配置多个 system prompt，例如：
    - 通用助手、代码专家、翻译官等
  - 在主界面可以快速选择技能，自动覆盖当前对话的 system prompt

---

### 数据存储与导出

- 所有设置与对话记录存储在用户目录下（通过 `electron-store` 或内置 JSON 存储）。
- 左侧侧边栏支持：
  - **导出对话**为 JSON
  - 从 JSON 文件 **导入对话**

---

### 常见问题

- **Q: 某个服务商测试连接失败怎么办？**  
  A: 首先确认 Endpoint、API Key、模型 ID 正确；如果是非 OpenAI 兼容协议，当前版本不会自动适配，需要你在网关层做协议转换。

- **Q: 为什么有的返回没有 `tokens used`？**  
  A: 只有在服务端支持并返回 `usage` 字段时，才能显示 token 统计；否则会显示为 `—`。

- **Q: 为什么中文回复的 `word count` 看起来不太准？**  
  A: 目前用的是按空白分词，更适合英文；如果你非常在意中文统计，可以在代码里改成基于字符数或自定义分词。

---

### 开发提示

- 主要代码入口：
  - `main.js`：Electron 主进程，负责窗口、IPC、流式请求等
  - `preload.js`：向渲染进程暴露 `window.api`
  - `src/js/*.js`：渲染进程的 UI 与逻辑（聊天、设置、MCP、技能等）
- UI 通过纯 HTML + CSS（在 `src/assets/css`）+ 少量 JS 动画实现，方便你根据喜好改主题或布局。

# chat-in-one
