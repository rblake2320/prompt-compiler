/**
 * Tool system for Prompt Compiler — v2 with media generation.
 * 
 * Architecture:
 * 1. Built-in tools - shipped with the app (update_html, validate, generate_image, etc.)
 * 2. User tools - custom JSON schemas pasted by user
 * 3. MCP tools - fetched from MCP server endpoints
 * 
 * Tools are injected into Claude API calls via the `tools` parameter.
 * When Claude responds with tool_use, the app executes the tool and
 * sends tool_result back in an agentic loop.
 */

import { generateImage, generateSpeech, imageToDataUri, audioToDataUri } from './mediaProviders.js';
import { createAsset } from './assetManager.js';
import { getModelForTask } from './modelRouter.js';

// ─── Built-in Tool Definitions ────────────────────────────────────

export const BUILT_IN_TOOLS = [
  {
    name: 'update_project_html',
    description:
      'Replace the entire current project HTML with an updated version. ' +
      'Use this when making changes to the landing page, app, or any web project. ' +
      'Always include the COMPLETE HTML document, not just fragments.',
    input_schema: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description: 'The complete updated HTML document (must start with <!DOCTYPE html>)',
        },
        changelog: {
          type: 'string',
          description: 'Brief summary of what changed (shown to user)',
        },
      },
      required: ['html', 'changelog'],
    },
  },
  {
    name: 'report_issues',
    description:
      'Report issues, suggestions, or observations about the current project. ' +
      'Use this to communicate findings from code review or analysis.',
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
  {
    name: 'generate_image',
    description:
      'Generate an AI image using DALL-E or Stability AI. Use this when the user asks for ' +
      'images, illustrations, icons, logos, hero images, product photos, or any visual content. ' +
      'The generated image will be added to the project assets and can be injected into the HTML.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image generation prompt. Be specific about style, composition, colors, mood.',
        },
        name: {
          type: 'string',
          description: 'Short name for the image (used as alt text and asset reference), e.g. "hero-background"',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1792x1024', '1024x1792'],
          description: 'Image dimensions. 1024x1024 for square, 1792x1024 for landscape, 1024x1792 for portrait.',
        },
        style: {
          type: 'string',
          enum: ['natural', 'vivid'],
          description: 'natural for realistic, vivid for hyper-real/dramatic',
        },
        inject_into_html: {
          type: 'boolean',
          description: 'If true, automatically replace a placeholder image in the project HTML',
        },
      },
      required: ['prompt', 'name'],
    },
  },
  {
    name: 'generate_speech',
    description:
      'Generate text-to-speech audio using OpenAI TTS or ElevenLabs. Use this when the user ' +
      'asks for voiceovers, narration, audio versions of text, or speech synthesis.',
    input_schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to convert to speech',
        },
        name: {
          type: 'string',
          description: 'Short name for the audio file, e.g. "welcome-narration"',
        },
        voice: {
          type: 'string',
          enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
          description: 'Voice to use (OpenAI voices). nova=warm female, onyx=deep male, alloy=neutral',
        },
        inject_into_html: {
          type: 'boolean',
          description: 'If true, add an audio player element to the project HTML',
        },
      },
      required: ['text', 'name'],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────

/**
 * Execute a built-in tool and return the result.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {object} context - { currentHtml, onUpdateHtml, onReportIssues, onAssetCreated }
 * @returns {Promise<{ result: string, sideEffects: object }>}
 */
