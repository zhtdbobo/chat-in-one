const { getModelParameterInfo, getConversationNumericOverrides, validateModelParameterOverrides,
    buildSamplingRequestConfig, getConversationModelMetadata, rememberProviderModelMetadata,
    getModelCapabilityInfo, changeConversationModel, rememberConversationModelOverrides,
    getProviderModelEntries, getProviderModelDirectory, getModelDisplayName } = require('../../src/js/modelParameters');

test('server defaults retain zero values and do not become request overrides', () => {
    const info=getModelParameterInfo({default_parameters:{temperature:0,top_p:'0.85',max_tokens:1024}});
    expect(info.parameters.temperature.defaultValue).toBe(0);
    expect(info.parameters.top_p.defaultValue).toBe(0.85);
    expect(info.parameters.max_tokens.defaultValue).toBe(1024);
    expect(buildSamplingRequestConfig('model')).toEqual({});
});

test('missing and null defaults remain unknown; output limits are separate from defaults', () => {
    const info=getModelParameterInfo({default_parameters:null,top_provider:{context_length:128000,max_completion_tokens:8192}});
    expect(info.parameters.temperature.defaultValue).toBeUndefined();
    expect(info.parameters.max_tokens.defaultValue).toBeUndefined();
    expect(info.parameters.max_tokens.max).toBe(8192);
    expect(info.contextWindowTokens).toBe(128000);
});

test('parameter schemas supply ranges, fixed values and defaults without guessing by model name', () => {
    const info=getModelParameterInfo({parameters:{temperature:{minimum:0,maximum:1.5,default:0.8},top_p:{const:0.95}}});
    expect(info.parameters.temperature).toMatchObject({min:0,max:1.5,defaultValue:0.8,fixed:false});
    expect(info.parameters.top_p).toMatchObject({min:0.95,max:0.95,defaultValue:0.95,fixed:true});
});

test('only an explicit supported-parameter list disables unsupported parameters', () => {
    expect(getModelParameterInfo({id:'unknown'}).parameters.temperature.supported).toBeNull();
    const info=getModelParameterInfo({supported_parameters:['max_completion_tokens']});
    expect(info.parameters.temperature.supported).toBe(false);
    expect(info.parameters.max_tokens).toMatchObject({supported:true,requestKey:'max_completion_tokens'});
    expect(()=>validateModelParameterOverrides({temperature:0.5},info)).toThrow('不支持');
    expect(()=>validateModelParameterOverrides({},info)).not.toThrow();
});

test('removed history and output controls never become overrides in old or current chats', () => {
    for (const chat of [{maxMessageCount:15,maxOutputTokens:8100},
        {modelSettingsVersion:2,maxMessageCount:1,maxOutputTokens:1},
        {modelSettingsVersion:2,maxMessageCount:100,maxOutputTokens:32768}]) {
        expect(getConversationNumericOverrides({...chat,temperature:0,topP:0.8})).toEqual({temperature:0,top_p:0.8});
    }
});

test('output parameter aliases use the field advertised by the server', () => {
    expect(getModelParameterInfo({supported_parameters:['max_output_tokens']}).parameters.max_tokens)
        .toMatchObject({supported:true,requestKey:'max_output_tokens'});
});

test('provider schemas cannot weaken basic nonnegative and probability validation', () => {
    const info=getModelParameterInfo({parameters:{temperature:{minimum:-1},top_p:{maximum:2}}});
    expect(()=>validateModelParameterOverrides({temperature:-0.5},info)).toThrow();
    expect(()=>validateModelParameterOverrides({top_p:1.5},info)).toThrow();
});

test.each([{temperature:-1},{top_p:1.1},{max_tokens:0},{max_tokens:1.5},{maxMessageCount:0},{maxMessageCount:1.5},{temperature:Infinity}])('rejects invalid manual settings %j', values => {
    expect(()=>validateModelParameterOverrides(values)).toThrow();
});

test('manual values are checked against provider limits and zero temperature is preserved', () => {
    const info=getModelParameterInfo({top_provider:{max_completion_tokens:2048}});
    expect(()=>validateModelParameterOverrides({max_tokens:2049},info)).toThrow('2048');
    expect(buildSamplingRequestConfig('kimi-k2.6',{temperature:0,top_p:0.8,enableThinking:false})).toEqual({temperature:0,top_p:0.8});
});

test('fresh provider metadata is isolated by endpoint and model, and never falls back to stale defaults', () => {
    const provider={id:'test',endpoint:'https://a.invalid',allModels:JSON.stringify([{id:'m',default_parameters:{temperature:0.7}}])};
    rememberProviderModelMetadata(provider,[{id:'m',default_parameters:{temperature:1}}]);
    expect(getModelParameterInfo(getConversationModelMetadata(provider,'m')).parameters.temperature.defaultValue).toBe(1);
    expect(getModelParameterInfo(getConversationModelMetadata({...provider,endpoint:'https://b.invalid'},'m')).parameters.temperature.defaultValue).toBe(0.7);
    rememberProviderModelMetadata(provider,[]);
    expect(getConversationModelMetadata(provider,'m')).toEqual({});
});

