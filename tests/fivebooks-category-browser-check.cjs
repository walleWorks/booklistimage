const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const book = (id, title) => `<li class="single-book" data-book-id="${id}"><a href="/book/${id}/buy"><div class="cover-wrap"><picture><source type="image/webp" data-srcset="https://fivebooks.com/images/large/${id}.webp 234w"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></picture></div><h2 class="book-title"><span class="title">${title}</span></h2></a></li>`;
const interview = (id, person, topic, books) => `<article id="${id}" class="archive-interview"><section class="book-list"><h3 class="interview-title -archive"><a href="/best-books/${id}/">The best books on <span class="subject">${topic}</span>, recommended by ${person}</a></h3><ul>${books.map(([bookId, title]) => book(bookId, title)).join('')}</ul><h3 class="interview-title -archive"><a href="/best-books/${id}/">The best books on <span class="subject">${topic}</span>, recommended by ${person}</a></h3></section></article>`;
const dino = interview(106314, 'Dino Martins', 'Entomology', [
  [106323, 'Fleas, Flukes and Cuckoos'], [106324, 'The Ants'],
  [106325, 'The Life of the Bee'], [106326, 'The Soul of the White Ant'],
  [106327, 'Six Legs Walking']
]);
const ecology = interview(106044, 'Kulbhushansingh Suryawanshi', 'Ecology', [
  [106067, 'The Serengeti Lion'], [106068, 'Owls of the Eastern Ice']
]);
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Biology - Five Books</title><body>
<div class="page-content archive"><h1>Biology Books</h1><div class="infinite-container">${dino}${ecology}</div></div>
</body></html>`;

(async () => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.DCW_TEST_CHROME || '/Users/haojiang/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true, viewport: { width: 1440, height: 980 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    await context.route('https://fivebooks.com/category/mathematics-and-science/biology/', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await context.route('https://fivebooks.com/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="234" height="360"><rect width="234" height="360" fill="#31584c"/></svg>' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://fivebooks.com/category/mathematics-and-science/biology/');
    assert.equal(await page.locator('#dcw-launcher').count(), 0);
    assert.equal(await page.locator('.dcw-fivebooks-interview-button').count(), 4);
    assert.equal(await page.locator('article[id="106314"] .dcw-fivebooks-interview-button').first().textContent(), 'Dino Martins 推荐（Entomology）');
    assert.equal(await page.locator('article[id="106044"] .dcw-fivebooks-interview-button').first().textContent(), 'Kulbhushansingh Suryawanshi 推荐（Ecology）');

    await page.locator('article[id="106314"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 5);
    assert.equal(await page.locator('#dcw-title').textContent(), 'Dino Martins 推荐书单 · Entomology');
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label'))), [
      '选择 Fleas, Flukes and Cuckoos', '选择 The Ants', '选择 The Life of the Bee',
      '选择 The Soul of the White Ant', '选择 Six Legs Walking'
    ]);
    await page.waitForFunction(() => document.querySelector('#dcw-preview-status')?.textContent.includes('相同画幅'));
    assert.equal(await page.locator('#dcw-preview-page option').count(), 1);
    const pending = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download = await pending;
    assert.ok(download.suggestedFilename().includes('Dino Martins 推荐书单'));
    assert.equal(await download.failure(), null);
    await page.waitForFunction(() => !document.querySelector('[data-action="export"]').disabled);
    await page.locator('[data-action="edit-books"]').click();
    await page.locator('.dcw-book-card input').first().uncheck();
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="106044"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 2);
    assert.equal(await page.locator('#dcw-title').textContent(), 'Kulbhushansingh Suryawanshi 推荐书单 · Ecology');
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="106314"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 5);
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card input').first().isChecked(), false);
    await page.locator('[data-action="close"]').click();

    await page.evaluate(() => {
      const article = document.createElement('article');
      article.id = '20026';
      article.className = 'archive-interview';
      article.innerHTML = '<section class="book-list"><h3 class="interview-title"><a href="/best-books/biology/">The Best <span class="subject">Biology Books</span>, recommended by Sean B Carroll</a></h3><li class="single-book" data-book-id="20021"><a href="/book/eighth-day/"> <h2 class="book-title"><span class="title">The Eighth Day of Creation</span></h2></a></li></section>';
      document.querySelector('.infinite-container').appendChild(article);
    });
    await page.locator('article[id="20026"] .dcw-fivebooks-interview-button').waitFor();
    assert.equal(await page.locator('article[id="20026"] .dcw-fivebooks-interview-button').textContent(), 'Sean B Carroll 推荐（Biology Books）');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('article[id="106314"] .dcw-fivebooks-interview-heading').first().evaluate(heading => getComputedStyle(heading).flexDirection), 'column');
    assert.deepEqual(errors, []);
    console.log('PASS: Five Books category interviews get per-expert buttons, isolated books and drafts, PNG export, dynamic additions and mobile layout');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
