/**
 * Tool system for Prompt Compiler.
 *
 * Architecture:
 * 1. Built-in tools - shipped with the app (update_html, validate, etc.)
 * 2. Media tools - image/speech/audio generation (route to providers)
 * 3. User tools - custom JSON schemas pasted by user
 * 4. MCP tools - fetched from MCP server endpoints
 */

import { generateImage, generateSpeech, blobToDataUri } from './providers.js';
import { saveAsset, injectImageAsset, injectAudioAsset } from './assets.js';

// ─── Built-in Tool Definitions ────────────────────────────────────

export const BUILT_IN_TOOLS = [
  {
    name: 'update_project_html',
    description: 'Replace the entire current project HTML with an updated version. Use this when making changes to the landing page, app, or any web project. Always include the COMPLETE HTML document, not just fragments.',
    input_schema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'The complete updated HTML document (must start with <!DOCTYPE html>)' },
        changelog: { type: 'string', description: 'Brief summary of what changed (shown to user)' },
      },
      required: ['html', 'changelog'],
    },
  },
  {
    name: 'report_issues',
    description: 'Report issues, suggestions, or observations about the current project. Use this to communicate findings from code review or analysis.',
    input_schema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['error', 'warning', 'info'] },
              message: { type: 'string' },
              suggestion: { type: 'string' },
            },
            required: ['severity', 'message'],
          },
          description: 'List of issues found',
        },
      },
      required: ['issues'],
    },
  },
];

// ─── Media Tool Definitions ───────────────────────────────────────

export const MEDIA_TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate an image using AI (DALL-E 3 or Stability AI). Returns an asset ID that can be injected into the project HTML. After generating, use update_project_html to add the image using <img src="ASSET:{asset_id}" /> which will be auto-replaced.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate. Be specific about style, composition, colors.' },
        name: { type: 'string', description: 'Short name for the image (e.g., "hero-banner", "product-photo")' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions' },
        style: { type: 'string', enum: ['vivid', 'natural'], description: 'vivid=hyper-real/dramatic, natural=more realistic' },
      },
      required: ['prompt', 'name'],
    },
  },
  {
    name: 'generate_speech',
    description: 'Convert text to speech using AI (OpenAI TTS or ElevenLabs). Returns an asset ID. Use update_project_html to add an <audio> tag.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to convert to speech' },
        name: { type: 'string', description: 'Short name for the audio clip' },
        voice: { type: 'string', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], description: 'Voice to use' },
        speed: { type: 'number', description: 'Speech speed (0.25 to 4.0, default 1.0)' },
      },
      required: ['text', 'name'],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────

export async function executeBuiltInTool(toolName, toolInput, context) {
  switch (toolName) {
    case 'update_project_html': {
      const { html, changelog } = toolInput;
      if (context.onUpdateHtml) context.onUpdateHtml(html, changelog);
      return { result: `Project HTML updated successfully. Changes: ${changelog}`, sideEffects: { type: 'html_update', html, changelog } };
    }
    case 'report_issues': {
      const { issues } = toolInput;
      if (context.onReportIssues) context.onReportIssues(issues);
      const summary = issues.map(i => `[${i.severity}] ${i.message}`).join('\n');
      return { result: `Reported ${issues.length} issue(s):\n${summary}`, sideEffects: { type: 'issues', issues } };
    }
    case 'generate_image': return executeImageGeneration(toolInput, context);
    case 'generate_speech': return executeSpeechGeneration(toolInput, context);
    default: return { result: `Unknown tool: ${toolName}`, sideEffects: null };
  }
}

async function executeImageGeneration(input, context) {
  const { prompt, name, size = '1024x1024', style = 'vivid' } = input;
  try {
    if (context.onToolStatus) context.onToolStatus('generate_image', 'running', `Generating image: ${name}...`);
    const result = await generateImage({ prompt, size, style });
    const asset = await saveAsset({
      projectId: context.projectId || 'unlinked', type: 'image', name, prompt,
      provider: result.provider, format: result.format, dataUri: result.url,
      metadata: { size, style, revised_prompt: result.revised_prompt },
    });
    if (context.onAssetGenerated) context.onAssetGenerated(asset);
    if (context.currentHtml && context.onUpdateHtml) {
      const updated = injectImageAsset(context.currentHtml, asset.id, asset.dataUri);
      if (updated !== context.currentHtml) context.onUpdateHtml(updated, `Injected image: ${name}`);
    }
    if (context.onToolStatus) context.onToolStatus('generate_image', 'done', `Image generated: ${name}`);
    return {
      result: `Image "${name}" generated successfully.\nAsset ID: ${asset.id}\nProvider: ${result.provider}\n${result.revised_prompt ? `Revised prompt: ${result.revised_prompt}` : ''}\n\nTo add this image, use update_project_html with:\n<img src="ASSET:${asset.id}" alt="${prompt.slice(0, 100)}" />`,
      sideEffects: { type: 'asset_generated', asset },
    };
  } catch (e) {
    if (context.onToolStatus) context.onToolStatus('generate_image', 'error', e.message);
    return { result: `Image generation failed: ${e.message}. Check Settings → Model Router for API keys.`, sideEffects: { type: 'error', error: e.message } };
  }
}

