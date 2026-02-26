/**
 * Asset Manager — tracks all media assets generated for a project.
 * 
 * Assets are stored in memory during the session and persisted
 * as part of the project in IndexedDB.
 *
 * Asset types: image, audio, video, file
 * Each asset has: id, type, name, provider, prompt/source, dataUri, metadata
 */

import { generateId } from './projects.js';

/**
 * Create a new asset record.
 */
export function createAsset({
  type,       // 'image' | 'audio' | 'video' | 'file'
  name,       // display name
  prompt,     // original generation prompt (if AI-generated)
  provider,   // which API generated it
  dataUri,    // data:... URI or blob URL
  url,        // external URL (if hosted)
  mimeType,   // e.g. 'image/png', 'audio/mp3'
  metadata,   // provider-specific metadata
}) {
  return {
    id: generateId(),
    type,
    name: name || `${type}-${Date.now()}`,
    prompt: prompt || '',
    provider: provider || 'unknown',
    dataUri: dataUri || '',
    url: url || '',
    mimeType: mimeType || '',
    metadata: metadata || {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate an HTML tag for embedding an asset in a project.
 */
export function assetToHtml(asset) {
  const src = asset.dataUri || asset.url;
  if (!src) return `<!-- Asset ${asset.name}: no source available -->`;

  switch (asset.type) {
    case 'image':
      return `<img src="${src}" alt="${asset.name}" class="generated-asset" data-asset-id="${asset.id}" />`;

    case 'audio':
      return `<audio controls data-asset-id="${asset.id}">\n  <source src="${src}" type="${asset.mimeType || 'audio/mpeg'}">\n  Your browser does not support audio.\n</audio>`;

    case 'video':
      return `<video controls data-asset-id="${asset.id}">\n  <source src="${src}" type="${asset.mimeType || 'video/mp4'}">\n</video>`;

    default:
      return `<a href="${src}" download="${asset.name}" data-asset-id="${asset.id}">${asset.name}</a>`;
  }
}

/**
 * Inject an asset into HTML at a placeholder location.
 * Looks for: <!-- ASSET:asset_name --> or replaces placeholder images.
 */
export function injectAssetIntoHtml(html, asset) {
  const src = asset.dataUri || asset.url;
  if (!src || !html) return html;

  // Replace placeholder comments
  const commentPattern = new RegExp(
    `<!--\\s*ASSET:\\s*${escapeRegex(asset.name)}\\s*-->`,
    'gi'
  );
  let result = html.replace(commentPattern, assetToHtml(asset));

  // Replace placeholder.com images with matching alt text
  if (asset.type === 'image') {
    const placeholderPattern = new RegExp(
      `(src=")https?://(?:via\\.placeholder\\.com|placehold\\.co|placeholder\\.com)/[^"]*?("[^>]*?alt="[^"]*?${escapeRegex(asset.name)}[^"]*?")`,
      'gi'
    );
    result = result.replace(placeholderPattern, `$1${src}$2`);
  }

  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get total size of all assets (approximate, from data URIs).
 */
export function getTotalAssetSize(assets) {
  let totalBytes = 0;
  for (const a of assets) {
    if (a.dataUri) {
      // Base64 data URI: ~75% efficiency
      const base64Part = a.dataUri.split(',')[1] || '';
      totalBytes += Math.ceil(base64Part.length * 0.75);
    }
  }
  return totalBytes;
}

/**
 * Format bytes to human-readable.
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
