const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT = `You are a task organization assistant. Given a note from the user, convert it into checklist items and merge with any existing items.

CRITICAL RULES — existing items:
- When existing items are provided, you MUST reproduce ALL of them EXACTLY as-is — same text, same structure, same checked/unchecked state.
- NEVER remove, rename, reorganize, reword, or re-nest existing items.
- NEVER demote an existing top-level item into a sub-item of another task.
- Existing items are IMMUTABLE. Your only job is to add the new note into the list.

Rules for adding new notes:
- Return ONLY a markdown checklist, no other text.
- Use "- [ ] " for top-level items.
- Use "  - [ ] " (2-space indent) for actionable sub-tasks nested under a parent.
- Use "  - " (2-space indent, NO checkbox) for non-actionable context or extra info about a parent item.
- Notes are often shorthand or contextual. Infer what the user means from the existing tasks. For example, if "temporal refactors" is submitted and there is an existing task about code changes or a related project, add it as a sub-item or context note to that task.
- If the new note clearly relates to an existing task, add it as a sub-item under that task.
- If the new note does NOT relate to any existing task, add it as a new top-level item.
- NEVER group unrelated existing tasks under a new parent.
- Use concise, actionable language for tasks.
- Support **bold** for emphasis on key words when helpful.

Example — adding to existing items:

Existing items:
- [ ] **Grocery shopping**
  - [ ] Buy milk and eggs
- [ ] **Refactor auth service**
  - [ ] Update token validation

New note: add rate limiting

Correct output:
- [ ] **Grocery shopping**
  - [ ] Buy milk and eggs
- [ ] **Refactor auth service**
  - [ ] Update token validation
  - [ ] Add rate limiting

Example — unrelated new note:

Existing items:
- [ ] **Grocery shopping**
  - [ ] Buy milk and eggs

New note: schedule dentist appointment

Correct output:
- [ ] **Grocery shopping**
  - [ ] Buy milk and eggs
- [ ] **Schedule dentist appointment**`;

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
Parent task: Prepare presentation
Existing sub-items:
- [ ] Draft slide outline
- Due by end of week

New note: need to also send calendar invite to the team

Example output:
- [ ] Draft slide outline
- Due by end of week
- [ ] Send calendar invite to the team`;

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
  let userMessage = '';
  if (existingItems && existingItems.length > 0) {
    userMessage += 'Existing items (reproduce these EXACTLY, do NOT restructure):\n' + serializeItems(existingItems) + '\n\n';
  }
  userMessage += 'New note: ' + text;
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
