const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT = `You are a task extraction assistant. Given a note or text, extract actionable items and return them as a markdown checklist. Each item should be on its own line starting with "- [ ] ". Return ONLY the checklist, no other text. If there is additional context provided, use it to better understand and refine the tasks.`;

async function processNote(text, context, model = 'qwen2.5:7b', baseUrl = DEFAULT_URL) {
  let userMessage = text;
  if (context && context.trim()) {
    userMessage += '\n\n---\nAdditional context:\n' + context;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.message.content;
}

async function healthCheck(baseUrl = DEFAULT_URL) {
  try {
    const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function listModels(baseUrl = DEFAULT_URL) {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) throw new Error('Failed to list models');
  const data = await res.json();
  return data.models.map((m) => m.name);
}

module.exports = { processNote, healthCheck, listModels };
