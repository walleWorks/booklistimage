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
    background: "#f5f2eb",
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
    landscape: 9 / 16
  };

  const STYLE_PRESETS = {
    compact: {
      theme: "cover", columns: 6, gap: 0, ratio: "2:3", fit: "cover",
      shadow: "none", structure: "open", alignment: "left", margin: "compact",
      titleMode: "none"
    },
    oak: {
      theme: "oak", columns: 5, gap: 6, ratio: "2:3", fit: "cover",
      shadow: "soft", structure: "open", alignment: "center", margin: "comfortable",
      titleMode: "plaque"
    },
    gallery: {
      theme: "nordic", columns: 5, gap: 10, ratio: "2:3", fit: "contain",
      shadow: "soft", structure: "floating", alignment: "center", margin: "spacious",
      titleMode: "top"
    },
    collector: {
      theme: "walnut", columns: 4, gap: 8, ratio: "2:3", fit: "cover",
      shadow: "strong", structure: "cubby", alignment: "center", margin: "comfortable",
      titleMode: "plaque"
    }
  };

  const THEME_IDS = ["cover", "oak", "walnut", "nordic", "vintage"];
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
  const PAGE_KIND = /^\/personage\/\d+\/creations\/?$/.test(location.pathname)
    ? "author"
    : "doulist";
  const PAGE_COPY = PAGE_KIND === "author"
    ? {
        fallbackTitle: "作者作品",
        launcherTitle: "把这个作者的全部作品做成封面墙",
        sourceName: "作者全部作品",
        itemName: "部作品",
        emptyHint: "请确认这是公开的豆瓣作者作品页"
      }
    : {
        fallbackTitle: "豆列",
        launcherTitle: "把这个豆列做成封面墙",
        sourceName: "豆列",
        itemName: "本书",
        emptyHint: "请确认这是包含图书的公开豆列"
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
    workspaceView: "organize",
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
    title: readPageTitle()
  };

  injectLauncher();
  if (IS_EDITOR) openBuilder();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "DCW_OPEN") {
      openBuilder();
    }
  });

  function injectLauncher() {
    if (document.getElementById("dcw-launcher")) {
      return;
    }

    const button = document.createElement("button");
    button.id = "dcw-launcher";
    button.type = "button";
    button.title = PAGE_COPY.launcherTitle;
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="8" rx="1.2" fill="currentColor"></rect>
        <rect x="14" y="3" width="7" height="8" rx="1.2" fill="currentColor" opacity=".78"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1.2" fill="currentColor" opacity=".78"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1.2" fill="currentColor"></rect>
      </svg>
      <span>生成封面墙</span>
    `;
    button.addEventListener("click", openBuilder);
    document.body.appendChild(button);
  }

  async function openBuilder() {
    let overlay = document.getElementById("dcw-overlay");
    if (!overlay) {
      overlay = createBuilder();
      document.body.appendChild(overlay);
      bindBuilderEvents(overlay);
      await restoreSettings(overlay);
    } else {
      overlay.hidden = false;
    }

    document.documentElement.style.overflow = "hidden";

    if (!state.loaded && !state.loading) {
      if (IS_EDITOR) { state.loaded = true; renderBooks(overlay); setStatus(overlay, "上传封面或导入清单，开始制作你的书单。"); }
      else await loadBooks(overlay);
    } else if (state.loaded) {
      renderBooks(overlay);
    }
  }

  function createBuilder() {
    const overlay = document.createElement("div");
    overlay.id = "dcw-overlay";
    overlay.innerHTML = `
      <section class="dcw-dialog" role="dialog" aria-modal="true" aria-labelledby="dcw-title">
        <header class="dcw-topbar">
          <div class="dcw-brand">
            <span class="dcw-logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <div>
              <h2 id="dcw-title">${escapeHtml(state.title)}</h2>
              <p>豆瓣封面墙 · ${IS_EDITOR ? '独立书单工作台' : PAGE_COPY.sourceName} · 主题成图</p>
            </div>
          </div>
          <button class="dcw-icon-button" type="button" data-action="close" aria-label="关闭">×</button>
        </header>

        <div class="dcw-body">
          <aside class="dcw-panel">
            <h3>墙面设置</h3>

            <details class="dcw-library">
              <summary>项目与自定义模板</summary>
              <label>项目名称<input id="dcw-project-name" type="text" maxlength="80" value="${escapeAttribute(state.title)}"></label>
              <div class="dcw-library-actions"><button type="button" data-action="save-project">保存为项目</button><button type="button" data-action="new-project">新建空白</button></div>
              <label>我的项目<select id="dcw-project-list"><option value="">选择项目</option></select></label>
              <button type="button" data-action="load-project">打开选中项目</button>
              <label>模板名称<input id="dcw-template-name" type="text" maxlength="60" placeholder="例如：每月书单"></label>
              <button type="button" data-action="save-template">保存当前样式为模板</button>
              <label>我的模板<select id="dcw-template-list"><option value="">选择模板</option></select></label>
              <button type="button" data-action="load-template">套用选中模板</button>
              <p class="dcw-help">项目自动保存；另存同名项目会保留原项目。模板只保存样式，不保存作品和标题文字。</p>
            </details>

            <div class="dcw-field">
              <span class="dcw-label">背景主题</span>
              <div class="dcw-theme-grid" role="group" aria-label="背景主题">
                ${[
                  ["cover", "纯封面"],
                  ["oak", "浅橡木"],
                  ["walnut", "深胡桃木"],
                  ["nordic", "北欧白"],
                  ["vintage", "复古绿"]
                ].map(([id, label]) => `
                  <button type="button" data-action="set-theme" data-theme-value="${id}" aria-pressed="${id === "cover"}">
                    <i aria-hidden="true"></i><span>${label}</span>
                  </button>
                `).join("")}
              </div>
            </div>

            <div class="dcw-field">
              <label for="dcw-style-preset">一键风格</label>
              <select id="dcw-style-preset">
                <option value="">自定义设置</option>
                <option value="compact">紧凑封面墙</option>
                <option value="oak">浅木收藏架</option>
                <option value="gallery">北欧画册</option>
                <option value="collector">深色典藏柜</option>
              </select>
            </div>

            <div class="dcw-field-row">
              <div class="dcw-field">
                <label for="dcw-structure">展示结构</label>
                <select id="dcw-structure" data-setting="structure">
                  <option value="open">开放书架</option>
                  <option value="floating">悬浮层板</option>
                  <option value="cubby">格子书柜</option>
                </select>
              </div>
              <div class="dcw-field">
                <label for="dcw-alignment">最后一排</label>
                <select id="dcw-alignment" data-setting="alignment">
                  <option value="left">靠左</option>
                  <option value="center">居中</option>
                </select>
              </div>
            </div>

            <div class="dcw-field">
              <label for="dcw-page-format">成图版式</label>
              <select id="dcw-page-format" data-setting="pageFormat">
                <option value="flow">内容长图</option>
                <option value="square">1:1 方形海报</option>
                <option value="portrait">4:5 竖版海报</option>
                <option value="story">9:16 长竖版</option>
                <option value="landscape">16:9 横版展示</option>
              </select>
            </div>

            <div class="dcw-field">
              <label for="dcw-export-mode">长图策略</label>
              <select id="dcw-export-mode" data-setting="exportMode">
                <option value="auto">自动安全分页</option>
                <option value="single">单张长图</option>
              </select>
            </div>

            <div class="dcw-field">
              <label for="dcw-per-page">每页最多作品数（0 为自动）</label>
              <input id="dcw-per-page" type="number" min="0" max="500" step="1" data-setting="booksPerPage" value="0">
              <p id="dcw-layout-advice" class="dcw-advice"></p>
              <button class="dcw-recommend" type="button" data-action="recommend-layout">采用推荐排版</button>
            </div>

            <div class="dcw-field">
              <label for="dcw-margin">画面边距</label>
              <select id="dcw-margin" data-setting="margin">
                <option value="compact">紧凑</option>
                <option value="comfortable" selected>舒适</option>
                <option value="spacious">宽松</option>
              </select>
            </div>

            <div class="dcw-field-row">
              <div class="dcw-field">
                <label for="dcw-title-mode">标题展示</label>
                <select id="dcw-title-mode" data-setting="titleMode">
                  <option value="none">关闭</option>
                  <option value="top">顶部标题</option>
                  <option value="plaque">书架铭牌</option>
                </select>
              </div>
              <div class="dcw-field">
                <label for="dcw-title-text">标题文字</label>
                <input id="dcw-title-text" data-setting="titleText" type="text" maxlength="80" placeholder="自动生成">
              </div>
            </div>

            <div class="dcw-field-row">
              <div class="dcw-field">
                <label for="dcw-columns">列数</label>
                <select id="dcw-columns" data-setting="columns">
                  ${[3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${n === 5 ? "selected" : ""}>${n} 列</option>`).join("")}
                </select>
              </div>
              <div class="dcw-field">
                <label for="dcw-ratio">封面比例</label>
                <select id="dcw-ratio" data-setting="ratio">
                  <option value="2:3">2:3 经典</option>
                  <option value="3:4">3:4 偏宽</option>
                  <option value="1:1">1:1 方形</option>
                </select>
              </div>
            </div>

            <div class="dcw-field">
              <div class="dcw-range-head">
                <label for="dcw-gap">封面间距</label>
                <span class="dcw-range-value" id="dcw-gap-value">0 px</span>
              </div>
              <input id="dcw-gap" data-setting="gap" type="range" min="0" max="24" step="1" value="0">
            </div>

            <div class="dcw-field-row">
              <div class="dcw-field">
                <label for="dcw-fit">图片方式</label>
                <select id="dcw-fit" data-setting="fit">
                  <option value="cover">铺满裁切</option>
                  <option value="contain">完整显示</option>
                </select>
              </div>
              <div class="dcw-field">
                <label for="dcw-width">导出宽度</label>
                <select id="dcw-width" data-setting="width">
                  <option value="1000">1000 px</option>
                  <option value="1500" selected>1500 px</option>
                  <option value="2000">2000 px</option>
                  <option value="3000">3000 px</option>
                </select>
              </div>
            </div>

            <div class="dcw-field">
              <label for="dcw-background">留白颜色</label>
              <input id="dcw-background" data-setting="background" type="color" value="#f5f2eb">
            </div>

            <div class="dcw-field">
              <label for="dcw-shadow">封面阴影</label>
              <select id="dcw-shadow" data-setting="shadow">
                <option value="none">关闭</option>
                <option value="soft" selected>柔和</option>
                <option value="strong">明显</option>
              </select>
            </div>

            <p class="dcw-help">在「整理作品」中勾选、排序；在「成品预览」中查看每页真实效果。草稿自动保存在当前浏览器。</p>

            <div class="dcw-actions">
              <p class="dcw-export-estimate" id="dcw-export-estimate">读取作品后显示预计导出尺寸</p>
              <button class="dcw-button dcw-button-primary" type="button" data-action="export">导出 PNG</button>
              <button class="dcw-button dcw-button-cancel" type="button" data-action="cancel-export" hidden>取消生成</button>
              <button class="dcw-button dcw-button-secondary" type="button" data-action="reset">恢复默认样式</button>
            </div>
          </aside>

          <main class="dcw-workspace">
            <div class="dcw-viewbar">
              <div role="group" aria-label="工作视图">
                <button type="button" data-action="view-organize" aria-pressed="true">整理作品</button>
                <button type="button" data-action="view-preview" aria-pressed="false">成品预览</button>
              </div>
              <span id="dcw-draft-status" role="status">等待保存草稿</span>
              <button type="button" data-action="undo" disabled title="撤销 Ctrl/Cmd+Z">撤销</button>
              <button type="button" data-action="redo" disabled title="重做 Ctrl/Cmd+Shift+Z">重做</button>
              <button type="button" data-action="refresh-books">更新作品</button>
              <button type="button" data-action="open-editor">独立工作台</button>
            </div>
            <div class="dcw-workspace-head">
              <span class="dcw-status" id="dcw-status" role="status">准备读取${PAGE_COPY.sourceName}…</span>
              <div class="dcw-mini-actions">
                <button type="button" data-action="upload-covers">上传封面</button>
                <button type="button" data-action="import-list" title="TXT：每行一个书名；CSV/TSV：首行需要 title 或书名列；JSON：书名数组或含 title、coverUrl 的对象数组">导入清单</button>
                <button type="button" data-action="select-all">选择全部作品</button>
                <button type="button" data-action="invert">反选全部作品</button>
              </div>
            </div>
            <input type="file" id="dcw-cover-files" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <input type="file" id="dcw-list-file" accept=".txt,.csv,.tsv,.json" hidden>
            <div class="dcw-filterbar" title="搜索和筛选只影响预览；导出仍使用全部已选择作品">
              <input id="dcw-book-search" type="search" placeholder="搜索作品名称" aria-label="搜索作品名称">
              <select id="dcw-view-filter" aria-label="筛选封面">
                <option value="all">显示全部</option>
                <option value="included">仅看已选</option>
                <option value="excluded">仅看已排除</option>
                <option value="missing">待补封面</option>
              </select>
              <span id="dcw-filter-count">全部作品</span>
            </div>
            <div class="dcw-canvas-shell">
              <div id="dcw-preview" class="dcw-organizer">
                <div class="dcw-empty">正在读取${PAGE_COPY.sourceName}中的封面…</div>
              </div>
              <section id="dcw-output" hidden aria-label="成品预览">
                <div class="dcw-pagebar">
                  <button type="button" data-action="previous-page" aria-label="上一页">←</button>
                  <label>页码 <select id="dcw-preview-page" aria-label="预览页码"></select></label>
                  <button type="button" data-action="next-page" aria-label="下一页">→</button>
                  <span id="dcw-page-dimensions"></span>
                  <select id="dcw-preview-fit" aria-label="预览缩放">
                    <option value="page">适合整页</option>
                    <option value="width">适合宽度</option>
                  </select>
                  <button type="button" data-action="retry-preview">重新载入</button>
                </div>
                <p id="dcw-preview-status" role="status"></p>
                <div id="dcw-output-canvas"></div>
              </section>
            </div>
          </main>
        </div>
      </section>
    `;
    return overlay;
  }

  function bindBuilderEvents(overlay) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeBuilder();
        return;
      }

      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) {
        return;
      }
      if ((state.importing || state.libraryBusy || state.loading) && !['close','cancel-export','view-preview','view-organize'].includes(action)) { showToast("正在处理，请稍候"); return; }

      if (action === "close") closeBuilder();
      if (action === "export") exportWall(overlay);
      if (action === "cancel-export") cancelExport(overlay);
      if (action === "reset") resetSettings(overlay);
      if (action === "select-all") setAllIncluded(true, overlay);
      if (action === "invert") invertSelection(overlay);
      if (action === "view-organize") setWorkspaceView("organize", overlay);
      if (action === "view-preview") setWorkspaceView("preview", overlay);
      if (action === "previous-page") changePreviewPage(state.previewPage - 1, overlay);
      if (action === "next-page") changePreviewPage(state.previewPage + 1, overlay);
      if (action === "retry-preview") schedulePreview(overlay);
      if (action === "refresh-books" && !state.loading) loadBooks(overlay);
      if (action === "undo") travelHistory(-1, overlay);
      if (action === "redo") travelHistory(1, overlay);
      if (action === "save-project") runLibraryAction(() => saveProjectAs(overlay));
      if (action === "load-project") runLibraryAction(() => loadProject(overlay));
      if (action === "new-project") runLibraryAction(() => newProject(overlay));
      if (action === "save-template") runLibraryAction(() => saveTemplate(overlay));
      if (action === "load-template") runLibraryAction(() => loadTemplate(overlay));
      if (action === "recommend-layout") applyRecommendation(overlay);
      if (action === "open-editor") sendExtension({type:"DCW_OPEN_EDITOR"}).catch(error=>showToast(error.message));
      if (action === "upload-covers") { state.replaceCoverKey = null; overlay.querySelector("#dcw-cover-files").multiple = true; overlay.querySelector("#dcw-cover-files").click(); }
      if (action === "import-list") overlay.querySelector("#dcw-list-file").click();
      if (action === "set-theme") {
        setTheme(event.target.closest("[data-theme-value]")?.dataset.themeValue, overlay);
      }
    });

    overlay.addEventListener("input", (event) => {
      if (state.importing || state.libraryBusy || state.loading) return;
      if (event.target.id === "dcw-book-search") {
        state.viewQuery = event.target.value.trim().toLocaleLowerCase("zh-CN");
        renderBooks(overlay);
        return;
      }

      const key = event.target.dataset.setting;
      if (!key) return;
      const next = normalizeSetting(key, event.target.value);
      if (state.settings[key] === next) return;
      recordHistory(`setting:${key}`);
      overlay.querySelector("#dcw-style-preset").value = "";
      state.settings[key] = next;
      applySettings(overlay);
      if (key === "columns" && state.loaded) renderBooks(overlay);
      saveSettings();
    });

    overlay.addEventListener("change", (event) => {
      if (event.target.id === "dcw-cover-files") { handleCoverFiles([...event.target.files], overlay); event.target.value = ""; return; }
      if (event.target.id === "dcw-list-file") { handleListFile(event.target.files[0], overlay); event.target.value = ""; return; }
      if (state.importing || state.libraryBusy || state.loading) return;
      if (event.target.id === "dcw-preview-fit") {
        overlay.querySelector("#dcw-output-canvas").dataset.fit = event.target.value;
        fitOutputCanvas(overlay);
        return;
      }
      if (event.target.id === "dcw-preview-page") {
        changePreviewPage(Number(event.target.value), overlay);
        return;
      }
      if (event.target.id === "dcw-style-preset") {
        applyStylePreset(event.target.value, overlay);
        return;
      }
      if (event.target.id === "dcw-view-filter") {
        state.viewFilter = event.target.value;
        renderBooks(overlay);
        return;
      }

      const key = event.target.dataset.setting;
      if (!key) return;
      const next = normalizeSetting(key, event.target.value);
      if (state.settings[key] === next) return;
      recordHistory(`setting:${key}`);
      overlay.querySelector("#dcw-style-preset").value = "";
      state.settings[key] = next;
      applySettings(overlay);
      saveSettings();
    });

    document.addEventListener("keydown", (event) => {
      const editing = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
      if (!overlay.hidden && !editing && !state.importing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1, overlay);
      }
      if (event.key === "Escape" && !overlay.hidden) {
        closeBuilder();
      }
    });
    window.addEventListener("pagehide", flushDraft);
    const previewResize = new ResizeObserver(() => fitOutputCanvas(overlay));
    previewResize.observe(overlay.querySelector(".dcw-canvas-shell"));
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
      const saved = await chrome.storage.local.get(["dcwSettings", draftKey()]);
      state.settings = { ...DEFAULT_SETTINGS, ...(saved.dcwSettings || {}) };
      let draft = saved[draftKey()];
      if (draft?.projectId) {
        const key=`dcwProject:${draft.projectId}`;
        const projects=await chrome.storage.local.get(key), project=projects[key];
        if (project?.version===1 && project.updatedAt>=draft.updatedAt && Array.isArray(project.books) && project.books.every(isDraftBook)) draft=project;
      }
      if (draft?.version === 1 && Array.isArray(draft.books) && draft.books.every(isDraftBook)) {
        state.books = draft.books;
        state.settings = { ...DEFAULT_SETTINGS, ...draft.settings };
        state.title = draft.title || state.title;
        state.projectId = draft.projectId || null;
        state.loaded = true;
        setDraftStatus("已恢复此页面的草稿");
        setStatus(overlay, `已恢复 ${state.books.length} 部作品；${IS_EDITOR ? '可继续上传封面或导入清单。' : '可点击「更新作品」获取新增条目。'}`);
      }
    } catch {
      state.settings = { ...DEFAULT_SETTINGS };
    }

    syncSettingInputs(overlay);
    applySettings(overlay);
    overlay.querySelector("#dcw-title").textContent = state.title;
    overlay.querySelector("#dcw-project-name").value = state.title;
    overlay.querySelector('[data-action="refresh-books"]').hidden = IS_EDITOR;
    overlay.querySelector('[data-action="open-editor"]').hidden = IS_EDITOR;
    refreshLibrary(overlay).catch(()=>setDraftStatus("无法读取项目库，请检查扩展状态"));
  }

  function saveSettings() {
    queueDraft();
    try {
      const pendingSave = chrome.storage.local.set({ dcwSettings: state.settings });
      pendingSave?.catch?.(() => {});
    } catch {
      // 扩展重新加载后，旧标签页中的 content script 会暂时失去扩展上下文。
      // 样式调整仍可继续使用，刷新页面后会恢复设置持久化。
    }
  }

  function draftKey() {
    const url = new URL(location.href);
    const scope = PAGE_KIND === "author" ? (url.searchParams.get("type") || "writer") : "books";
    return `dcwDraft:v1:${url.pathname.replace(/\/$/, "")}:${scope}`;
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

  function applySnapshot(snapshot, overlay) {
    state.title = snapshot.title || '我的书单';
    state.books = snapshot.books.map(book=>({...book}));
    state.settings = {...DEFAULT_SETTINGS,...snapshot.settings};
    state.loaded = true;
    state.previewPage = 0;
    overlay.querySelector('#dcw-title').textContent = state.title;
    overlay.querySelector('#dcw-project-name').value = state.title;
    overlay.querySelector('#dcw-style-preset').value = '';
    syncSettingInputs(overlay);applySettings(overlay);renderBooks(overlay);queueDraft();
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

  async function runLibraryAction(action) {
    if (state.libraryBusy || state.loading || state.exportJob) { showToast('正在读取、保存或导出，请稍候'); return; }
    state.libraryBusy = true;
    document.querySelector('#dcw-overlay')?.classList.add('dcw-importing');
    try { await action(); } catch(error) { showToast(`操作未完成：${error.message}`); }
    finally { state.libraryBusy = false; document.querySelector('#dcw-overlay')?.classList.remove('dcw-importing'); }
  }

  async function refreshLibrary(overlay) {
    const stored = await chrome.storage.local.get(null);
    for (const [prefix,selector,placeholder] of [['dcwProject:','#dcw-project-list','选择项目'],['dcwTemplate:','#dcw-template-list','选择模板']]) {
      const select=overlay.querySelector(selector), selected=select.value;
      select.replaceChildren(new Option(placeholder,''));
      Object.entries(stored).filter(([key,value])=>key.startsWith(prefix)&&value?.version===1).sort((a,b)=>b[1].updatedAt-a[1].updatedAt).forEach(([key,value])=>{
        select.add(new Option(`${value.title || '未命名'}${prefix==='dcwProject:' ? ` · ${value.books?.length || 0} 部` : ''}`,key));
      });
      select.value=selected;
    }
  }

  async function saveProjectAs(overlay) {
    if (await flushDraft() === false) throw new Error('当前草稿未保存，请检查存储空间');
    const title=overlay.querySelector('#dcw-project-name').value.trim() || state.title;
    const projectId=crypto.randomUUID();
    const snapshot={version:1,updatedAt:Date.now(),...captureSnapshot(),title,projectId};
    await chrome.storage.local.set({[`dcwProject:${projectId}`]:snapshot});
    recordHistory();
    state.title=title;state.projectId=projectId;
    overlay.querySelector('#dcw-title').textContent=title;
    await flushDraft();await refreshLibrary(overlay);
    overlay.querySelector('#dcw-project-list').value=`dcwProject:${projectId}`;
    schedulePreview(overlay);showToast('已保存为新项目，后续编辑自动保存');
  }

  async function loadProject(overlay) {
    const key=overlay.querySelector('#dcw-project-list').value;
    if (!key) { showToast('请先选择项目'); return; }
    await preserveCurrentProject();
    const saved=await chrome.storage.local.get(key), project=saved[key];
    if (!project || !Array.isArray(project.books) || !project.books.every(isDraftBook)) throw new Error('项目数据不可用');
    state.projectId=key.slice('dcwProject:'.length);
    state.undo=[];state.redo=[];state.historyGroup=null;
    state.viewQuery='';state.viewFilter='all';
    overlay.querySelector('#dcw-book-search').value='';overlay.querySelector('#dcw-view-filter').value='all';
    applySnapshot(project,overlay);updateHistoryControls();await flushDraft();await refreshLibrary(overlay);
    overlay.querySelector('#dcw-project-list').value=key;
    setStatus(overlay,`已打开项目「${state.title}」 · ${state.books.length} 部作品`);
    showToast('项目已打开，原项目已自动保存');
  }

  async function preserveCurrentProject() {
    if (await flushDraft() === false) throw new Error('当前草稿尚未保存，已取消切换以保护作品');
    // Preserve unnamed work before replacing the page's working draft.
    if (!state.projectId && state.books.length) {
      const id=crypto.randomUUID();
      await chrome.storage.local.set({[`dcwProject:${id}`]:{version:1,updatedAt:Date.now(),projectId:id,...captureSnapshot()}});
    }
  }

  async function newProject(overlay) {
    await preserveCurrentProject();
    state.projectId=crypto.randomUUID();state.undo=[];state.redo=[];state.historyGroup=null;
    state.viewQuery='';state.viewFilter='all';
    overlay.querySelector('#dcw-book-search').value='';overlay.querySelector('#dcw-view-filter').value='all';
    applySnapshot({title:'未命名书单',books:[],settings:DEFAULT_SETTINGS},overlay);
    updateHistoryControls();await flushDraft();await refreshLibrary(overlay);
    setWorkspaceView('organize',overlay);showToast('空白项目已创建，原有作品已保留到项目库');
  }

  async function saveTemplate(overlay) {
    const title=overlay.querySelector('#dcw-template-name').value.trim();
    if (!title) { showToast('请填写模板名称'); return; }
    const settings={...state.settings};delete settings.titleText;
    const key=`dcwTemplate:${crypto.randomUUID()}`;
    await chrome.storage.local.set({[key]:{version:1,title,updatedAt:Date.now(),settings}});
    await refreshLibrary(overlay);overlay.querySelector('#dcw-template-list').value=key;
    showToast('模板已保存，可在其他书单中套用');
  }

  async function loadTemplate(overlay) {
    const key=overlay.querySelector('#dcw-template-list').value;
    if (!key) { showToast('请先选择模板'); return; }
    const saved=await chrome.storage.local.get(key), template=saved[key];
    if (!template?.settings) throw new Error('模板不可用');
    recordHistory();state.settings={...state.settings,...template.settings,titleText:state.settings.titleText};
    syncSettingInputs(overlay);applySettings(overlay);saveSettings();showToast('模板已套用，作品与标题文字保持不变');
  }

  function getRecommendation() {
    return DCWWorkspace.recommendLayout(state.books.filter(book=>book.included).length,state.settings,buildExportPlan);
  }

  function applyRecommendation(overlay) {
    const recommendation=getRecommendation();
    if (!recommendation) { showToast('请先选择作品'); return; }
    recordHistory();
    Object.assign(state.settings,{columns:recommendation.columns,booksPerPage:recommendation.booksPerPage,exportMode:'auto'});
    syncSettingInputs(overlay);applySettings(overlay);saveSettings();
    showToast(`已采用 ${recommendation.columns} 列，每页最多 ${recommendation.booksPerPage} 部`);
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
    const projectKey = state.projectId ? `dcwProject:${state.projectId}` : null;
    state.draftWrite = state.draftWrite.catch(() => {}).then(async () => {
      try {
        await chrome.storage.local.set({ [key]: snapshot, ...(projectKey ? {[projectKey]:snapshot} : {}) });
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
    const host = overlay.querySelector("#dcw-output-canvas");
    const canvas = host.querySelector("canvas");
    if (!canvas || state.workspaceView !== "preview") return;
    if (host.dataset.fit === "width") { canvas.style.maxHeight = "none"; return; }
    const shell = overlay.querySelector(".dcw-canvas-shell");
    const above = host.getBoundingClientRect().top - shell.getBoundingClientRect().top + shell.scrollTop;
    const bottom = parseFloat(getComputedStyle(shell).paddingBottom) || 0;
    canvas.style.maxHeight = `${Math.max(160, shell.clientHeight - above - bottom)}px`;
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

  function resetSettings(overlay) {
    recordHistory();
    state.settings = { ...DEFAULT_SETTINGS };
    overlay.querySelector("#dcw-style-preset").value = "";
    syncSettingInputs(overlay);
    applySettings(overlay);
    if (state.loaded) renderBooks(overlay);
    saveSettings();
  }

  function setTheme(theme, overlay) {
    if (!THEME_IDS.includes(theme)) return;
    recordHistory();
    overlay.querySelector("#dcw-style-preset").value = "";
    state.settings.theme = theme;
    applySettings(overlay);
    saveSettings();
  }

  function applyStylePreset(presetId, overlay) {
    const preset = STYLE_PRESETS[presetId];
    if (!preset) return;
    recordHistory();
    state.settings = { ...state.settings, ...preset };
    syncSettingInputs(overlay);
    overlay.querySelector("#dcw-style-preset").value = presetId;
    applySettings(overlay);
    if (state.loaded) renderBooks(overlay);
    saveSettings();
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
    const { theme, titleMode, gap } = state.settings;
    overlay.querySelectorAll("[data-theme-value]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.themeValue === theme));
    });
    overlay.querySelector("#dcw-shadow").disabled = theme === "cover";
    overlay.querySelector("#dcw-structure").disabled = theme === "cover";
    overlay.querySelector("#dcw-export-mode").disabled = state.settings.pageFormat !== "flow";
    overlay.querySelector("#dcw-per-page").disabled = state.settings.pageFormat === 'flow' && state.settings.exportMode === 'single';
    overlay.querySelector("#dcw-title-text").disabled = titleMode === "none";
    overlay.querySelector("#dcw-gap-value").textContent = `${gap} px`;
    updateExportEstimate(overlay);
    schedulePreview(overlay);
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
    setStatus(overlay, `正在读取${PAGE_COPY.sourceName}第 1 页…`);

    try {
      const allBooks = PAGE_KIND === "author"
        ? await loadAuthorWorks(overlay)
        : await loadDoulistBooks(overlay);

      const hadDraft = state.loaded;
      if (hadDraft) recordHistory();
      state.books = hadDraft ? mergeDraftBooks(state.books, allBooks) : allBooks;
      state.loaded = true;
      renderBooks(overlay);
      queueDraft();

      if (allBooks.length === 0) {
        setStatus(overlay, `没有找到作品封面。${PAGE_COPY.emptyHint}。`, "error");
      } else {
        setStatus(overlay, hadDraft ? `作品已更新，保留原有顺序与选择；共 ${state.books.length} 部作品。` : `已找到 ${allBooks.length} ${PAGE_COPY.itemName} · 勾选、拖动或用箭头排序`);
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
    updateExportEstimate(overlay);
    schedulePreview(overlay);
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
    const height = forcedHeight || naturalHeight;

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
    const recommendation = getRecommendation();
    const advice = overlay.querySelector('#dcw-layout-advice');
    if (advice) advice.textContent = recommendation
      ? `建议 ${recommendation.columns} 列 · 每页最多 ${recommendation.booksPerPage} 部 · 共 ${recommendation.pages} 页（按当前画幅与样式）`
      : '选择作品后提供排版建议；每页数量填 0 表示按画幅自动计算。';
    const recommendButton=overlay.querySelector('[data-action="recommend-layout"]');
    if (recommendButton) recommendButton.disabled=!recommendation;
    const estimate = overlay.querySelector("#dcw-export-estimate");
    if (!estimate) return;
    const count = state.books.filter((book) => book.included).length;
    estimate.dataset.kind = "normal";

    if (count === 0) {
      estimate.textContent = state.loaded ? "请先选择要导出的作品" : "读取作品后显示预计导出尺寸";
      return;
    }

    const plan = buildExportPlan(count, state.settings);
    const fullLayout = calculateLayout(count, state.settings);
    const fixedHeight = getFixedPageHeight(state.settings);
    if (fixedHeight) {
      if (!plan.safe) {
        estimate.textContent = "当前画幅放不下一行封面，请增加列数、减少边距或关闭标题";
        estimate.dataset.kind = "warning";
      } else {
        estimate.textContent = `预计 ${fullLayout.width} × ${fixedHeight} px · ${plan.pageCounts.length} 张 PNG`;
      }
      return;
    }

    if (state.settings.exportMode === "single") {
      estimate.textContent = `预计 ${fullLayout.width} × ${fullLayout.height} px · 1 张 PNG${plan.safe ? "" : " · 尺寸过大"}`;
      if (!plan.safe) estimate.dataset.kind = "warning";
      return;
    }

    if (plan.pageCounts.length === 1) {
      estimate.textContent = `预计 ${plan.layouts[0].width} × ${plan.layouts[0].height} px · 1 张 PNG`;
    } else {
      const tallest = Math.max(...plan.layouts.map((layout) => layout.height));
      estimate.textContent = `预计自动拆分 ${plan.pageCounts.length} 张 PNG · 每张不超过 ${plan.layouts[0].width} × ${tallest} px`;
    }
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
    exportButton.textContent = exporting ? "正在生成…" : "导出 PNG";
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

  function readPageTitle() {
    const heading = document.querySelector("#content h1 .subject-name, #content h1 span, #content h1")
      ?.textContent.trim();
    if (!heading) return PAGE_COPY.fallbackTitle;
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