export async function executeBuiltInTool(toolName, toolInput, context) {
  switch (toolName) {
    case 'update_project_html': {
      const { html, changelog } = toolInput;
      if (context.onUpdateHtml) {
        context.onUpdateHtml(html, changelog);
      }
      return {
        result: `Project HTML updated successfully. Changes: ${changelog}`,
        sideEffects: { type: 'html_update', html, changelog },
      };
    }

    case 'report_issues': {
      const { issues } = toolInput;
      if (context.onReportIssues) {
        context.onReportIssues(issues);
      }
      const summary = issues.map(i => `[${i.severity}] ${i.message}`).join('\n');
      return {
        result: `Reported ${issues.length} issue(s):\n${summary}`,
        sideEffects: { type: 'issues', issues },
      };
    }

    case 'generate_image': {
      try {
        const route = getModelForTask('image');
        const imageResult = await generateImage(toolInput.prompt, {
          provider: route.provider,
          model: route.model,
          size: toolInput.size || '1024x1024',
          style: toolInput.style || 'natural',
          returnBase64: true,
        });

        const dataUri = imageToDataUri(imageResult);
        const asset = createAsset({
          type: 'image',
          name: toolInput.name,
          prompt: toolInput.prompt,
          provider: imageResult.provider,
          dataUri,
          mimeType: 'image/png',
          metadata: { revised_prompt: imageResult.revised_prompt, size: toolInput.size },
        });

        if (context.onAssetCreated) {
          context.onAssetCreated(asset);
        }

        // Auto-inject into HTML if requested
        if (toolInput.inject_into_html && context.currentHtml && context.onUpdateHtml) {
          const { injectAssetIntoHtml } = await import('./assetManager.js');
          const updatedHtml = injectAssetIntoHtml(context.currentHtml, asset);
          if (updatedHtml !== context.currentHtml) {
            context.onUpdateHtml(updatedHtml, `Injected image: ${toolInput.name}`);
          }
        }

        return {
          result: `Image "${toolInput.name}" generated successfully using ${imageResult.provider}. ` +
            `${imageResult.revised_prompt ? `Revised prompt: ${imageResult.revised_prompt}. ` : ''}` +
            `The image has been added to project assets.` +
            `${toolInput.inject_into_html ? ' It was also injected into the project HTML.' : ' Use inject_into_html:true to add it to the HTML automatically.'}`,
          sideEffects: { type: 'image_generated', asset },
        };
      } catch (e) {
        return {
          result: `Failed to generate image: ${e.message}`,
          sideEffects: { type: 'error', error: e.message },
        };
      }
    }

    case 'generate_speech': {
      try {
        const route = getModelForTask('tts');
        const speechResult = await generateSpeech(toolInput.text, {
          provider: route.provider,
          model: route.model,
          voice: toolInput.voice || 'nova',
        });

        const dataUri = await audioToDataUri(speechResult);
        const asset = createAsset({
          type: 'audio',
          name: toolInput.name,
          prompt: toolInput.text.slice(0, 200),
          provider: speechResult.provider,
          dataUri,
          mimeType: 'audio/mpeg',
          metadata: { voice: toolInput.voice },
        });

        if (context.onAssetCreated) {
          context.onAssetCreated(asset);
        }

        // Auto-inject audio player
        if (toolInput.inject_into_html && context.currentHtml && context.onUpdateHtml) {
          const { assetToHtml } = await import('./assetManager.js');
          const audioTag = assetToHtml(asset);
          // Add before </body>
          const updatedHtml = context.currentHtml.replace(
            '</body>',
            `\n  <!-- Generated audio: ${toolInput.name} -->\n  <div style="position:fixed;bottom:16px;right:16px;z-index:1000;background:rgba(0,0,0,0.8);padding:12px;border-radius:12px;">\n    <p style="color:white;font-size:12px;margin-bottom:8px;">${toolInput.name}</p>\n    ${audioTag}\n  </div>\n</body>`
          );
          context.onUpdateHtml(updatedHtml, `Added audio player: ${toolInput.name}`);
        }

        return {
          result: `Speech "${toolInput.name}" generated successfully using ${speechResult.provider}. ` +
            `Audio has been added to project assets.` +
            `${toolInput.inject_into_html ? ' An audio player was added to the HTML.' : ''}`,
          sideEffects: { type: 'speech_generated', asset },
        };
      } catch (e) {
        return {
          result: `Failed to generate speech: ${e.message}`,
          sideEffects: { type: 'error', error: e.message },
        };
      }
    }

    default:
      return {
        result: `Unknown tool: ${toolName}`,
        sideEffects: null,
      };
  }
}

