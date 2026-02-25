function parseChecklist(markdownText) {
  const lines = markdownText.split('\n');
  const items = [];

  for (const line of lines) {
    const match = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (match) {
      items.push({
        id: generateId(),
        text: match[2].trim(),
        completed: match[1].toLowerCase() === 'x',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return items;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = { parseChecklist };
