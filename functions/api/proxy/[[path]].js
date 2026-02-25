const PROVIDER_TARGETS = {
  anthropic: { base: 'https://api.anthropic.com', authType: 'anthropic' },
  openai:    { base: 'https://api.openai.com',    authType: 'bearer'    },
  groq:      { base: 'https://api.groq.com/openai', authType: 'bearer'  },
};

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, x-api-key, Authorization, anthropic-version',
      },
    });
  }

  const [provider = 'anthropic', ...rest] = params.path || [];
  const target = PROVIDER_TARGETS[provider] || PROVIDER_TARGETS.anthropic;
  const url = new URL(request.url);
  const targetUrl = target.base + '/' + rest.join('/') + url.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('anthropic-dangerous-direct-browser-access');

  if (target.authType === 'anthropic') {
    if (!headers.has('x-api-key') && env.ANTHROPIC_API_KEY) {
      headers.set('x-api-key', env.ANTHROPIC_API_KEY);
    }
    if (!headers.has('anthropic-version')) {
      headers.set('anthropic-version', '2023-06-01');
    }
  } else {
    if (!headers.has('Authorization')) {
      const serverKey = provider === 'openai' ? env.OPENAI_API_KEY : env.GROQ_API_KEY;
      if (serverKey) headers.set('Authorization', `Bearer ${serverKey}`);
    }
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
