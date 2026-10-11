const fs = require('fs');
const path = require('path');
const vm = require('vm');

function setup() {
    const column = () => ({ appendChild: jest.fn() });
    const columns = new Map();
    const settings = { providers: [{ id:'p1', endpoint:'https://test.invalid/v1', apiKey:'__MASKED__',
        allModels:JSON.stringify([{id:'same-model',capabilities:{vision:true}}]) }], mcpServers:[] };
    const chat = {id:'c1',title:'已有对话',model:'p1|same-model',messages:[]};
    const input = {value:'hello',style:{},focus:jest.fn()};
    const doc = { getElementById:jest.fn(id => columns.get(id) || null), querySelector:()=>null };
    const context = vm.createContext({ state:{settings,chats:[chat],currentChatId:'c1',activeRequests:{},
        isStreaming:false,isCompressing:false,selectedComparisonModels:[],enabledMcpServerIds:[]},
        document:doc, window:{api:{sendMessageStream:jest.fn(),saveChats:jest.fn(),stopStream:jest.fn().mockResolvedValue(true),summarizeChat:jest.fn()}},
        messageInput:input, sendBtn:{style:{}}, stopBtn:{style:{}}, messagesList:column(),
        messageContainer:{appendChild:jest.fn()}, welcomeScreen:{style:{}}, currentChatTitle:{},
        console, TextDecoder, Uint8Array, atob: data=>Buffer.from(data,'base64').toString('binary'),
        setTimeout:jest.fn(()=>1),clearTimeout:jest.fn(),setInterval:jest.fn(()=>2),clearInterval:jest.fn(),
        getAllCompanions:()=>[], generateId: (()=>{let id=0;return()=> 'r'+ ++id;})(),
        detectModelCapabilities:()=>({vision:false}), showNotification:jest.fn() });
    for (const file of ['modelParameters.js','longText.js','messageFormatConverter.js','requests.js','chat.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/js',file),'utf8'),context,{filename:file});
    }
    context.renderMessageItem = jest.fn(() => {
        const content = {dataset:{},querySelector:()=>({innerHTML:''})};
        return {querySelector:()=>content,closest:()=>null,replaceWith:jest.fn()};
    });
    context.renderMarkdownSafe=text=>text;
    context.scrollToBottom=jest.fn(); context.renderMessages=jest.fn(); context.saveChats=jest.fn();
    context.renderComparisonEmptyState=jest.fn();
    return { c:context, chat, columns };
}
const part = (name,type,text) => ({name,type,data:'data:'+type+';base64,'+Buffer.from(text).toString('base64')});
const identity = requestId => ({ requestId,chatId:'c1' });

test.each([true, false])('legacy streamOutput=%s does not override the server response format', streamOutput => {
    const { c, chat } = setup(); chat.streamOutput = streamOutput;
    c.sendMessage();
    const request = c.window.api.sendMessageStream.mock.calls[0][0];
    expect(request).not.toHaveProperty('stream');
    expect(request).not.toHaveProperty('stream_options');
});

test('pending requests lock sending and switching before stream-start', () => {
    const {c,chat}=setup(); c.sendMessage();
    expect(c.state.isStreaming).toBe(true);
    expect(c.window.api.sendMessageStream).toHaveBeenCalledTimes(1);
    c.messageInput.value='again'; c.sendMessage(); c.createNewChat(); c.switchChat('other');
    expect(c.window.api.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(c.state.currentChatId).toBe(chat.id);
    expect(c.state.chats).toHaveLength(1);
    expect(c.stopBtn.style.display).toBe('flex');
});

test('same-named comparison models route independently; first completion keeps the pending peer locked', () => {
    const {c,chat,columns}=setup();
    columns.set(c.comparisonColumnId('p1|same-model'),{appendChild:jest.fn()});
    columns.set(c.comparisonColumnId('p2|same-model'),{appendChild:jest.fn()});
    c.beginChatRequests(['p1','p2'].map((providerId,i)=>({requestId:'r'+i,chatId:'c1',providerId,modelName:'same-model',isComparisonStream:true})));
    c.handleStreamChunk({...identity('r0'),content:'A'});
    c.handleStreamChunk({...identity('r1'),content:'B'});
    c.finishChatRequest(identity('r0'));
    expect(c.state.isStreaming).toBe(true);
    expect(chat.messages[0]).toMatchObject({providerId:'p1',comparisonModelId:'p1|same-model',content:{content:'A'}});
    c.finishChatRequest(identity('r1'));
    expect(chat.messages[1]).toMatchObject({providerId:'p2',comparisonModelId:'p2|same-model',content:{content:'B'}});
    expect(c.state.isStreaming).toBe(false);
    for(const value of columns.values()) expect(value.appendChild).toHaveBeenCalledTimes(1);
});

test('stop saves cancellation and ignores late chunks, completion and errors', () => {
    const {c,chat}=setup(); c.sendMessage();
    c.handleStreamChunk({...identity('r1'),content:'partial'});
    c.stopChatRequests();
    expect(c.window.api.stopStream).toHaveBeenCalledWith(['r1']);
    expect(chat.messages[1]).toMatchObject({status:'cancelled',content:{content:'partial'}});
    c.handleStreamChunk({...identity('r1'),content:'late'}); c.finishChatRequest({...identity('r1'),error:'late error'});
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[1].content.content).toBe('partial');
    expect(c.state.isStreaming).toBe(false);
});

