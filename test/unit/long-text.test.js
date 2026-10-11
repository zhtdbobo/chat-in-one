const {MessageTextBuffer,countMessageWords,getMessageRawText}=require('../../src/js/longText');

test('million-character buffers retain Unicode across fragmented input and arbitrary display ranges',()=>{
    const text=('中文🙂\n').repeat(200000),buffer=new MessageTextBuffer();
    for(let i=0;i<text.length;i+=137)buffer.append(text.slice(i,i+137));
    expect(buffer.text()).toBe(text);expect(buffer.length).toBe(text.length);
    for(const start of [0,19999,30001,999000])expect(buffer.slice(start,start+20000)).toBe(text.slice(start,start+20000));
    expect(getMessageRawText({messageTextBuffer:buffer})).toBe(text);
});

test('copy data can live outside DOM attributes and mixed-language counts stay consistent',()=>{
    expect(getMessageRawText({rawText:'full text',dataset:{}})).toBe('full text');
    expect(countMessageWords('你好 world test')).toBe(4);
    expect(countMessageWords('中'.repeat(1000000))).toBe(1000000);
});