async function executeSpeechGeneration(input, context) {
  const { text, name, voice = 'nova', speed = 1.0 } = input;
  try {
    if (context.onToolStatus) context.onToolStatus('generate_speech', 'running', `Generating speech: ${name}...`);
    const result = await generateSpeech({ text, voice, speed });
    let dataUri = result.url;
    if (result.blob) dataUri = await blobToDataUri(result.blob);
    const asset = await saveAsset({
      projectId: context.projectId || 'unlinked', type: 'speech', name,
      prompt: text.slice(0, 200), provider: result.provider, format: result.format, dataUri,
      metadata: { voice, speed, text_length: text.length, duration_estimate: result.duration_estimate },
    });
    if (context.onAssetGenerated) context.onAssetGenerated(asset);
    if (context.currentHtml && context.onUpdateHtml) {
      const updated = injectAudioAsset(context.currentHtml, asset.id, dataUri, { controls: true });
      if (updated !== context.currentHtml) context.onUpdateHtml(updated, `Added speech audio: ${name}`);
    }
    if (context.onToolStatus) context.onToolStatus('generate_speech', 'done', `Speech generated: ${name}`);
    return {
      result: `Speech "${name}" generated successfully.\nAsset ID: ${asset.id}\nVoice: ${voice}\nDuration: ~${result.duration_estimate}s\n\nTo add audio, use update_project_html with:\n<audio controls src="ASSET:${asset.id}"></audio>`,
      sideEffects: { type: 'asset_generated', asset },
    };
  } catch (e) {
    if (context.onToolStatus) context.onToolStatus('generate_speech', 'error', e.message);
    return { result: `Speech generation failed: ${e.message}. Check Settings → Model Router for API keys.`, sideEffects: { type: 'error', error: e.message } };
  }
}

// ─── User Tool Management ─────────────────────────────────────────

const USER_TOOLS_KEY = 'pc_user_tools';

export function getUserTools() {
  try { return JSON.parse(localStorage.getItem(USER_TOOLS_KEY) || '[]'); }
  catch { return []; }
}

export function saveUserTools(tools) { localStorage.setItem(USER_TOOLS_KEY, JSON.stringify(tools)); }

export function addUserTool(tool) {
  const tools = getUserTools();
  if (!tool.name || !tool.input_schema) throw new Error('Tool must have name and input_schema');
  tools.push({ ...tool, _source: 'user', _addedAt: new Date().toISOString() });
  saveUserTools(tools);
  return tools;
}

export function removeUserTool(name) {
  const tools = getUserTools().filter(t => t.name !== name);
  saveUserTools(tools);
  return tools;
}

export async function executeUserTool(toolName, toolInput, toolDef) {
  if (toolDef._endpoint) {
    try {
      const res = await fetch(toolDef._endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: toolName, input: toolInput }) });
      const data = await res.json();
      return { result: JSON.stringify(data), sideEffects: null };
    } catch (e) { return { result: `Tool endpoint error: ${e.message}`, sideEffects: null }; }
  }
  return { result: JSON.stringify(toolInput), sideEffects: { type: 'user_tool', name: toolName, output: toolInput } };
}

// ─── MCP Server Management ────────────────────────────────────────

const MCP_SERVERS_KEY = 'pc_mcp_servers';

export function getMcpServers() {
  try { return JSON.parse(localStorage.getItem(MCP_SERVERS_KEY) || '[]'); }
  catch { return []; }
}

export function saveMcpServers(servers) { localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(servers)); }

export async function fetchMcpTools(serverUrl) {
  try {
    const res = await fetch(serverUrl.replace(/\/sse$/, '') + '/tools/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    return (data.tools || []).map(t => ({ ...t, _source: 'mcp', _server: serverUrl }));
  } catch (e) { console.warn('Failed to fetch MCP tools from', serverUrl, e); return []; }
}

export async function executeMcpTool(serverUrl, toolName, toolInput) {
  try {
    const res = await fetch(serverUrl.replace(/\/sse$/, '') + '/tools/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: toolName, arguments: toolInput }) });
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('\n');
    return { result: text || JSON.stringify(data), sideEffects: null };
  } catch (e) { return { result: `MCP tool error: ${e.message}`, sideEffects: null }; }
}

// ─── Unified Tool Registry ────────────────────────────────────────

export function getAllTools(options = {}) {
  const tools = [];
  if (options.projectMode) tools.push(...BUILT_IN_TOOLS);
  if (options.mediaEnabled !== false) tools.push(...MEDIA_TOOLS);
  tools.push(...getUserTools());
  return tools;
}

export async function routeToolCall(toolName, toolInput, context) {
  const builtIn = [...BUILT_IN_TOOLS, ...MEDIA_TOOLS].find(t => t.name === toolName);
  if (builtIn) return executeBuiltInTool(toolName, toolInput, context);
  const userTools = getUserTools();
  const userTool = userTools.find(t => t.name === toolName);
  if (userTool) return executeUserTool(toolName, toolInput, userTool);
  const mcpServers = getMcpServers();
  for (const server of mcpServers) {
    if (!server.enabled) continue;
    try { return await executeMcpTool(server.url, toolName, toolInput); } catch { continue; }
  }
  return { result: `Tool not found: ${toolName}`, sideEffects: null };
}
