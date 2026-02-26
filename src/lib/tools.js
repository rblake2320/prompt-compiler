/**
 * Tool system for Prompt Compiler.
 * 
 * Architecture:
 * 1. Built-in tools - shipped with the app (update_html, validate, etc.)
 * 2. User tools - custom JSON schemas pasted by user
 * 3. MCP tools - fetched from MCP server endpoints (future)
 * 
 * Tools are injected into Claude API calls via the `tools` parameter.
 * When Claude responds with tool_use, the app executes the tool and
 * sends tool_result back in an agentic loop.
 */

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
];

// ─── Tool Execution ───────────────────────────────────────────────

/**
 * Execute a built-in tool and return the result.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {object} context - { currentHtml, onUpdateHtml, onReportIssues }
 * @returns {{ result: string, sideEffects: object }}
 */
export function executeBuiltInTool(toolName, toolInput, context) {
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
  // Validate schema
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

/**
 * Execute a user-defined tool.
 * User tools can specify an endpoint URL for remote execution,
 * or they return a no-op result (the AI's output IS the result).
 */
export async function executeUserTool(toolName, toolInput, toolDef) {
  // If tool has an endpoint, call it
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

  // No endpoint — return the input as the result (AI structured output)
  return {
    result: JSON.stringify(toolInput),
    sideEffects: { type: 'user_tool', name: toolName, output: toolInput },
  };
}

// ─── MCP Server Management ────────────────────────────────────────

const MCP_SERVERS_KEY = 'pc_mcp_servers';

/**
 * MCP server config:
 * { name: string, url: string, transport: 'sse'|'http', enabled: boolean }
 */
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

/**
 * Fetch available tools from an MCP server (SSE transport).
 * POST to /tools/list endpoint.
 */
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

/**
 * Execute a tool on an MCP server.
 */
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
 * Returns array in Claude API tool format.
 */
export function getAllTools(options = {}) {
  const tools = [];

  // Built-in tools (always available when in project mode)
  if (options.projectMode) {
    tools.push(...BUILT_IN_TOOLS);
  }

  // User-defined tools
  const userTools = getUserTools();
  tools.push(...userTools);

  return tools;
}

/**
 * Route a tool call to the right executor.
 * @returns {Promise<{ result: string, sideEffects: object|null }>}
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
    // We'd need cached tool lists here — for now, try calling
    try {
      return await executeMcpTool(server.url, toolName, toolInput);
    } catch {
      continue;
    }
  }

  return { result: `Tool not found: ${toolName}`, sideEffects: null };
}
