// Shared by the renderer and main process. Missing values mean server defaults.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else Object.assign(root, api);
})(globalThis, function () {
    const discoveredProviderModels = new Map();
    const providerMetadataKey = provider => JSON.stringify([provider?.id, provider?.endpoint]);
    function rememberProviderModelMetadata(provider, models) {
        discoveredProviderModels.set(providerMetadataKey(provider), models);
    }
    function getConversationModelMetadata(provider, modelName) {
        const remote = discoveredProviderModels.get(providerMetadataKey(provider));
        if (remote) return remote.find(model => (model?.id || model?.name || model?.model) === modelName) || {};
        return getProviderModelMetadata(provider, modelName);
    }

    function parameterNumber(value) {
        if (typeof value !== 'number' && typeof value !== 'string') return undefined;
        if (typeof value === 'string' && !value.trim()) return undefined;
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    function getProviderModelMetadata(provider, modelName) {
        let models = [];
        try { models = JSON.parse(provider?.allModels || '[]'); } catch (_) { /* legacy model list */ }
        if (!Array.isArray(models)) return {};
        return models.find(model => (model?.id || model?.name) === modelName) || {};
    }

    // Every model of a provider keeps its raw server metadata; the id is what the request sends,
    // the name is only what the interface shows.
    function getProviderModelEntries(provider) {
        let models = [];
        try { models = JSON.parse(provider?.allModels || '[]'); }
        catch (_) { models = String(provider?.allModels || '').split(','); } // legacy comma separated list
        if (!Array.isArray(models)) models = [];
        return models.map(model => {
            const id = String((typeof model === 'string' ? model : model?.id || model?.name || model?.model) || '').trim();
            if (!id) return null;
            return typeof model === 'object' && model !== null ? { ...model, id, name: model.name || id } : { id, name: id };
        }).filter(Boolean);
    }

    // The model directory is what the pickers offer: the enabled list when it exists, otherwise the
    // legacy fetched catalog, plus any enabled id that has no catalog entry left.
    function getProviderModelDirectory(provider) {
        const entries = getProviderModelEntries(provider);
        const enabled = String(provider?.visibleModels || '').split(',').map(id => id.trim()).filter(Boolean);
        if (!enabled.length) return entries;
        const byId = new Map(entries.map(entry => [entry.id, entry]));
        return enabled.map(id => byId.get(id) || { id, name: id });
    }

    function getModelDisplayName(provider, modelName) {
        const entry = getProviderModelEntries(provider).find(model => model.id === modelName);
        return entry && entry.name && entry.name !== entry.id ? entry.name : modelName;
    }

    function getModelParameterInfo(model = {}) {
        const supported = Array.isArray(model.supported_parameters) ? model.supported_parameters : null;
        const definitions = {
            temperature: { aliases: ['temperature'], min: 0 },
            top_p: { aliases: ['top_p'], min: 0, max: 1 },
            max_tokens: { aliases: ['max_tokens', 'max_completion_tokens', 'max_output_tokens'], min: 1, integer: true }
        };
        const parameters = {};
        for (const [key, definition] of Object.entries(definitions)) {
            const aliases = definition.aliases;
            const schemas = [model.parameters?.properties, model.parameters, model.parameter_schema?.properties, model.parameter_limits];
            const schema = schemas.flatMap(source => aliases.map(alias => source?.[alias]))
                .find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
            const defaults = [model.default_parameters, model.parameter_defaults, model.defaults];
            let defaultValue;
            for (const source of defaults) {
                defaultValue = aliases.map(alias => parameterNumber(source?.[alias])).find(value => value !== undefined);
                if (defaultValue !== undefined) break;
            }
            defaultValue ??= parameterNumber(schema.default ?? schema.default_value ?? schema.defaultValue);
            const fixed = parameterNumber(schema.const ?? (schema.enum?.length === 1 ? schema.enum[0] : undefined));
            if (fixed !== undefined) defaultValue = fixed;
            let max = parameterNumber(schema.maximum ?? schema.max) ?? definition.max;
            if (definition.max !== undefined && max !== undefined) max = Math.min(max, definition.max);
            if (key === 'max_tokens') {
                const caps = [max, model.top_provider?.max_completion_tokens, model.max_output_tokens,
                    model.maxOutputTokens, model.max_completion_tokens, model.maxCompletionTokens,
                    model.limits?.max_output_tokens].map(parameterNumber).filter(value => value > 0);
                if (caps.length) max = Math.min(...caps);
            }
            parameters[key] = {
                supported: schema.supported === false ? false : supported ? aliases.some(alias => supported.includes(alias)) : null,
                defaultValue, min: fixed ?? Math.max(parameterNumber(schema.minimum ?? schema.min) ?? definition.min, definition.min),
                max: fixed ?? max, fixed: fixed !== undefined, integer: !!definition.integer,
                requestKey: key === 'max_tokens' ? aliases.find(alias => supported?.includes(alias)) || key : key
            };
        }
        const contextWindowTokens = [model.contextWindowTokens, model.context_window, model.context_length,
            model.contextWindow, model.contextLength, model.max_context_tokens, model.max_input_tokens,
            model.top_provider?.context_length].map(parameterNumber).find(value => value > 0);
        return { parameters, contextWindowTokens };
    }

    function getModelCapabilityInfo(model = {}) {
        const info = getModelParameterInfo(model);
        const modalities = [model.architecture?.input_modalities, model.input_modalities,
            model.inputModalities, model.modalities?.input].find(Array.isArray);
        let inputTypes;
        if (modalities) inputTypes = modalities.map(value => String(value).toLowerCase());
        else if (model.capabilitiesSource !== 'inferred') {
            const capabilities = model.capabilities;
            if (Array.isArray(capabilities)) inputTypes = ['text', ...(capabilities.includes('vision') ? ['image'] : [])];
            else if (typeof capabilities?.vision === 'boolean' || typeof model.vision === 'boolean') {
                inputTypes = ['text', ...((capabilities?.vision ?? model.vision) ? ['image'] : [])];
            }
        }
        return { contextWindowTokens: info.contextWindowTokens, maxOutputTokens: info.parameters.max_tokens.max, inputTypes };
    }

    function getConversationNumericOverrides(chat = {}) {
        return {
            temperature: parameterNumber(chat.temperature),
            top_p: parameterNumber(chat.topP)
        };
    }

    const modelOverrideFields = { temperature: 'temperature', top_p: 'topP' };
    function rememberConversationModelOverrides(chat) {
        if (!chat.model || chat.isComparisonMode) return;
        const values = getConversationNumericOverrides(chat);
        const stored = chat.modelParameterOverrides && typeof chat.modelParameterOverrides === 'object' && !Array.isArray(chat.modelParameterOverrides)
            ? chat.modelParameterOverrides : {};
        chat.modelParameterOverrides = { ...stored, [chat.model]: Object.fromEntries(Object.keys(modelOverrideFields)
            .filter(key => values[key] !== undefined).map(key => [key, values[key]])) };
    }
    function changeConversationModel(chat, modelId) {
        if (chat.model === modelId) return false;
        rememberConversationModelOverrides(chat);
        chat.model = modelId;
        const saved = Object.prototype.hasOwnProperty.call(chat.modelParameterOverrides || {}, modelId)
            ? chat.modelParameterOverrides[modelId] : {};
        for (const [key, field] of Object.entries(modelOverrideFields)) {
            const value = parameterNumber(saved?.[key]);
            if (value === undefined) delete chat[field];
            else chat[field] = value;
        }
        delete chat.maxMessageCount;
        delete chat.maxOutputTokens;
        chat.modelSettingsVersion = 2;
        return true;
    }

    function validateModelParameterOverrides(values, info = getModelParameterInfo()) {
        const labels = { temperature: '温度', top_p: 'Top P', max_tokens: '单次输出限制' };
        for (const [key, label] of Object.entries(labels)) {
            const value = values[key];
            if (value === undefined || value === null) continue;
            const limits = info.parameters[key];
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(label + '必须是有效数字。');
            if (limits.supported === false) throw new Error('当前模型不支持' + label + '，请清空该输入。');
            if (limits.integer && !Number.isSafeInteger(value)) throw new Error(label + '必须是正整数。');
            if (value < limits.min || (limits.max !== undefined && value > limits.max)) {
                throw new Error(label + '必须在 ' + limits.min + ' 到 ' + (limits.max ?? '服务端支持的上限') + ' 之间。');
            }
        }
        const count = values.maxMessageCount;
        if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) throw new Error('历史消息数量必须是正整数，或留空使用全部历史。');
    }

    function buildSamplingRequestConfig(modelName, req = {}) {
        const config = {};
        validateModelParameterOverrides(req);
        if (req.temperature != null) config.temperature = req.temperature;
        if (req.top_p != null) config.top_p = req.top_p;
        // Thinking remains an explicit UI option; sampling values are never filled in here.
        if (String(modelName || '').trim().toLowerCase() === 'kimi-k2.6' && req.enableThinking !== false) {
            config.thinking = { type: 'enabled' };
        }
        return config;
    }

    return { parameterNumber, getProviderModelMetadata, getProviderModelEntries, getProviderModelDirectory,
        getModelDisplayName, getConversationModelMetadata, rememberProviderModelMetadata, getModelParameterInfo, getModelCapabilityInfo,
        getConversationNumericOverrides, rememberConversationModelOverrides, changeConversationModel,
        validateModelParameterOverrides, buildSamplingRequestConfig };
});