test('failed output retains error and partial text after completion arrives', () => {
    const {c,chat}=setup(); c.sendMessage(); c.handleStreamChunk({...identity('r1'),content:'partial'});
    c.finishChatRequest({...identity('r1'),error:'API failed'}); c.finishChatRequest(identity('r1'));
    expect(chat.messages[1]).toMatchObject({status:'error',error:'API failed',content:{content:'partial'}});
    expect(c.prepareMessagesForModel(chat.messages,c.state.settings.providers[0],'same-model')).toHaveLength(1);
});

test('comparison histories include shared messages and only the matching provider and model', () => {
    const {c}=setup(); const provider=c.state.settings.providers[0];
    const messages=[{role:'system',content:'memory'},{role:'user',content:'question'},
        {role:'assistant',comparisonModelId:'p1|same-model',content:{content:'A'}},
        {role:'assistant',comparisonModelId:'p2|same-model',content:{content:'B'}}];
    expect(c.prepareMessagesForModel(messages,provider,'same-model',true).map(m=>m.content)).toEqual(['memory','question','A']);
});

test('normal and comparison paths preserve images and use metadata for custom vision models', () => {
    const {c}=setup(); const provider=c.state.settings.providers[0];
    const message={role:'user',content:{content:'look',attachments:[part('pic.png','image/png','bytes')]}};
    for(const comparison of [false,true]) {
        const content=c.prepareMessagesForModel([message],provider,'same-model',comparison)[0].content;
        expect(content[1]).toMatchObject({type:'image_url',image_url:{url:expect.stringContaining('data:image/png;base64,')}});
    }
    const noVision={...provider,allModels:JSON.stringify([{id:'same-model',capabilities:{vision:false}}])};
    expect(()=>c.prepareMessagesForModel([message],noVision,'same-model')).toThrow('不支持图片');
});

test('PDF uses file input, UTF-8 text becomes text and unsupported binary is rejected', () => {
    const {c}=setup(); const provider=c.state.settings.providers[0];
    const pdf={role:'user',content:{attachments:[part('report.pdf','application/pdf','%PDF')]}};
    expect(c.prepareMessagesForModel([pdf],provider,'same-model')[0].content[0]).toMatchObject({type:'file',file:{filename:'report.pdf',file_data:expect.stringContaining('data:application/pdf;base64,')}});
    const txt={role:'user',content:{content:'read',attachments:[part('notes.txt','text/plain','中文文本')]}};
    expect(c.prepareMessagesForModel([txt],provider,'text-only')[0].content).toContain('中文文本');
    expect(()=>c.attachmentContentPart(part('archive.zip','application/zip','binary'))).toThrow('暂不支持');
});

test('send retains temperature zero and does not commit unsupported attachments', () => {
    const {c,chat,columns}=setup(); chat.temperature=0; c.sendMessage();
    expect(c.window.api.sendMessageStream.mock.calls[0][0].temperature).toBe(0);
    c.finishChatRequest(identity('r1'));
    columns.set('attachments-list',{querySelectorAll:()=>[{dataset:{fileName:'bad.zip',fileType:'application/zip',fileData:'data:application/zip;base64,Yg=='}}]});
    const count=chat.messages.length; c.messageInput.value='bad'; c.sendMessage();
    expect(chat.messages).toHaveLength(count);
    expect(c.messageInput.value).toBe('bad');
    expect(c.window.api.sendMessageStream).toHaveBeenCalledTimes(1);
});

