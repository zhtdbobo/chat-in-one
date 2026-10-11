// settings.js - Settings related functions

// -----------------------------------------
// Model Capability Detection
// -----------------------------------------
/**
 * 根据模型ID或模型对象检测其支持的能力
 * 基于2024-2026年市面最新模型信息，覆盖125+个模型
 * 来源：OpenAI、Claude、Gemini、DeepSeek、Qwen、Ernie等主流服务商
 * @param {string} modelId - 模型ID
 * @param {object} modelObj - 模型对象（可选）
 * @returns {object} 能力对象 { vision: boolean, reasoning: boolean, tools: boolean }
 */
function detectModelCapabilities(modelId, modelObj = {}) {
    const id = String(modelId).toLowerCase().trim();

    // 初始化能力
    let capabilities = {
        vision: false,
        reasoning: false,
        tools: false
    };

    // 先检查API返回的能力信息（优先级最高）
    if (modelObj) {
        const inputTypes = getModelCapabilityInfo(modelObj).inputTypes;
        if (modelObj.capabilities && typeof modelObj.capabilities === 'object' && !Array.isArray(modelObj.capabilities)) {
            return { ...capabilities, ...modelObj.capabilities, ...(inputTypes ? { vision: inputTypes.includes('image') } : {}) };
        }
        if (modelObj.capabilities && Array.isArray(modelObj.capabilities)) {
            capabilities.vision = modelObj.capabilities.includes('vision');
            capabilities.reasoning = modelObj.capabilities.includes('reasoning');
            capabilities.tools = modelObj.capabilities.includes('tools');
            return { ...capabilities, ...(inputTypes ? { vision: inputTypes.includes('image') } : {}) };
        }
        if (modelObj.vision !== undefined || modelObj.reasoning !== undefined || modelObj.tools !== undefined) {
            capabilities.vision = !!modelObj.vision;
            capabilities.reasoning = !!modelObj.reasoning;
            capabilities.tools = !!modelObj.tools;
            return { ...capabilities, ...(inputTypes ? { vision: inputTypes.includes('image') } : {}) };
        }
        if (inputTypes) {
            return { vision: inputTypes.includes('image'), reasoning: !!modelObj.reasoning,
                tools: !!modelObj.tools || modelObj.supported_parameters?.includes('tools') || false };
        }
    }

    // ==================== 完整模型数据库查表 ====================
    // 这个数据库涵盖市面上主流的125+个模型

    // OpenAI 模型
    const openaiModels = {
        // GPT-5 系列（2025 年发布）
        "gpt-5": { vision: true, reasoning: true, tools: true },
        "gpt-5-turbo": { vision: true, reasoning: true, tools: true },
        "gpt-5-mini": { vision: true, reasoning: false, tools: true },
        "gpt-5-codex": { vision: false, reasoning: true, tools: true },
        // GPT-4 系列
        "gpt-4-vision": { vision: true, reasoning: false, tools: true },
        "gpt-4-turbo": { vision: true, reasoning: false, tools: true },
        "gpt-4-turbo-vision": { vision: true, reasoning: false, tools: true },
        "gpt-4o": { vision: true, reasoning: false, tools: true },           // 旗舰多模态
        "gpt-4o-mini": { vision: true, reasoning: false, tools: true },
        "gpt-4o-vision": { vision: true, reasoning: false, tools: true },
        "gpt-4-32k": { vision: false, reasoning: false, tools: true },
        "gpt-4": { vision: false, reasoning: false, tools: true },
        // GPT-3.5 系列
        "gpt-3.5-turbo": { vision: false, reasoning: false, tools: true },
        "gpt-3.5": { vision: false, reasoning: false, tools: true },
        // O 系列（推理/思维）
        "o1": { vision: false, reasoning: true, tools: true },
        "o1-mini": { vision: false, reasoning: true, tools: true },
        "o1-preview": { vision: false, reasoning: true, tools: true },
        "o3": { vision: false, reasoning: true, tools: true },
        "o3-mini": { vision: false, reasoning: true, tools: true },
        "o4": { vision: false, reasoning: true, tools: true },
        "o4-mini": { vision: false, reasoning: true, tools: true },
    };

    // Claude 模型（Anthropic）
    const claudeModels = {
        // Claude 4 系列（2025 年发布）
        "claude-4-opus": { vision: true, reasoning: true, tools: true },
        "claude-4-sonnet": { vision: true, reasoning: true, tools: true },
        "claude-4-haiku": { vision: true, reasoning: false, tools: true },
        // Claude 3.7 系列
        "claude-3.7-sonnet": { vision: true, reasoning: true, tools: true },
        "claude-3.7-haiku": { vision: true, reasoning: false, tools: true },
        "claude-3-7-sonnet": { vision: true, reasoning: true, tools: true },
        // Claude 3.5 系列 - 旗舰
        "claude-3-5-sonnet": { vision: true, reasoning: false, tools: true },
        "claude-3.5-sonnet": { vision: true, reasoning: false, tools: true },
        "claude-3-5-haiku": { vision: true, reasoning: false, tools: true },
        "claude-3.5-haiku": { vision: true, reasoning: false, tools: true },
        // Claude 3 系列
        "claude-3-opus": { vision: true, reasoning: false, tools: true },
        "claude-3-sonnet": { vision: true, reasoning: false, tools: true },
        "claude-3-haiku": { vision: true, reasoning: false, tools: true },
        // 旧版
        "claude-2": { vision: false, reasoning: false, tools: true },
        "claude-2.1": { vision: false, reasoning: false, tools: true },
        "claude-instant": { vision: false, reasoning: false, tools: true },
    };

    // Gemini 模型（Google）
    const geminiModels = {
        // Gemini 3 系列（2026 年发布）
        "gemini-3-pro": { vision: true, reasoning: true, tools: true },
        "gemini-3-flash": { vision: true, reasoning: false, tools: true },
        "gemini-3-ultra": { vision: true, reasoning: true, tools: true },
        // Gemini 2.5 系列（2025 年发布）
        "gemini-2.5-pro": { vision: true, reasoning: true, tools: true },
        "gemini-2.5-flash": { vision: true, reasoning: false, tools: true },
        "gemini-2.5-ultra": { vision: true, reasoning: true, tools: true },
        // Gemini 2 系列
        "gemini-2-flash": { vision: true, reasoning: false, tools: true },
        "gemini-2-flash-lite": { vision: true, reasoning: false, tools: true },
        "gemini-2-pro": { vision: true, reasoning: false, tools: true },
        "gemini-2-flash-thinking": { vision: false, reasoning: true, tools: true },
        "gemini-2-ultra": { vision: true, reasoning: true, tools: true },
        // Gemini 1.5 系列
        "gemini-1.5-pro": { vision: true, reasoning: false, tools: true },
        "gemini-1.5-flash": { vision: true, reasoning: false, tools: true },
        "gemini-1.5-flash-8b": { vision: true, reasoning: false, tools: true },
        // 兼容性别名
        "gemini-pro": { vision: true, reasoning: false, tools: true },
        "gemini-pro-vision": { vision: true, reasoning: false, tools: true },
        "gemini-vision": { vision: true, reasoning: false, tools: true },
        "gemini-ultra": { vision: true, reasoning: true, tools: true },
    };

    // Qwen 模型（阿里云）
    const qwenModels = {
        // Qwen 3.5 系列（2025-2026 年，原生多模态 - 所有变体都有 vision 能力）
        "qwen3.5": { vision: true, reasoning: true, tools: true },
        "qwen-3.5": { vision: true, reasoning: true, tools: true },
        "qwen3.5-turbo": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-turbo": { vision: true, reasoning: true, tools: true },
        "qwen3.5-vision": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-vision": { vision: true, reasoning: true, tools: true },
        "qwen3.5-plus": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-plus": { vision: true, reasoning: true, tools: true },
        "qwen3.5-32b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-72b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-27b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-122b-a10b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-35b-a3b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-32b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-72b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-27b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-122b-a10b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-35b-a3b": { vision: true, reasoning: true, tools: true },
        // Qwen 3.5 小尺寸模型
        "qwen3.5-0.8b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-2b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-4b": { vision: true, reasoning: true, tools: true },
        "qwen3.5-9b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-0.8b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-2b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-4b": { vision: true, reasoning: true, tools: true },
        "qwen-3.5-9b": { vision: true, reasoning: true, tools: true },
        // Qwen 3 系列
        "qwen3": { vision: true, reasoning: false, tools: true },
        "qwen-3": { vision: true, reasoning: false, tools: true },
        "qwen3-turbo": { vision: true, reasoning: false, tools: true },
        "qwen3-plus": { vision: true, reasoning: false, tools: true },
        // Qwen 2.5 系列 - 文本模型
        "qwen2.5-72b": { vision: false, reasoning: false, tools: true },
        "qwen2.5-32b": { vision: false, reasoning: false, tools: true },
        "qwen2.5-14b": { vision: false, reasoning: false, tools: true },
        "qwen2.5-7b": { vision: false, reasoning: false, tools: true },
        "qwen2.5-coder-32b": { vision: false, reasoning: false, tools: true },
        "qwen2.5-math-7b": { vision: false, reasoning: true, tools: true },
        "qwen2-72b": { vision: false, reasoning: false, tools: true },
        "qwen2-7b": { vision: false, reasoning: false, tools: true },
        // Qwen VL 系列 - 视觉/多模态
        "qwen-vl": { vision: true, reasoning: false, tools: true },
        "qwen-vl-max": { vision: true, reasoning: false, tools: true },
        "qwen-vl-plus": { vision: true, reasoning: false, tools: true },
        "qwen2-vl": { vision: true, reasoning: false, tools: true },
        "qwen2-vl-7b": { vision: true, reasoning: false, tools: true },
        "qwen2.5-vl": { vision: true, reasoning: false, tools: true },
        "qwen2.5-vl-7b": { vision: true, reasoning: false, tools: true },
        // Qwen 特殊能力模型
        "qwq": { vision: false, reasoning: true, tools: false },
        "qwq-1b": { vision: false, reasoning: true, tools: false },
        "qwq-32b": { vision: false, reasoning: true, tools: false },
        // 基础模型
        "qwen-exp": { vision: false, reasoning: false, tools: true },
        "qwen-max": { vision: false, reasoning: false, tools: true },
        "qwen-turbo": { vision: false, reasoning: false, tools: true },
        "qwen-plus": { vision: false, reasoning: false, tools: true },
    };

    // DeepSeek 模型
    const deepseekModels = {
        // R1 系列（推理）
        "deepseek-r1": { vision: false, reasoning: true, tools: true },
        "deepseek-r1-distill-qwen-32b": { vision: false, reasoning: true, tools: true },
        "deepseek-r1-distill-llama-70b": { vision: false, reasoning: true, tools: true },
        "deepseek-r1-zero": { vision: false, reasoning: true, tools: true },
        "deepseek-r1-lite": { vision: false, reasoning: true, tools: true },
        // V3 系列 - 旗舰
        "deepseek-v3": { vision: true, reasoning: true, tools: true },
        "deepseek-v3-lite": { vision: true, reasoning: false, tools: true },
        "deepseek-v3-base": { vision: true, reasoning: true, tools: true },
        // VL 系列（多模态）
        "deepseek-vl": { vision: true, reasoning: false, tools: true },
        "deepseek-vl2": { vision: true, reasoning: false, tools: true },
        "deepseek-vl2-lite": { vision: true, reasoning: false, tools: true },
        // 其他
        "deepseek-chat": { vision: false, reasoning: false, tools: true },
        "deepseek-coder": { vision: false, reasoning: false, tools: true },
        "deepseek-coder-v2": { vision: false, reasoning: false, tools: true },
        "deepseek-math": { vision: false, reasoning: true, tools: true },
    };

    // Llama 模型（Meta）
    const llamaModels = {
        // Llama 3.2 系列（多模态）
        "llama-3.2-90b-vision": { vision: true, reasoning: false, tools: true },
        "llama-3.2-11b-vision": { vision: true, reasoning: false, tools: true },
        "llama-3.2": { vision: true, reasoning: false, tools: true },
        "llama-3.2-vision": { vision: true, reasoning: false, tools: true },
        // Llama 3.1 系列
        "llama-3.1-405b": { vision: false, reasoning: false, tools: true },
        "llama-3.1-70b": { vision: false, reasoning: false, tools: true },
        "llama-3.1-8b": { vision: false, reasoning: false, tools: true },
        // Llama 3 系列
        "llama-3-70b": { vision: false, reasoning: false, tools: true },
        "llama-3-8b": { vision: false, reasoning: false, tools: true },
        // Llama 2 系列
        "llama-2-70b": { vision: false, reasoning: false, tools: true },
        "llama-2-13b": { vision: false, reasoning: false, tools: true },
    };

    // Ernie 模型（百度）
    const ernieModels = {
        // Ernie 4.5 系列（2025 年）
        "ernie-4.5-turbo": { vision: true, reasoning: true, tools: true },
        "ernie-4.5-pro": { vision: true, reasoning: true, tools: true },
        // Ernie 4.0 系列 - 旗舰
        "ernie-4.0-turbo-8k": { vision: false, reasoning: false, tools: true },
        "ernie-4.0-8k": { vision: false, reasoning: false, tools: true },
        "ernie-4.0-turbo": { vision: false, reasoning: false, tools: true },
        "ernie-4.0": { vision: false, reasoning: false, tools: true },
        // Ernie 3.5 系列
        "ernie-3.5-turbo-8k": { vision: false, reasoning: false, tools: true },
        "ernie-3.5-8k": { vision: false, reasoning: false, tools: true },
        "ernie-3.5-turbo": { vision: false, reasoning: false, tools: true },
        // Ernie Pro 系列
        "ernie-pro": { vision: false, reasoning: false, tools: true },
        "ernie-pro-vision": { vision: true, reasoning: false, tools: true },
        // 轻量级
        "ernie-lite": { vision: false, reasoning: false, tools: true },
        "ernie-speed": { vision: false, reasoning: false, tools: true },
        // 其他
        "ernie-speed-pro": { vision: false, reasoning: false, tools: true },
        "ernie-text-pro": { vision: false, reasoning: false, tools: true },
    };

    // Hunyuan 模型（腾讯）
    const hunyuanModels = {
        // Hunyuan 2.0 系列（2025 年）
        "hunyuan-2.0-pro": { vision: true, reasoning: true, tools: true },
        "hunyuan-2.0-turbo": { vision: true, reasoning: false, tools: true },
        // 标准模型
        "hunyuan-pro": { vision: false, reasoning: false, tools: true },
        "hunyuan-pro-vision": { vision: true, reasoning: false, tools: true },
        "hunyuan-plus": { vision: false, reasoning: false, tools: true },
        "hunyuan-lite": { vision: false, reasoning: false, tools: true },
        "hunyuan-turbo": { vision: false, reasoning: false, tools: true },
        // 其他变体
        "hunyuan-vision": { vision: true, reasoning: false, tools: true },
        "hunyuan-pro-32k": { vision: false, reasoning: false, tools: true },
    };

    // Mistral 模型
    const mistralModels = {
        // Mistral Large 2（2025 年）
        "mistral-large-2": { vision: true, reasoning: true, tools: true },
        "mistral-large-3": { vision: true, reasoning: true, tools: true },
        // Mistral 系列
        "mistral-large": { vision: false, reasoning: false, tools: true },
        "mistral-medium": { vision: false, reasoning: false, tools: true },
        "mistral-small": { vision: false, reasoning: false, tools: true },
        "mistral-small-3": { vision: false, reasoning: false, tools: true },
        "mixtral-8x22b": { vision: false, reasoning: false, tools: true },
        "mixtral-8x7b": { vision: false, reasoning: false, tools: true },
        "codestral": { vision: false, reasoning: false, tools: true },
        "codestral-25b": { vision: false, reasoning: false, tools: true },
    };

    // 其他服务商模型
    const otherModels = {
        // xAI（Grok）
        "grok-4": { vision: true, reasoning: true, tools: true },
        "grok-3": { vision: true, reasoning: false, tools: true },
        "grok-2-vision": { vision: true, reasoning: false, tools: true },
        "grok-2": { vision: false, reasoning: false, tools: true },
        // Cohere
        "command-r": { vision: false, reasoning: false, tools: true },
        "command-r-plus": { vision: false, reasoning: false, tools: true },
        "command-nightly": { vision: false, reasoning: false, tools: true },
        "command-a": { vision: false, reasoning: false, tools: true },
        // Perplexity
        "sonar-pro": { vision: false, reasoning: false, tools: true },
        "sonar": { vision: false, reasoning: false, tools: true },
        "sonar-reasoning-pro": { vision: false, reasoning: true, tools: true },
        "sonar-reasoning": { vision: false, reasoning: true, tools: true },
        "sonar-deep-research": { vision: false, reasoning: true, tools: true },
        // 360 AI
        "360gpt-pro": { vision: true, reasoning: false, tools: true },
        "360gpt-turbo": { vision: false, reasoning: false, tools: true },
        "360gpt-3": { vision: false, reasoning: false, tools: true },
        // Moonshot（月之暗面/Kimi）- moonshot-v1-vision 有视觉，Kimi K2/K2.5 是原生多模态
        "moonshot-v1-8k": { vision: false, reasoning: false, tools: true },
        "moonshot-v1-32k": { vision: false, reasoning: false, tools: true },
        "moonshot-v1-128k": { vision: false, reasoning: false, tools: true },
        "moonshot-v1-auto": { vision: false, reasoning: false, tools: true },
        "moonshot-v1-vision-preview": { vision: true, reasoning: false, tools: true },
        "moonshot-v1-vision": { vision: true, reasoning: false, tools: true },
        "kimi-k2": { vision: true, reasoning: true, tools: true },
        "kimi-k2.5": { vision: true, reasoning: true, tools: true },
        "kimi-k2-vision": { vision: true, reasoning: true, tools: true },
        "kimi-k2.5-vision": { vision: true, reasoning: true, tools: true },
        "kimi-k2.6": { vision: true, reasoning: true, tools: true },
        // 01.AI（零一万物）
        "yi-large": { vision: false, reasoning: false, tools: true },
        "yi-vision": { vision: true, reasoning: false, tools: true },
        "yi-medium": { vision: false, reasoning: false, tools: true },
        "yi-spark": { vision: false, reasoning: false, tools: true },
        "yi-lightning": { vision: false, reasoning: false, tools: true },
        // ByteDance（豆包）
        "doubao-pro-32k": { vision: false, reasoning: false, tools: true },
        "doubao-pro-128k": { vision: false, reasoning: false, tools: true },
        "doubao-pro-4k": { vision: false, reasoning: false, tools: true },
        "doubao-vision-pro": { vision: true, reasoning: false, tools: true },
        "doubao-lite": { vision: false, reasoning: false, tools: true },
        // MiniMax（MiniMax-Text-01 是文本，MiniMax-VL-01 是视觉）
        "minimax-01": { vision: true, reasoning: false, tools: true },
        "minimax-vl-01": { vision: true, reasoning: false, tools: true },
        "minimax-text-01": { vision: false, reasoning: false, tools: true },
        "minimax-abab6.5": { vision: false, reasoning: false, tools: true },
        "minimax-abab7": { vision: true, reasoning: true, tools: true },
        "minimax-abab7-vision": { vision: true, reasoning: false, tools: true },
        // StepFun（阶跃星辰）
        "step-1v": { vision: true, reasoning: false, tools: true },
        "step-2": { vision: true, reasoning: true, tools: true },
        // Baichuan（百川）
        "baichuan-3-turbo": { vision: false, reasoning: false, tools: true },
        "baichuan-4": { vision: true, reasoning: false, tools: true },
        // Fireworks AI
        "firefunction-v2": { vision: false, reasoning: false, tools: true },
        // Together AI
        "together-llama-3.1-405b": { vision: false, reasoning: false, tools: true },
        // 开源模型
        "llava-13b": { vision: true, reasoning: false, tools: false },
        "llava-7b": { vision: true, reasoning: false, tools: false },
        "llava-next": { vision: true, reasoning: false, tools: false },
        "cogvlm": { vision: true, reasoning: false, tools: false },
        "falcon-40b": { vision: false, reasoning: false, tools: true },
        "falcon-7b": { vision: false, reasoning: false, tools: true },
        "vicuna-13b": { vision: false, reasoning: false, tools: true },
        "alpaca-13b": { vision: false, reasoning: false, tools: true },
        "mpt-30b": { vision: false, reasoning: false, tools: true },
        "starling-lm": { vision: false, reasoning: false, tools: true },
        // InternLM（书生·浦语）
        "internlm2.5-7b": { vision: false, reasoning: false, tools: true },
        "internlm2.5-20b": { vision: false, reasoning: false, tools: true },
        "internlm-xcomposer2": { vision: true, reasoning: false, tools: true },
    };

    // 合并所有数据库
    const completeModelDB = {
        ...openaiModels,
        ...claudeModels,
        ...geminiModels,
        ...qwenModels,
        ...deepseekModels,
        ...llamaModels,
        ...ernieModels,
        ...hunyuanModels,
        ...mistralModels,
        ...otherModels
    };

    // 先尝试精确匹配
    if (completeModelDB[id]) {
        return completeModelDB[id];
    }

    // 不精确匹配失败时，使用模糊匹配规则作为后备
    // 这样可以处理未来新发布但还没录入的模型变体
    // 注意：不能仅凭名字中的某些字符判断能力，需要结合主流厂商的命名规范

    // Vision 能力 - 模糊匹配（基于主流厂商命名规范）
    // 只有明确标识视觉能力的后缀才认为有 vision 能力
    const visionPatterns = [
        'vision', 'visual', 'multimodal', 'mm-', '-v-', '-v$',
        '-vision$', '-vl$', '-vl-', 'vl-', '^vl-', // vl 必须在开头或作为独立词段
        '-camera', '-see', '-image', '-pic', '-photo',
        // Qwen3.5 系列都是原生多模态（2025-2026 年）- 支持 qwen/qwen3.5-9b 这种格式
        'qwen3\\.5', 'qwen-3\\.5',
        // Kimi K2/K2.5 是原生多模态
        'kimi-k2',
        // MiniMax abab7 是多模态
        'abab7'
    ];
    const visionRegex = new RegExp('(' + visionPatterns.join('|') + ')', 'i');
    if (visionRegex.test(id)) {
        capabilities.vision = true;
    }

    // Reasoning 能力 - 模糊匹配（基于主流厂商命名规范）
    // 只有明确标识推理能力的型号才认为有 reasoning 能力
    const reasoningPatterns = [
        'reasoning', '^o[1-9]', '-r1$', '-r1-', '^r1-', '-think', 'thinking',
        '-distill.*r1', '-math', '-logic', '-reason', '-deepseek-r'
    ];
    const reasoningRegex = new RegExp('(' + reasoningPatterns.join('|') + ')', 'i');
    if (reasoningRegex.test(id)) {
        capabilities.reasoning = true;
    }

    // Tools 能力 - 默认 true，除非是已知不支持的模型
    // 纯视觉模型、轻量级模型通常不支持工具调用
    const noToolsPatterns = [
        '^llava', '^cogvlm', '^mini-?cpm', 'pure$', 'vision-only',
        '-pure$', '-vision-only$', '-lite$', '-nano$', '-tiny$'
    ];
    const noToolsRegex = new RegExp('(' + noToolsPatterns.join('|') + ')', 'i');
    if (!noToolsRegex.test(id)) {
        capabilities.tools = true;
    }

    return capabilities;
}

