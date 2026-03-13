/**
 * 消息格式转换器
 * 根据不同的API提供商，将消息转换为对应的格式
 * 支持的格式：OpenAI、Claude、Gemini、Qwen、DeepSeek、Ernie、Hunyuan
 */

/**
 * 根据endpoint推断provider type
 * @param {string} endpoint - API endpoint
 * @returns {string} provider type
 */
function inferProviderTypeFromEndpoint(endpoint) {
    if (!endpoint) return 'openai'; // 默认
    
    const lower = endpoint.toLowerCase();
    
    // OpenAI系
    if (lower.includes('openai.com') || lower.includes('api.openai.com')) return 'openai';
    if (lower.includes('azure.com')) return 'openai-azure';
    
    // Anthropic Claude
    if (lower.includes('anthropic.com')) return 'anthropic';
    
    // Google Gemini
    if (lower.includes('generativelanguage.googleapis.com') || lower.includes('google.com')) return 'gemini';
    
    // 阿里云 Qwen
    if (lower.includes('dashscope') || lower.includes('aliyun') || lower.includes('aliyuncs')) return 'qwen';
    
    // DeepSeek
    if (lower.includes('deepseek.com') || lower.includes('api.deepseek')) return 'deepseek';
    
    // 百度 Ernie
    if (lower.includes('baidubce.com') || lower.includes('baidu')) return 'baidu';
    
    // 腾讯 Hunyuan
    if (lower.includes('hunyuan') || lower.includes('tencentcloud')) return 'hunyuan';
    
    // xAI Grok
    if (lower.includes('xai')) return 'xai';
    
    // Perplexity
    if (lower.includes('perplexity')) return 'perplexity';
    
    // 默认使用OpenAI兼容格式
    return 'openai';
}

function convertMessageForProvider(providerId, messages, endpoint) {
    // 如果提供了endpoint，优先从endpoint推断provider type
    let providerType = providerId?.toLowerCase();
    
    if (endpoint) {
        providerType = inferProviderTypeFromEndpoint(endpoint);
    }
    
    switch (providerType) {
        case 'openai':
        case 'openai-azure':
        case 'xai':
        case 'perplexity':
            return convertToOpenAIFormat(messages);
            
        case 'anthropic':
            return convertToClaudeFormat(messages);
            
        case 'google':
        case 'gemini':
            return convertToGeminiFormat(messages);
            
        case 'alibaba':
        case 'qwen':
        case 'aliyun':
            return convertToQwenFormat(messages);
            
        case 'deepseek':
            return convertToDeepSeekFormat(messages);
            
        case 'baidu':
        case 'ernie':
            return convertToErnieFormat(messages);
            
        case 'tencent':
        case 'hunyuan':
            return convertToHunyuanFormat(messages);
            
        default:
            // 默认使用OpenAI兼容格式
            return convertToOpenAIFormat(messages);
    }
}

/**
 * OpenAI格式
 * 图片使用URL_BASE64编码: { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }
 */
function convertToOpenAIFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            // Content是数组（包含文本和图片）
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    // 转换为OpenAI格式
                    const base64Data = item.source?.data || item.data || '';
                    const mediaType = item.source?.media_type || 'image/jpeg';
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mediaType};base64,${base64Data}`,
                            detail: 'auto'
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

/**
 * Claude格式（Anthropic）
 * 图片使用source: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
 */
function convertToClaudeFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    // 保持Claude格式
                    return {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: item.source?.media_type || 'image/jpeg',
                            data: item.source?.data || item.data || ''
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

/**
 * Gemini格式（Google）
 * 图片使用inlineData: { mimeType: "image/jpeg", data: "base64数据" }
 */
function convertToGeminiFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    // 转换为Gemini格式
                    return {
                        type: 'image',
                        inlineData: {
                            mimeType: item.source?.media_type || 'image/jpeg',
                            data: item.source?.data || item.data || ''
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

/**
 * Qwen格式（阿里云）
 * Qwen支持多种格式，优先使用base64
 */
function convertToQwenFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    // 使用OpenAI兼容格式
                    const base64Data = item.source?.data || item.data || '';
                    const mediaType = item.source?.media_type || 'image/jpeg';
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mediaType};base64,${base64Data}`
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

/**
 * DeepSeek格式
 * DeepSeek支持OpenAI兼容格式
 */
function convertToDeepSeekFormat(messages) {
    return convertToOpenAIFormat(messages);
}

/**
 * Baidu Ernie格式
 * Ernie支持base64编码的图片
 */
function convertToErnieFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    // Ernie使用类似OpenAI的格式
                    const base64Data = item.source?.data || item.data || '';
                    const mediaType = item.source?.media_type || 'image/jpeg';
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mediaType};base64,${base64Data}`
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

/**
 * Tencent Hunyuan格式
 * Hunyuan支持base64编码的图片
 */
function convertToHunyuanFormat(messages) {
    return messages.map(msg => {
        if (Array.isArray(msg.content)) {
            const contentArray = msg.content.map(item => {
                if (item.type === 'text') {
                    return { type: 'text', text: item.text };
                } else if (item.type === 'image') {
                    const base64Data = item.source?.data || item.data || '';
                    const mediaType = item.source?.media_type || 'image/jpeg';
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mediaType};base64,${base64Data}`
                        }
                    };
                }
                return item;
            });
            return { role: msg.role, content: contentArray };
        }
        return msg;
    });
}

// 如果在Node.js环境中使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        convertMessageForProvider,
        convertToOpenAIFormat,
        convertToClaudeFormat,
        convertToGeminiFormat,
        convertToQwenFormat,
        convertToDeepSeekFormat,
        convertToErnieFormat,
        convertToHunyuanFormat
    };
}