test('compression includes the previous summary, locks changes and preserves messages appended during the await', async () => {
    const {c,chat}=setup();
    chat.messages=[{role:'system',content:'[对话摘要] previous facts'},...Array.from({length:8},(_,i)=>({role:'user',content:'m'+i}))];
    let resolve; c.window.api.summarizeChat.mockImplementation(()=>new Promise(r=>resolve=r));
    const pending=c.compressCurrentChatContext();
    expect(c.state.isCompressing).toBe(true); expect(c.sendBtn.disabled).toBe(true);
    expect(c.window.api.summarizeChat.mock.calls[0][0].messages[0].content).toContain('previous facts');
    c.sendMessage(); c.switchChat('other'); expect(c.window.api.sendMessageStream).not.toHaveBeenCalled();
    const appended={role:'user',content:'new during compression'}; chat.messages.push(appended);
    resolve({ok:true,summary:'combined memory'}); await pending;
    expect(chat.messages).toHaveLength(8); expect(chat.messages[0].content).toContain('combined memory');
    expect(chat.messages.at(-1)).toBe(appended); expect(c.state.isCompressing).toBe(false); expect(c.sendBtn.disabled).toBe(false);
});

test('compression refuses to overwrite edited history and releases controls on failure', async () => {
    const {c,chat}=setup(); chat.messages=Array.from({length:9},(_,i)=>({role:'user',content:'m'+i}));
    let resolve; c.window.api.summarizeChat.mockImplementation(()=>new Promise(r=>resolve=r));
    const pending=c.compressCurrentChatContext(); const edited={role:'user',content:'edited'}; chat.messages[0]=edited;
    resolve({ok:true,summary:'stale summary'}); await pending;
    expect(chat.messages[0]).toBe(edited); expect(c.showNotification).toHaveBeenCalledWith(expect.stringContaining('已发生变化'),'error',6000);
    expect(c.state.isCompressing).toBe(false);
});

test('compression failure keeps the complete original history', async () => {
    const {c,chat}=setup(); chat.messages=Array.from({length:9},(_,i)=>({role:'user',content:'m'+i}));
    const snapshot=chat.messages.slice(); c.window.api.summarizeChat.mockRejectedValue(new Error('offline'));
    await c.compressCurrentChatContext(); expect(chat.messages).toEqual(snapshot); expect(c.state.isCompressing).toBe(false);
});

test('comparison history retains the summary and all matching messages without a count limit', () => {
    const {c}=setup(); const provider={...c.state.settings.providers[0],allModels:'[]'};
    const messages=[{role:'system',content:'memory'},
        {role:'user',content:{content:'old question'}},
        {role:'assistant',comparisonModelId:'p2|same-model',content:{content:'other model'}},
        {role:'user',content:{content:'latest'}}];
    expect(c.prepareMessagesForModel(messages,provider,'same-model',true).map(m=>m.content)).toEqual(['memory','old question','latest']);
});

test('PDF base64 is not tokenized as plain text in context estimates', () => {
    const {c}=setup(); vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/js/utils.js'),'utf8'),c);
    const content=[{type:'text',text:'question'},{type:'file',file:{filename:'x.pdf',file_data:'data:application/pdf;base64,'+'a'.repeat(1000000)}}];
    expect(c.estimateTokensFromMessageContent(content)).toBeLessThan(2000);
});

test('all comparison providers are validated before committing or dispatching any request', () => {
    const {c,chat}=setup(); c.state.settings.providers.push({id:'p2',endpoint:'https://test.invalid/v1',apiKey:''});
    c.state.isComparisonMode=true;c.state.selectedComparisonModels=['p1|same-model','p2|same-model'];
    c.sendMessage(); expect(chat.messages).toHaveLength(0); expect(c.window.api.sendMessageStream).not.toHaveBeenCalled();
    expect(c.state.isStreaming).toBe(false); expect(c.messageInput.value).toBe('hello');
});

test('compression keeps text from legacy multimodal content arrays', async () => {
    const {c,chat}=setup(); chat.messages=Array.from({length:9},(_,i)=>({role:'user',content:'m'+i}));
    chat.messages[0].content=[{type:'text',text:'legacy fact'}];
    c.window.api.summarizeChat.mockResolvedValue({ok:true,summary:'memory'});
    await c.compressCurrentChatContext();
    expect(c.window.api.summarizeChat.mock.calls[0][0].messages[0].content).toContain('legacy fact');
});

