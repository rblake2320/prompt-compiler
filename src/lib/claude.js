function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location.hostname.includes('claude.ai')) {
    return 'https://api.anthropic.com';
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/anthropic';
  }
  return '/api/anthropic';
}

export async function callClaude(system, userMessage) {
  const url = `${getBaseUrl()}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  return (data.content || []).map((b) => b.text || '').join('');
}

export function robustJsonParse(raw) {
  let s = raw.trim().replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('No JSON object found');
  let sub = s.slice(first, last + 1);
  try { return JSON.parse(sub); } catch (_) {}
  sub = sub.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
    m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  );
  try { return JSON.parse(sub); } catch (e) {
    throw new Error('JSON parse failed: ' + e.message);
  }
}
