const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const book = (id, title) => `<li class="single-book" data-book-id="${id}"><a href="/book/${id}/buy"><div class="cover-wrap"><picture><source type="image/webp" data-srcset="https://fivebooks.com/images/large/${id}.webp 234w"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></picture></div><h2 class="book-title"><span class="title">${title}</span></h2></a></li>`;
const article = (id, heading, books) => `<article id="${id}" class="archive-interview"><section class="book-list"><h3 class="interview-title -archive"><a href="/best-books/${id}/">${heading}</a></h3><ul>${books.map(([bookId, title]) => book(bookId, title)).join('')}</ul><h3 class="interview-title -archive"><a href="/best-books/${id}/">${heading}</a></h3></section></article>`;
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><title>The Booker Prizes</title><body>
<div class="page-content archive" style="max-width:780px"><h1>The Booker Prizes</h1><div class="infinite-container">
${article(105418, '<span class="subject">The Best Fiction Books: The 2026 International Booker Prize</span>, recommended by Troy Onyango', [
  [105419, 'Taiwan Travelogue'], [105420, 'The Nights Are Quiet in Tehran'], [105421, 'She Who Remains'],
  [105422, 'The Director'], [105423, 'On Earth As It Is Beneath'], [105424, 'The Witch']
])}
${article(103619, 'Booker Prize-Nominated Mystery Novels, recommended by Cal Flyn', [
  [103620, 'The Seven Moons of Maali Almeida'], [103621, 'The Trees']
])}
${article(92586, '<span class="subject">Booker Prize-Winning Novels</span>', [
  [101977, 'Flesh'], [101978, 'Orbital'], [101979, 'Prophet Song'],
  [101980, 'The Seven Moons of Maali Almeida'], [101981, 'The Promise']
])}
</div></div></body></html>`;

(async () => {
  const root = path.resolve(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    executablePath: process.env.DCW_TEST_CHROME || '/Users/haojiang/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true, viewport: { width: 1440, height: 980 }, acceptDownloads: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    await context.route('https://fivebooks.com/books/booker-prize/', route => route.fulfill({ contentType: 'text/html', body: fixture }));
    await context.route('https://fivebooks.com/images/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="234" height="360"><rect width="234" height="360" fill="#31584c"/></svg>' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://fivebooks.com/books/booker-prize/');
    assert.equal(await page.locator('.dcw-fivebooks-interview-button').count(), 6);
    assert.equal(await page.locator('article[id="105418"] .dcw-fivebooks-interview-button').first().textContent(), 'Troy Onyango 推荐（The Best Fiction Books: The 2026 International Booker Prize）');
    assert.ok(await page.locator('article[id="105418"] h3.interview-title').first().evaluate(heading => heading.querySelector('button').getBoundingClientRect().width <= heading.getBoundingClientRect().width * 0.43));
    assert.equal(await page.locator('article[id="103619"] .dcw-fivebooks-interview-button').first().textContent(), 'Cal Flyn 推荐（Booker Prize-Nominated Mystery Novels）');
    assert.equal(await page.locator('article[id="92586"] .dcw-fivebooks-interview-button').first().textContent(), 'Booker Prize-Winning Novels 书单');

    await page.locator('article[id="105418"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 6);
    assert.equal(await page.locator('#dcw-title').textContent(), 'Troy Onyango 推荐书单 · The Best Fiction Books: The 2026 International Booker Prize');
    await page.waitForFunction(() => document.querySelector('#dcw-preview-status')?.textContent.includes('相同画幅'));
    const pending = page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download = await pending;
    assert.ok(download.suggestedFilename().includes('Troy Onyango 推荐书单'));
    assert.equal(await download.failure(), null);
    await page.waitForFunction(() => !document.querySelector('[data-action="export"]').disabled);
    await page.locator('[data-action="edit-books"]').click();
    await page.locator('.dcw-book-card input').first().uncheck();
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="92586"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 5);
    assert.equal(await page.locator('#dcw-title').textContent(), 'Booker Prize-Winning Novels 书单');
    assert.deepEqual(await page.locator('.dcw-book-card input').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label'))), [
      '选择 Flesh', '选择 Orbital', '选择 Prophet Song', '选择 The Seven Moons of Maali Almeida', '选择 The Promise'
    ]);
    await page.locator('[data-action="close"]').click();

    await page.locator('article[id="105418"] .dcw-fivebooks-interview-button').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.dcw-book-card').length === 6);
    await page.locator('[data-action="edit-books"]').click();
    assert.equal(await page.locator('.dcw-book-card input').first().isChecked(), false);
    assert.deepEqual(errors, []);
    console.log('PASS: Five Books award-page interviews and curated lists get accurate buttons, isolated books and drafts, and PNG export');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
