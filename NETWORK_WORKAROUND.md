# Network Access Workaround

If Figma Desktop is blocking `networkAccess` even with correct manifest, you have two options:

## Option 1: Proxy Server (Recommended for Production)

Deploy a simple proxy that forwards requests to Anthropic API.

### Quick Vercel Deployment:

1. Create `api/proxy.js`:
```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

2. Deploy:
```bash
npm i -g vercel
vercel --prod
```

3. Update manifest.json:
```json
"networkAccess": {
  "allowedDomains": ["https://your-app.vercel.app"]
}
```

4. Update `src/ai/anthropic.ts` to use your proxy URL.

## Option 2: Use Code.ts for Network Calls

Move all `fetch()` calls from `ui.ts` to `code.ts`:

### How it works:
1. UI sends message to code.ts: `{ type: "fetch-anthropic", payload: {...} }`
2. code.ts makes the fetch call
3. code.ts sends result back to UI

### Why this might work:
- code.ts runs in a different sandbox context
- Some Figma versions allow network access from code.ts but not ui.ts

### Implementation:
```typescript
// In code.ts
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'fetch-anthropic') {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: msg.headers,
        body: JSON.stringify(msg.body),
      });
      const data = await response.json();
      figma.ui.postMessage({ type: 'fetch-result', success: true, data });
    } catch (error) {
      figma.ui.postMessage({ type: 'fetch-result', success: false, error: String(error) });
    }
  }
};
```

## Current Status:

The plugin's `manifest.json` has correct `networkAccess` configuration:
```json
"networkAccess": {
  "allowedDomains": ["https://api.anthropic.com"]
}
```

If this still fails after plugin reload, it suggests:
1. Figma Desktop version is too old (check Help → About)
2. Corporate firewall/proxy blocking SSL
3. Figma bug/limitation (known issue in some versions)

Try Option 2 (code.ts fetch) first as it requires no external infrastructure.
