const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

const otherBook=(id,title)=>`<li class="single-book" data-book-id="${id}"><a href="/book/${id}/buy"><picture><source type="image/webp" data-srcset="https://fivebooks.com/images/large/${id}.webp 234w"></picture><h2 class="book-title"><span class="title">${title}</span></h2></a></li>`;
const otherArticle=(id,heading,books)=>`<article id="${id}" class="archive-interview"><section class="book-list"><h3 class="interview-title -archive"><a href="/best-books/interview-${id}/">${heading}</a></h3><ul>${books.map(([bookId,title])=>otherBook(bookId,title)).join('')}</ul></section></article>`;
const fixture=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Five Books fixture</title><body>
<div class="twenty-col page-content people"><div class="main-content"><h1>Books by Test Expert</h1><p>Test Expert writes about books.</p><h3 class="block-heading">Books by Test Expert</h3>
  <div class="book-container"><div class="row" data-book-id="10"><picture><source type="image/webp" data-srcset="https://fivebooks.com/images/small/authored.webp 117w, https://fivebooks.com/images/large/authored.webp 234w"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></picture><h2 class="book-title"><a href="/book/authored-book/">Authored Book</a></h2></div></div>
</div></div>
<div class="main-content"><div class="infinite-container">
  <h3 class="block-heading">Interviews with Test Expert</h3>
  <article class="archive-interview"><section class="book-list"><h3 class="interview-title -archive"><a href="/best-books/test-expert-on-reason/">The best books on <span class="subject">Reason</span>, recommended by Test Expert</a></h3><ul class="books"><div class="books-themselves"><div class="row">
    <li class="single-book" data-book-id="101"><a href="https://fivebooks.com/book/first-recommendation/buy"><div class="cover-wrap"><picture>
      <source type="image/webp" data-srcset="https://fivebooks.com/images/small/first.webp 117w, https://fivebooks.com/images/large/first.webp 234w">
      <img class="cover" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
    </picture></div><h2 class="book-title -listbook"><span class="title">First Recommendation</span><br>by First Author</h2></a></li>
    <li class="single-book" data-book-id="102"><a href="https://fivebooks.com/book/second-recommendation/listen"><div class="cover-wrap"><picture>
      <source type="image/webp" data-srcset="https://fivebooks.com/images/small/second.webp 117w, https://fivebooks.com/images/large/second.webp 234w">
      <img class="cover" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
    </picture></div><h2 class="book-title -listbook"><span class="title">Second Recommendation</span><br>by Second Author</h2></a></li>
  </div></div></ul></section></article>
</div></div>
<div class="main-content"><div class="infinite-container"><h3 class="block-heading">Interviews where books by Test Expert were recommended</h3>
  ${otherArticle(5971,'The best books on <span class="subject">Trust and Modern Society</span>, recommended by Bruce Schneier',[[201,'The Penguin and the Leviathan'],[202,'The Folly of Fools'],[203,'The Murderer Next Door'],[204,'The Better Angels of Our Nature'],[205,'Braintrust']])}
  ${otherArticle(1598,'Rebecca Goldstein on <span class="subject">Reason and its Limitations</span>',[[203,'Republic'],[204,'Middlemarch']])}
  ${otherArticle(55136,'<span class="subject">Grammar Books That Prove What They Preach</span>, recommended by Lane Greene',[[205,'Shorter Oxford English Dictionary'],[206,'The Sense of Style']])}
  ${otherArticle(4170,'The best books on <span class="subject">Language and the Mind</span>, recommended by Lane Greene',[[207,'Through the Language Glass'],[208,'The First Word']])}
