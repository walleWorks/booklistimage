(() => {
  "use strict";

  if (window.__doubanCoverWallLoaded) {
    return;
  }
  window.__doubanCoverWallLoaded = true;

  const DEFAULT_SETTINGS = {
    columns: 5,
    gap: 0,
    ratio: "2:3",
    fit: "cover",
    width: 1500,
    background: "#ffffff",
    theme: "cover",
    shadow: "soft",
    structure: "open",
    alignment: "left",
    margin: "comfortable",
    titleMode: "none",
    titleText: "",
    exportMode: "auto",
    pageFormat: "flow",
    booksPerPage: 0
  };

  const EXPORT_LIMITS = {
    maxHeight: 16_000,
    maxPixels: 48_000_000
  };

  const PAGE_FORMATS = {
    flow: null,
    square: 1,
    portrait: 5 / 4,
    story: 16 / 9,
    landscape: 9 / 16,
    xhs: null,
    wechatCover: 100 / 235
  };

  const SHELF_THEMES = {
    oak: {
      backTop: "#f2e8d7",
      backBottom: "#ddc7a4",
      grain: "rgba(121, 84, 43, 0.08)",
      shelfTop: "#ddb982",
      shelfFront: "#a87542",
      shelfEdge: "#efd3a3",
      text: "#513920"
    },
    walnut: {
      backTop: "#493a33",
      backBottom: "#2d2421",
      grain: "rgba(229, 195, 157, 0.07)",
      shelfTop: "#815a3f",
      shelfFront: "#4b3025",
      shelfEdge: "#a87a59",
      text: "#f2e4d5"
    },
    nordic: {
      backTop: "#f7f6f1",
      backBottom: "#deded7",
      grain: "rgba(104, 101, 88, 0.045)",
      shelfTop: "#eee9dc",
      shelfFront: "#c8c3b7",
      shelfEdge: "#ffffff",
      text: "#3e403b"
    },
    vintage: {
      backTop: "#34584a",
      backBottom: "#1f3b32",
      grain: "rgba(227, 210, 166, 0.055)",
      shelfTop: "#805b3e",
      shelfFront: "#4d3326",
      shelfEdge: "#aa815d",
      text: "#f1e5c4"
    }
  };

  const IS_EDITOR = document.body?.dataset.dcwEditor === "true";
  const FIVEBOOKS_HOST = /^(?:www\.)?fivebooks\.com$/i.test(location.hostname);
  const PAGE_KIND = FIVEBOOKS_HOST && /^\/people\/[^/]+\/?$/.test(location.pathname)
    ? "fivebooks"
    : FIVEBOOKS_HOST && /^\/(?:category|books)\/.+/.test(location.pathname)
      ? "fivebooks-archive"
    : /^\/personage\/\d+\/creations\/?$/.test(location.pathname)
      ? "author"
      : "doulist";
  const IS_FIVEBOOKS = PAGE_KIND === "fivebooks" || PAGE_KIND === "fivebooks-archive";
  const FIVEBOOKS_SOURCES = {
    authored: {
      titleSuffix: "著作书单",
      sourceName: "Five Books 人物著作",
      emptyHint: "请确认该人物页列出了作者著作",
      refreshLabel: "更新作者著作"
    },
    recommended: {
      titleSuffix: "推荐书单",
      sourceName: "Five Books 专家推荐",
      emptyHint: "请确认该人物页包含“Interviews with …”推荐书单",
      refreshLabel: "更新本人推荐"
    }
  };
  const PAGE_COPY = IS_FIVEBOOKS
    ? {
        fallbackTitle: PAGE_KIND === "fivebooks-archive" ? "Five Books 专题书单" : "Five Books 推荐书单",
        launcherTitle: "制作 Five Books 书单图片",
        itemName: "本书",
        ...FIVEBOOKS_SOURCES.recommended
      }
    : PAGE_KIND === "author"
    ? {
        fallbackTitle: "作者作品",
        launcherTitle: "把这个作者的全部作品做成封面墙",
        sourceName: "作者全部作品",
        itemName: "部作品",
        emptyHint: "请确认这是公开的豆瓣作者作品页",
        refreshLabel: "更新豆瓣作品"
      }
    : {
        fallbackTitle: "豆列",
        launcherTitle: "把这个豆列做成封面墙",
        sourceName: "豆列",
        itemName: "本书",
        emptyHint: "请确认这是包含图书的公开豆列",
        refreshLabel: "更新豆瓣作品"
      };

  const state = {
    books: [],
    settings: { ...DEFAULT_SETTINGS },
    loading: false,
    loaded: false,
    draggedIndex: null,
    didDrag: false,
    exportJob: null,
    viewQuery: "",
    viewFilter: "all",
    workspaceView: "preview",
    previewPage: 0,
    previewRevision: 0,
    previewTimer: null,
    previewJob: null,
    draftTimer: null,
    draftWrite: Promise.resolve(),
    projectId: null,
    undo: [],
    redo: [],
    historyGroup: null,
    importing: false,
    replaceCoverKey: null,
    sourceMode: "recommended",
    title: readPageTitle()
  };

  injectLauncher();
  if (IS_EDITOR) openBuilder();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "DCW_OPEN") {
      openBuilder(PAGE_KIND === "fivebooks-archive" && state.sourceMode === "recommended"
        ? fiveBooksFirstArchiveMode() : state.sourceMode);
    }
  });

  function injectLauncher() {
    if (PAGE_KIND === "fivebooks") {
      injectFiveBooksProfileButton();
      injectFiveBooksSectionButtons();
      injectFiveBooksInterviewButtons();
      return;
    }
    if (PAGE_KIND === "fivebooks-archive") {
      injectFiveBooksInterviewButtons();
      const container = document.querySelector(".infinite-container");
      if (container) new MutationObserver(() => injectFiveBooksInterviewButtons())
        .observe(container, { childList: true });
      return;
    }

    if (document.getElementById("dcw-launcher")) return;

    const button = document.createElement("button");
    button.id = "dcw-launcher";
    button.className = "dcw-launcher";
    button.type = "button";
    button.title = PAGE_COPY.launcherTitle;
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="8" rx="1.2" fill="currentColor"></rect>
        <rect x="14" y="3" width="7" height="8" rx="1.2" fill="currentColor" opacity=".78"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1.2" fill="currentColor" opacity=".78"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1.2" fill="currentColor"></rect>
      </svg>
      <span>制作书单图片</span>
    `;
    button.addEventListener("click", () => openBuilder());
    document.body.appendChild(button);
  }

  function injectFiveBooksProfileButton() {
    const heading = document.querySelector(".page-content.people h1");
    const biography = heading?.parentElement?.querySelector(":scope > p");
    if (!biography || heading.parentElement.querySelector(".dcw-fivebooks-profile-button")) return;
    const name = heading.textContent.replace(/^Books by\s+/i, "").trim();
    if (!name) return;
    const actions = document.createElement("div");
    actions.className = "dcw-fivebooks-profile-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dcw-fivebooks-profile-button";
    button.dataset.sourceMode = "authored";
    button.textContent = `${name} 的书`;
    button.setAttribute("aria-label", `制作 ${name} 的著作书单图片`);
    button.addEventListener("click", () => openBuilder("authored"));
    actions.appendChild(button);
    biography.insertAdjacentElement("afterend", actions);
  }

  function injectFiveBooksSectionButtons() {
    const headings = Array.from(document.querySelectorAll("h3.block-heading"));
    for (const [mode, pattern] of [["authored", /^Books by\b/i], ["recommended", /^Interviews? with\b/i]]) {
      const heading = headings.find((candidate) => pattern.test(candidate.textContent.trim()));
      if (!heading || heading.querySelector(".dcw-fivebooks-section-button")) continue;
      const label = document.createElement("span");
      label.textContent = heading.textContent.trim();
      const button = document.createElement("button");
      button.type = "button";
      if (mode === "recommended") button.id = "dcw-launcher";
      button.className = "dcw-fivebooks-section-button";
      button.dataset.sourceMode = mode;
      const name = label.textContent.replace(mode === "authored" ? /^Books by\s+/i : /^Interviews? with\s+/i, "").trim();
      const interviews = mode === "recommended"
        ? Array.from(heading.parentElement.querySelectorAll(":scope > article.archive-interview")) : [];
      const topic = interviews.length === 1 ? fiveBooksInterviewInfo(interviews[0]).topic : "";
      button.textContent = mode === "authored" ? `${name} 的书`
        : `${name} 推荐${topic ? `（${topic}）` : ""}`;
      button.addEventListener("click", () => openBuilder(mode));
      heading.classList.add("dcw-fivebooks-section-heading");
      heading.replaceChildren(label, button);
    }
  }

  function fiveBooksOtherInterviews(doc = document) {
    if (PAGE_KIND === "fivebooks-archive") {
      return Array.from(doc.querySelectorAll("article.archive-interview[id]"));
    }
    const heading = Array.from(doc.querySelectorAll("h3.block-heading"))
      .find((candidate) => /^Interviews where books by\b/i.test(candidate.textContent.trim()));
    return heading ? Array.from(heading.parentElement.querySelectorAll(":scope > article.archive-interview")) : [];
  }

  function fiveBooksInterview(sourceMode, doc = document) {
    const id = /^interview:(\d+)$/.exec(sourceMode)?.[1];
    return id ? fiveBooksOtherInterviews(doc).find((article) => article.id === id) : null;
  }

  function fiveBooksFirstArchiveMode() {
    const id = fiveBooksOtherInterviews()[0]?.id;
    return id ? `interview:${id}` : "recommended";
  }

  function fiveBooksInterviewInfo(article) {
    const heading = article?.querySelector("section.book-list h3.interview-title");
    const text = heading?.querySelector("a")?.textContent.replace(/\s+/g, " ").trim() || "";
    const name = text.match(/,\s*recommended by\s+(.+)$/i)?.[1]
      || text.match(/^(.+?)\s+on\s+.+$/i)?.[1]
      || "";
    const topic = heading?.querySelector(".subject")?.textContent.trim()
      || text.replace(/,\s*recommended by\s+.+$/i, "").replace(/^The best books on\s+/i, "").trim();
    const label = name ? `${name} 推荐${topic ? `（${topic}）` : ""}` : `${topic || text} 书单`;
    const title = name ? (topic ? `${name} 推荐书单 · ${topic}` : `${name} 推荐书单`)
      : `${topic || text} 书单`;
    return { name, topic, label, title };
  }

  function fiveBooksSourceCopy(sourceMode) {
    if (FIVEBOOKS_SOURCES[sourceMode]) return FIVEBOOKS_SOURCES[sourceMode];
    const { name, topic } = fiveBooksInterviewInfo(fiveBooksInterview(sourceMode));
    return {
      sourceName: name ? `${name} 推荐书单` : `${topic} 书单`,
      emptyHint: "请确认该访谈仍列有推荐图书",
      refreshLabel: name ? `更新 ${name} 的书单` : `更新 ${topic} 书单`
    };
  }

  function injectFiveBooksInterviewButtons() {
    for (const article of fiveBooksOtherInterviews()) {
      if (!/^\d+$/.test(article.id)) continue;
      const sourceMode = `interview:${article.id}`;
      const { label } = fiveBooksInterviewInfo(article);
      for (const heading of article.querySelectorAll("h3.interview-title")) {
        if (heading.querySelector(".dcw-fivebooks-interview-button")) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dcw-fivebooks-interview-button";
        button.dataset.sourceMode = sourceMode;
        button.textContent = label;
        button.setAttribute("aria-label", `制作 ${label}的图片`);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openBuilder(sourceMode);
        });
        heading.classList.add("dcw-fivebooks-interview-heading");
        heading.appendChild(button);
      }
    }
  }

  async function openBuilder(sourceMode = "recommended") {
    let overlay = document.getElementById("dcw-overlay");
    if (!overlay) {
      if (IS_FIVEBOOKS) {
        state.sourceMode = sourceMode;
        Object.assign(PAGE_COPY, fiveBooksSourceCopy(sourceMode));
        state.title = readPageTitle(sourceMode);
      }
      overlay = createBuilder();
      document.body.appendChild(overlay);
      bindBuilderEvents(overlay);
      await restoreSettings(overlay);
    } else if (IS_FIVEBOOKS && sourceMode !== state.sourceMode) {
      await switchFiveBooksSource(sourceMode, overlay);
    }
    overlay.hidden = false;

    document.documentElement.style.overflow = "hidden";

    if (!state.loaded && !state.loading) {
      if (IS_EDITOR) { state.loaded = true; renderBooks(overlay); setStatus(overlay, "上传封面或导入清单，开始制作你的书单。"); }
      else await loadBooks(overlay);
    } else if (state.loaded) {
      renderBooks(overlay);
    }
  }

  async function switchFiveBooksSource(sourceMode, overlay) {
    if (state.exportJob || state.loading || state.importing) {
      showToast("当前书单正在处理，请稍后切换");
      return;
    }
    await flushDraft();
    invalidatePreview();
    state.sourceMode = sourceMode;
    Object.assign(PAGE_COPY, fiveBooksSourceCopy(sourceMode));
    state.books = [];
    state.settings = { ...DEFAULT_SETTINGS };
    state.loaded = false;
    state.title = readPageTitle(sourceMode);
    state.undo = [];
    state.redo = [];
    state.historyGroup = null;
    state.viewQuery = "";
    state.viewFilter = "all";
    state.previewPage = 0;
    overlay.querySelector("#dcw-book-search").value = "";
    overlay.querySelector("#dcw-view-filter").value = "all";
    overlay.querySelector('[data-action="refresh-books"]').textContent = PAGE_COPY.refreshLabel;
    updateHistoryControls();
    setWorkspaceView("preview", overlay);
    await restoreSettings(overlay);
  }

  function createBuilder() {
    const overlay=document.createElement('div');overlay.id='dcw-overlay';
    overlay.innerHTML=`
    <section class="dcw-dialog" role="dialog" aria-modal="true" aria-labelledby="dcw-title">
      <header class="dcw-topbar"><div class="dcw-brand"><span class="dcw-wordmark">书单</span><h2 id="dcw-title">${escapeHtml(state.title)}</h2></div><div class="dcw-top-actions"><button data-action="undo" aria-label="撤销" disabled>↶</button><button data-action="redo" aria-label="重做" disabled>↷</button><button data-action="close" aria-label="关闭">×</button></div></header>
      <div class="dcw-body">
        <aside class="dcw-panel">
          <div><p class="dcw-eyebrow">MADE TO SHARE</p><h3>把好书，分享出去。</h3><p class="dcw-intro">选择一个画幅，剩下的交给排版。</p></div>
          <fieldset class="dcw-platforms"><legend>分享到</legend>
            ${Object.entries(DCWWorkspace.SHARE_PRESETS).map(([id,p])=>`<button data-action="share-preset" data-preset="${id}" aria-pressed="false"><span>${p.label}</span><small>${p.ratioLabel}</small></button>`).join('')}
          </fieldset>
          <div class="dcw-field"><label for="dcw-title-text">图片标题</label><input id="dcw-title-text" data-setting="titleText" maxlength="80" placeholder="自动使用书单名称"></div>
          <fieldset class="dcw-colors"><legend>底色</legend>${[['#ffffff','纯白'],['#f5f2eb','暖纸'],['#e9eef2','雾灰']].map(([color,name])=>`<button data-action="share-color" data-color="${color}" aria-label="${name}" aria-pressed="false" style="--swatch:${color}"><i></i><span>${name}</span></button>`).join('')}</fieldset>
          <div class="dcw-source"><button data-action="edit-books"><span>选择与排序</span><span id="dcw-source-count">0 本 →</span></button><details><summary>添加作品</summary><div class="dcw-add-actions"><button data-action="upload-covers">上传封面</button><button data-action="import-list">导入书单</button><button data-action="refresh-books">${PAGE_COPY.refreshLabel}</button><button data-action="open-editor">独立工作台</button></div><p>TXT 每行一个书名；也支持 CSV、TSV 和 JSON。缺图可在作品卡片上补充。</p></details></div>
          <div class="dcw-actions"><p id="dcw-export-estimate" aria-live="polite"></p><button class="dcw-button-primary" data-action="export">导出图片</button><button data-action="cancel-export" hidden>取消生成</button><span id="dcw-draft-status" role="status">自动保存在此浏览器</span></div>
        </aside>
        <main class="dcw-workspace">
          <div class="dcw-viewbar"><div role="group" aria-label="工作视图"><button data-action="view-preview" aria-pressed="true">成品预览</button><button data-action="view-organize" aria-pressed="false">整理作品</button></div><span class="dcw-quiet">自动排版 · 高清 PNG</span></div>
          <p id="dcw-status" class="dcw-status" role="status">准备作品…</p>
          <div class="dcw-filterbar" hidden><input id="dcw-book-search" type="search" placeholder="搜索书名" aria-label="搜索作品名称"><select id="dcw-view-filter" aria-label="筛选封面"><option value="all">全部作品</option><option value="included">已选择</option><option value="excluded">未选择</option><option value="missing">待补封面</option></select><span id="dcw-filter-count"></span></div>
          <div class="dcw-mini-actions" hidden><button data-action="select-all">全选</button><button data-action="invert">反选</button><button data-action="view-preview">完成，查看图片 →</button></div>
          <div class="dcw-canvas-shell"><div id="dcw-preview" class="dcw-organizer" hidden></div><section id="dcw-output" aria-label="成品预览"><div id="dcw-output-canvas"></div><p id="dcw-preview-status" role="status"></p><div class="dcw-pagebar"><button data-action="previous-page" aria-label="上一页">←</button><select id="dcw-preview-page" aria-label="预览页码"></select><button data-action="next-page" aria-label="下一页">→</button><span id="dcw-page-dimensions"></span><button data-action="retry-preview" aria-label="重新载入">↻</button></div></section></div>
        </main>
      </div><input type="file" id="dcw-cover-files" accept="image/jpeg,image/png,image/webp" multiple hidden><input type="file" id="dcw-list-file" accept=".txt,.csv,.tsv,.json" hidden>
    </section>`;return overlay;
  }
  function bindBuilderEvents(overlay) {
    overlay.addEventListener('click',event=>{
      const button=event.target.closest('[data-action]'),action=button?.dataset.action;
      if(!action)return;
      if((state.importing||state.loading)&&!['close','cancel-export','view-preview','view-organize'].includes(action)){showToast('正在处理，请稍候');return;}
      if(action==='close')closeBuilder();
      if(action==='export')exportWall(overlay);
      if(action==='cancel-export')cancelExport(overlay);
      if(action==='undo')travelHistory(-1,overlay);
      if(action==='redo')travelHistory(1,overlay);
      if(action==='view-preview')setWorkspaceView('preview',overlay);
      if(action==='view-organize'||action==='edit-books')setWorkspaceView('organize',overlay);
      if(action==='select-all')setAllIncluded(true,overlay);
      if(action==='invert')invertSelection(overlay);
      if(action==='previous-page')changePreviewPage(state.previewPage-1,overlay);
      if(action==='next-page')changePreviewPage(state.previewPage+1,overlay);
      if(action==='retry-preview')schedulePreview(overlay);
      if(action==='refresh-books')loadBooks(overlay);
      if(action==='open-editor')sendExtension({type:'DCW_OPEN_EDITOR'}).catch(e=>showToast(e.message));
      if(action==='upload-covers'){state.replaceCoverKey=null;const input=overlay.querySelector('#dcw-cover-files');input.multiple=true;input.click();}
      if(action==='import-list')overlay.querySelector('#dcw-list-file').click();
      if(action==='share-preset'||action==='share-color'){
        recordHistory();
        if(action==='share-preset')state.settings.sharePreset=button.dataset.preset;else state.settings.background=button.dataset.color;
        state.previewPage=0;applySettings(overlay);queueDraft();
      }
    });
    overlay.addEventListener('input',event=>{
      if(state.importing||state.loading)return;
      if(event.target.id==='dcw-book-search'){state.viewQuery=event.target.value.trim().toLocaleLowerCase('zh-CN');renderBooks(overlay);}
      if(event.target.id==='dcw-title-text'){recordHistory('titleText');state.settings.titleText=event.target.value;applySettings(overlay);queueDraft();}
    });
    overlay.addEventListener('change',event=>{
      if(event.target.id==='dcw-cover-files'){handleCoverFiles([...event.target.files],overlay);event.target.value='';return;}
      if(event.target.id==='dcw-list-file'){handleListFile(event.target.files[0],overlay);event.target.value='';return;}
      if(event.target.id==='dcw-preview-page')changePreviewPage(Number(event.target.value),overlay);
      if(event.target.id==='dcw-view-filter'){state.viewFilter=event.target.value;renderBooks(overlay);}
    });
    document.addEventListener('keydown',event=>{
      if(overlay.hidden)return;
      const editing=event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      if(!editing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travelHistory(event.shiftKey?1:-1,overlay);}
      if(event.key==='Escape')closeBuilder();
    });
    window.addEventListener('pagehide',flushDraft);
    new ResizeObserver(()=>fitOutputCanvas(overlay)).observe(overlay.querySelector('.dcw-canvas-shell'));
  }
  function closeBuilder() {
    flushDraft();
    invalidatePreview();
    const overlay = document.getElementById("dcw-overlay");
    if (overlay) overlay.hidden = true;
    document.documentElement.style.overflow = "";
  }

  async function restoreSettings(overlay) {
    try {
      const key=draftKey(),legacyKey=key.replace('dcwShareDraft:','dcwDraft:');
      const saved=await chrome.storage.local.get([key,legacyKey]),draft=saved[key]||saved[legacyKey];
      if(draft?.version===1&&Array.isArray(draft.books)&&draft.books.every(isDraftBook)){
        state.books=draft.books;state.title=draft.title||state.title;state.loaded=true;
        state.settings=saved[key]?{...DEFAULT_SETTINGS,...draft.settings}:{...DEFAULT_SETTINGS,titleText:draft.settings?.titleText||''};
        setDraftStatus(saved[key]?'草稿已恢复':'已接续旧版书单，旧草稿仍保留');
      }
    }catch{setDraftStatus('暂时无法读取草稿');}
    state.projectId=null;
    syncSettingInputs(overlay);applySettings(overlay);
    overlay.querySelector('#dcw-title').textContent=state.title;
    overlay.querySelector('[data-action="refresh-books"]').hidden=IS_EDITOR;
    overlay.querySelector('[data-action="open-editor"]').hidden=IS_EDITOR;
  }

  function draftKey() {
    const url = new URL(location.href);
    const scope = PAGE_KIND === "author" ? (url.searchParams.get("type") || "writer")
      : IS_FIVEBOOKS && state.sourceMode !== "recommended" ? state.sourceMode
      : "books";
    return `dcwShareDraft:v1:${url.pathname.replace(/\/$/, "")}:${scope}`;
  }

  function isDraftBook(book) {
    return book && typeof book.key === "string" && typeof book.title === "string"
      && typeof book.coverUrl === "string" && (!book.coverUrl || /^(https:\/\/|dcw-upload:)/.test(book.coverUrl))
      && typeof book.included === "boolean";
  }

  function mergeDraftBooks(existing, fresh) {
    const byKey = new Map(fresh.map(book => [book.key, book]));
    const merged = existing.map(book => {
      const updated = byKey.get(book.key);
      byKey.delete(book.key);
      return updated ? { ...updated, included: book.included, ...(book.coverUrl?.startsWith('dcw-upload:') ? {coverUrl:book.coverUrl} : {}) } : book;
    });
    return merged.concat([...byKey.values()]);
  }

  function setDraftStatus(message) {
    const label = document.querySelector("#dcw-draft-status");
    if (label) label.textContent = message;
  }

  function captureSnapshot() {
    return { title:state.title, settings:{...state.settings}, books:state.books.map(book=>({...book})) };
  }

  function recordHistory(group = null) {
    if (!state.loaded) return;
    const now = Date.now();
    if (!group || state.historyGroup?.key !== group || now-state.historyGroup.time > 700) {
      state.undo.push(captureSnapshot());
      if (state.undo.length > 50) state.undo.shift();
    }
    state.historyGroup = group ? {key:group,time:now} : null;
    state.redo = [];
    updateHistoryControls();
  }

  function updateHistoryControls() {
    const overlay = document.querySelector('#dcw-overlay');
    if (!overlay) return;
    overlay.querySelector('[data-action="undo"]').disabled = !state.undo.length;
    overlay.querySelector('[data-action="redo"]').disabled = !state.redo.length;
  }

  function applySnapshot(snapshot,overlay) {
    state.title=snapshot.title||'我的书单';state.books=snapshot.books.map(book=>({...book}));
    state.settings={...DEFAULT_SETTINGS,...snapshot.settings};state.loaded=true;state.previewPage=0;
    overlay.querySelector('#dcw-title').textContent=state.title;
    syncSettingInputs(overlay);renderBooks(overlay);queueDraft();
  }
  function travelHistory(direction, overlay) {
    if (state.importing || state.loading || state.libraryBusy) return;
    const source = direction < 0 ? state.undo : state.redo;
    const destination = direction < 0 ? state.redo : state.undo;
    if (!source.length) return;
    destination.push(captureSnapshot());
    applySnapshot(source.pop(), overlay);
    state.historyGroup = null;
    updateHistoryControls();
    setStatus(overlay, direction < 0 ? '已撤销上一步' : '已重做');
  }

  function sendExtension(message) {
    return new Promise((resolve,reject)=>{
      try {chrome.runtime.sendMessage(message,response=>{
        if (chrome.runtime.lastError) {reject(new Error(chrome.runtime.lastError.message));return;}
        if (!response?.ok) {reject(new Error(response?.error || '扩展未响应'));return;}
        resolve(response);
      });} catch {reject(new Error('扩展已更新，请刷新页面'));}
    });
  }

  async function fileCoverData(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('支持 JPG、PNG、WebP 图片');
    if (file.size > 20*1024*1024) throw new Error('单张图片不能超过 20 MB');
    const bitmap=await createImageBitmap(file);
    try {
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/webp',.92);canvas.width=0;canvas.height=0;return data;
    } finally {bitmap.close();}
  }

  async function handleCoverFiles(files, overlay) {
    if (state.exportJob) {showToast('请等待导出完成后再上传封面');return;}
    if (!files.length || state.importing || state.libraryBusy || state.loading) return;
    if (files.length > 100) {showToast('每次最多上传 100 张封面');return;}
    state.importing=true;overlay.classList.add('dcw-importing');
    const replaceKey=state.replaceCoverKey;state.replaceCoverKey=null;
    const added=[], failed=[];
    try {
      for (const file of files) {
        setStatus(overlay,`正在保存封面 ${added.length+failed.length+1} / ${files.length}…`);
        try {
          const dataUrl=await fileCoverData(file);
          const response=await sendExtension({type:'DCW_STORE_COVER',dataUrl});
          added.push({key:`local:${crypto.randomUUID()}`,title:file.name.replace(/\.[^.]+$/,''),coverUrl:response.url,included:true,subjectUrl:''});
        } catch(error) {failed.push(`${file.name}：${error.message}`);}
      }
      if (added.length) {
        recordHistory();state.loaded=true;
        const book=replaceKey && state.books.find(item=>item.key===replaceKey);
        if (book) book.coverUrl=added[0].coverUrl;
        else state.books.push(...added);
        renderBooks(overlay);queueDraft();
      }
      setStatus(overlay,`已保存 ${added.length} 张封面${failed.length ? `；${failed.length} 张失败：${failed[0]}` : ''}`);
    } finally {state.importing=false;overlay.classList.remove('dcw-importing');}
  }

  async function handleListFile(file, overlay) {
    if (state.exportJob) {showToast('请等待导出完成后再导入清单');return;}
    if (!file || state.importing || state.libraryBusy || state.loading) return;
    state.importing=true;overlay.classList.add('dcw-importing');
    try {
      if (file.size > 5*1024*1024) throw new Error('清单不能超过 5 MB');
      const format=file.name.split('.').pop().toLowerCase();
      if (!['txt','csv','tsv','json'].includes(format)) throw new Error('请选择 TXT、CSV、TSV 或 JSON 清单');
      const result=DCWWorkspace.parseBookList(await file.text(),format);
      recordHistory();state.loaded=true;
      state.books.push(...result.books.map(book=>({...book,key:`import:${crypto.randomUUID()}`,subjectUrl:''})));
      renderBooks(overlay);queueDraft();
      const missing=result.books.filter(book=>!book.coverUrl).length;
      setStatus(overlay,`已追加 ${result.books.length} 部作品${missing ? `，${missing} 部使用书名占位，可点击「更换封面」上传图片` : ''}${result.skipped ? `；忽略 ${result.skipped} 条无书名记录` : ''}`);
    } catch(error) {showToast(`导入失败：${error.message}`);}
    finally {state.importing=false;overlay.classList.remove('dcw-importing');}
  }

  function queueDraft() {
    if (!state.loaded) return;
    clearTimeout(state.draftTimer);
    setDraftStatus("草稿保存中…");
    state.draftTimer = setTimeout(flushDraft, 200);
  }

  function flushDraft() {
    clearTimeout(state.draftTimer);
    state.draftTimer = null;
    if (!state.loaded) return state.draftWrite;
    const snapshot = {
      version: 1,
      updatedAt: Date.now(),
      title: state.title,
      projectId: state.projectId,
      settings: { ...state.settings },
      books: state.books.map(({ key, title, coverUrl, subjectUrl, included }) =>
        ({ key, title, coverUrl, subjectUrl, included }))
    };
    const key = draftKey();
    state.draftWrite = state.draftWrite.catch(() => {}).then(async () => {
      try {
        await chrome.storage.local.set({ [key]: snapshot });
        if (!state.draftTimer) setDraftStatus("草稿已保存到此浏览器");
        return true;
      } catch {
        setDraftStatus("草稿未保存，请检查扩展状态或存储空间");
        return false;
      }
    });
    return state.draftWrite;
  }

  function setWorkspaceView(view, overlay) {
    state.workspaceView = view;
    const isPreview = view === "preview";
    overlay.querySelector('[data-action="view-organize"]').setAttribute("aria-pressed", String(!isPreview));
    overlay.querySelector('[data-action="view-preview"]').setAttribute("aria-pressed", String(isPreview));
    overlay.querySelector("#dcw-preview").hidden = isPreview;
    overlay.querySelector("#dcw-output").hidden = !isPreview;
    overlay.querySelector(".dcw-filterbar").hidden = isPreview;
    overlay.querySelector(".dcw-mini-actions").hidden = isPreview;
    if (isPreview) schedulePreview(overlay);
    else invalidatePreview();
  }

  function invalidatePreview() {
    state.previewRevision += 1;
    clearTimeout(state.previewTimer);
    const job = state.previewJob;
    state.previewJob = null;
    if (job) {
      job.cancelled = true;
      try {
        chrome.runtime.sendMessage({ type: "DCW_CANCEL_EXPORT", jobId: job.id })?.catch?.(() => {});
      } catch { /* 页面刷新后旧扩展上下文可能已经失效。 */ }
    }
  }

  function changePreviewPage(page, overlay) {
    state.previewPage = Math.max(0, page);
    schedulePreview(overlay);
  }

  function pageTitle(total, settings, pageIndex, pageCount) {
    const title = getTitleText(total, settings);
    return pageCount > 1 ? `${title} · 第 ${pageIndex + 1}/${pageCount} 页` : title;
  }

  function schedulePreview(overlay) {
    invalidatePreview();
    if (state.workspaceView !== "preview" || overlay.hidden) return;
    const message = overlay.querySelector("#dcw-preview-status");
    message.textContent = "正在更新成品预览…";
    const host = overlay.querySelector("#dcw-output-canvas");
    overlay.querySelector(".dcw-canvas-shell").scrollTop = 0;
    host.querySelectorAll("canvas").forEach(canvas => { canvas.width = 0; canvas.height = 0; });
    host.replaceChildren();
    state.previewTimer = setTimeout(() => renderOutputPreview(overlay), 180);
  }

  function fitOutputCanvas(overlay) {
    const shell=overlay.querySelector('.dcw-canvas-shell'),canvas=overlay.querySelector('#dcw-output-canvas canvas');
    if(canvas&&state.workspaceView==='preview')canvas.style.maxHeight=`${Math.max(180,shell.clientHeight-100)}px`;
  }
  async function renderOutputPreview(overlay) {
    const revision = state.previewRevision;
    const settings = { ...state.settings };
    const books = state.books.filter(book => book.included);
    const plan = buildExportPlan(books.length, settings);
    const select = overlay.querySelector("#dcw-preview-page");
    const message = overlay.querySelector("#dcw-preview-status");
    const dimensions = overlay.querySelector("#dcw-page-dimensions");
    const host = overlay.querySelector("#dcw-output-canvas");
    state.previewPage = Math.min(state.previewPage, Math.max(0, plan.pageCounts.length - 1));
    select.replaceChildren();
    plan.pageCounts.forEach((count, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index + 1} / ${plan.pageCounts.length} · ${count} 部`;
      select.appendChild(option);
    });
    select.value = String(state.previewPage);
    select.disabled = !books.length || !plan.safe;
    overlay.querySelector('[data-action="previous-page"]').disabled = !plan.safe || state.previewPage === 0;
    overlay.querySelector('[data-action="next-page"]').disabled = !plan.safe || state.previewPage >= plan.pageCounts.length - 1;
    dimensions.textContent = "";
    if (!state.loaded) { message.textContent = "正在读取作品，请稍候。"; return; }
    if (!books.length) { message.textContent = "请在「整理作品」中至少选择一部作品。"; return; }
    if (!plan.safe) { message.textContent = "当前布局无法导出，请参考左侧尺寸提示调整画幅或列数。"; return; }
    const pageIndex = state.previewPage;
    const layout = plan.layouts[pageIndex];
    dimensions.textContent = `${layout.width} × ${layout.height} px`;
    const start = plan.pageCounts.slice(0, pageIndex).reduce((sum, count) => sum + count, 0);
    const pageBooks = books.slice(start, start + plan.pageCounts[pageIndex]);
    const job = { id: `preview-${Date.now()}-${revision}`, cancelled: false };
    state.previewJob = job;
    let completed = 0;
    try {
      const items = await mapWithConcurrency(pageBooks, 4, async (book) => {
        const result = await loadBookCoverWithRetry(book, job);
        assertExportActive(job);
        completed += 1;
        if (revision === state.previewRevision) message.textContent = `正在载入本页封面 ${completed} / ${pageBooks.length}…`;
        return result;
      });
      if (revision !== state.previewRevision || job.cancelled) return;
      const canvas = drawWall(items, settings, pageTitle(books.length, settings, pageIndex, plan.pageCounts.length));
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `第 ${pageIndex + 1} 页成品，${pageBooks.map(book => book.title).join("、")}`);
      host.replaceChildren(canvas);
      const failures = items.filter(item => !item.image && !item.placeholder).length;
      message.textContent = failures
        ? `本页 ${failures} 张封面读取失败，已显示占位；导出会重试，仍失败时跳过并重新分页。`
        : "本页与 PNG 导出使用相同画幅、排版和标题。";
      fitOutputCanvas(overlay);
    } catch (error) {
      if (revision === state.previewRevision && !job.cancelled) message.textContent = `预览失败：${error.message}。可点击「重新载入」。`;
    } finally {
      if (state.previewJob === job) state.previewJob = null;
    }
  }

  function syncSettingInputs(overlay) {
    Object.entries(state.settings).forEach(([key, value]) => {
      const input = overlay.querySelector(`[data-setting="${key}"]`);
      if (input) input.value = String(value);
    });
  }

  function normalizeSetting(key, value) {
    if (key === 'booksPerPage') return Math.max(0,Math.min(500,Math.floor(Number(value)||0)));
    if (["columns", "gap", "width"].includes(key)) {
      return Number(value);
    }
    return value;
  }

  function applySettings(overlay) {
    state.settings=DCWWorkspace.shareSettings(state.books.filter(book=>book.included).length,state.settings,buildExportPlan);
    overlay.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===state.settings.sharePreset)));
    overlay.querySelectorAll('[data-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.color===state.settings.background)));
    const count=state.books.filter(book=>book.included).length;
    overlay.querySelector('#dcw-source-count').textContent=`${count} / ${state.books.length} 本 →`;
    overlay.querySelector('[data-action="export"]').disabled=!count||Boolean(state.exportJob);
    updateExportEstimate(overlay);schedulePreview(overlay);
  }
  function getTitleText(count, settings = state.settings) {
    const customTitle = String(settings.titleText || "").trim();
    if (customTitle) return customTitle;
    return count > 0 ? `${state.title} · ${count} ${PAGE_COPY.itemName}` : state.title;
  }

  function contrastTextColor(hexColor) {
    const normalized = String(hexColor || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#30322d";
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#30322d" : "#f7f4ed";
  }

  async function loadBooks(overlay) {
    state.loading = true;
    overlay.querySelector('[data-action="refresh-books"]').disabled = true;
    setStatus(overlay, IS_FIVEBOOKS
      ? `正在读取${PAGE_COPY.sourceName}…`
      : `正在读取${PAGE_COPY.sourceName}第 1 页…`);

    try {
      const allBooks = IS_FIVEBOOKS
        ? parseFiveBooksBooks(document, state.sourceMode)
        : PAGE_KIND === "author"
          ? await loadAuthorWorks(overlay)
          : await loadDoulistBooks(overlay);

      const hadDraft = state.loaded;
      if (hadDraft) recordHistory();
      state.books = hadDraft ? mergeDraftBooks(state.books, allBooks) : allBooks;
      state.loaded = true;
      renderBooks(overlay);
      queueDraft();

      if (allBooks.length === 0) {
        setStatus(overlay, `${IS_FIVEBOOKS ? "没有找到书目" : "没有找到作品封面"}。${PAGE_COPY.emptyHint}。`, "error");
      } else {
        setStatus(overlay, hadDraft
          ? `${IS_FIVEBOOKS ? "书目" : "作品"}已更新，保留原有顺序与选择；共 ${state.books.length} ${PAGE_COPY.itemName}。`
          : `已找到 ${allBooks.length} ${PAGE_COPY.itemName} · 勾选、拖动或用箭头排序`);
      }
    } catch (error) {
      setStatus(overlay, `读取失败：${error.message}`, "error");
      if (!state.loaded) overlay.querySelector("#dcw-preview").innerHTML = `<div class="dcw-empty">读取失败，可点击「更新作品」重试。<br>${escapeHtml(error.message)}</div>`;
    } finally {
      state.loading = false;
      overlay.querySelector('[data-action="refresh-books"]').disabled = false;
    }
  }

  async function loadDoulistBooks(overlay) {
    const total = readTotalCount(document);
    const pageSize = 25;
    const pageStarts = total > 0
      ? Array.from({ length: Math.ceil(total / pageSize) }, (_, index) => index * pageSize)
      : [0];
    const allBooks = [];
    const seen = new Set();

    for (let index = 0; index < pageStarts.length; index += 1) {
      const start = pageStarts[index];
      let pageDocument;

      if (start === currentStart()) {
        pageDocument = document;
      } else {
        setStatus(overlay, `正在读取豆列第 ${index + 1} / ${pageStarts.length} 页…`);
        pageDocument = await fetchPage(start);
        await delay(260);
      }

      addUniqueBooks(allBooks, seen, parseBooks(pageDocument));
    }

    return allBooks;
  }

  async function loadAuthorWorks(overlay) {
    const allWorks = [];
    const seenWorks = new Set();
    const visitedPages = new Set();
    let pageUrl = firstAuthorPageUrl();
    let pageNumber = 1;

    while (pageUrl && pageNumber <= 200 && !visitedPages.has(pageUrl)) {
      visitedPages.add(pageUrl);
      setStatus(overlay, `正在读取作者作品第 ${pageNumber} 页…`);

      const pageDocument = isCurrentPage(pageUrl)
        ? document
        : await fetchDocument(pageUrl, `作者作品第 ${pageNumber} 页`);
      addUniqueBooks(allWorks, seenWorks, parseAuthorWorks(pageDocument));

      pageUrl = readNextPageUrl(pageDocument, pageUrl);
      pageNumber += 1;
      if (pageUrl) await delay(260);
    }

    return allWorks;
  }

  function addUniqueBooks(target, seen, books) {
    books.forEach((book) => {
      if (!seen.has(book.key)) {
        seen.add(book.key);
        target.push(book);
      }
    });
  }

  function currentStart() {
    return Number(new URL(location.href).searchParams.get("start") || 0);
  }

  function readTotalCount(doc) {
    const text = doc.querySelector(".doulist-filter .active span")?.textContent || "";
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  async function fetchPage(start) {
    const url = new URL(location.href);
    url.searchParams.set("start", String(start));
    return fetchDocument(url.href, `第 ${Math.floor(start / 25) + 1} 页`);
  }

  async function fetchDocument(url, pageName) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`${pageName}返回 ${response.status}`);
    }
    const html = await response.text();
    const pageDocument = new DOMParser().parseFromString(html, "text/html");
    if (pageDocument.querySelector('form#sec[action="/c"]')) {
      throw new Error("豆瓣要求先完成页面安全验证，请刷新页面后重试");
    }
    return pageDocument;
  }

  function firstAuthorPageUrl() {
    const url = new URL(location.href);
    url.searchParams.delete("start");
    return url.href;
  }

  function isCurrentPage(url) {
    const current = new URL(location.href);
    const candidate = new URL(url);
    current.hash = "";
    candidate.hash = "";
    return current.href === candidate.href;
  }

  function readNextPageUrl(doc, pageUrl) {
    const next = doc.querySelector('link[rel="next"], .paginator .next a, .paginator a.next');
    const rawUrl = next?.getAttribute("href");
    if (!rawUrl) return null;

    const current = new URL(pageUrl);
    const candidate = new URL(rawUrl, current);
    if (candidate.origin !== current.origin || candidate.pathname !== current.pathname) {
      return null;
    }
    return candidate.href;
  }

  function parseBooks(doc) {
    return Array.from(doc.querySelectorAll(".doulist-item")).flatMap((item, index) => {
      const image = item.querySelector(".doulist-subject .post img, .post img");
      const link = image?.closest("a") || item.querySelector(".doulist-subject .title a");
      const subjectUrl = link?.href || "";

      if (!image || !/\/subject\/\d+/.test(subjectUrl) || !subjectUrl.includes("book.douban.com")) {
        return [];
      }

      const rawCover = image.getAttribute("src") || image.getAttribute("data-src");
      if (!rawCover) {
        return [];
      }

      const title = item.querySelector(".doulist-subject .title a")?.textContent.trim()
        || image.getAttribute("alt")
        || `第 ${index + 1} 本书`;
      const subjectId = subjectUrl.match(/subject\/(\d+)/)?.[1];

      return [{
        key: subjectId || subjectUrl,
        title,
        subjectUrl,
        coverUrl: upgradeCoverUrl(rawCover),
        included: true
      }];
    });
  }

  function parseAuthorWorks(doc) {
    const items = Array.from(doc.querySelectorAll(
      "ul.creations > li.creation, .grid_view > ul > li, .grid-view > ul > li, .subject-list > li, .article .item"
    ));

    return items.flatMap((item, index) => {
      const subjectLinks = Array.from(item.querySelectorAll('a[href*="/subject/"]'));
      const link = subjectLinks.find((candidate) => /\/subject\/\d+/.test(candidate.getAttribute("href") || ""));
      if (!link) return [];

      const subjectUrl = absoluteUrl(link.getAttribute("href"));
      const image = link.querySelector("img") || item.querySelector("img");
      const rawCover = image?.getAttribute("data-src")
        || image?.getAttribute("data-original")
        || image?.getAttribute("src");
      if (!subjectUrl || !rawCover || !/\/subject\/\d+/.test(subjectUrl)) {
        return [];
      }

      const titleLink = item.querySelector("h2 a, h6 a, .title a") || link;
      const title = titleLink.getAttribute("title")
        || titleLink.textContent.trim()
        || image.getAttribute("alt")
        || `第 ${index + 1} 部作品`;
      const subjectId = subjectUrl.match(/subject\/(\d+)/)?.[1];
      const subjectOrigin = new URL(subjectUrl).origin;

      return [{
        key: subjectId ? `${subjectOrigin}:${subjectId}` : subjectUrl,
        title,
        subjectUrl,
        coverUrl: upgradeCoverUrl(absoluteUrl(rawCover)),
        included: true
      }];
    });
  }

  function parseFiveBooksBooks(doc, sourceMode = "recommended") {
    let items;
    if (sourceMode === "authored") {
      items = doc.querySelectorAll(".page-content.people .book-container .row[data-book-id]");
    } else if (sourceMode.startsWith("interview:")) {
      items = fiveBooksInterview(sourceMode, doc)?.querySelectorAll("section.book-list li.single-book") || [];
    } else {
      const heading = Array.from(doc.querySelectorAll("h3.block-heading"))
        .find((candidate) => /^Interviews? with\b/i.test(candidate.textContent.trim()));
      const section = heading?.closest(".infinite-container") || heading?.parentElement;
      items = section?.querySelectorAll("li.single-book") || [];
    }

    const books = Array.from(items).flatMap((item, index) => {
      const title = item.querySelector(".book-title .title")?.textContent.trim()
        || item.querySelector("h2.book-title a")?.textContent.trim()
        || item.querySelector(".book-title")?.textContent.split(/\bby\b/i)[0].trim();
      if (!title) return [];

      const bookLink = item.querySelector('h2.book-title a[href*="/book/"], a[href*="/book/"]');
      const subjectUrl = canonicalFiveBooksBookUrl(bookLink?.getAttribute("href"));
      const coverUrl = readFiveBooksCover(item);
      const bookId = item.getAttribute("data-book-id");

      return [{
        key: bookId ? `fivebooks:${bookId}` : subjectUrl || `fivebooks:${title}:${index}`,
        title,
        subjectUrl,
        coverUrl,
        included: true
      }];
    });
    const unique = [];
    const seen = new Set();
    addUniqueBooks(unique, seen, books);
    return unique;
  }

  function parseFiveBooksRecommendations(doc) {
    return parseFiveBooksBooks(doc, "recommended");
  }

  function canonicalFiveBooksBookUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl, location.href);
      if (!/^(?:www\.)?fivebooks\.com$/i.test(url.hostname)) return "";
      url.pathname = url.pathname.replace(/\/(?:buy|listen)\/?$/i, "/");
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function readFiveBooksCover(item) {
    const webp = item.querySelector('.cover-wrap source[type="image/webp"], picture source[type="image/webp"]');
    const image = item.querySelector(".cover-wrap img, img.cover, picture img");
    const candidates = [
      bestSrcsetUrl(webp?.getAttribute("data-srcset")),
      bestSrcsetUrl(webp?.getAttribute("srcset")),
      bestSrcsetUrl(image?.getAttribute("data-srcset")),
      bestSrcsetUrl(image?.getAttribute("srcset")),
      image?.getAttribute("data-src"),
      image?.getAttribute("data-original"),
      image?.getAttribute("src")
    ];
    for (const candidate of candidates) {
      const url = absoluteUrl(candidate);
      if (url && !url.startsWith("data:") && /^(?:www\.)?fivebooks\.com$/i.test(new URL(url).hostname)) {
        return url;
      }
    }
    return "";
  }

  function bestSrcsetUrl(srcset) {
    if (!srcset) return "";
    return srcset.split(",").map((candidate) => {
      const [url, descriptor = ""] = candidate.trim().split(/\s+/, 2);
      const score = Number.parseFloat(descriptor) || 0;
      return { url, score };
    }).filter((candidate) => candidate.url)
      .sort((left, right) => right.score - left.score)[0]?.url || "";
  }

  function absoluteUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      return new URL(rawUrl, location.href).href;
    } catch {
      return "";
    }
  }

  function upgradeCoverUrl(url) {
    return url
      .replace("/view/subject/s/public/", "/view/subject/l/public/")
      .replace("/view/subject/m/public/", "/view/subject/l/public/");
  }

  function renderBooks(overlay) {
    const container = overlay.querySelector("#dcw-preview");
    const visible = state.books.map((book, index) => ({ book, index })).filter(({ book }) =>
      (!state.viewQuery || book.title.toLocaleLowerCase("zh-CN").includes(state.viewQuery))
      && (state.viewFilter === "all" || (state.viewFilter === "missing" ? !book.coverUrl : state.viewFilter === "included" ? book.included : !book.included))
    );
    const filtered = Boolean(state.viewQuery) || state.viewFilter !== "all";
    container.replaceChildren();
    updateFilterCount(overlay, visible.length);
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "dcw-empty";
      empty.textContent = state.books.length ? "当前筛选条件下没有作品。" : "这里还没有可用的作品封面。";
      container.appendChild(empty);
    }
    visible.forEach(({ book, index }) => {
      const card = document.createElement("article");
      card.className = "dcw-book-card";
      card.dataset.included = String(book.included);
      card.draggable = !filtered;
      card.innerHTML = `
        <label class="dcw-book-choice">
          ${book.coverUrl ? `<img ${book.coverUrl.startsWith('https:') ? `src="${escapeAttribute(book.coverUrl)}"` : ''} alt="" loading="lazy">` : `<div class="dcw-missing-cover">${escapeHtml(book.title)}<small>待补封面</small></div>`}
          <span><input type="checkbox" ${book.included ? "checked" : ""} aria-label="选择 ${escapeAttribute(book.title)}"> ${escapeHtml(book.title)}</span>
        </label>
        <div class="dcw-book-order">
          <span>第 ${index + 1} 位</span>
          <button type="button" data-move="-1" aria-label="前移 ${escapeAttribute(book.title)}" ${filtered || index === 0 ? "disabled" : ""}>←</button>
          <button type="button" data-move="1" aria-label="后移 ${escapeAttribute(book.title)}" ${filtered || index === state.books.length - 1 ? "disabled" : ""}>→</button>
        </div>
        <button class="dcw-replace-cover" type="button" aria-label="更换封面 ${escapeAttribute(book.title)}">更换封面</button>`;
      if (book.coverUrl.startsWith('dcw-upload:')) {
        const thumbnail=card.querySelector('img');
        requestImage(book.coverUrl).then(url=>{if(thumbnail.isConnected) thumbnail.src=url;}).catch(()=>{thumbnail.alt='本地封面不可用，请重新上传';});
      }
      card.querySelector('.dcw-replace-cover').addEventListener('click',()=>{
        if (state.importing || state.libraryBusy || state.loading) return;
        state.replaceCoverKey=book.key;
        const input=overlay.querySelector('#dcw-cover-files');input.multiple=false;input.click();
      });
      card.querySelector("input").addEventListener("change", (event) => {
        if (state.importing || state.libraryBusy || state.loading) {event.target.checked=book.included;return;}
        recordHistory();
        book.included = event.target.checked;
        renderBooks(overlay);
        updateSelectionStatus(overlay);
      });
      card.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => {
        moveBook(index, index + Number(button.dataset.move), overlay);
      }));
      card.title = filtered ? "清除筛选后可调整顺序" : "拖动卡片或使用箭头调整顺序";
      card.addEventListener("dragstart", (event) => {
        if (filtered) { event.preventDefault(); return; }
        state.draggedIndex = index;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
      });
      card.addEventListener("dragover", (event) => {
        if (!filtered) event.preventDefault();
      });
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        if (!filtered && state.draggedIndex !== null) moveBook(state.draggedIndex, index, overlay);
        state.draggedIndex = null;
      });
      card.addEventListener("dragend", () => { state.draggedIndex = null; });
      container.appendChild(card);
    });
    applySettings(overlay);
  }

  function moveBook(from, to, overlay) {
    if (state.importing || state.libraryBusy || state.loading) return;
    if (from === to || from < 0 || to < 0 || from >= state.books.length || to >= state.books.length) return;
    recordHistory();
    const [book] = state.books.splice(from, 1);
    state.books.splice(to, 0, book);
    renderBooks(overlay);
    updateSelectionStatus(overlay);
  }

  function updateFilterCount(overlay, visibleCount) {
    const count = overlay.querySelector("#dcw-filter-count");
    if (!count) return;
    count.textContent = visibleCount === state.books.length
      ? `全部 ${state.books.length}`
      : `显示 ${visibleCount} / ${state.books.length}`;
  }

  function setAllIncluded(included, overlay) {
    if (state.books.every(book=>book.included===included)) return;
    recordHistory();
    state.books.forEach((book) => { book.included = included; });
    renderBooks(overlay);
    updateSelectionStatus(overlay);
  }

  function invertSelection(overlay) {
    recordHistory();
    state.books.forEach((book) => { book.included = !book.included; });
    renderBooks(overlay);
    updateSelectionStatus(overlay);
  }

  function updateSelectionStatus(overlay) {
    const selected = state.books.filter((book) => book.included).length;
    if (!state.exportJob) setStatus(overlay, `已选择 ${selected} / ${state.books.length} ${PAGE_COPY.itemName}`);
    queueDraft();
    updateExportEstimate(overlay);
  }

  function calculateLayout(itemCount, settings, forcedHeight = null) {
    const columns = Number(settings.columns) || DEFAULT_SETTINGS.columns;
    const width = Number(settings.width) || DEFAULT_SETTINGS.width;
    const [ratioWidth, ratioHeight] = String(settings.ratio || DEFAULT_SETTINGS.ratio).split(":").map(Number);
    const themeSpec = SHELF_THEMES[settings.theme] || null;
    const hasShelf = Boolean(themeSpec);
    const marginFactors = hasShelf
      ? { compact: 0.018, comfortable: 0.035, spacious: 0.06 }
      : { compact: 0, comfortable: 0.015, spacious: 0.035 };
    const marginFactor = marginFactors[settings.margin] ?? marginFactors.comfortable;
    const paddingX = Math.round(width * marginFactor);
    const paddingTop = Math.round(width * marginFactor);
    const paddingBottom = Math.round(width * (hasShelf ? marginFactor * 0.72 : marginFactor));
    const normalizedTitleMode = ["top", "plaque"].includes(settings.titleMode) ? settings.titleMode : "none";
    const titleHeight = normalizedTitleMode === "top"
      ? Math.round(width * 0.075)
      : normalizedTitleMode === "plaque"
        ? Math.round(width * 0.058)
        : 0;
    const contentTop = paddingTop + titleHeight;
    const shelfFactors = { open: 0.035, floating: 0.027, cubby: 0.046 };
    const shelfSpace = hasShelf
      ? Math.round(width * (shelfFactors[settings.structure] || shelfFactors.open))
      : 0;
    const gap = Number(settings.gap) || 0;
    const effectiveGap = hasShelf ? gap + Math.round(width * 0.008) : gap;
    const cellWidth = Math.floor((width - paddingX * 2 - effectiveGap * (columns - 1)) / columns);
    const cellHeight = Math.round(cellWidth * ratioHeight / ratioWidth);
    const rows = Math.ceil(itemCount / columns);
    const naturalHeight = hasShelf
      ? contentTop + rows * (cellHeight + shelfSpace) + paddingBottom
      : contentTop + rows * cellHeight + Math.max(0, rows - 1) * effectiveGap + paddingBottom;
    const height = forcedHeight || (settings.pageFormat === "xhs"
      ? Math.max(naturalHeight, Math.round(width * 1.25)) : naturalHeight);

    return {
      width,
      height,
      naturalHeight,
      columns,
      themeSpec,
      hasShelf,
      paddingX,
      paddingTop,
      normalizedTitleMode,
      titleHeight,
      contentTop,
      shelfSpace,
      effectiveGap,
      cellWidth,
      cellHeight,
      rows
    };
  }

  function isLayoutSafe(layout) {
    return layout.height <= EXPORT_LIMITS.maxHeight
      && layout.width * layout.height <= EXPORT_LIMITS.maxPixels;
  }

  function getFixedPageHeight(settings) {
    const heightRatio = PAGE_FORMATS[settings.pageFormat];
    if (!heightRatio) return null;
    return Math.round((Number(settings.width) || DEFAULT_SETTINGS.width) * heightRatio);
  }

  function buildExportPlan(itemCount, settings) {
    if (itemCount <= 0) return { pageCounts: [], layouts: [], safe: true };
    const requestedCapacity = normalizeSetting('booksPerPage', settings.booksPerPage) || Infinity;

    const fullLayout = calculateLayout(itemCount, settings);
    if (settings.pageFormat === "xhs") {
      const maxHeight = Math.round(fullLayout.width * 2);
      const totalRows = Math.ceil(itemCount / fullLayout.columns);
      let rowsPerPage = 0;
      while (rowsPerPage < totalRows) {
        const candidate = calculateLayout((rowsPerPage + 1) * fullLayout.columns, settings);
        if (candidate.height > maxHeight || !isLayoutSafe(candidate)) break;
        rowsPerPage += 1;
      }
      if (rowsPerPage === 0) return { pageCounts: [itemCount], layouts: [fullLayout], safe: false };
      const pageCapacity = Math.min(rowsPerPage * fullLayout.columns, requestedCapacity);
      const pageCounts = [];
      for (let offset = 0; offset < itemCount; offset += pageCapacity) {
        pageCounts.push(Math.min(pageCapacity, itemCount - offset));
      }
      const layouts = pageCounts.map(count => calculateLayout(count, settings));
      return { pageCounts, layouts, safe: layouts.every(layout => isLayoutSafe(layout) && layout.height <= maxHeight) };
    }
    const fixedHeight = getFixedPageHeight(settings);
    if (fixedHeight) {
      let rowsPerPage = 0;
      const totalRows = Math.ceil(itemCount / fullLayout.columns);
      while (rowsPerPage < totalRows) {
        const candidate = calculateLayout((rowsPerPage + 1) * fullLayout.columns, settings, fixedHeight);
        if (candidate.naturalHeight > fixedHeight || !isLayoutSafe(candidate)) break;
        rowsPerPage += 1;
      }

      if (rowsPerPage === 0) {
        const failedLayout = calculateLayout(Math.min(itemCount, fullLayout.columns), settings, fixedHeight);
        return { pageCounts: [itemCount], layouts: [failedLayout], safe: false };
      }

      const pageCapacity = Math.min(rowsPerPage * fullLayout.columns, requestedCapacity);
      const pageCounts = [];
      for (let offset = 0; offset < itemCount; offset += pageCapacity) {
        pageCounts.push(Math.min(pageCapacity, itemCount - offset));
      }
      const layouts = pageCounts.map((count) => calculateLayout(count, settings, fixedHeight));
      return {
        pageCounts,
        layouts,
        safe: layouts.every((layout) => isLayoutSafe(layout) && layout.naturalHeight <= layout.height)
      };
    }

    if (settings.exportMode === "single") {
      return {
        pageCounts: [itemCount],
        layouts: [fullLayout],
        safe: isLayoutSafe(fullLayout)
      };
    }

    const totalRows = Math.ceil(itemCount / fullLayout.columns);
    let rowsPerPage = 1;
    while (rowsPerPage < totalRows) {
      const nextLayout = calculateLayout((rowsPerPage + 1) * fullLayout.columns, settings);
      if (!isLayoutSafe(nextLayout)) break;
      rowsPerPage += 1;
    }

    const pageCapacity = Math.min(rowsPerPage * fullLayout.columns, requestedCapacity);
    const pageCounts = [];
    for (let offset = 0; offset < itemCount; offset += pageCapacity) {
      pageCounts.push(Math.min(pageCapacity, itemCount - offset));
    }
    const layouts = pageCounts.map((count) => calculateLayout(count, settings));
    return { pageCounts, layouts, safe: layouts.every(isLayoutSafe) };
  }

  function updateExportEstimate(overlay) {
    const count=state.books.filter(book=>book.included).length,estimate=overlay.querySelector('#dcw-export-estimate');
    if(!count){estimate.textContent='添加作品，即可生成图片';return;}
    const plan=buildExportPlan(count,state.settings),preset=DCWWorkspace.SHARE_PRESETS[state.settings.sharePreset];
    const heights=plan.layouts.map(layout=>layout.height);
    const heightLabel=state.settings.sharePreset==='xiaohongshu' && Math.min(...heights)!==Math.max(...heights)
      ? `${Math.min(...heights)}–${Math.max(...heights)}` : String(heights[0]);
    estimate.textContent=`${preset.width} × ${heightLabel} · ${plan.pageCounts.length} 张图片${state.settings.sharePreset==='x' && plan.pageCounts.length>4 ? ' · X 请分批发布' : ''}`;
    estimate.dataset.kind=plan.safe?'normal':'warning';
  }
  async function exportWall(overlay) {
    if (state.exportJob) return;

    const books = state.books.filter((book) => book.included).slice();
    if (books.length === 0) {
      showToast(`请至少选择 1 ${PAGE_COPY.itemName}`);
      return;
    }

    const settings = { ...state.settings };
    const initialPlan = buildExportPlan(books.length, settings);
    if (!initialPlan.safe) {
      const fixedFormat = getFixedPageHeight(settings);
      const message = fixedFormat
        ? "当前画幅放不下一行封面，请增加列数、减少边距或关闭标题。"
        : "当前单张长图尺寸过大，请把长图策略改为自动安全分页。";
      setStatus(overlay, message, "error");
      showToast(message);
      return;
    }

    const job = {
      id: `dcw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cancelled: false
    };
    state.exportJob = job;
    setExportControls(overlay, true);

    try {
      let completed = 0;
      let failed = 0;
      const results = await mapWithConcurrency(books, 4, async (book) => {
        assertExportActive(job);
        const result = await loadBookCoverWithRetry(book, job);
        completed += 1;
        if (!result.image && !result.placeholder) failed += 1;
        setStatus(overlay, `正在读取高清封面 ${completed} / ${books.length}${failed ? ` · ${failed} 张暂时失败` : ""}…`);
        return result;
      });
      assertExportActive(job);

      const loaded = results.filter((result) => result.image || result.placeholder);
      const failures = results.filter((result) => !result.image && !result.placeholder);
      if (loaded.length === 0) {
        throw new Error(failures[0]?.error?.message || "没有可用于导出的封面");
      }

      const plan = buildExportPlan(loaded.length, settings);
      let offset = 0;
      for (let pageIndex = 0; pageIndex < plan.pageCounts.length; pageIndex += 1) {
        assertExportActive(job);
        const pageCount = plan.pageCounts[pageIndex];
        const pageItems = loaded.slice(offset, offset + pageCount);
        offset += pageCount;
        setStatus(overlay, `正在绘制第 ${pageIndex + 1} / ${plan.pageCounts.length} 张图片…`);

        const exportTitle = pageTitle(loaded.length, settings, pageIndex, plan.pageCounts.length);
        const canvas = drawWall(pageItems, settings, exportTitle);
        const blob = await canvasToBlob(canvas);
        assertExportActive(job);
        const suffix = plan.pageCounts.length > 1
          ? `-${String(pageIndex + 1).padStart(2, "0")}`
          : "";
        downloadBlob(blob, `${safeFilename(state.title)}-封面墙${suffix}.png`);
        canvas.width = 0;
        canvas.height = 0;
        if (pageIndex < plan.pageCounts.length - 1) await delay(180);
      }

      const summary = failures.length
        ? `生成完成 · 成功 ${loaded.length}，跳过 ${failures.length} 张失败封面 · 共 ${plan.pageCounts.length} 张 PNG`
        : `生成完成 · ${loaded.length} ${PAGE_COPY.itemName} · 共 ${plan.pageCounts.length} 张 PNG`;
      setStatus(overlay, summary);
      showToast(failures.length ? `导出完成，已跳过 ${failures.length} 张失败封面` : "封面墙已导出为 PNG");
    } catch (error) {
      if (job.cancelled || error.name === "ExportCancelledError") {
        setStatus(overlay, "已取消生成");
        showToast("已取消生成");
      } else {
        setStatus(overlay, `生成失败：${error.message}`, "error");
        showToast(`生成失败：${error.message}`);
      }
    } finally {
      if (state.exportJob === job) state.exportJob = null;
      setExportControls(overlay, false);
    }
  }

  async function loadBookCoverWithRetry(book, job) {
    assertExportActive(job);
    if (!book.coverUrl) return {book,image:null,placeholder:true,error:null};
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      assertExportActive(job);
      try {
        const dataUrl = await requestImage(book.coverUrl, job.id);
        assertExportActive(job);
        return { book, image: await loadImage(dataUrl), error: null };
      } catch (error) {
        if (job.cancelled) assertExportActive(job);
        lastError = error;
        if (attempt < 2) await delay(320);
      }
    }
    return { book, image: null, error: lastError };
  }

  function assertExportActive(job) {
    if (!job.cancelled) return;
    const error = new Error("生成已取消");
    error.name = "ExportCancelledError";
    throw error;
  }

  function setExportControls(overlay, exporting) {
    const exportButton = overlay.querySelector('[data-action="export"]');
    const cancelButton = overlay.querySelector('[data-action="cancel-export"]');
    exportButton.disabled = exporting;
    exportButton.textContent = exporting ? "正在生成…" : "导出图片";
    cancelButton.hidden = !exporting;
    cancelButton.disabled = false;
    cancelButton.textContent = "取消生成";
  }

  function cancelExport(overlay) {
    const job = state.exportJob;
    if (!job || job.cancelled) return;
    job.cancelled = true;
    const cancelButton = overlay.querySelector('[data-action="cancel-export"]');
    cancelButton.disabled = true;
    cancelButton.textContent = "正在取消…";
    setStatus(overlay, "正在取消生成…");

    try {
      const pendingCancel = chrome.runtime.sendMessage({ type: "DCW_CANCEL_EXPORT", jobId: job.id });
      pendingCancel?.catch?.(() => {});
    } catch {
      // 旧标签页的扩展上下文失效时，本地取消标记仍然有效。
    }
  }

  function requestImage(url, jobId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "DCW_FETCH_IMAGE", url, jobId }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || "封面读取失败"));
            return;
          }
          resolve(response.dataUrl);
        });
      } catch {
        reject(new Error("扩展刚刚更新，请刷新当前豆瓣页面后重试"));
      }
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("封面图片无法解码"));
      image.src = src;
    });
  }

  function drawWall(items, settings = state.settings, titleText = getTitleText(items.length, settings)) {
    const { fit, background, shadow } = settings;
    const structure = ["open", "floating", "cubby"].includes(settings.structure) ? settings.structure : "open";
    const alignment = ["left", "center"].includes(settings.alignment) ? settings.alignment : "left";
    const layout = calculateLayout(items.length, settings, getFixedPageHeight(settings));
    const {
      width,
      height,
      naturalHeight,
      columns,
      themeSpec,
      hasShelf,
      paddingX,
      paddingTop,
      normalizedTitleMode,
      titleHeight,
      contentTop,
      shelfSpace,
      effectiveGap,
      cellWidth,
      cellHeight,
      rows
    } = layout;
    const verticalOffset = Math.max(0, Math.floor((height - naturalHeight) / 2));
    const drawPaddingTop = paddingTop + verticalOffset;
    const drawContentTop = contentTop + verticalOffset;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("图片尺寸过大，无法创建绘图画布");

    if (hasShelf) {
      drawShelfBackground(context, canvas.width, canvas.height, themeSpec);
    } else {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (normalizedTitleMode !== "none") {
      drawCanvasTitle(
        context,
        width,
        drawPaddingTop,
        titleHeight,
        titleText,
        normalizedTitleMode,
        themeSpec,
        background,
        paddingX
      );
    }

    items.forEach(({ image, book }, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const rowCount = Math.min(columns, items.length - row * columns);
      const occupiedWidth = rowCount * cellWidth + Math.max(0, rowCount - 1) * effectiveGap;
      const rowStartX = alignment === "center" && rowCount < columns
        ? Math.round((width - occupiedWidth) / 2)
        : paddingX;
      const x = rowStartX + column * (cellWidth + effectiveGap);
      const y = drawContentTop + row * (cellHeight + (hasShelf ? shelfSpace : effectiveGap));
      if (hasShelf) drawCoverShadow(context, x, y, cellWidth, cellHeight, shadow);
      if (image) drawImageInCell(context, image, x, y, cellWidth, cellHeight, fit, background);
      else {
        context.save();
        context.fillStyle = "#eeeae3";
        context.fillRect(x, y, cellWidth, cellHeight);
        context.fillStyle = "#655f55";
        context.textAlign = "center";
        const fontSize=Math.max(16,cellWidth*.1);
        context.font = `${fontSize}px sans-serif`;
        if (book?.coverUrl) context.fillText("封面暂不可用", x + cellWidth / 2, y + cellHeight * 0.4, cellWidth * 0.9);
        const title=book?.title || '未命名作品';
        const charsPerLine=Math.max(5,Math.floor(cellWidth*.8 / fontSize));
        const lines=Array.from(title).reduce((rows,char,index)=>{const row=Math.floor(index/charsPerLine);if(row<5) rows[row]=(rows[row]||'')+char;return rows;},[]);
        lines.forEach((line,index)=>context.fillText(line,x+cellWidth/2,y+cellHeight*.5+index*cellWidth*.1,cellWidth*.85));
        context.restore();
      }
    });

    if (hasShelf) {
      for (let row = 0; row < rows; row += 1) {
        const rowCount = Math.min(columns, items.length - row * columns);
        const occupiedWidth = rowCount * cellWidth + Math.max(0, rowCount - 1) * effectiveGap;
        const rowStartX = alignment === "center" && rowCount < columns
          ? Math.round((width - occupiedWidth) / 2)
          : paddingX;
        const rowY = drawContentTop + row * (cellHeight + shelfSpace);
        const shelfY = drawContentTop + row * (cellHeight + shelfSpace) + cellHeight + Math.round(width * 0.004);
        if (structure === "cubby") {
          drawCubbyFrame(context, paddingX, rowStartX, rowY, width - paddingX * 2, rowCount, cellWidth, cellHeight, effectiveGap, width, themeSpec);
        }
        drawShelf(context, paddingX, shelfY, width - paddingX * 2, width, themeSpec, structure);
      }
    }

    return canvas;
  }

  function drawCanvasTitle(context, width, y, height, rawText, mode, theme, background, paddingX) {
    const textColor = theme?.text || contrastTextColor(background);
    const maxTextWidth = Math.max(120, width - Math.max(paddingX * 2, width * 0.12));
    const initialSize = mode === "top" ? width * 0.034 : width * 0.024;
    const fitted = fitCanvasText(context, rawText, maxTextWidth, initialSize, Math.max(14, width * 0.014));
    const centerX = width / 2;

    context.save();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${fitted.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;

    if (mode === "plaque") {
      const horizontalPadding = Math.round(width * 0.025);
      const plaqueWidth = Math.min(width * 0.86, context.measureText(fitted.text).width + horizontalPadding * 2);
      const plaqueHeight = Math.max(34, height * 0.68);
      const plaqueX = centerX - plaqueWidth / 2;
      const plaqueY = y + Math.max(0, (height - plaqueHeight) * 0.22);
      const radius = Math.max(6, width * 0.006);
      const topColor = theme?.shelfTop || "#3b8c67";
      const frontColor = theme?.shelfFront || "#286b4d";

      context.save();
      context.shadowColor = "rgba(0,0,0,0.28)";
      context.shadowBlur = Math.max(7, width * 0.01);
      context.shadowOffsetY = Math.max(3, width * 0.004);
      roundedRectPath(context, plaqueX, plaqueY, plaqueWidth, plaqueHeight, radius);
      const plaqueGradient = context.createLinearGradient(0, plaqueY, 0, plaqueY + plaqueHeight);
      plaqueGradient.addColorStop(0, topColor);
      plaqueGradient.addColorStop(1, frontColor);
      context.fillStyle = plaqueGradient;
      context.fill();
      context.restore();

      roundedRectPath(context, plaqueX, plaqueY, plaqueWidth, plaqueHeight, radius);
      context.strokeStyle = theme?.shelfEdge || "#8fb7a3";
      context.lineWidth = Math.max(1, width / 1200);
      context.stroke();
      context.fillStyle = theme ? textColor : "#ffffff";
      context.fillText(fitted.text, centerX, plaqueY + plaqueHeight / 2);
    } else {
      context.fillStyle = textColor;
      context.fillText(fitted.text, centerX, y + height * 0.42);
      context.globalAlpha = 0.2;
      context.fillRect(Math.max(paddingX, width * 0.08), y + height * 0.78, width - Math.max(paddingX, width * 0.08) * 2, Math.max(1, width / 1600));
    }
    context.restore();
  }

  function fitCanvasText(context, rawText, maxWidth, initialSize, minimumSize) {
    let size = Math.round(initialSize);
    let text = String(rawText || "");
    const font = () => `700 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.font = font();

    while (size > minimumSize && context.measureText(text).width > maxWidth) {
      size -= 1;
      context.font = font();
    }

    if (context.measureText(text).width > maxWidth) {
      while (text.length > 2 && context.measureText(`${text}…`).width > maxWidth) {
        text = text.slice(0, -1);
      }
      text = `${text.trim()}…`;
    }
    return { text, size };
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.arcTo(x + width, y, x + width, y + height, safeRadius);
    context.arcTo(x + width, y + height, x, y + height, safeRadius);
    context.arcTo(x, y + height, x, y, safeRadius);
    context.arcTo(x, y, x + width, y, safeRadius);
    context.closePath();
  }

  function drawShelfBackground(context, width, height, theme) {
    const backgroundGradient = context.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, theme.backTop);
    backgroundGradient.addColorStop(1, theme.backBottom);
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, width, height);

    context.save();
    context.strokeStyle = theme.grain;
    context.lineWidth = Math.max(1, width / 1800);
    const spacing = Math.max(18, Math.round(width / 55));
    for (let x = -spacing; x < width + spacing; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.bezierCurveTo(x + spacing * 0.45, height * 0.3, x - spacing * 0.35, height * 0.68, x + spacing * 0.2, height);
      context.stroke();
    }
    context.restore();

    const vignette = context.createRadialGradient(width / 2, 0, 0, width / 2, height * 0.32, Math.max(width, height));
    vignette.addColorStop(0, "rgba(255,255,255,0.11)");
    vignette.addColorStop(0.72, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.13)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  function drawCoverShadow(context, x, y, width, height, shadow) {
    if (shadow === "none") return;
    const strong = shadow === "strong";
    context.save();
    context.fillStyle = "rgba(0,0,0,0.22)";
    context.shadowColor = strong ? "rgba(0,0,0,0.48)" : "rgba(0,0,0,0.3)";
    context.shadowBlur = strong ? Math.max(14, width * 0.1) : Math.max(8, width * 0.06);
    context.shadowOffsetX = 0;
    context.shadowOffsetY = strong ? Math.max(7, width * 0.045) : Math.max(4, width * 0.025);
    context.fillRect(x, y, width, height);
    context.restore();
  }

  function drawShelf(context, x, y, shelfWidth, canvasWidth, theme, structure) {
    const floating = structure === "floating";
    const topHeight = floating
      ? Math.max(3, Math.round(canvasWidth * 0.0035))
      : Math.max(5, Math.round(canvasWidth * 0.006));
    const frontHeight = floating
      ? Math.max(4, Math.round(canvasWidth * 0.005))
      : Math.max(8, Math.round(canvasWidth * 0.01));
    const overhang = Math.round(canvasWidth * (floating ? 0.004 : 0.007));
    const shelfX = x - overhang;
    const fullWidth = shelfWidth + overhang * 2;

    context.save();
    context.shadowColor = "rgba(0,0,0,0.32)";
    context.shadowBlur = Math.max(8, canvasWidth * 0.012);
    context.shadowOffsetY = Math.max(5, canvasWidth * 0.007);
    context.fillStyle = theme.shelfFront;
    context.fillRect(shelfX, y + topHeight, fullWidth, frontHeight);
    context.restore();

    const topGradient = context.createLinearGradient(0, y, 0, y + topHeight);
    topGradient.addColorStop(0, theme.shelfEdge);
    topGradient.addColorStop(1, theme.shelfTop);
    context.fillStyle = topGradient;
    context.fillRect(shelfX, y, fullWidth, topHeight);

    const frontGradient = context.createLinearGradient(0, y + topHeight, 0, y + topHeight + frontHeight);
    frontGradient.addColorStop(0, theme.shelfTop);
    frontGradient.addColorStop(1, theme.shelfFront);
    context.fillStyle = frontGradient;
    context.fillRect(shelfX, y + topHeight, fullWidth, frontHeight);

    context.strokeStyle = theme.grain;
    context.lineWidth = Math.max(1, canvasWidth / 2000);
    context.beginPath();
    context.moveTo(shelfX, y + topHeight + frontHeight * 0.62);
    context.lineTo(shelfX + fullWidth, y + topHeight + frontHeight * 0.48);
    context.stroke();
  }

  function drawCubbyFrame(context, frameX, rowStartX, y, frameWidth, rowCount, cellWidth, cellHeight, gap, canvasWidth, theme) {
    const frameSize = Math.max(8, Math.round(canvasWidth * 0.009));
    const overhang = Math.round(canvasWidth * 0.007);
    const left = frameX - overhang;
    const top = y - frameSize;
    const height = cellHeight + frameSize;

    const frameGradient = context.createLinearGradient(left, 0, left + frameSize, 0);
    frameGradient.addColorStop(0, theme.shelfFront);
    frameGradient.addColorStop(0.5, theme.shelfTop);
    frameGradient.addColorStop(1, theme.shelfFront);
    context.fillStyle = frameGradient;
    context.fillRect(left, top, frameWidth + overhang * 2, frameSize);
    context.fillRect(left, top, frameSize, height);
    context.fillRect(left + frameWidth + overhang * 2 - frameSize, top, frameSize, height);

    for (let column = 1; column < rowCount; column += 1) {
      const dividerX = rowStartX + column * cellWidth + (column - 0.5) * gap - frameSize / 2;
      context.fillRect(dividerX, top, frameSize, height);
    }
  }

  function drawImageInCell(context, image, x, y, width, height, fit, background) {
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.fillStyle = background;
    context.fillRect(x, y, width, height);

    const scale = fit === "contain"
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight)
      : Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG 编码失败"));
      }, "image/png");
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function run() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
  }

  function setStatus(overlay, message, kind = "normal") {
    const status = overlay.querySelector("#dcw-status");
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function showToast(message) {
    document.querySelector(".dcw-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "dcw-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function safeFilename(value) {
    return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "豆瓣封面墙";
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readPageTitle(sourceMode = "recommended") {
    const heading = document.querySelector(IS_FIVEBOOKS
      ? ".page-content.people h1, main h1, h1"
      : "#content h1 .subject-name, #content h1 span, #content h1")
      ?.textContent.trim();
    if (!heading) return PAGE_COPY.fallbackTitle;
    if (IS_FIVEBOOKS) {
      if (sourceMode.startsWith("interview:")) {
        return fiveBooksInterviewInfo(fiveBooksInterview(sourceMode)).title;
      }
      if (PAGE_KIND === "fivebooks-archive") return `${heading} 推荐书单`;
      const name = heading.replace(/^Books by\s+/i, "").trim();
      return name ? `${name} ${FIVEBOOKS_SOURCES[sourceMode].titleSuffix}` : PAGE_COPY.fallbackTitle;
    }
    return PAGE_KIND === "author"
      ? heading.replace(/\s*的全部作品\s*[（(]\d+[）)]\s*$/, "").trim() || heading
      : heading;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