// -----------------------------------------
// Settings Logics
// -----------------------------------------
// -----------------------------------------
// Settings Master-Detail Refactoring
// -----------------------------------------
let tempProviders = [];
let currentProviderIndex = -1;

function openSettings() {
    if (typeof closeAllModals === 'function') closeAllModals();

    tempProviders = JSON.parse(JSON.stringify(state.settings.providers || []));
    currentProviderIndex = tempProviders.length > 0 ? 0 : -1;

    const systemPromptEl = document.getElementById('system-prompt');
    const enableThinkingEl = document.getElementById('enable-thinking');
    const enableSearchEl = document.getElementById('enable-search');

    if (systemPromptEl) systemPromptEl.value = state.settings.systemPrompt || '';
    if (enableThinkingEl) enableThinkingEl.checked = state.settings.enableThinking !== false;
    if (enableSearchEl) enableSearchEl.checked = !!state.settings.enableSearch;
    if (typeof initMCPSettings === 'function') {
        initMCPSettings();
    }

    renderProvidersSidebar();
    renderProviderDetail();

    // Reset tabs
    document.querySelectorAll('.settings-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === 0));

    if (settingsModal) settingsModal.style.display = 'flex';
}

function renderProvidersSidebar() {
    const list = document.getElementById('providers-list-menu');
    list.innerHTML = '';
    tempProviders.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = `provider-menu-item ${index === currentProviderIndex ? 'active' : ''}`;
        item.innerHTML = `
            <i class="ph ph-cloud"></i>
            <span>${escapeHtml(p.name || '未命名服务商')}</span>
        `;
        item.addEventListener('click', () => {
            saveCurrentProviderData();
            currentProviderIndex = index;
            renderProvidersSidebar();
            renderProviderDetail();
        });
        list.appendChild(item);
    });

    document.getElementById('add-provider-btn').onclick = () => {
        saveCurrentProviderData();
        const newP = { id: generateId(), name: '', endpoint: '', apiKey: '', models: '' };
        tempProviders.push(newP);
        currentProviderIndex = tempProviders.length - 1;
        renderProvidersSidebar();
        renderProviderDetail();
    };
}

