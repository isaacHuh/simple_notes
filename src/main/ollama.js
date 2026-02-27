const DEFAULT_URL = 'http://localhost:11434';

const SYSTEM_PROMPT = `You are a minimal task assistant. Convert the user's note into a checklist.

CRITICAL: Do NOT invent, expand, or break down tasks. If the user says ONE thing, return ONE item. Never add steps, sub-tasks, or details the user did not explicitly state.

CRITICAL FORMAT RULES:
- Return ONLY a markdown checklist. No other text, no headings, no explanations.
- EVERY actionable item MUST use checkbox format: "- [ ] " (unchecked).
- Sub-tasks use 2-space indent: "  - [ ] "
- Context notes (non-actionable) use 2-space indent without checkbox: "  - "

WHEN TO CREATE SUB-TASKS:
- ONLY when the input explicitly contains multiple distinct actions or listed details.
- A single task like "Fix the login bug" MUST stay as one item. Do NOT break it into steps.
- If the input is a message containing multiple actions AND extra context (deadlines, names, background), create ONE parent item summarizing the scope, with each action as a sub-task and context as notes without checkboxes.

Example input: "Fix the login bug"
Example output:
- [ ] Fix the login bug

Example input: "Read up on temporal nexus"
Example output:
- [ ] Read up on temporal nexus

Example input: "Buy groceries: milk, eggs, bread"
Example output:
- [ ] Buy groceries
  - [ ] Milk
  - [ ] Eggs
  - [ ] Bread

Example input: "Fix login bug and update docs"
Example output:
- [ ] Fix login bug
- [ ] Update docs

Example input: "Hey, can you review the PR for the login feature and update the API docs? The deadline is Friday and Sarah already approved the design."
Example output:
- [ ] Review login feature PR and update API docs
  - [ ] Review the PR for the login feature
  - [ ] Update the API docs
  - Deadline is Friday
  - Sarah already approved the design

Example input: "We need to migrate the database to the new schema, run the integration tests, and then deploy to staging. Make sure to back up the current data first. John said the staging server was reset yesterday."
Example output:
- [ ] Database migration and staging deployment
  - [ ] Back up current data
  - [ ] Migrate database to new schema
  - [ ] Run integration tests
  - [ ] Deploy to staging
  - John noted staging server was reset yesterday`;

const TASK_CONTEXT_PROMPT = `You are a task organization assistant. You will be given a single parent task with its existing sub-items, plus a new note to incorporate into that task.

CRITICAL FORMAT RULES:
- Return ONLY the sub-items as a markdown list. No other text.
- Actionable sub-tasks MUST use checkbox format: "- [ ] " (unchecked) or "- [x] " (checked).
- Non-actionable context or extra info uses "- " with NO checkbox.
- Preserve ALL existing sub-items exactly as given (keep their checkboxes and wording).
- Add the new information as sub-tasks or context notes as appropriate.
- Do NOT include the parent task line in your output.
- Use concise language.

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

const MERGE_PROMPT = `You are a task organization assistant. Merge the given task trees into a single, unified task tree.

CRITICAL FORMAT RULES:
- Return ONLY a markdown checklist. No other text, no headings, no explanations.
- EVERY actionable item MUST use checkbox format: "- [ ] " (unchecked) or "- [x] " (checked).
- The FIRST line MUST be a parent item with "- [ ] " describing the combined scope.
- Sub-tasks use 2-space indent: "  - [ ] "
- Context notes (non-actionable) use 2-space indent without checkbox: "  - "
- Do NOT use bold for the parent item. Use plain text.
- Do NOT invent new tasks. Only merge what is given.
- Preserve checked state from the original tasks.

Example input:
Task A:
- [ ] Buy groceries
  - [ ] Milk
  - [ ] Eggs

Task B:
- [ ] Prepare dinner
  - [ ] Cook pasta

Example output:
- [ ] Meal preparation
  - [ ] Buy groceries: milk, eggs
  - [ ] Cook pasta`;

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

function cleanResponse(text) {
  let cleaned = text;

  // Strip <think>...</think> blocks (Qwen thinking mode safety net)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Strip markdown code fences (```markdown ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/```(?:markdown|md)?\s*\n?([\s\S]*?)```/gi, '$1');

  // Remove common preamble lines (e.g. "Here is the merged task:")
  // Only strip lines before the first checklist item
  const lines = cleaned.split('\n');
  const firstItemIndex = lines.findIndex((l) => /^\s*[-*]\s*\[[ xX]\]/.test(l));
  if (firstItemIndex > 0) {
    cleaned = lines.slice(firstItemIndex).join('\n');
  }

  return cleaned.trim();
}

async function callOllama(systemPrompt, userMessage, model = 'exaone3.5:2.4b', baseUrl = DEFAULT_URL) {
  const isQwen = model.startsWith('qwen');

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    options: {
      temperature: 0, // Deterministic output for reliable format adherence
    },
  };

  // Disable thinking mode for Qwen3 models (avoids <think> block overhead)
  if (isQwen) {
    body.think = false;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return cleanResponse(data.message.content);
}

async function processNote(text, model = 'exaone3.5:2.4b', baseUrl = DEFAULT_URL) {
  return callOllama(SYSTEM_PROMPT, text, model, baseUrl);
}

async function processTaskContext(parentText, existingChildren, noteText, model = 'exaone3.5:2.4b', baseUrl = DEFAULT_URL) {
  let userMessage = `Parent task: ${parentText}\n`;
  if (existingChildren && existingChildren.length > 0) {
    userMessage += `Existing sub-items:\n${serializeChildren(existingChildren)}\n`;
  }
  userMessage += `\nNew note: ${noteText}`;
  return callOllama(TASK_CONTEXT_PROMPT, userMessage, model, baseUrl);
}

async function mergeTasks(taskA, taskB, model = 'exaone3.5:2.4b', baseUrl = DEFAULT_URL) {
  const userMessage = `Task A:\n${serializeTask(taskA)}\n\nTask B:\n${serializeTask(taskB)}`;
  return callOllama(MERGE_PROMPT, userMessage, model, baseUrl);
}

async function mergeMultipleTasks(tasks, model = 'exaone3.5:2.4b', baseUrl = DEFAULT_URL) {
  const userMessage = tasks.map((task, i) => {
    const label = String.fromCharCode(65 + i);
    return `Task ${label}:\n${serializeTask(task)}`;
  }).join('\n\n');
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

module.exports = { processNote, processTaskContext, mergeTasks, mergeMultipleTasks, healthCheck, listModels };
