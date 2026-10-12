// Source-page regression. Run fixture-server.cjs first.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://img.doubanio.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="#31584c"/></svg>'}));
    await page.goto('http://127.0.0.1:8768/personage/1/creations?type=writer');
    await page.locator('#dcw-launcher').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas'));
    assert.equal(await page.locator('.dcw-book-card').count(),23);
    assert.ok(await page.locator('#dcw-output').isVisible());
    await page.locator('[data-action="edit-books"]').click();
    await page.getByRole('checkbox',{name:'选择 作品 01',exact:true}).uncheck();
    await page.getByRole('button',{name:'前移 作品 02',exact:true}).click();
    await page.locator('#dcw-book-search').fill('作品 02');
    assert.equal(await page.locator('.dcw-book-card').count(),1);
    await page.getByRole('button',{name:'成品预览',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas'));
    const label=await page.locator('#dcw-output-canvas canvas').getAttribute('aria-label');
    assert.ok(label.includes('作品 02'));assert.ok(!label.includes('作品 01'));
    await page.locator('[data-preset="x"]').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas')?.width===1600);
    await page.waitForFunction(()=>document.querySelector('#dcw-draft-status').textContent.includes('已保存'));
    await page.reload();await page.locator('#dcw-launcher').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-output-canvas canvas')?.width===1600);
    await page.locator('summary').click();await page.locator('[data-action="refresh-books"]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-action="refresh-books"]').disabled);
    await page.locator('[data-action="edit-books"]').click();
    assert.ok(!await page.getByRole('checkbox',{name:'选择 作品 01',exact:true}).isChecked());
    assert.ok((await page.locator('.dcw-book-card').first().innerText()).includes('作品 02'));
    await page.evaluate(()=>sessionStorage.setItem('failCover','2'));
    await page.getByRole('button',{name:'成品预览',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#dcw-preview-status').textContent.includes('占位'));
    await page.evaluate(()=>sessionStorage.removeItem('failCover'));
    await page.locator('[data-action="retry-preview"]').click();
    await page.waitForFunction(()=>document.querySelector('#dcw-preview-status').textContent.includes('相同画幅'));
    assert.deepEqual(errors,[]);
    console.log('PASS: Douban source collection, preview-first, selection/order, filtered preview, preset switch, draft reload, source refresh, failed cover retry');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
