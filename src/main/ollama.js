const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT = `You are a minimal task assistant. Convert the user's note into checklist items.

CRITICAL: Do NOT invent, expand, or break down tasks. Only create what the user explicitly stated.

Rules:
- Return ONLY a markdown checklist, no other text.
- Use "- [ ] " for items.
- If the note is a single task, return a SINGLE "- [ ] " item. Do NOT add sub-tasks unless the user explicitly listed them.
- Only create multiple items if the user explicitly listed multiple distinct things.
- Only create sub-items ("  - [ ] " or "  - ") if the user explicitly provided details or steps.
- Use the user's own wording. Do not rephrase, elaborate, or add detail.
- Do NOT suggest steps, approaches, resources, or breakdowns the user did not ask for.

Examples:
User: "Read up on temporal nexus"
Output: - [ ] Read up on temporal nexus

User: "Buy groceries: milk, eggs, bread"
Output:
- [ ] Buy groceries
  - [ ] Milk
  - [ ] Eggs
  - [ ] Bread

User: "Fix login bug and update docs"
Output:
- [ ] Fix login bug
- [ ] Update docs`;

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

const MERGE_PROMPT = `You are a task organization assistant. Merge two task trees into a single, unified task tree.

Rules:
- Return ONLY a markdown checklist for the merged task, no other text.
- Create ONE parent item using "- [ ] " that best describes the combined scope.
- Merge duplicate or very similar sub-items into one.
- Preserve all unique sub-items and context notes from both tasks.
- Use "  - [ ] " (2-space indent) for actionable sub-tasks.
- Use "  - " (2-space indent, NO checkbox) for context notes.
- Use concise language.
- Support **bold** for emphasis.
- Preserve checked state: use "- [x] " or "  - [x] " for items that were already checked.`;

function serializeChildren(children) {
  return children.map((child) => {
    if (child.isContext) {
      return `- ${child.text}`;
    }
    return `- [${child.completed ? 'x' : ' '}] ${child.text}`;
  }).join('\n');
}

function serializeTask(task) {
  let line = `- [${task.completed ? 'x' : ' '}] ${task.text}`;
  if (task.children && task.children.length > 0) {
    for (const child of task.children) {
      if (child.isContext) {
        line += `\n  - ${child.text}`;
      } else {
        line += `\n  - [${child.completed ? 'x' : ' '}] ${child.text}`;
      }
    }
  }
  return line;
}

async function callOllama(systemPrompt, userMessage, model = 'qwen3:8b', baseUrl = DEFAULT_URL) {
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

async function processNote(text, model = 'qwen3:8b', baseUrl = DEFAULT_URL) {
  return callOllama(SYSTEM_PROMPT, text, model, baseUrl);
}

async function processTaskContext(parentText, existingChildren, noteText, model = 'qwen3:8b', baseUrl = DEFAULT_URL) {
  let userMessage = `Parent task: ${parentText}\n`;
  if (existingChildren && existingChildren.length > 0) {
    userMessage += `Existing sub-items:\n${serializeChildren(existingChildren)}\n`;
  }
  userMessage += `\nNew note: ${noteText}`;
  return callOllama(TASK_CONTEXT_PROMPT, userMessage, model, baseUrl);
}

async function mergeTasks(taskA, taskB, model = 'qwen3:8b', baseUrl = DEFAULT_URL) {
  const userMessage = `Task A:\n${serializeTask(taskA)}\n\nTask B:\n${serializeTask(taskB)}`;
  return callOllama(MERGE_PROMPT, userMessage, model, baseUrl);
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

module.exports = { processNote, processTaskContext, mergeTasks, healthCheck, listModels };