</div></div></body></html>`;

(async()=>{
  const root=path.resolve(__dirname,'..');
  const context=await chromium.launchPersistentContext('',{
    executablePath:process.env.DCW_TEST_CHROME||'/Users/haojiang/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless:true,viewport:{width:1440,height:980},acceptDownloads:true,
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]
  });
  try {
    await context.route('https://fivebooks.com/people/test-expert/',route=>route.fulfill({contentType:'text/html',body:fixture}));
    await context.route('https://fivebooks.com/images/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="234" height="360"><rect width="234" height="360" fill="#31584c"/></svg>'}));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const assertDownload=async(title)=>{
      const pending=page.waitForEvent('download');
      await page.locator('[data-action="export"]').click();
      const download=await pending;
      assert.ok(download.suggestedFilename().includes(title));
      assert.equal(await download.failure(),null);
      await page.waitForFunction(()=>!document.querySelector('[data-action="export"]').disabled);
    };
    await page.goto('https://fivebooks.com/people/test-expert/');
    assert.equal(await page.locator('#dcw-launchers').count(),0);
    assert.equal(await page.locator('.dcw-fivebooks-section-button').count(),2);
    assert.equal(await page.locator('h3.block-heading').filter({hasText:'Books by Test Expert'}).locator('.dcw-fivebooks-section-button[data-source-mode="authored"]').count(),1);
    assert.equal(await page.locator('h3.block-heading').filter({hasText:'Interviews with Test Expert'}).locator('.dcw-fivebooks-section-button[data-source-mode="recommended"]').count(),1);
    assert.equal(await page.locator('.dcw-fivebooks-section-button[data-source-mode="authored"]').textContent(),'Test Expert 的书');
    assert.equal(await page.locator('.dcw-fivebooks-section-button[data-source-mode="recommended"]').textContent(),'Test Expert 推荐（Reason）');
    assert.equal(await page.locator('.dcw-fivebooks-profile-button').textContent(),'Test Expert 的书');
    assert.equal(await page.locator('.dcw-fivebooks-profile-button').getAttribute('data-source-mode'),'authored');
    assert.equal(await page.locator('.dcw-fivebooks-profile-button').evaluate(button=>button.parentElement.previousElementSibling?.tagName),'P');
    assert.equal(await page.locator('.dcw-fivebooks-interview-button').count(),4);
    assert.equal(await page.locator('article[id="5971"] h3.interview-title').evaluate(heading=>heading.lastElementChild?.tagName),'BUTTON');
    assert.equal(await page.locator('article[id="5971"] .dcw-fivebooks-interview-button').textContent(),'Bruce Schneier 推荐（Trust and Modern Society）');
    assert.equal(await page.locator('article[id="1598"] .dcw-fivebooks-interview-button').textContent(),'Rebecca Goldstein 推荐（Reason and its Limitations）');
    assert.equal(await page.locator('article[id="55136"] .dcw-fivebooks-interview-button').textContent(),'Lane Greene 推荐（Grammar Books That Prove What They Preach）');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('h3.dcw-fivebooks-section-heading').first().evaluate(heading=>getComputedStyle(heading).flexDirection),'column');
    assert.equal(await page.locator('.dcw-fivebooks-section-button').filter({visible:true}).count(),2);
    await page.setViewportSize({width:1440,height:980});

    await page.locator('.dcw-fivebooks-profile-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===1);
    assert.equal(await page.locator('#dcw-title').textContent(),'Test Expert 著作书单');
    await page.waitForFunction(()=>document.querySelector('#dcw-preview-status')?.textContent.includes('相同画幅'));
    await assertDownload('Test Expert 著作书单');
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card input').first().getAttribute('aria-label'),'选择 Authored Book');
    await page.locator('.dcw-book-card input').first().uncheck();
    await page.locator('[data-action="close"]').click();

    await page.locator('.dcw-fivebooks-section-button[data-source-mode="authored"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===1);
    assert.equal(await page.locator('#dcw-title').textContent(),'Test Expert 著作书单');
    await page.locator('[data-action="close"]').click();

    await page.locator('.dcw-fivebooks-section-button[data-source-mode="recommended"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===2);
    await page.waitForFunction(()=>document.querySelector('#dcw-preview-status')?.textContent.includes('相同画幅'));
    assert.ok(!(await page.locator('#dcw-preview-status').textContent()).includes('占位'));
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card').count(),2);
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),[
      '选择 First Recommendation','选择 Second Recommendation'
    ]);
    assert.ok((await page.locator('.dcw-book-card img').first().getAttribute('src')).includes('/images/large/first.webp'));
    assert.equal(await page.locator('#dcw-title').textContent(),'Test Expert 推荐书单');
    await assertDownload('Test Expert 推荐书单');
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="5971"] .dcw-fivebooks-interview-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===5);
    await page.waitForFunction(()=>document.querySelector('#dcw-preview-status')?.textContent.includes('相同画幅'));
    assert.equal(await page.locator('#dcw-preview-page option').count(),1);
    await page.locator('[data-action="edit-books"]').click();
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),[
      '选择 The Penguin and the Leviathan','选择 The Folly of Fools','选择 The Murderer Next Door','选择 The Better Angels of Our Nature','选择 Braintrust'
    ]);
    assert.equal(await page.locator('#dcw-title').textContent(),'Bruce Schneier 推荐书单 · Trust and Modern Society');
    await assertDownload('Bruce Schneier 推荐书单');
    await page.locator('.dcw-book-card input').first().uncheck();
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="1598"] .dcw-fivebooks-interview-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===2);
    assert.equal(await page.locator('#dcw-title').textContent(),'Rebecca Goldstein 推荐书单 · Reason and its Limitations');
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),['选择 Republic','选择 Middlemarch']);
    await assertDownload('Rebecca Goldstein 推荐书单');
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="55136"] .dcw-fivebooks-interview-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===2);
    assert.equal(await page.locator('#dcw-title').textContent(),'Lane Greene 推荐书单 · Grammar Books That Prove What They Preach');
    await assertDownload('Lane Greene 推荐书单');
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="4170"] .dcw-fivebooks-interview-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===2);
    assert.equal(await page.locator('#dcw-title').textContent(),'Lane Greene 推荐书单 · Language and the Mind');
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs=>inputs.map(input=>input.getAttribute('aria-label'))),['选择 Through the Language Glass','选择 The First Word']);
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="5971"] .dcw-fivebooks-interview-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===5);
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card input').first().isChecked(),false);
    await page.locator('[data-action="close"]').click();

    await page.locator('.dcw-fivebooks-profile-button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.dcw-book-card').length===1);
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card input').first().isChecked(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: Five Books author buttons and per-interview buttons select distinct lists, export PNGs and preserve separate drafts');
  } finally {await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
