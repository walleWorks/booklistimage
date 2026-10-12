const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const context=await chromium.launchPersistentContext('',{
    executablePath:process.env.DCW_TEST_CHROME||'/Users/haojiang/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless:true,viewport:{width:1440,height:980},acceptDownloads:true,
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]
  });
  try{
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
    const url=worker.url().replace('background.js','editor.html');
    const titles=['悉达多','瓦尔登湖','局外人','我们仨','小王子','人间草木','月亮与六便士','百年孤独','一间自己的房间','夜航西飞','活着','山茶文具店','长日将尽'];
    const oldDraft={version:1,updatedAt:1,title:'值得重读的书',projectId:'legacy-project',settings:{theme:'oak',titleText:'值得重读的书'},books:titles.map((title,i)=>({title,key:String(i),coverUrl:'',included:true}))};
    await worker.evaluate(async draft=>{await chrome.storage.local.set({'dcwDraft:v1:/editor.html:books':draft,'dcwProject:legacy-project':draft});},oldDraft);
    await page.goto(url);await page.waitForSelector('#dcw-overlay');
    const waitCanvas=async()=>{try{await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas')?.width>0,{},{timeout:10000});}catch(error){console.error(await page.locator('#dcw-overlay').innerText());throw error;}};
    await waitCanvas();
    assert.ok(await page.locator('#dcw-output').isVisible());
    assert.equal(await page.locator('.dcw-library').count(),0);
    assert.equal(await page.locator('#dcw-columns').count(),0);
    assert.deepEqual(await page.locator('[data-preset]').evaluateAll(buttons=>buttons.map(button=>button.dataset.preset)),['xiaohongshu','x']);
    assert.equal(await page.locator('[data-preset="x"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await page.locator('#dcw-output-canvas canvas').evaluate(c=>[c.width,c.height]),[1600,900]);
    await page.locator('[data-preset="xiaohongshu"]').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas')?.width===1200);
    const xhsSize=await page.locator('#dcw-output-canvas canvas').evaluate(c=>[c.width,c.height]);
    assert.ok(xhsSize[1]>=1500&&xhsSize[1]<=2400&&xhsSize[1]>xhsSize[0]);
    await page.locator('[data-preset="x"]').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas')?.height===900);
    assert.deepEqual(await page.locator('#dcw-output-canvas canvas').evaluate(c=>[c.width,c.height]),[1600,900]);
    const fits=await page.evaluate(()=>{const c=document.querySelector('#dcw-output-canvas canvas').getBoundingClientRect(),s=document.querySelector('.dcw-canvas-shell').getBoundingClientRect();return c.right<=s.right+1&&c.bottom<=s.bottom+1;});assert.ok(fits);
    await page.locator('[data-preset="xiaohongshu"]').click();await waitCanvas();
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card').count(),13);
    await page.getByRole('checkbox',{name:'选择 悉达多',exact:true}).uncheck();
    await page.locator('[data-action="undo"]').click();assert.ok(await page.getByRole('checkbox',{name:'选择 悉达多',exact:true}).isChecked());
    await page.getByRole('button',{name:'前移 瓦尔登湖',exact:true}).click();
    assert.ok((await page.locator('.dcw-book-card').first().innerText()).includes('瓦尔登湖'));
    await page.locator('[data-action="undo"]').click();
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#25473d';ctx.fillRect(0,0,240,360);ctx.fillStyle='#f5ecdc';ctx.font='26px serif';ctx.fillText('悉达多',30,80);return c.toDataURL().split(',')[1];});
    await page.getByRole('button',{name:'更换封面 悉达多',exact:true}).click();
    await page.locator('#dcw-cover-files').setInputFiles({name:'悉达多.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelector('.dcw-book-card img')?.naturalWidth>0);
    await page.locator('#dcw-book-search').fill('悉达多');assert.equal(await page.locator('.dcw-book-card').count(),1);
    await page.getByRole('button',{name:'成品预览',exact:true}).click();await waitCanvas();
    const output=path.join(root,'output/playwright');fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'minimal-preview.png')});
    const preview=await page.locator('#dcw-output-canvas canvas').evaluate(c=>c.toDataURL());
    const downloaded=page.waitForEvent('download');await page.locator('[data-action="export"]').click();
    const download=await downloaded;const file=path.join(output,'minimal-export.png');await download.saveAs(file);
    const same=await page.evaluate(async([a,b])=>{async function pixels(src){const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;}const x=await pixels(a),y=await pixels(b);return x.length===y.length&&x.every((v,i)=>v===y[i]);},[preview,'data:image/png;base64,'+fs.readFileSync(file).toString('base64')]);
    assert.ok(same,'Preview and exported pixels match');
    await page.waitForFunction(()=>!document.querySelector('[data-action="export"]').disabled);
    await page.locator('#dcw-title-text').fill('我的秋日书单');await page.locator('[data-color="#e9eef2"]').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-draft-status').textContent.includes('已保存'));
    const stored=await page.evaluate(()=>chrome.storage.local.get(null));
    assert.deepEqual(stored['dcwDraft:v1:/editor.html:books'],oldDraft);
    assert.deepEqual(stored['dcwProject:legacy-project'],oldDraft);
    await page.reload();await waitCanvas();assert.equal(await page.locator('#dcw-title-text').inputValue(),'我的秋日书单');
    assert.equal(await page.locator('[data-color="#e9eef2"]').getAttribute('aria-pressed'),'true');
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.querySelector('.dcw-dialog').scrollWidth<=390));
    await page.screenshot({path:path.join(output,'minimal-mobile.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: actual extension, X default, dynamic Xiaohongshu portrait, auto pagination, preview-first, legacy drafts untouched, selection/order undo, local cover replacement, filtered preview, pixel-identical export, draft reload, narrow viewport, no page errors');
  }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
