// Run with npm run test:electron. Uses a hidden window, mocked IPC and isolated userData.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'chat-in-one-renderer-test-')));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
const provider = id => ({id,name:id,apiKey:'__MASKED__',endpoint:'https://example.invalid/v1',
    models:'same-model',visibleModels:'same-model',allModels:JSON.stringify([{id:'same-model',capabilities:{vision:true}}])});
const settings = {providers:[provider('p1'),provider('p2')],skills:[],mcpServers:[],theme:process.env.CHAT_IN_ONE_TEST_THEME==='dark'?'dark':'light',enableThinking:true};
const sent = [], stopped = [];
async function fetchModels(_, request) {
    await new Promise(resolve=>setTimeout(resolve,request.endpoint.includes('/delayed')?250:70));
    if (request.endpoint.includes('/failed')) return {ok:false,error:'mock metadata failure'};
    const second=request.providerId==='p2';
    return {ok:true,models:[
        {id:'same-model',capabilities:{vision:true},context_length:second?65536:131072,
            architecture:{input_modalities:second?['text']:['text','image']},
            supported_parameters:['temperature','top_p','max_tokens'],
            default_parameters:{temperature:second?0.4:0.7,top_p:second?0.9:1,max_tokens:second?2048:4096},
            top_provider:{max_completion_tokens:second?16384:32768}},
        {id:'kimi-k2.6',supported_parameters:['temperature','top_p','max_tokens']},
        {id:'unsupported',supported_parameters:['max_tokens'],default_parameters:null},
        {id:'fixed',parameters:{temperature:{const:1}}}
    ]};
}
for (const [name, handler] of Object.entries({
    'get-settings':()=>structuredClone(settings), 'get-chats':()=>[], 'save-chats':()=>true,
    'save-settings':()=>true, 'is-maximized':()=>false, 'unmaximize-window':()=>true,
    'maximize-window':()=>true, 'get-app-version':()=> 'test', 'stop-stream':(_,ids)=>{stopped.push(ids);return true;},
    'fetch-provider-models':fetchModels
})) ipcMain.handle(name,handler);
ipcMain.on('update-titlebar-theme',()=>{});
ipcMain.on('send-message-stream',(_,data)=>sent.push(data));
const hardStop=setTimeout(()=>{console.error('Electron smoke test timed out');app.exit(2);},30000);
app.whenReady().then(async()=> {
    const w=new BrowserWindow({show:false,width:1200,height:process.env.CHAT_IN_ONE_TEST_SCREENSHOT?1050:800,webPreferences:{
        preload:path.join(repo,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,
        backgroundThrottling:false,offscreen:!!process.env.CHAT_IN_ONE_TEST_SCREENSHOT}});
    const errors=[];
    w.webContents.on('console-message',(event,...args)=>{
        const message=event.message ?? args[1];
        if (/ReferenceError|TypeError|SyntaxError|Refused to execute|Failed to load/i.test(message||'')) errors.push(String(message));
    });
    try {
        await w.loadFile(path.join(repo,'index.html'));
        const facts=await w.webContents.executeJavaScript(`(async()=>{
            const checks={};
            const assert=(condition,label)=>{ if(!condition) throw new Error(label); checks[label]=true; };
            assert(typeof hljs === 'object' && hljs.getLanguage('javascript'), 'browser highlighter loaded');
            const controls=document.createElement('div');
            controls.innerHTML=renderMarkdownSafe('\x60\x60\x60javascript\\nconst x = 1;\\n\x60\x60\x60');
            assert(controls.querySelectorAll('.code-copy-btn').length===1 && controls.querySelectorAll('.code-preview-btn').length===1,'trusted code buttons survive sanitizing');
            assert(controls.querySelector('.hljs-keyword'),'syntax highlighting applied');
            const malicious=document.createElement('div'); malicious.innerHTML=renderMarkdownSafe('<button onclick="alert(1)">bad</button><img src="x" onerror="alert(1)">');
            assert(!malicious.querySelector('button') && !malicious.querySelector('[onclick],[onerror]'),'untrusted controls and handlers removed');
            assert(document.querySelectorAll('#enable-thinking').length===1 && document.querySelectorAll('#conversation-enable-thinking').length===1,'thinking control IDs unique');
            openSettings(); document.getElementById('enable-thinking').checked=false;
            await document.getElementById('fetch-models-btn').onclick();
            const dialog=document.getElementById('model-selection-modal');
            const options=()=>[...dialog.querySelectorAll('.model-selection-item')];
            const optionFor=id=>options().find(item=>item.dataset.modelId===id);
            assert(dialog && dialog.querySelector('.model-selection-title').textContent==='选择要添加的模型' && dialog.textContent.includes('勾选要添加的模型'),'fetching opens the add-model dialog with its own title and hint');
            assert(options().length===4 && options().every(item=>item.querySelector('input[type="checkbox"]')),'every fetched model is offered with a checkbox');
            assert(optionFor('same-model').querySelector('input').checked && !optionFor('kimi-k2.6').querySelector('input').checked,'models already in the directory start checked');
            dialog.querySelector('.model-select-all').click();
            assert(options().every(item=>item.querySelector('input').checked),'select all ticks every listed model');
            dialog.querySelector('.model-select-all').click();
            assert(options().every(item=>!item.querySelector('input').checked),'select all toggles back to none');
            optionFor('same-model').querySelector('input').click();
            optionFor('kimi-k2.6').querySelector('input').click();
            dialog.querySelector('.model-selection-footer .btn-primary').click();
            assert(!document.getElementById('model-selection-modal'),'confirming the selection closes the dialog');
            assert(JSON.parse(tempProviders[0].allModels).length===2 && tempProviders[0].visibleModels.split(',').map(value=>value.trim()).sort().join(',')==='kimi-k2.6,same-model','only checked models join the directory');
            const fetchedModel=JSON.parse(tempProviders[0].allModels).find(model=>model.id==='same-model');
            assert(fetchedModel.default_parameters.temperature===0.7 && fetchedModel.top_provider.max_completion_tokens===32768 && fetchedModel.supported_parameters.includes('temperature') && fetchedModel.capabilities.vision===true,'provider settings preserve raw parameter and capability metadata');
            const directoryRow=[...document.querySelectorAll('.model-directory-row')].find(row=>row.dataset.modelId==='same-model');
            assert(directoryRow.querySelector('.model-id-input').value==='same-model' && directoryRow.querySelector('.model-name-input').value==='','the directory keeps the request id and leaves the display name empty');
            const fetchedCard=directoryRow.querySelector('.model-directory-row-details');
            assert(!fetchedCard.classList.contains('expanded') && directoryRow.querySelector('.model-info-toggle').getAttribute('aria-expanded')==='false','model details start collapsed behind the expander');
            directoryRow.querySelector('.model-info-toggle').click();
            assert(fetchedCard.classList.contains('expanded') && fetchedCard.querySelector('input[aria-label="上下文窗口（Token）"]').value==='131072' && fetchedCard.querySelector('input[aria-label="最大输出上限（Token）"]').value==='32768' && [...fetchedCard.querySelectorAll('input')].every(input=>input.readOnly||input.disabled),'expanded model details stay read-only');
            const unknownRow=[...document.querySelectorAll('.model-directory-row')].find(row=>row.dataset.modelId==='kimi-k2.6');
            unknownRow.querySelector('.model-info-toggle').click();
            const unknownCard=unknownRow.querySelector('.model-directory-row-details');
            assert(unknownCard.querySelector('input[aria-label="上下文窗口（Token）"]').value==='未提供' && unknownCard.textContent.includes('实际限制以服务端为准') && unknownCard.textContent.includes('不表示模型不支持图片'),'unpublished model details stay unknown with server-decides hints');
            const displayNameInput=directoryRow.querySelector('.model-name-input');
            displayNameInput.value='同款模型'; displayNameInput.dispatchEvent(new Event('input'));
            assert(JSON.parse(tempProviders[0].allModels).find(model=>model.id==='same-model').name==='同款模型' && getModelDisplayName(tempProviders[0],'same-model')==='同款模型','the display name is stored without changing the request id');
            await handleSettingsSave({preventDefault(){}});
            assert(state.settings.enableThinking===false,'global thinking setting saved');
            state.settings.enableThinking=true;
            const activeChat=state.chats.find(c=>c.id===state.currentChatId);
            const waitForMetadata=async()=>{
                for(let i=0;i<100 && document.getElementById('model-parameter-status').textContent.includes('正在');i++) await new Promise(resolve=>setTimeout(resolve,20));
                if(document.getElementById('model-parameter-status').textContent.includes('正在')) throw new Error('metadata did not finish');
            };
            activeChat.model='p1|same-model';
            openConversationSettings();
            const numberIds=['temperature','top-p'];
            const numberInput=id=>document.getElementById(id);
            assert(numberIds.every(id=>numberInput(id).type==='number') && !conversationSettingsModal.querySelector('input[type="range"]'),'conversation numeric settings use inputs');
            assert(!document.getElementById('stream-output'),'conversation leaves response format to the server without a stream toggle');
            numberInput('temperature').value='0.25';
            await waitForMetadata();
            assert(numberInput('temperature').value==='0.25' && numberInput('temperature').placeholder.includes('0.7'),'late metadata preserves typed override and echoes default');
            assert(!numberInput('max-output-tokens'),'output override input is removed');
            assert(!numberInput('max-message-count'),'history count input is removed');
            const originalTitle=activeChat.title;
            numberInput('top-p').value='2';document.getElementById('conversation-name').value='invalid title';saveConversationSettings();
            assert(conversationSettingsModal.style.display==='flex' && activeChat.title===originalTitle && activeChat.temperature===undefined,'invalid input cannot partially save settings');
            document.getElementById('conversation-name').value=originalTitle;
            numberInput('temperature').value='0';numberInput('top-p').value='0.8';activeChat.maxOutputTokens=1;activeChat.maxMessageCount=1;
            saveConversationSettings();
            assert(activeChat.temperature===0 && activeChat.topP===0.8 && !Object.hasOwn(activeChat,'maxOutputTokens') && !Object.hasOwn(activeChat,'maxMessageCount'),'saving retains sampling overrides and removes obsolete output and history controls');
            openConversationSettings();await waitForMetadata();
            assert(numberInput('temperature').value==='0' && numberInput('top-p').value==='0.8','saved overrides reopen as values');
            resetModelSettings();saveConversationSettings();
            assert(numberIds.every((id,index)=>!Object.hasOwn(activeChat,['temperature','topP'][index])) && activeChat.modelSettingsVersion===2,'restore defaults clears saved numeric overrides');
            activeChat.model='p1|kimi-k2.6';openConversationSettings();await waitForMetadata();
            assert(numberInput('temperature').value==='' && document.getElementById('temperature-hint').textContent.includes('未提供'),'unpublished defaults remain unknown');
            closeConversationSettings();
            activeChat.model='p1|unsupported';openConversationSettings();await waitForMetadata();
            assert(numberInput('temperature').disabled && numberInput('top-p').disabled,'explicitly unsupported parameters are disabled');
            closeConversationSettings();activeChat.model='p1|fixed';openConversationSettings();await waitForMetadata();
            assert(numberInput('temperature').disabled && numberInput('temperature').placeholder.includes('固定：1'),'server fixed parameter is displayed without an override');
            closeConversationSettings();
            activeChat.model='p1|same-model';activeChat.isComparisonMode=true;activeChat.comparisonModels=['p1|same-model','p2|same-model'];
            openConversationSettings();await waitForMetadata();
            assert(document.getElementById('temperature-hint').textContent.includes('p1 / same-model：0.7') && document.getElementById('temperature-hint').textContent.includes('p2 / same-model：0.4'),'comparison echoes per-provider defaults');
            closeConversationSettings();activeChat.isComparisonMode=false;delete activeChat.comparisonModels;
            const p1=state.settings.providers.find(p=>p.id==='p1');const endpoint=p1.endpoint;
            p1.endpoint=endpoint+'/delayed';activeChat.model='p1|same-model';openConversationSettings();
            closeConversationSettings();activeChat.model='p2|same-model';openConversationSettings();await waitForMetadata();
            await new Promise(resolve=>setTimeout(resolve,300));
            assert(numberInput('temperature').placeholder.includes('0.4') && !numberInput('temperature').placeholder.includes('0.7'),'closed form response cannot overwrite reopened model settings');
            closeConversationSettings();p1.endpoint=endpoint+'/failed';activeChat.model='p1|same-model';openConversationSettings();await waitForMetadata();
            assert(document.getElementById('model-parameter-status').textContent.includes('读取失败') && numberInput('temperature').value==='' && !numberInput('temperature').disabled,'metadata failure keeps default mode and manual input usable');
            closeConversationSettings();p1.endpoint=endpoint;
            activeChat.model='p1|kimi-k2.6';openConversationSettings();
            document.getElementById('conversation-enable-thinking').checked=false;saveConversationSettings();
            assert(activeChat.enableThinking===false && state.settings.enableThinking===true,'conversation thinking setting independent');
            activeChat.model='p1|same-model';activeChat.temperature=0;rememberConversationModelOverrides(activeChat);
            state.settings.providers.find(provider=>provider.id==='p1').visibleModels+=', unsupported';
            renderSearchableModelSelect();openConversationSettings();await waitForMetadata();
            const pick=id=>{const option=document.querySelector('#model-options-list .select-option[data-value="'+id+'"]');if(!option)throw Error('missing model selector option: '+id);option.click();};
            pick('p2|same-model');await waitForMetadata();
            assert(activeChat.temperature===undefined && numberInput('temperature').value==='' && numberInput('temperature').placeholder.includes('0.4'),'model selector starts another provider with its own defaults');
            const p2Meta=getConversationModelMetadata(state.settings.providers.find(p=>p.id==='p2'),'same-model');
            const p2Info=getModelParameterInfo(p2Meta);
            assert(p2Info.contextWindowTokens===65536 && p2Info.parameters.max_tokens.max===16384 && getModelCapabilityInfo(p2Meta).inputTypes.join()==='text','model switch loads that provider context output cap and image support');
            numberInput('temperature').value='0.3';numberInput('top-p').value='0.85';saveConversationSettings();
            pick('p1|same-model');openConversationSettings();await waitForMetadata();
            assert(numberInput('temperature').value==='0','switching back restores that models manual settings');
            document.getElementById('conversation-name').value='unsaved name';
            pick('p2|same-model');await waitForMetadata();
            assert(numberInput('temperature').value==='0.3' && numberInput('top-p').value==='0.85' && document.getElementById('conversation-name').value==='unsaved name','switching models preserves common form edits and restores separate overrides');
            pick('p1|unsupported');await waitForMetadata();
            assert(numberInput('temperature').disabled && numberInput('top-p').disabled,'unsupported fields update on switch');
            pick('p1|same-model');await waitForMetadata();closeConversationSettings();
            const chat=state.chats.find(c=>c.id===state.currentChatId);
            chat.model='p1|same-model';chat.temperature=0;
            chat.maxOutputTokens=1;chat.maxMessageCount=1;
            messageInput.value='pending'; sendMessage();
            const first=Object.values(state.activeRequests)[0];
            assert(state.isStreaming && first && stopBtn.style.display==='flex','pending send is locked and stoppable');
            messageInput.value='duplicate';sendMessage();createNewChat();switchChat('missing');
            assert(Object.keys(state.activeRequests).length===1 && state.currentChatId===chat.id,'duplicate sends and switching blocked');
            stopChatRequests();
            handleStreamChunk({requestId:first.requestId,chatId:chat.id,content:'late'});
            assert(!state.isStreaming && chat.messages.at(-1).status==='cancelled' && !chat.messages.at(-1).content.content,'stop ignores stale chunks');
            chat.messages=[];chat.isComparisonMode=true;chat.comparisonModels=['p1|same-model','p2|same-model'];
            state.isComparisonMode=true;state.selectedComparisonModels=chat.comparisonModels.slice();
            messageInput.value='compare';sendMessage();
            const requests=Object.values(state.activeRequests);
            assert(requests.length===2 && document.querySelectorAll('.comparison-column').length===2,'comparison creates all pending columns');
            const a=requests.find(r=>r.providerId==='p1'), b=requests.find(r=>r.providerId==='p2');
            handleStreamChunk({requestId:a.requestId,chatId:chat.id,content:'answer A'});
            finishChatRequest({requestId:a.requestId,chatId:chat.id});
            assert(state.isStreaming && chat.messages.at(-1).comparisonModelId==='p1|same-model','first completion keeps pending peer locked');
            handleStreamChunk({requestId:b.requestId,chatId:chat.id,content:'partial B'});
            finishChatRequest({requestId:b.requestId,chatId:chat.id,error:'API test error'});
            assert(!state.isStreaming,'comparison unlocks after all finish');
            const bColumn=document.getElementById(comparisonColumnId('p2|same-model'));
            assert(bColumn.textContent.includes('API test error') && bColumn.closest('.comparison-column').querySelector('.model-status').textContent==='发生错误','comparison error is retained');
            renderMessages(chat.messages);
            assert(document.getElementById(comparisonColumnId('p1|same-model')).textContent.includes('answer A') && !document.getElementById(comparisonColumnId('p1|same-model')).textContent.includes('partial B'),'same-named provider histories isolated');
            assert(document.getElementById(comparisonColumnId('p2|same-model')).closest('.comparison-column').querySelector('.model-status').textContent==='发生错误','error status survives comparison reload');
            state.isComparisonMode=false;renderMessages(chat.messages);
            assert(messagesList.textContent.includes('API test error') && messagesList.textContent.includes('发生错误'),'error survives normal history layout');
            chat.isComparisonMode=true;chat.comparisonModels=['p1|same-model','p2|same-model'];
            const normalChat={id:'normal-switch-test',title:'normal switch test',model:'p1|same-model',messages:[{role:'user',content:'normal-only history'}]};
            state.chats.push(normalChat);state.isComparisonMode=true;switchChat(normalChat.id);
            assert(!messagesList.querySelector('.comparison-grid-container') && messagesList.textContent.includes('normal-only history') && !messagesList.textContent.includes('answer A'),'switch synchronously replaces comparison history with normal layout');
            switchChat(chat.id);
            assert(messagesList.querySelectorAll('.comparison-grid-container .comparison-column').length===2 && document.getElementById(comparisonColumnId('p1|same-model')).textContent.includes('answer A'),'switch synchronously restores comparison layout before the next send');
            state.isComparisonMode=false;renderMessages(chat.messages);
            const probe='let parentAccess,topAccess;try{parentAccess=typeof parent.api}catch(e){parentAccess="blocked"}try{topAccess=typeof top.api}catch(e){topAccess="blocked"}console.log("preview executed", typeof window.api, parentAccess,topAccess);document.body.dataset.probe="ok";';
            const previewMessage=renderMessageItem('assistant',{content:'\x60\x60\x60javascript\\n'+probe+'\\n\x60\x60\x60'});
            messagesList.appendChild(previewMessage);
            previewMessage.querySelector('.code-preview-btn').click();
            for(let i=0;i<60 && !document.getElementById('sandbox-console-output').textContent.includes('preview executed');i++) await new Promise(r=>setTimeout(r,50));
            const output=document.getElementById('sandbox-console-output').textContent;
            assert(output.includes('preview executed undefined blocked blocked'),'JavaScript preview runs without the application bridge');
            closeSandbox();
            openSandbox('<!doctype html><html><head><script>console.log("full html executed")</'+'script></head><body>test</body></html>','html');
            for(let i=0;i<60 && !document.getElementById('sandbox-console-output').textContent.includes('full html executed');i++) await new Promise(r=>setTimeout(r,50));
            assert(document.getElementById('sandbox-console-output').textContent.includes('full html executed'),'full HTML preview executes and forwards console');
            closeSandbox();chat.isComparisonMode=false;chat.model='p1|same-model';delete chat.temperature;
            openConversationSettings();await waitForMetadata();
            conversationSettingsModal.querySelector('.conversation-settings-body').scrollTop=10000;
            return checks;
        })()`);
        assert.equal(sent.length,3,'main IPC received one regular and two comparison requests');
        assert(sent.every(request=>!Object.hasOwn(request,'stream')&&!Object.hasOwn(request,'stream_options')),'renderer requests omit stream configuration');
        assert.equal(sent[0].temperature,0);
        assert(sent.every(request=>!Object.hasOwn(request,'max_tokens')&&!Object.hasOwn(request,'maxTokenParameter')),'obsolete output limits are not sent');
        assert.equal(stopped.length,1);
        assert.deepEqual(stopped[0],[sent[0].requestId]);
        assert.deepEqual(errors,[],'no renderer JavaScript or resource loading errors');
        if (process.env.CHAT_IN_ONE_TEST_SCREENSHOT) {
            await w.webContents.executeJavaScript('document.querySelectorAll(".notification").forEach(item=>item.remove());conversationSettingsModal.querySelector(".conversation-settings-body").scrollTop=conversationSettingsModal.querySelector(".specific-model-settings").offsetTop-24');
            await w.webContents.executeJavaScript('conversationSettingsModal.getAnimations({subtree:true}).forEach(animation=>animation.finish())');
            await w.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            const bounds=await w.webContents.executeJavaScript('(()=>{const r=conversationSettingsModal.querySelector(".conversation-settings-content").getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()');
            const screenshot=await w.webContents.capturePage(bounds,{stayHidden:true});
            fs.writeFileSync(process.env.CHAT_IN_ONE_TEST_SCREENSHOT,screenshot.toPNG());
        }
        console.log(JSON.stringify({passed:Object.keys(facts).length+7,checks:facts},null,2));
    } catch(error) { console.error(error.stack); console.error(JSON.stringify(errors)); for (const frame of w.webContents.mainFrame.framesInSubtree) { try { console.error(JSON.stringify({url:frame.url,state:await frame.executeJavaScript('({url:location.href,html:document.documentElement.outerHTML.slice(0,2000),api:typeof window.api})')})); } catch (_) {} } process.exitCode=1; }
    finally { clearTimeout(hardStop);w.destroy();app.exit(process.exitCode||0); }
});
