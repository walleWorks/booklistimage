// Pure helpers shared by the extension, standalone editor and regression tests.
(() => {
  function parseDelimited(text, separator) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && c === separator) { row.push(field); field = ''; }
      else if (!quoted && (c === '\n' || c === '\r')) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); if (row.some(v => v.trim())) rows.push(row);
        row = []; field = '';
      } else field += c;
    }
    if (quoted) throw new Error('CSV 引号未闭合，请检查文件');
    row.push(field); if (row.some(v => v.trim())) rows.push(row);
    return rows;
  }

  function parseBookList(raw, format = 'txt') {
    const text = String(raw).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('清单为空');
    let records;
    if (format === 'json') {
      const parsed = JSON.parse(text);
      records = Array.isArray(parsed) ? parsed : parsed?.books;
      if (!Array.isArray(records)) throw new Error('JSON 需要数组或包含 books 数组');
    } else if (format === 'csv' || format === 'tsv') {
      const rows = parseDelimited(text, format === 'tsv' ? '\t' : ',');
      const header = rows.shift().map(v => v.trim().toLowerCase());
      const titleIndex = header.findIndex(v => ['title','name','书名','作品名称'].includes(v));
      const coverIndex = header.findIndex(v => ['coverurl','cover','封面','封面链接'].includes(v));
      if (titleIndex < 0) throw new Error('CSV/TSV 首行需要 title 或「书名」列');
      records = rows.map(row => ({ title: row[titleIndex], coverUrl: row[coverIndex] || '' }));
    } else records = text.split(/\r?\n/).filter(line => line.trim());
    if (records.length > 2000) throw new Error('每次最多导入 2000 部作品，请分批导入');
    let skipped = 0;
    const books = records.flatMap(record => {
      const value = typeof record === 'string' ? {title:record} : record;
      if (!value || typeof value.title !== 'string' || !value.title.trim()) { skipped++; return []; }
      const cover = typeof value.coverUrl === 'string' ? value.coverUrl.trim() : '';
      // Only the existing Douban image scope is fetched. Other sources can be
      // supplied as local files without expanding the extension's permissions.
      let coverUrl = '';
      try { const u = new URL(cover); if (u.protocol === 'https:' && (u.hostname.endsWith('.doubanio.com') || u.hostname === 'book.douban.com' || u.hostname === 'www.douban.com')) coverUrl = u.href; } catch {}
      return [{title:value.title.trim().slice(0,300),coverUrl,included:true}];
    });
    if (!books.length) throw new Error('没有找到有效书名');
    return {books,skipped};
  }

  function recommendLayout(count, settings, buildPlan) {
    if (!count) return null;
    const heightRatios = {square:1,portrait:1.25,story:16/9,landscape:9/16,flow:1.25};
    const [rw,rh] = settings.ratio.split(':').map(Number);
    const targetCount = Math.min(count,20);
    const ideal = Math.sqrt(targetCount * rh / rw / (heightRatios[settings.pageFormat] || 1.25));
    let best;
    for (let columns=3;columns<=10;columns++) {
      const candidate = {...settings,columns,exportMode:'auto',booksPerPage:0};
      let plan = buildPlan(count,candidate);
      if (!plan.safe) continue;
      const capacity = plan.pageCounts[0];
      const booksPerPage = Math.min(count,capacity, Math.max(columns, Math.round(targetCount/columns)*columns));
      plan = buildPlan(count,{...candidate,booksPerPage});
      const last = count % booksPerPage;
      const score = Math.abs(columns-ideal) + (last && last < columns ? .45 : 0);
      if (!best || score < best.score) best = {columns,booksPerPage,pages:plan.pageCounts.length,score};
    }
    return best || null;
  }

  const api = {parseDelimited,parseBookList,recommendLayout};
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.DCWWorkspace = api;
})();
