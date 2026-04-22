export async function testAnthropicConnection(
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmedKey = apiKey.trim();
  
  if (!trimmedKey) {
    return { ok: false, error: "API key is empty" };
  }

  if (!trimmedKey.startsWith("sk-ant-")) {
    return {
      ok: false,
      error: 'API key should start with "sk-ant-". Check your Anthropic Console.',
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": trimmedKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say hi" }],
      }),
    });

    if (res.ok) {
      return { ok: true };
    }

    if (res.status === 401) {
      return { ok: false, error: "Invalid API key (401 Unauthorized). Check your key at console.anthropic.com" };
    }

    if (res.status === 403) {
      return { ok: false, error: "API key lacks permissions (403 Forbidden). Check billing/usage at console.anthropic.com" };
    }

    if (res.status === 429) {
      return { ok: false, error: "Rate limited (429). Wait a moment and try again." };
    }

    if (res.status === 529) {
      return { ok: true };
    }

    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
    };
  } catch (e) {
    const errMsg = String(e);
    if (errMsg.includes("Failed to fetch")) {
      return {
        ok: false,
        error: `Network blocked. Steps:\n\n1. Use Figma Desktop app (not browser)\n2. Remove plugin and re-import manifest\n3. Check firewall/VPN isn't blocking api.anthropic.com\n\nTechnical: ${errMsg}`,
      };
    }
    return { ok: false, error: `Connection failed: ${errMsg}` };
  }
}
