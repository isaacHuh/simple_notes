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

const TASK_CONTEXT_PROMPT = `You are a task organization assistant. You will be given a single parent task with its existing sub-items, plus a new note to incorporate into that task.

Rules:
- Return ONLY the sub-items for this one task as a markdown list — do NOT include the parent task line.
- Use "- [ ] " for actionable sub-tasks.
- Use "- " (NO checkbox) for non-actionable context or extra info.
- Preserve all existing sub-items (do not remove or reword them unless merging a duplicate).
- Add the new information as sub-tasks or context notes as appropriate.
- If the new note is actionable, add it as a sub-task with a checkbox.
- If the new note is just extra info or context, add it without a checkbox.
- Use concise language.
- Support **bold** for emphasis when helpful.

Example input:
Parent task: Deploy Redis cluster
Existing sub-items:
- [ ] Set up 3-node cluster configuration
- Scheduled for Friday

New note: need to also benchmark throughput after deploy

Example output:
- [ ] Set up 3-node cluster configuration
- Scheduled for Friday
- [ ] Benchmark throughput after deploy`;

function serializeChildren(children) {
  return children.map((child) => {
    if (child.isContext) {
      return `- ${child.text}`;
    }
    return `- [${child.completed ? 'x' : ' '}] ${child.text}`;
  }).join('\n');
}

function serializeItems(items) {
  return items.map((item) => {
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
}

async function callOllama(systemPrompt, userMessage, model = 'qwen2.5:7b', baseUrl = DEFAULT_URL) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
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

async function processNote(text, existingItems, model = 'qwen2.5:7b', baseUrl = DEFAULT_URL) {
  let userMessage = text;
  if (existingItems && existingItems.length > 0) {
    userMessage += '\n\n---\nExisting items (merge into these where relevant):\n' + serializeItems(existingItems);
  }
  return callOllama(SYSTEM_PROMPT, userMessage, model, baseUrl);
}

async function processTaskContext(parentText, existingChildren, noteText, model = 'qwen2.5:7b', baseUrl = DEFAULT_URL) {
  let userMessage = `Parent task: ${parentText}\n`;
  if (existingChildren && existingChildren.length > 0) {
    userMessage += `Existing sub-items:\n${serializeChildren(existingChildren)}\n`;
  }
  userMessage += `\nNew note: ${noteText}`;
  return callOllama(TASK_CONTEXT_PROMPT, userMessage, model, baseUrl);
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

module.exports = { processNote, processTaskContext, healthCheck, listModels };
