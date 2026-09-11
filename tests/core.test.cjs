const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
const workspace = require('../workspace-core.js');
function setup(url='https://www.douban.com/personage/1/creations?type=writer') {
  const stored={}; const calls=[]; const label={textContent:''};
  const context = new Proxy({},{get(target,key){if(key==='createLinearGradient'||key==='createRadialGradient') return ()=>({addColorStop(){}});if(key==='measureText')return text=>({width:text.length*12});return target[key]||((...args)=>{calls.push([key,...args]);});},set(t,k,v){t[k]=v;return true;}});
  const env={window:{},location:new URL(url),URL,setTimeout,clearTimeout,document:{querySelector:()=>null,createElement:()=>({getContext:()=>context})},chrome:{runtime:{onMessage:{addListener(){}}},storage:{local:{async set(values){Object.assign(stored,values);}}}}};
  const instrumented=source.replace('  injectLauncher();','').replace(/\}\)\(\);\s*$/, 'globalThis.api={state,DEFAULT_SETTINGS,buildExportPlan,drawWall,pageTitle,draftKey,mergeDraftBooks,flushDraft,isDraftBook,preserveCurrentProject};})();');
  vm.createContext(env);vm.runInContext(instrumented,env);
  env.document.querySelector=()=>label;
  return {api:env.api,stored,calls,label,env};
}
test('flow export really draws the configured gap between rows',()=>{
  const {api,calls}=setup();const settings={...api.DEFAULT_SETTINGS,columns:3,gap:24,margin:'compact'};
  const canvas=api.drawWall(Array.from({length:6},()=>({image:{naturalWidth:200,naturalHeight:300}})),settings,'');
  const drawn=calls.filter(c=>c[0]==='drawImage');
  assert.equal(drawn[3][3]-drawn[0][3]-drawn[0][5],24);
  assert.equal(canvas.height,drawn[3][3]+drawn[3][5]);
});
test('planned pages and actual canvases agree across formats and titles',()=>{
  const {api}=setup();
  for(const pageFormat of ['flow','square','portrait','story','landscape']) for(const theme of ['cover','oak','walnut']) for(const titleMode of ['none','top','plaque']) {
    const settings={...api.DEFAULT_SETTINGS,pageFormat,theme,titleMode,width:1000};
    const plan=api.buildExportPlan(23,settings);
    assert.ok(plan.safe);assert.equal(plan.pageCounts.reduce((a,b)=>a+b),23);
    plan.pageCounts.forEach((count,index)=>{
      const canvas=api.drawWall(Array.from({length:count},()=>({image:{naturalWidth:200,naturalHeight:300}})),settings,api.pageTitle(23,settings,index,plan.pageCounts.length));
      assert.equal(canvas.width,plan.layouts[index].width);assert.equal(canvas.height,plan.layouts[index].height);
    });
  }
});
test('draft keys ignore pagination and sorting but isolate authors and roles',()=>{
  const key=url=>setup(url).api.draftKey();
  assert.equal(key('https://www.douban.com/personage/1/creations?type=writer&start=20'),key('https://www.douban.com/personage/1/creations/?sortby=time&type=writer'));
  assert.notEqual(key('https://www.douban.com/personage/1/creations'),key('https://www.douban.com/personage/2/creations'));
  assert.notEqual(key('https://www.douban.com/personage/1/creations?type=writer'),key('https://www.douban.com/personage/1/creations?type=translator'));
});
test('refresh preserves draft ordering, deselection and missing entries, appends new books',()=>{
  const {api}=setup();
  const result=api.mergeDraftBooks([{key:'b',included:false},{key:'a',included:true},{key:'old',included:true}],[{key:'a',included:true},{key:'b',included:true,title:'updated'},{key:'c',included:true}]);
  assert.equal(JSON.stringify(result.map(b=>b.key)),JSON.stringify(['b','a','old','c']));
  assert.equal(result[0].included,false);assert.equal(result[0].title,'updated');
});
test('draft persists settings and ordered selections, never image bytes or transient filters',async()=>{
  const {api,stored}=setup();api.state.loaded=true;
  api.state.books=[{key:'a',title:'书 A',coverUrl:'https://img.doubanio.com/a.jpg',included:false}];
  api.state.settings.titleText='我的书单';api.state.viewQuery='temporary';
  await api.flushDraft();const draft=stored[api.draftKey()];
  assert.equal(draft.settings.titleText,'我的书单');assert.equal(draft.books[0].included,false);assert.equal(draft.viewQuery,undefined);assert.equal(draft.version,1);
});

