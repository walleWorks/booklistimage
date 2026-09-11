const imageCache = new Map();
const activeDownloads = new Map();
const IMAGE_CACHE_MAX_BYTES = 24 * 1024 * 1024;
let imageCacheBytes = 0;

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !isSupportedPage(tab.url)) {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "DCW_OPEN" }).catch(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
  });
});

function isSupportedPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:"
      && url.hostname === "www.douban.com"
      && (/^\/doulist\/\d+\/?$/.test(url.pathname)
        || /^\/personage\/\d+\/creations\/?$/.test(url.pathname));
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'DCW_OPEN_EDITOR') {
    chrome.tabs.create({url:chrome.runtime.getURL('editor.html')});
    sendResponse({ok:true}); return false;
  }
  if (message?.type === 'DCW_STORE_COVER') {
    storeLocalCover(message.dataUrl).then(url=>sendResponse({ok:true,url})).catch(error=>sendResponse({ok:false,error:error.message}));
    return true;
  }
  if (message?.type === "DCW_CANCEL_EXPORT") {
    cancelDownloads(message.jobId);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== "DCW_FETCH_IMAGE") {
    return false;
  }

  fetchImageAsDataUrl(message.url, message.jobId)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
    .catch((error) => sendResponse({
      ok: false,
      error: error.name === "AbortError" ? "生成已取消" : error.message
    }));

  return true;
});

async function fetchImageAsDataUrl(url, jobId) {
  if (typeof url === 'string' && url.startsWith('dcw-upload:')) return readLocalCover(url.slice(11));
  if (imageCache.has(url)) {
    const cached = imageCache.get(url);
    imageCache.delete(url);
    imageCache.set(url, cached);
    return cached.dataUrl;
  }

  const controller = new AbortController();
  trackDownload(jobId, controller);
  try {
    const dataUrl = await downloadImage(url, controller.signal);
    cacheImage(url, dataUrl);
    return dataUrl;
  } finally {
    untrackDownload(jobId, controller);
  }
}

let coverDatabase;
function openCoverDatabase() {
  if (!coverDatabase) coverDatabase = new Promise((resolve,reject)=>{
    const request = indexedDB.open('dcw-covers',1);
    request.onupgradeneeded = () => request.result.createObjectStore('covers');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地封面库'));
  }).catch(error=>{coverDatabase=null;throw error;});
  return coverDatabase;
}
async function storeLocalCover(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 8*1024*1024 || !/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new Error('封面格式无效或文件过大');
  const db=await openCoverDatabase(), id=crypto.randomUUID();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('covers','readwrite');tx.objectStore('covers').put(dataUrl,id);
    tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('封面保存失败，请检查存储空间'));tx.onabort=()=>reject(new Error('封面保存已中止'));
  });
  return 'dcw-upload:'+id;
}
async function readLocalCover(id) {
  const db=await openCoverDatabase();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('covers').objectStore('covers').get(id);
    req.onsuccess=()=>req.result ? resolve(req.result) : reject(new Error('本地封面已丢失，请重新上传'));
    req.onerror=()=>reject(new Error('无法读取本地封面'));
  });
}

function trackDownload(jobId, controller) {
  if (!jobId) return;
  if (!activeDownloads.has(jobId)) activeDownloads.set(jobId, new Set());
  activeDownloads.get(jobId).add(controller);
}

function untrackDownload(jobId, controller) {
  const downloads = activeDownloads.get(jobId);
  if (!downloads) return;
  downloads.delete(controller);
  if (downloads.size === 0) activeDownloads.delete(jobId);
}

function cancelDownloads(jobId) {
  const downloads = activeDownloads.get(jobId);
  if (!downloads) return;
  downloads.forEach((controller) => controller.abort());
  activeDownloads.delete(jobId);
}

function cacheImage(url, dataUrl) {
  const size = dataUrl.length;
  if (size > IMAGE_CACHE_MAX_BYTES) return;

  const existing = imageCache.get(url);
  if (existing) imageCacheBytes -= existing.size;
  imageCache.set(url, { dataUrl, size });
  imageCacheBytes += size;
  while (imageCacheBytes > IMAGE_CACHE_MAX_BYTES && imageCache.size > 0) {
    const oldestUrl = imageCache.keys().next().value;
    const oldest = imageCache.get(oldestUrl);
    imageCache.delete(oldestUrl);
    imageCacheBytes -= oldest.size;
  }
}

async function downloadImage(rawUrl, signal) {
  const url = new URL(rawUrl);
  const allowed =
    url.protocol === "https:" &&
    (url.hostname === "douban.com" ||
      url.hostname.endsWith(".douban.com") ||
      url.hostname.endsWith(".doubanio.com"));

  if (!allowed) {
    throw new Error("不支持的图片地址");
  }

  const response = await fetch(url.href, { credentials: "omit", signal });

  if (!response.ok) {
    throw new Error(`封面读取失败（${response.status}）`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("封面地址没有返回图片");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${contentType};base64,${btoa(binary)}`;
}