test('capability cards separate output caps from defaults and honor explicit input modalities', () => {
    expect(getModelCapabilityInfo({context_length:131072,default_parameters:{max_tokens:2048},top_provider:{max_completion_tokens:32768},architecture:{input_modalities:['text','image']}}))
        .toEqual({contextWindowTokens:131072,maxOutputTokens:32768,inputTypes:['text','image']});
    expect(getModelCapabilityInfo({default_parameters:{max_tokens:2048}}).maxOutputTokens).toBeUndefined();
});

test('unknown or inferred model capabilities stay unpublished instead of becoming server facts', () => {
    expect(getModelCapabilityInfo({id:'future-model',capabilitiesSource:'inferred',capabilities:{vision:true}}).inputTypes).toBeUndefined();
    expect(getModelCapabilityInfo({input_modalities:['text'],capabilities:{vision:true}}).inputTypes).toEqual(['text']);
    expect(getModelCapabilityInfo({capabilities:{vision:false}}).inputTypes).toEqual(['text']);
});

test('switching models isolates manual overrides by provider while preserving common conversation settings', () => {
    const chat={model:'p1|same',modelSettingsVersion:2,temperature:0,topP:0.8,maxOutputTokens:16384,maxMessageCount:20,systemPrompt:'shared',enableThinking:false};
    changeConversationModel(chat,'p2|same');
    expect(getConversationNumericOverrides(chat)).toEqual({temperature:undefined,top_p:undefined});
    expect(chat).toMatchObject({systemPrompt:'shared',enableThinking:false});
    expect(chat.maxMessageCount).toBeUndefined();expect(chat.maxOutputTokens).toBeUndefined();
    chat.temperature=0.4;
    changeConversationModel(chat,'p1|same');
    expect(getConversationNumericOverrides(chat)).toEqual({temperature:0,top_p:0.8});
    changeConversationModel(chat,'p2|same');expect(chat.temperature).toBe(0.4);
});

test('model settings persist through JSON reload and restore-default clears only the current model', () => {
    let chat={model:'p1|a',modelSettingsVersion:2,temperature:0.5};
    rememberConversationModelOverrides(chat);changeConversationModel(chat,'p1|b');chat.temperature=0.9;rememberConversationModelOverrides(chat);
    chat=JSON.parse(JSON.stringify(chat));delete chat.temperature;rememberConversationModelOverrides(chat);
    changeConversationModel(chat,'p1|a');expect(chat.temperature).toBe(0.5);
    changeConversationModel(chat,'p1|b');expect(chat.temperature).toBeUndefined();
});

test('switching models ignores stored output overrides and discards removed controls', () => {
    const chat={model:'p1|a',maxMessageCount:1,maxOutputTokens:1,temperature:0.7,modelParameterOverrides:{'p1|b':{max_tokens:2,temperature:0.9}}};
    changeConversationModel(chat,'p1|b');expect(chat.modelSettingsVersion).toBe(2);expect(chat.maxMessageCount).toBeUndefined();
    expect(chat.maxOutputTokens).toBeUndefined();expect(chat.temperature).toBe(0.9);
    changeConversationModel(chat,'p1|a');expect(chat.temperature).toBe(0.7);expect(chat.maxOutputTokens).toBeUndefined();
});

test('the model directory keeps raw metadata, request ids and interface names apart', () => {
    const provider={id:'p1',allModels:JSON.stringify([
        {id:'deepseek-flash',name:'deepseek-flash',context_length:131072,top_provider:{max_completion_tokens:32768}}])};
    expect(getProviderModelEntries(provider)).toEqual([{id:'deepseek-flash',name:'deepseek-flash',context_length:131072,top_provider:{max_completion_tokens:32768}}]);
    expect(getModelDisplayName(provider,'deepseek-flash')).toBe('deepseek-flash');
    const renamed={...provider,allModels:JSON.stringify([{id:'deepseek-flash',name:'快速模型',context_length:131072}])};
    expect(getModelDisplayName(renamed,'deepseek-flash')).toBe('快速模型');
    expect(getModelDisplayName(renamed,'missing-model')).toBe('missing-model');
    expect(getModelCapabilityInfo(getProviderModelEntries(renamed)[0]).contextWindowTokens).toBe(131072);
});

test('the directory follows the enabled list and keeps enabled ids that lost their catalog entry', () => {
    const provider={id:'p1',allModels:JSON.stringify([{id:'a'},{id:'b'},{id:'c'}]),visibleModels:'b, legacy'};
    expect(getProviderModelDirectory(provider).map(model=>model.id)).toEqual(['b','legacy']);
    expect(getProviderModelDirectory({id:'p1',allModels:provider.allModels,visibleModels:''}).map(model=>model.id)).toEqual(['a','b','c']);
});

test('legacy comma separated model lists and blank entries stay readable', () => {
    const provider={id:'p1',allModels:'old-a, old-b'};
    expect(getProviderModelEntries(provider)).toEqual([{id:'old-a',name:'old-a'},{id:'old-b',name:'old-b'}]);
    expect(getProviderModelEntries({id:'p1',allModels:JSON.stringify([{name:'by-name'},{id:'  '},null])}))
        .toEqual([{id:'by-name',name:'by-name'}]);
    expect(getProviderModelDirectory({id:'p1'})).toEqual([]);
});
