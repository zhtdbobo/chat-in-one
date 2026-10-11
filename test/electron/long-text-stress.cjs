// Real renderer, preload, IPC, network parser and disk store; all HTTP traffic stays on loopback.
const {app,BrowserWindow} = require('electron');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'chat-in-one-stress-')));
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
process.env.CHAT_IN_ONE_STREAM_IDLE_TIMEOUT_MS='3000';
const {initStore}=require('../../src/js/main/store');
const {setupIpcHandlers}=require('../../src/js/main/ipc');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const expected=new Map(),received=new Map(),cases=[];
const makeOutput=size=>{const prefix='BEGIN\n',suffix='\n<script>0</script>🙂END';return prefix+'长'.repeat(size-prefix.length-suffix.length)+suffix;};
let window,store,stage='initialization';
const server=http.createServer(async(req,res)=>{
    try {
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert(!Object.hasOwn(body,'stream') && !Object.hasOwn(body,'stream_options'),'client must leave response format to the service');
        assert(['max_tokens','max_completion_tokens','max_output_tokens'].every(key=>!Object.hasOwn(body,key)),'removed output controls must not restrict the service response');
        const mode=body.messages[0].content;
        const input=body.messages.at(-1).content;
        received.set(mode,{length:input.length,hash:hash(input)});
        const output=expected.get(mode);
        await delay(80);
        if (mode==='json') {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({model:'stress-model',choices:[{message:{content:output},finish_reason:'stop'}]}));return;}
        res.writeHead(200,{'Content-Type':'text/event-stream'});
        const frame=data=>'data: '+JSON.stringify(data)+'\n\n';
        if(mode==='idle'||mode==='eof') {
            res.write(frame({choices:[{delta:{content:output}}]}));
            if(mode==='eof')res.end();return;
        }
        for(let offset=0;offset<output.length && !res.destroyed;){
            let end=Math.min(offset+4096,output.length);
            if(end<output.length && output.charCodeAt(end-1)>=0xd800 && output.charCodeAt(end-1)<=0xdbff)end++;
            const packet=frame({choices:[{delta:{content:output.slice(offset,end)}}]});offset=end;
            if(!res.write(packet))await Promise.race([new Promise(resolve=>res.once('drain',resolve)),new Promise(resolve=>res.once('close',resolve))]);
            await delay(mode==='cancel'?10:1);
        }
        if(res.destroyed)return;
        res.write(frame({choices:[{delta:{},finish_reason:mode==='terminal-only'?'stop':'length'}]}));
        res.write(frame({choices:[],usage:{completion_tokens:output.length,total_tokens:output.length+input.length}}));
        if(mode!=='terminal-only')res.write('data: [DONE]\n\n');
        // Deliberately leave HTTP open. Correct clients finish on SSE completion.
        const timer=setTimeout(()=>res.end(),30000);res.once('close',()=>clearTimeout(timer));
    }catch(error){if(!res.destroyed){res.writeHead(500);res.end(error.message);}}
});
const hardStop=setTimeout(()=>{console.error('Stress test timed out');app.exit(2);},90000);
async function waitUntil(expression,timeout=30000){
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){if(await window.webContents.executeJavaScript(expression))return;await delay(50);}
    throw new Error('Timed out: '+expression);
}
async function send(mode,inputSize,outputSize,{comparison=false,cancel=false}={}){
    stage=mode+':send';
    const input='入'.repeat(inputSize),output=mode==='idle'||mode==='eof'?'未完成的内容🙂':makeOutput(outputSize);
    expected.set(mode,output);
    await window.webContents.executeJavaScript(`(()=>{
        state.chats=[];createNewChat();const chat=state.chats[0];chat.model='stress-p1|stress-model';chat.systemPrompt=${JSON.stringify(mode)};chat.streamOutput=false;chat.maxMessageCount=1;chat.maxOutputTokens=1;
        chat.isComparisonMode=${comparison};chat.comparisonModels=['stress-p1|stress-model','stress-p2|stress-model'];state.isComparisonMode=${comparison};state.selectedComparisonModels=chat.comparisonModels;
        window.__beats=0;window.__maxGap=0;let last=performance.now();clearInterval(window.__beatTimer);window.__beatTimer=setInterval(()=>{window.__beats++;const now=performance.now();window.__maxGap=Math.max(window.__maxGap,now-last);last=now;},20);
        messageInput.value=${JSON.stringify(input)};sendMessage();
        if(!state.isStreaming)throw Error('long input was blocked');
    })()`);
    if(mode==='idle') {
        await waitUntil('Object.values(state.activeRequests)[0]?.content.length>0');
        const status=await window.webContents.executeJavaScript(`(()=>{const r=Object.values(state.activeRequests)[0];r.lastActivityAt=Date.now()-20000;updateActiveRequestStatus(r);return r.contentDiv.querySelector('.request-status').textContent;})()`);
        assert(status.includes('未收到新片段')&&status.includes('总耗时')&&status.includes('首个回复片段'));
    }
    if(cancel){await waitUntil('Object.values(state.activeRequests)[0]?.content.length>40000');await window.webContents.executeJavaScript('stopChatRequests()');}
    await waitUntil('!state.isStreaming');await delay(150);
    await window.webContents.executeJavaScript('saveChats()');
    stage=mode+':check';
    const facts=await window.webContents.executeJavaScript(`(()=>{
        const chat=state.chats[0],messages=chat.messages.filter(m=>m.role==='assistant');
        const meta=[...document.querySelectorAll('.message-meta')].map(el=>el.textContent).join(' | ');
        const element=document.querySelector('.message.assistant .message-content');
        const originalCopy=copyToClipboard;window.__copied='';copyToClipboard=(value)=>{window.__copied=value};element.querySelector('.copy-btn').click();copyToClipboard=originalCopy;
        const pager=element.querySelector('.long-text-view');let pageLength=0,pageNavigation=true;
        if(pager){pageLength=pager.querySelector('pre').textContent.length;const field=pager.querySelector('input');field.value=field.max;field.dispatchEvent(new Event('change'));pageNavigation=pager.querySelector('pre').textContent.endsWith('END');}
        clearInterval(window.__beatTimer);
        return {statuses:messages.map(m=>m.status),warnings:messages.map(m=>m.warning||m.error||''),lengths:messages.map(m=>m.content.content.length),meta,
            first:messages[0].firstTokenLatency,total:messages[0].totalDurationMs,copyComplete:window.__copied===messages[0].content.content,
            pageLength,pageNavigation,largeAttributes:element.dataset.raw?.length||0,beats:window.__beats,maxGapMs:Math.round(window.__maxGap),controlsRestored:!sendBtn.disabled&&stopBtn.style.display==='none'};
    })()`);
    assert.equal(received.get(mode).length,inputSize);assert.equal(received.get(mode).hash,hash(input));
    assert(facts.controlsRestored&&facts.copyComplete,'controls restored and copy retains complete text: '+JSON.stringify(facts));
    assert(facts.meta.includes('首个回复片段')&&facts.meta.includes('总耗时'),'two explicitly named timings');
    assert(facts.total>=facts.first&&facts.beats>0);
    assert(facts.maxGapMs<1500,'renderer event loop remains responsive');
    const saved=store.get('chats')[0].messages.filter(m=>m.role==='assistant');
    const diskMessages=JSON.parse(fs.readFileSync(store.path,'utf8')).chats[0].messages.filter(m=>m.role==='assistant');
    assert.deepEqual(diskMessages.map(m=>hash(m.content.content)),saved.map(m=>hash(m.content.content)),'actual file retains every output character');
    assert.equal(saved.length,comparison?2:1);
    for(const message of saved){
        if(cancel){assert.equal(message.status,'cancelled');assert(output.startsWith(message.content.content));assert(message.content.content.length>40000);}
        else {assert.equal(hash(message.content.content),hash(output),'no missing or altered characters');}
    }
    if(mode==='idle')assert(facts.statuses.every(s=>s==='error')&&facts.warnings[0].includes('未返回数据'));
    else if(mode==='eof')assert(facts.statuses[0]==='interrupted'&&facts.warnings[0].includes('未提供完成标记'));
    else if(!cancel){assert(facts.statuses.every(s=>s===(mode!=='json'&&mode!=='terminal-only'?'truncated':'complete')));if(output.length>30000)assert(facts.pageLength<=20001&&facts.pageNavigation&&!facts.largeAttributes);}
    // Reload through real get-chats IPC and persisted file, then render the full saved history.
    await window.webContents.executeJavaScript('(async()=>{state.chats=await window.api.getChats();const c=state.chats[0];state.currentChatId=c.id;renderMessages(c.messages)})()');
    assert.equal(await window.webContents.executeJavaScript('state.chats[0].messages.filter(m=>m.role==="assistant")[0].content.content.length'),saved[0].content.content.length);
    const report={mode,inputChars:inputSize,outputChars:saved.map(m=>m.content.content.length),firstReplyMs:facts.first,totalMs:facts.total,maxEventLoopGapMs:facts.maxGapMs,statuses:facts.statuses};
    cases.push(report);console.log(JSON.stringify(report));
}
app.whenReady().then(async()=>{
    try{
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
        const endpoint='http://127.0.0.1:'+server.address().port+'/v1';
        store=await initStore();store.set('chats',[]);
        store.set('settings',{providers:['stress-p1','stress-p2'].map(id=>({id,name:id,endpoint,apiKey:'local-stress-key',models:'stress-model',visibleModels:'stress-model',allModels:JSON.stringify([{id:'stress-model',context_length:8192}])})),skills:[],mcpServers:[],theme:'light',enableThinking:true});
        setupIpcHandlers();
        window=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{preload:path.join(repo,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
        const errors=[];window.webContents.on('console-message',(event,...args)=>{const message=event.message??args[1];if(/Uncaught|ReferenceError|TypeError|SyntaxError|Refused to execute|Failed to load|large text entered/i.test(message||'')){errors.push(String(message));console.error('Renderer:',message);}});
        await window.loadFile(path.join(repo,'index.html'));await waitUntil('state.chats.length>0');
        await window.webContents.executeJavaScript('const originalParse=marked.parse;void (marked.parse=(text,...args)=>{if(text.length>RICH_TEXT_LIMIT)throw Error("large text entered Markdown parser");return originalParse(text,...args)})');
        await send('million',1000000,1000000);
        await send('five-million',5000000,5000000);
        await send('json',1000000,1000000);
        await send('terminal-only',1000,10000);
        await send('eof',1000,1000);
        await send('idle',1000,1000);
        await send('cancel',1000,5000000,{cancel:true});
        await send('comparison',10000,1000000,{comparison:true});
        assert.deepEqual(errors,[]);assert.equal((global.activeStreamControllers||[]).length,0);
        const report={scope:'Local client stress test; loopback mock service, no real accounts or API calls',largestInputChars:5000000,largestOutputChars:5000000,cases};
        if(process.env.CHAT_IN_ONE_STRESS_REPORT)fs.writeFileSync(process.env.CHAT_IN_ONE_STRESS_REPORT,JSON.stringify(report,null,2));
        console.log(JSON.stringify({passed:cases.length,largestInputChars:report.largestInputChars,largestOutputChars:report.largestOutputChars}));
    }catch(error){console.error('Stage:',stage);console.error(error.stack);process.exitCode=1;}
    finally{clearTimeout(hardStop);server.closeAllConnections();server.close();window?.destroy();app.exit(process.exitCode||0);}
});