// ─── User Tool Management ─────────────────────────────────────────

const USER_TOOLS_KEY = 'pc_user_tools';

export function getUserTools() {
  try {
    return JSON.parse(localStorage.getItem(USER_TOOLS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveUserTools(tools) {
  localStorage.setItem(USER_TOOLS_KEY, JSON.stringify(tools));
}

export function addUserTool(tool) {
  const tools = getUserTools();
  if (!tool.name || !tool.input_schema) {
    throw new Error('Tool must have name and input_schema');
  }
  tools.push({
    ...tool,
    _source: 'user',
    _addedAt: new Date().toISOString(),
  });
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
      const res = await fetch(toolDef._endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, input: toolInput }),
      });
      const data = await res.json();
      return { result: JSON.stringify(data), sideEffects: null };
    } catch (e) {
      return { result: `Tool endpoint error: ${e.message}`, sideEffects: null };
    }
  }
  return {
    result: JSON.stringify(toolInput),
    sideEffects: { type: 'user_tool', name: toolName, output: toolInput },
  };
}

// ─── MCP Server Management ────────────────────────────────────────

const MCP_SERVERS_KEY = 'pc_mcp_servers';

export function getMcpServers() {
  try {
    return JSON.parse(localStorage.getItem(MCP_SERVERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveMcpServers(servers) {
  localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(servers));
}

export async function fetchMcpTools(serverUrl) {
  try {
    const res = await fetch(serverUrl.replace(/\/sse$/, '') + '/tools/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    return (data.tools || []).map(t => ({
      ...t,
      _source: 'mcp',
      _server: serverUrl,
    }));
  } catch (e) {
    console.warn('Failed to fetch MCP tools from', serverUrl, e);
    return [];
  }
}

export async function executeMcpTool(serverUrl, toolName, toolInput) {
  try {
    const res = await fetch(serverUrl.replace(/\/sse$/, '') + '/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName, arguments: toolInput }),
    });
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || '').join('\n');
    return { result: text || JSON.stringify(data), sideEffects: null };
  } catch (e) {
    return { result: `MCP tool error: ${e.message}`, sideEffects: null };
  }
}

// ─── Unified Tool Registry ────────────────────────────────────────

/**
 * Get all available tools (built-in + user + MCP).
 * @param {object} options
 * @param {boolean} options.projectMode - include built-in tools
 * @param {boolean} options.includeMedia - include media generation tools (default: true if projectMode)
 * @returns {Array}
 */
export function getAllTools(options = {}) {
  const tools = [];

  if (options.projectMode) {
    if (options.includeMedia === false) {
      tools.push(...BUILT_IN_TOOLS.filter(t => !['generate_image', 'generate_speech'].includes(t.name)));
    } else {
      tools.push(...BUILT_IN_TOOLS);
    }
  }

  const userTools = getUserTools();
  tools.push(...userTools);

  return tools;
}

/**
 * Route a tool call to the right executor.
 */
export async function routeToolCall(toolName, toolInput, context) {
  // Check built-in first
  const builtIn = BUILT_IN_TOOLS.find(t => t.name === toolName);
  if (builtIn) {
    return executeBuiltInTool(toolName, toolInput, context);
  }

  // Check user tools
  const userTools = getUserTools();
  const userTool = userTools.find(t => t.name === toolName);
  if (userTool) {
    return executeUserTool(toolName, toolInput, userTool);
  }

  // Check MCP tools
  const mcpServers = getMcpServers();
  for (const server of mcpServers) {
    if (!server.enabled) continue;
    try {
      return await executeMcpTool(server.url, toolName, toolInput);
    } catch {
      continue;
    }
  }

  return { result: `Tool not found: ${toolName}`, sideEffects: null };
}
