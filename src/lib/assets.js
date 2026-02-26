/**
 * Asset Manager for Prompt Compiler.
 *
 * Stores generated media (images, audio) in IndexedDB alongside projects.
 * Assets are linked to projects by projectId and can be injected into HTML.
 *
 * Storage: IndexedDB 'prompt_compiler_db' → 'assets' store
 */

const DB_NAME = 'prompt_compiler_db';
const DB_VERSION = 2;
const STORE_NAME = 'assets';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('projects')) {
        const projStore = db.createObjectStore('projects', { keyPath: 'id' });
        projStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

function tx(db, storeName, mode = 'readonly') {
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

function generateId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveAsset(assetData) {
  const db = await openDB();
  const asset = {
    id: generateId(),
    projectId: assetData.projectId || 'unlinked',
    type: assetData.type,
    name: assetData.name || `${assetData.type}_${Date.now()}`,
    prompt: assetData.prompt || '',
    provider: assetData.provider || 'unknown',
    format: assetData.format || 'bin',
    dataUri: assetData.dataUri || '',
    metadata: assetData.metadata || {},
    size: assetData.dataUri ? Math.ceil(assetData.dataUri.length * 0.75) : 0,
    createdAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, 'readwrite');
    const req = store.put(asset);
    req.onsuccess = () => resolve(asset);
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectAssets(projectId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME);
    const idx = store.index('projectId');
    const req = idx.getAll(projectId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getAsset(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAsset(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME, 'readwrite');
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectAssets(projectId) {
  const assets = await getProjectAssets(projectId);
  const db = await openDB();
  const store = tx(db, STORE_NAME, 'readwrite');
  for (const asset of assets) {
    store.delete(asset.id);
  }
}

export async function getAllAssets() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function injectImageAsset(html, assetId, dataUri) {
  let updated = html;
  updated = updated.replace(new RegExp(`src=["']ASSET:${assetId}["']`, 'g'), `src="${dataUri}"`);
  updated = updated.replace(new RegExp(`data-asset=["']${assetId}["']`, 'g'), `data-asset="${assetId}" src="${dataUri}"`);
  return updated;
}

export function injectAudioAsset(html, assetId, dataUri, opts = {}) {
  const { autoplay = false, loop = false, controls = true } = opts;
  const attrs = [
    controls ? 'controls' : '',
    autoplay ? 'autoplay' : '',
    loop ? 'loop' : '',
  ].filter(Boolean).join(' ');
  const audioTag = `<audio id="asset-${assetId}" ${attrs} src="${dataUri}"></audio>`;
  const existing = new RegExp(`<audio[^>]*id=["']asset-${assetId}["'][^>]*>.*?</audio>`, 's');
  if (existing.test(html)) {
    return html.replace(existing, audioTag);
  }
  return html.replace('</body>', `  ${audioTag}\n</body>`);
}

export function imagePlaceholder(assetId, prompt, width = 400, height = 300) {
  return `<div style="width:${width}px;height:${height}px;background:#1a1a2e;border:2px dashed #6366f1;display:flex;align-items:center;justify-content:center;border-radius:12px;margin:1rem auto;">
  <div style="text-align:center;color:#a5b4fc;padding:1rem;">
    <div style="font-size:2rem;margin-bottom:0.5rem;">🎨</div>
    <div style="font-size:0.85rem;">Generating: ${prompt.slice(0, 60)}...</div>
    <img src="ASSET:${assetId}" alt="${prompt}" style="display:none;" data-asset="${assetId}" />
  </div>
</div>`;
}

export async function exportProjectWithAssets(project) {
  const assets = await getProjectAssets(project.id);
  return { ...project, _assets: assets, _exportedAt: new Date().toISOString() };
}

export async function importProjectAssets(assets) {
  for (const asset of assets) {
    await saveAsset(asset);
  }
}

export async function getStorageStats() {
  const assets = await getAllAssets();
  const totalSize = assets.reduce((sum, a) => sum + (a.size || 0), 0);
  const byType = {};
  for (const a of assets) {
    byType[a.type] = (byType[a.type] || 0) + 1;
  }
  return {
    totalAssets: assets.length,
    totalSizeBytes: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    byType,
  };
}
