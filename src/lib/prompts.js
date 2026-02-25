export const DEFAULT_LAYERS = [
  { key: 'prompt',  label: 'Prompt Engineering',           short: 'Prompt',     icon: '✍️',  question: 'How should the instruction be phrased?' },
  { key: 'context', label: 'Context Engineering',          short: 'Context',    icon: '📚', question: 'What must the model know right now?' },
  { key: 'intent',  label: 'Intent Engineering',           short: 'Intent',     icon: '🎯', question: 'What outcome is desired and why?' },
  { key: 'flow',    label: 'Flow Engineering',             short: 'Flow',       icon: '🔄', question: 'How should this break into reliable steps?' },
  { key: 'eval',    label: 'Evaluation Engineering',       short: 'Eval',       icon: '✅', question: 'How do we know it works correctly?' },
  { key: 'tool',    label: 'Tool / Integration Engineering', short: 'Tool',     icon: '🔧', question: 'What external actions or data are needed?' },
];

// Backward compat
export const LAYER_META = DEFAULT_LAYERS;

export function buildDecomposeSystem(layers) {
  const shape = layers
    .map(l => `  "${l.key}": { "analysis": "...", "elements": ["...", "..."] }`)
    .join(',\n');
  return `You are a Prompt Architect. Given ANY user task, decompose it into ${layers.length} AI engineering layer${layers.length === 1 ? '' : 's'}.

For each layer provide:
- "analysis": 2-3 sentences explaining what this layer requires for the task
- "elements": array of 3-6 short actionable items

CRITICAL RULES:
- Respond with ONLY valid JSON. No markdown fences. No commentary before or after.
- Keep all string values on a single line. Never use literal newlines inside JSON strings.
- Do not use unescaped double quotes inside string values.

Exact shape required:
{
${shape}
}`;
}

export function buildSynthesizeSystem(layers) {
  const layerList = layers.map(l => `- ${l.label}`).join('\n');
  return `You are a Prompt Architect. You receive a ${layers.length}-layer decomposition of a user's task. Synthesize ALL layers into ONE production-grade system prompt.

Active layers:
${layerList}

Requirements:
- Incorporate every layer with appropriate depth and structure
- Use XML-style section tags for organization
- Be thorough but lean — no padding or filler

Respond with ONLY the raw prompt text. No preamble. No wrapping. Just the prompt itself.`;
}

export const DECOMPOSE_SYSTEM = buildDecomposeSystem(DEFAULT_LAYERS);
export const SYNTHESIZE_SYSTEM = buildSynthesizeSystem(DEFAULT_LAYERS);