function saveCurrentProviderData() {
    if (currentProviderIndex === -1 || !tempProviders[currentProviderIndex]) return;
    const detail = document.getElementById('provider-detail-container');
    const nameInput = detail.querySelector('.prov-name');
    if (nameInput) {
        tempProviders[currentProviderIndex].name = nameInput.value.trim();
        tempProviders[currentProviderIndex].apiKey = detail.querySelector('.prov-apikey').value.trim();
        tempProviders[currentProviderIndex].endpoint = detail.querySelector('.prov-endpoint').value.trim();
        // Models are updated via checkbox listeners or on fetch
    }
}

function renderProviderDetail() {
    const container = document.getElementById('provider-detail-container');
    if (currentProviderIndex === -1) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-selection-plus"></i>
                <p>请从左侧选择一个服务商，或点击添加按钮</p>
            </div>
        `;
        return;
    }

    const provider = tempProviders[currentProviderIndex];
    container.innerHTML = `
        <div class="provider-detail-header">
            <h3>服务商配置</h3>
            <button type="button" class="btn btn-ghost btn-danger btn-sm" id="del-current-provider">
                <i class="ph ph-trash"></i> 删除该服务商
            </button>
        </div>
        <div class="form-group">
            <label>服务商名称</label>
            <input type="text" class="prov-name" value="${escapeHtml(provider.name || '')}" placeholder="例如: OpenAI">
        </div>
        <div class="form-group">
            <label>API Key</label>
            <input type="password" class="prov-apikey" value="${escapeHtml(provider.apiKey || '')}" placeholder="sk-...">
        </div>
        <div class="form-group">
            <label>API Endpoint</label>
            <input
                type="url"
                class="prov-endpoint"
                value="${escapeHtml(provider.endpoint || '')}"
                placeholder="例如: https://api.openai.com/v1 或 https://dashscope.aliyuncs.com/v1">
        </div>
        
        <div class="form-group model-directory-section">
            <div class="model-directory-header">
                <div class="model-directory-heading">
                    <span class="model-directory-title">模型目录</span>
                    <span class="model-directory-status" id="model-directory-status"></span>
                </div>
                <div class="model-directory-actions">
                    <button type="button" class="btn-link" id="reset-models-btn">恢复默认模型</button>
                    <button type="button" class="btn-link" id="fetch-models-btn">获取可用模型</button>
                </div>
            </div>
            <div class="model-directory-list" id="model-directory-list">
                <!-- One editable row per model -->
            </div>
            <div class="provider-model-tools">
                <input type="text" class="prov-manual-model" placeholder="手动新增模型 ID（用于不支持 /models 的协议）">
                <button type="button" class="btn btn-ghost btn-sm" id="add-manual-model-btn">
                    <i class="ph ph-plus"></i> 新增模型
                </button>
                <button type="button" class="btn btn-ghost btn-sm" id="test-connection-btn">
                    <i class="ph ph-plug"></i> 测试连接
                </button>
            </div>
            <div class="provider-test-result" id="provider-test-result" style="display:none"></div>
        </div>
    `;

    // 模型目录：一行一个模型，左侧是发给接口的模型 ID，右侧是界面显示名
    const saveModelDirectory = models => {
        provider.allModels = JSON.stringify(models);
        provider.visibleModels = models.map(model => model.id).join(', ');
    };

    const renderModelDirectory = () => {
        const list = container.querySelector('#model-directory-list');
        const status = container.querySelector('#model-directory-status');
        const models = getProviderModelDirectory(provider);
        saveModelDirectory(models);

        if (status) status.textContent = models.length ? '已自定义模型目录' : '内置默认模型目录';
        list.innerHTML = '';
        if (models.length === 0) {
            list.innerHTML = '<div class="model-directory-empty">暂无模型。点击「获取可用模型」拉取服务商列表，或在下方手动新增模型 ID。</div>';
            return;
        }

        models.forEach((model, index) => {
            const row = document.createElement('div');
            row.className = 'model-directory-row';
            row.dataset.modelId = model.id;

            const main = document.createElement('div');
            main.className = 'model-directory-row-main';

            const idInput = document.createElement('input');
            idInput.type = 'text';
            idInput.className = 'model-id-input';
            idInput.value = model.id;
            idInput.placeholder = '模型 ID';
            idInput.setAttribute('aria-label', '模型 ID（发送给接口）');
            idInput.title = '发送给接口的模型 ID';
            idInput.addEventListener('change', () => {
                const nextId = idInput.value.trim();
                if (!nextId) {
                    idInput.value = model.id;
                    showNotification('模型 ID 不能为空', 'error');
                    return;
                }
                if (nextId === model.id) return;
                if (models.some((entry, i) => i !== index && entry.id === nextId)) {
                    idInput.value = model.id;
                    showNotification('该模型 ID 已存在', 'error');
                    return;
                }
                const previousId = model.id;
                model.id = nextId;
                if (!model.name || model.name === previousId) model.name = nextId;
                saveModelDirectory(models);
                renderModelDirectory();
            });

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'model-name-input';
            nameInput.value = model.name && model.name !== model.id ? model.name : '';
            nameInput.placeholder = '显示名称（默认同模型 ID）';
            nameInput.setAttribute('aria-label', '显示名称');
            nameInput.title = '模型选择器里显示的名称，留空则显示模型 ID';
            nameInput.addEventListener('input', () => {
                model.name = nameInput.value.trim() || model.id;
                saveModelDirectory(models);
            });

            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'btn btn-icon btn-ghost btn-sm model-info-toggle';
            toggle.title = '模型参数详情';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<i class="ph ph-caret-right"></i>';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn-icon btn-ghost btn-sm model-row-delete';
            removeBtn.title = '从模型目录移除';
            removeBtn.innerHTML = '<i class="ph ph-trash"></i>';
            removeBtn.addEventListener('click', () => {
                showConfirmDialog(`确认从模型目录中移除模型 ${model.id}？\n下次点击「获取可用模型」时可以重新添加。`, () => {
                    saveModelDirectory(models.filter((entry, i) => i !== index));
                    renderModelDirectory();
                }, null, { confirmText: '移除' });
            });

            const details = document.createElement('div');
            details.className = 'model-directory-row-details';
            if (typeof createModelCapabilityCard === 'function') details.append(createModelCapabilityCard(model));

            toggle.addEventListener('click', () => {
                const expanded = details.classList.toggle('expanded');
                toggle.classList.toggle('expanded', expanded);
                toggle.setAttribute('aria-expanded', String(expanded));
            });

            main.append(idInput, nameInput, toggle, removeBtn);
            row.append(main, details);
            list.append(row);
        });
    };
    renderModelDirectory();

    const resetModelsBtn = container.querySelector('#reset-models-btn');
    if (resetModelsBtn) {
        resetModelsBtn.onclick = () => {
            showConfirmDialog('确认恢复默认模型目录？\n当前目录中的模型与显示名称会被清空，需要重新「获取可用模型」或手动新增。', () => {
                provider.allModels = '';
                provider.visibleModels = '';
                renderProviderDetail();
                renderProvidersSidebar();
                showNotification('已恢复默认模型目录', 'success');
            }, null, { confirmText: '恢复默认' });
        };
    }

    // Bindings
    container.querySelector('#del-current-provider').onclick = () => {
        showConfirmDialog('确认删除此服务商？', () => {
            tempProviders.splice(currentProviderIndex, 1);
            currentProviderIndex = tempProviders.length > 0 ? 0 : -1;
            renderProvidersSidebar();
            renderProviderDetail();
        });
    };

    container.querySelector('#fetch-models-btn').onclick = async () => {
        // IMPORTANT: Save current inputs to tempProviders before fetching and re-rendering
        saveCurrentProviderData();

        const url = (provider.endpoint || '').trim();
        if (!url) { showNotification("请先填写Endpoint", "error"); return; }

        try {
            const btn = container.querySelector('#fetch-models-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 请求中...';

            // Fetch models via main process (API key stays server-side)
            const result = await window.api.fetchProviderModels({
                endpoint: provider.endpoint,
                apiKey: provider.apiKey,
                providerId: provider.id
            });

            if (!result.ok) {
                throw new Error(result.error || '获取模型列表失败');
            }

            const models = result.models || [];

            // 规范化模型对象结构，提取 id 并检测能力
            const normalizedModels = models.map(m => {
                if (!m || (typeof m !== 'object' && typeof m !== 'string')) return null;
                const modelId = m.id || m.name || m.model || (typeof m === 'string' ? m : '');
                if (!modelId) return null;

                // 检测模型能力
                const capabilities = detectModelCapabilities(modelId, m);

                // Best-effort: try to capture context window tokens if provider returns it
                const contextCandidates = [
                    m.contextWindowTokens,
                    m.context_window,
                    m.contextWindow,
                    m.context_length,
                    m.contextLength,
                    m.max_context_tokens,
                    m.maxContextTokens,
                    m.max_input_tokens,
                    m.maxInputTokens,
                    m.input_tokens,
                    m.inputTokens
                ];
                let contextWindowTokens = null;
                for (const v of contextCandidates) {
                    const n = (typeof v === 'string') ? parseInt(v, 10) : v;
                    if (Number.isFinite(n) && n > 0) { contextWindowTokens = n; break; }
                }

                return {
                    ...(typeof m === 'object' ? m : {}),
                    id: modelId,
                    name: m.name || modelId,
                    capabilities,
                    capabilitiesSource: m.capabilities !== undefined || m.vision !== undefined || getModelCapabilityInfo(m).inputTypes ? 'server' : 'inferred',
                    contextWindowTokens: contextWindowTokens
                };
            }).filter(m => m !== null);

            if (normalizedModels.length === 0) {
                throw new Error("未能从任何候选地址获取模型列表，或返回格式不支持");
            }

            // 保留本次没有返回、但已经在目录里的模型；勾选结果在用户确认后写入目录
            const fetchedIds = new Set(normalizedModels.map(model => model.id));
            const keptModels = getProviderModelDirectory(provider).filter(model => !fetchedIds.has(model.id));

            showModelSelectionPanel(normalizedModels, provider, selectedModels => {
                if (!selectedModels) return; // 取消：不改动现有目录
                saveModelDirectory([...keptModels, ...selectedModels]);
                renderProviderDetail();
                renderProvidersSidebar();
                showNotification(`已添加 ${selectedModels.length} 个模型到目录`, "success");
            });

        } catch (e) {
            showNotification("获取失败: " + e.message, "error");
        } finally {
            const btn = container.querySelector('#fetch-models-btn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-arrows-counter-clockwise"></i> 获取可用模型';
            }
        }
    };

    function showTestModelPicker(models, onPick) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay model-selection-overlay';

        const panel = document.createElement('div');
        panel.className = 'model-selection-panel';

        panel.innerHTML = `
            <button class="btn btn-ghost btn-sm model-panel-close" title="关闭">
                <i class="ph ph-x"></i>
            </button>
            <div style="font-weight:600; margin-bottom:10px;">选择要测试的模型</div>
            <input class="model-search-input" placeholder="搜索模型..." />
            <div class="model-selection-list"></div>
        `;

        const close = () => modal.remove();
        panel.querySelector('.model-panel-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        const searchInput = panel.querySelector('.model-search-input');
        const listEl = panel.querySelector('.model-selection-list');

        const renderList = () => {
            const q = (searchInput.value || '').toLowerCase();
            const filtered = (models || []).filter(m => (m || '').toLowerCase().includes(q));
            listEl.innerHTML = '';
            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px;">没有匹配的模型</div>';
                return;
            }
            filtered.forEach((m) => {
                const item = document.createElement('div');
                item.className = 'model-selection-item';
                item.style.cursor = 'pointer';
                item.innerHTML = `<span class="model-name">${escapeHtml(m)}</span><span style="font-size:12px; color:var(--text-muted);">点击测试</span>`;
                item.addEventListener('click', () => {
                    close();
                    onPick(m);
                });
                listEl.appendChild(item);
            });
        };

        searchInput.addEventListener('input', renderList);
        renderList();

        modal.appendChild(panel);
        document.body.appendChild(modal);
        setTimeout(() => searchInput.focus(), 0);
    }

    // Manual add model (for endpoints that don't support /models)
    const addManualBtn = container.querySelector('#add-manual-model-btn');
    if (addManualBtn) {
        addManualBtn.onclick = () => {
            saveCurrentProviderData();
            const input = container.querySelector('.prov-manual-model');
            const modelId = (input?.value || '').trim();
            if (!modelId) {
                showNotification("请输入模型 ID", "error");
                return;
            }

            // 解析当前所有模型（支持新旧格式）
            const all = getProviderModelDirectory(provider);

            // 检查重复
            if (!all.find(m => m.id === modelId)) {
                all.push({
                    id: modelId,
                    name: modelId,
                    capabilities: detectModelCapabilities(modelId),
                    capabilitiesSource: 'inferred'
                });
            }
            saveModelDirectory(all);

            if (input) input.value = '';
            renderProviderDetail();
            renderProvidersSidebar();
            showNotification(`已新增模型：${modelId}`, "success");
        };
    }

    // Test connection (OpenAI-compatible POST /chat/completions)
    const testBtn = container.querySelector('#test-connection-btn');
    if (testBtn) {
        testBtn.onclick = async () => {
            saveCurrentProviderData();

            const resultEl = container.querySelector('#provider-test-result');
            const manualModel = (container.querySelector('.prov-manual-model')?.value || '').trim();

            // 解析所有模型（新JSON格式）
            let allModelsArray = [];
            try {
                const parsed = JSON.parse(provider.allModels || '[]');
                allModelsArray = Array.isArray(parsed) ? parsed.map(m => m.id || m) : [];
            } catch (e) {
                allModelsArray = (provider.allModels || "").split(',').map(m => m.trim()).filter(Boolean);
            }

            const visible = (provider.visibleModels || "").split(',').map(m => m.trim()).filter(Boolean);
            const all = allModelsArray;
            if (!provider.endpoint) { showNotification("请先填写Endpoint", "error"); return; }
            if (!provider.apiKey) { showNotification("请先填写API Key", "error"); return; }

            const runTest = async (modelToTest) => {
                if (!modelToTest) return;
                try {
                    testBtn.disabled = true;
                    testBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 测试中...';
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.className = 'provider-test-result';
                        resultEl.textContent = `请求中... (model=${modelToTest})`;
                    }

                    const res = await window.api.testProviderConnection({
                        endpoint: provider.endpoint,
                        apiKey: provider.apiKey,
                        providerId: provider.id,
                        modelName: modelToTest
                    });

                    if (res?.ok) {
                        const tokens = res.usage?.total_tokens ?? res.usage?.completion_tokens ?? res.usage?.output_tokens ?? '—';
                        const line = `OK · latency=${res.latencyMs}ms · model=${res.model || modelToTest} · tokens=${tokens}`;
                        if (resultEl) {
                            resultEl.className = 'provider-test-result ok';
                            resultEl.textContent = line;
                        }
                        showNotification("连接成功：" + line, "success");
                    } else {
                        const errLine = `FAIL · latency=${res?.latencyMs ?? '—'}ms · ${res?.status ? 'HTTP ' + res.status + ' · ' : ''}${res?.error || 'Unknown error'}`;
                        if (resultEl) {
                            resultEl.className = 'provider-test-result fail';
                            resultEl.textContent = errLine;
                        }
                        showNotification("连接失败：" + errLine, "error");
                    }
                } catch (e) {
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.className = 'provider-test-result fail';
                        resultEl.textContent = 'FAIL · ' + (e.message || String(e));
                    }
                    showNotification("连接失败: " + (e.message || String(e)), "error");
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<i class="ph ph-plug"></i> 测试连接';
                }
            };

            // Build picker models list: prefer visibleModels, fallback to allModels
            let candidates = [...(visible.length ? visible : all)];
            if (manualModel && !candidates.includes(manualModel)) candidates.unshift(manualModel);
            candidates = candidates.filter(Boolean);

            if (candidates.length === 0) {
                const modelToTest = await showInputDialog({
                    title: '测试模型',
                    placeholder: '请输入要测试的模型 ID（例如：MiniMax-M2.5）'
                });
                if (!modelToTest) return;
                await runTest(modelToTest);
                return;
            }

            showTestModelPicker(candidates, runTest);
        };
    }
}

async function exportProviders() {
    saveCurrentProviderData();
    if (tempProviders.length === 0) {
        if (typeof showNotification === 'function') showNotification("没有可导出的服务商配置", "info");
        else alert("没有可导出的服务商配置");
        return;
    }
    // Save via native dialog — notification only fires after user confirms save location
    const result = await window.api.exportProvidersToFile(tempProviders);
    if (result.canceled) return;
    if (result.ok) {
        if (typeof showNotification === 'function') showNotification("导出成功", "success");
    } else {
        if (typeof showNotification === 'function') showNotification("导出失败: " + (result.error || '未知错误'), "error");
        else alert("导出失败: " + (result.error || '未知错误'));
    }
}

function importProviders(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const imported = JSON.parse(event.target.result);
            if (!Array.isArray(imported)) {
                throw new Error("Invalid format");
            }

            const existingIds = new Set(tempProviders.map(p => p.id));
            imported.forEach(p => {
                if (!p.name) return;
                // Basic validation and ID regeneration if needed
                if (existingIds.has(p.id) || !p.id) {
                    p.id = generateId();
                }
                tempProviders.push(p);
                existingIds.add(p.id);
            });

            currentProviderIndex = tempProviders.length - 1;
            renderProvidersSidebar();
            renderProviderDetail();
            if (typeof showNotification === 'function') showNotification("导入成功！已添加到列表末尾", "success");
            else alert("导入成功！");
        } catch (error) {
            if (typeof showNotification === 'function') showNotification("文件格式不正确，导入失败", "error");
            else alert("文件格式不正确，导入失败");
            console.error(error);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

async function handleSettingsSave(e) {
    if (e) e.preventDefault();
    saveCurrentProviderData();
    saveCurrentMCPServerData();

    // Use spread to preserve all existing settings (like lastUsedModel, theme, etc.)
    const newSettings = {
        ...state.settings,
        systemPrompt: document.getElementById('system-prompt').value.trim(),
        enableThinking: document.getElementById('enable-thinking').checked,
        enableSearch: document.getElementById('enable-search').checked,
        providers: tempProviders,
        mcpServers: tempMCPServers
    };

    const saveResult = await window.api.saveSettings(newSettings);
    if (saveResult?.ok === false) {
        showNotification(saveResult.error || '设置保存失败', 'error');
        return;
    }

    state.settings = newSettings;
    // Saved model lists replace earlier discovery results for this provider endpoint.
    for (const provider of state.settings.providers || []) {
        try {
            const models = JSON.parse(provider.allModels || '[]');
            if (Array.isArray(models)) rememberProviderModelMetadata(provider, models);
        } catch (_) { /* legacy comma-separated list */ }
    }
    updateSearchBtnState();

    updateBadge();
    if (typeof renderSearchableModelSelect === 'function') {
        renderSearchableModelSelect();
    }
    closeSettings();
}