test('send omits unspecified sampling and output limits instead of substituting local defaults', () => {
    const {c}=setup();c.sendMessage();const sent=c.window.api.sendMessageStream.mock.calls[0][0];
    for(const key of ['temperature','top_p','max_tokens'])expect(sent).not.toHaveProperty(key);
});

test('removed history count is ignored and both request and context preview retain the full history', () => {
    const {c,chat}=setup();chat.modelSettingsVersion=2;chat.maxMessageCount=1;
    chat.messages=[{role:'system',content:'memory'},...Array.from({length:30},(_,i)=>({role:'user',content:'m'+i}))];
    c.sendMessage();const sent=c.window.api.sendMessageStream.mock.calls[0][0];
    expect(sent.messages).toHaveLength(32);expect(sent.messages[0].content).toBe('memory');
    expect(c.buildMessagesForModelPreview(chat)).toHaveLength(32);
});

test('removed output overrides are ignored even after JSON reload with a published output cap', () => {
    const {c,chat}=setup();Object.assign(chat,JSON.parse('{"modelSettingsVersion":2,"maxOutputTokens":1,"modelParameterOverrides":{"p1|same-model":{"max_tokens":1}}}'));
    c.state.settings.providers[0].allModels=JSON.stringify([{id:'same-model',supported_parameters:['temperature','top_p','max_completion_tokens'],top_provider:{max_completion_tokens:32768}}]);
    c.sendMessage();const sent=c.window.api.sendMessageStream.mock.calls[0][0];
    for(const key of ['max_tokens','max_completion_tokens','max_output_tokens','maxTokenParameter'])expect(sent).not.toHaveProperty(key);
});

test('output-limit termination saves a warning and both timings instead of silently completing', () => {
    const {c,chat}=setup();c.sendMessage();c.handleStreamChunk({...identity('r1'),content:'partial',firstTokenLatency:600});
    c.finishChatRequest({...identity('r1'),finishReason:'length',totalDurationMs:12345});
    expect(chat.messages[1]).toMatchObject({status:'truncated',finishReason:'length',firstTokenLatency:600,totalDurationMs:12345,warning:expect.stringContaining('输出长度上限'),content:{content:'partial'}});
    expect(c.state.isStreaming).toBe(false);expect(c.sendBtn.disabled).toBe(false);
});

test('approximate context estimates warn but do not truncate or block a million-character input', () => {
    const {c}=setup();vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/js/utils.js'),'utf8'),c);
    c.state.settings.providers[0].allModels=JSON.stringify([{id:'same-model',context_length:8192}]);
    const text='长'.repeat(1000000);c.messageInput.value=text;c.sendMessage();
    expect(c.window.api.sendMessageStream).toHaveBeenCalledTimes(1);
    expect(c.window.api.sendMessageStream.mock.calls[0][0].messages[0].content).toBe(text);
    expect(c.showNotification).toHaveBeenCalledWith(expect.stringContaining('完整输入仍会发送'),'warning',8000);
});

test('high-frequency chunks are buffered for one scheduled render and stop preserves all unpainted content', () => {
    const {c,chat}=setup();c.sendMessage();
    for(let i=0;i<1000;i++)c.handleStreamChunk({...identity('r1'),content:'字'});
    expect(c.setTimeout).toHaveBeenCalledTimes(1);c.stopChatRequests();
    expect(chat.messages[1].content.content).toBe('字'.repeat(1000));expect(c.clearInterval).toHaveBeenCalled();
});

test('attachment validation uses the same refreshed input modalities as model capability cards', () => {
    const {c}=setup(),provider=c.state.settings.providers[0];
    c.rememberProviderModelMetadata(provider,[{id:'same-model',capabilities:{vision:true},architecture:{input_modalities:['text']}}]);
    expect(c.getStoredModelCapabilities(provider,'same-model').vision).toBe(false);
    c.rememberProviderModelMetadata(provider,[{id:'same-model',capabilities:{vision:false},architecture:{input_modalities:['text','image']}}]);
    expect(c.getStoredModelCapabilities(provider,'same-model').vision).toBe(true);
});
