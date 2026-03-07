import { auth } from '../lib/firebase';

export type ClaudeModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';

export interface ClaudeStreamEvent {
  type: 'text' | 'error' | 'usage' | 'usage_final' | 'done';
  text?: string;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// Cloud Function URL
const FUNCTION_URL =
  import.meta.env.VITE_CLAUDE_PROXY_URL ||
  'https://claudeproxy-7by4rkxotq-uc.a.run.app';

/**
 * Stream a Claude response from the Firebase Cloud Function proxy.
 * Yields ClaudeStreamEvents as they arrive via SSE.
 */
export async function* streamClaude(
  prompt: string,
  model: ClaudeModel = 'claude-haiku-4-5-20251001',
  maxTokens = 4096,
): AsyncGenerator<ClaudeStreamEvent> {
  const user = auth.currentUser;
  if (!user) {
    yield { type: 'error', error: 'Not signed in' };
    return;
  }

  const idToken = await user.getIdToken();

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ prompt, model, maxTokens }),
  });

  if (!response.ok) {
    const text = await response.text();
    yield { type: 'error', error: `HTTP ${response.status}: ${text}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);

      if (data === '[DONE]') {
        yield { type: 'done' };
        return;
      }

      try {
        const event = JSON.parse(data) as ClaudeStreamEvent;
        yield event;
      } catch {
        // skip unparseable
      }
    }
  }

  yield { type: 'done' };
}
