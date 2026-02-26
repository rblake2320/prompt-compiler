/**
 * Project persistence layer using IndexedDB.
 * Each project stores: compiled prompt, current HTML, conversation, versions.
 */

const DB_NAME = 'prompt_compiler_projects';
const DB_VERSION = 1;
const STORE = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => resolve(result._result ?? result);
      t.onerror = () => reject(t.error);
    });
  });
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new project
 */
export function createProject({
  name,
  input,
  compiledPrompt = '',
  layers = null,
  layerKeys = [],
  currentHtml = '',
  conversation = [],
}) {
  const now = new Date().toISOString();
  const project = {
    id: generateId(),
    name: name || input.slice(0, 60) + (input.length > 60 ? '...' : ''),
    input,
    compiledPrompt,
    layers,
    layerKeys,
    currentHtml,
    conversation,
    versions: [],
    tools: [],        // user-configured tools for this project
    errors: [],       // last captured errors
    createdAt: now,
    updatedAt: now,
  };
  return tx('readwrite', store => {
    store.put(project);
    return { _result: project };
  });
}

/**
 * Update an existing project (partial update)
 */
export async function updateProject(id, updates) {
  const project = await getProject(id);
  if (!project) throw new Error('Project not found: ' + id);
  const updated = { ...project, ...updates, updatedAt: new Date().toISOString() };
  return tx('readwrite', store => {
    store.put(updated);
    return { _result: updated };
  });
}

/**
 * Save a version snapshot
 */
export async function saveVersion(id, label) {
  const project = await getProject(id);
  if (!project) throw new Error('Project not found');
  const version = {
    id: generateId(),
    label: label || `v${(project.versions?.length || 0) + 1}`,
    timestamp: new Date().toISOString(),
    currentHtml: project.currentHtml,
    conversation: [...project.conversation],
  };
  const versions = [...(project.versions || []), version].slice(-20); // keep last 20
  return updateProject(id, { versions });
}

/**
 * Restore a version
 */
export async function restoreVersion(projectId, versionId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found');
  const version = project.versions?.find(v => v.id === versionId);
  if (!version) throw new Error('Version not found');
  return updateProject(projectId, {
    currentHtml: version.currentHtml,
    conversation: version.conversation,
  });
}

/**
 * Get a single project by ID
 */
export function getProject(id) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * List all projects, newest first
 */
export function listProjects() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).index('updatedAt').getAll();
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Delete a project
 */
export function deleteProject(id) {
  return tx('readwrite', store => {
    store.delete(id);
  });
}

/**
 * Export project as JSON
 */
export async function exportProject(id) {
  const p = await getProject(id);
  if (!p) throw new Error('Project not found');
  return JSON.stringify(p, null, 2);
}

/**
 * Import project from JSON
 */
export function importProject(json) {
  const p = typeof json === 'string' ? JSON.parse(json) : json;
  p.id = generateId(); // new ID to avoid collisions
  p.updatedAt = new Date().toISOString();
  return tx('readwrite', store => {
    store.put(p);
    return { _result: p };
  });
}
