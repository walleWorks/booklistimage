// Local-only UI fixture. Chrome storage and cover downloads are simulated;
// production content.js and content.css are served unchanged.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>豆瓣封面墙测试</title>
<link rel="stylesheet" href="/content.css"><body><div id="content"><h1>测试作者</h1>
<ul class="creations"></ul></div><script>
const entries = Array.from({length:23},(_,i)=>({id:i+1,title:'作品 '+String(i+1).padStart(2,'0')}));
document.querySelector('.creations').innerHTML=entries.map(b=>'<li class="creation"><a href="https://book.douban.com/subject/'+b.id+'/"><img src="https://img.doubanio.com/view/subject/l/public/'+b.id+'.jpg"></a><h2><a href="https://book.douban.com/subject/'+b.id+'/">'+b.title+'</a></h2></li>').join('');
window.chrome={storage:{local:{async get(keys){return Object.fromEntries((keys===null?Object.keys(localStorage):Array.isArray(keys)?keys:[keys]).map(k=>[k,JSON.parse(localStorage.getItem(k)||'null')]))},async set(values){for(const [k,v] of Object.entries(values))localStorage.setItem(k,JSON.stringify(v));}}},runtime:{onMessage:{addListener(){}},sendMessage(message,callback){
if(message.type==='DCW_CANCEL_EXPORT')return Promise.resolve({ok:true});
const number=Number(message.url.match(/(\\d+)\\.jpg/)[1]);
if(sessionStorage.getItem('failCover')===String(number)){setTimeout(()=>callback({ok:false,error:'测试封面失败'}),30);return;}
const canvas=document.createElement('canvas');canvas.width=240;canvas.height=360;
const ctx=canvas.getContext('2d');ctx.fillStyle=['#31584c','#bc6e42','#d4b978','#44576e'][number%4];ctx.fillRect(0,0,240,360);
ctx.fillStyle='#fff';ctx.font='24px sans-serif';ctx.fillText('作品 '+number,30,100);ctx.fillRect(30,130,50,3);
setTimeout(()=>callback({ok:true,dataUrl:canvas.toDataURL()}),30);
}}};
</script><script src="/workspace-core.js"></script><script src="/content.js"></script></body></html>`;
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(['/content.js','/content.css','/workspace-core.js'].includes(pathname)){
    res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');
    res.end(fs.readFileSync(path.join(root,pathname.slice(1))));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);
}).listen(8768,'127.0.0.1',()=>console.log('Fixture: http://127.0.0.1:8768/personage/1/creations?type=writer'));