test('explicit per-page limits are respected without overflowing fixed pages',()=>{
  const {api}=setup();
  for (const pageFormat of ['flow','square','portrait','story','landscape']) {
    const settings={...api.DEFAULT_SETTINGS,pageFormat,booksPerPage:7};
    const plan=api.buildExportPlan(23,settings);
    assert.ok(plan.safe);assert.equal(plan.pageCounts.reduce((a,b)=>a+b,0),23);
    assert.ok(plan.pageCounts.every(n=>n<=7));
    assert.ok(plan.layouts.every(l=>l.naturalHeight<=l.height));
  }
  const single=api.buildExportPlan(23,{...api.DEFAULT_SETTINGS,booksPerPage:7,exportMode:'single'});
  assert.equal(single.pageCounts.length,1);
});

test('recommended layouts are safe and their counts match actual pages',()=>{
  const {api}=setup();
  for (const count of [1,2,8,23,57,2000]) for (const pageFormat of ['flow','square','portrait','story','landscape']) {
    const settings={...api.DEFAULT_SETTINGS,pageFormat,theme:'oak',titleMode:'top'};
    const r=workspace.recommendLayout(count,settings,api.buildExportPlan);
    assert.ok(r && r.columns>=3 && r.columns<=10 && r.booksPerPage>0);
    const plan=api.buildExportPlan(count,{...settings,...r,exportMode:'auto'});
    assert.ok(plan.safe);assert.equal(plan.pageCounts.length,r.pages);
    assert.ok(plan.pageCounts.every(n=>n<=r.booksPerPage));
  }
  assert.equal(workspace.recommendLayout(0,api.DEFAULT_SETTINGS,api.buildExportPlan),null);
});

test('list imports handle quoted CSV, BOM, multiline fields, JSON and missing covers',()=>{
  const csv='\uFEFF书名,封面链接\r\n"书,一",https://img.doubanio.com/a.jpg\r\n"两行\n书名",https://example.com/a.jpg\r\n"他说""好""",\r\n,\r\n';
  const result=workspace.parseBookList(csv,'csv');
  assert.equal(result.books.length,3);
  assert.equal(result.books[0].title,'书,一');assert.ok(result.books[0].coverUrl);
  assert.equal(result.books[1].title,'两行\n书名');assert.equal(result.books[1].coverUrl,'');
  assert.equal(result.books[2].title,'他说"好"');
  assert.equal(workspace.parseBookList('{"books":["A",{"title":" B "},null]}','json').skipped,1);
  assert.equal(workspace.parseBookList('A\n\nB','txt').books.length,2);
  assert.equal(workspace.parseBookList('title\tcoverUrl\nA\tjavascript:alert(1)','tsv').books[0].coverUrl,'');
  assert.throws(()=>workspace.parseBookList('title\n"oops','csv'),/引号/);
  assert.throws(()=>workspace.parseBookList('badheader\nA','csv'),/首行/);
  assert.throws(()=>workspace.parseBookList('[]','json'),/有效书名/);
  assert.throws(()=>workspace.parseBookList(Array(2001).fill('A').join('\n')),/2000/);
});

test('uploaded covers survive source refresh and draft validation allows title-only books',()=>{
  const {api}=setup();const book={key:'a',title:'A',included:true,coverUrl:'dcw-upload:123'};
  assert.equal(api.mergeDraftBooks([book],[{...book,coverUrl:'https://img.doubanio.com/a.jpg'}])[0].coverUrl,book.coverUrl);
  assert.ok(api.isDraftBook({...book,coverUrl:''}));assert.ok(api.isDraftBook(book));
});

test('failed storage prevents switching away from current work',async()=>{
  const {api,env,label}=setup();api.state.loaded=true;api.state.projectId='current-project';
  api.state.books=[{key:'a',title:'A',included:true,coverUrl:''}];
  env.chrome.storage.local.set=async()=>{throw new Error('QuotaExceededError');};
  await assert.rejects(()=>api.preserveCurrentProject(),/已取消切换/);
  assert.equal(api.state.projectId,'current-project');assert.equal(api.state.books.length,1);
  assert.match(label.textContent,/未保存/);
});
