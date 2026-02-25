const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT = `You are a task organization assistant. Given one or more notes, convert them into a structured checklist.

Rules:
- Return ONLY a markdown checklist, no other text.
- Use "- [ ] " for top-level items.
- Use "  - [ ] " (2-space indent) for actionable sub-tasks nested under a parent.
- Use "  - " (2-space indent, NO checkbox) for non-actionable context or extra info about a parent item.
- Each distinct task or topic MUST be its own top-level item. Do NOT merge unrelated tasks under one parent.
- Only nest sub-items under a parent when they are clearly actionable steps or context for that specific parent task.
- If multiple notes refer to the exact same task, combine them. Otherwise, keep them as separate top-level items.
- Use concise, actionable language for tasks.
- Support **bold** for emphasis on key words when helpful.
- If existing items are provided, merge new notes into them ONLY when they are clearly about the same task — do not force unrelated notes into existing items.

Example output:
- [ ] **Grocery shopping**
  - [ ] Buy milk and eggs
  - [ ] Pick up bread
  - Prefer organic produce from Trader Joe's
- [ ] **Deploy Redis cluster**
  - [ ] Set up 3-node cluster configuration
  - [ ] Run migration scripts
  - Scheduled for Friday with Rohan
- [ ] **Migrate legacy databases**
  - [ ] Back up existing data
  - Affected services: auth, billing`;

async function processNote(text, context, existingItems, model = 'qwen2.5:7b', baseUrl = DEFAULT_URL) {
  let userMessage = text;
  if (existingItems && existingItems.length > 0) {
    const existing = existingItems.map((item) => {
      let line = `- [${item.completed ? 'x' : ' '}] ${item.text}`;
      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          if (child.isContext) {
            line += `\n  - ${child.text}`;
          } else {
            line += `\n  - [${child.completed ? 'x' : ' '}] ${child.text}`;
          }
        }
      }
      return line;
    }).join('\n');
    userMessage += '\n\n---\nExisting items (merge into these where relevant):\n' + existing;
  }
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
