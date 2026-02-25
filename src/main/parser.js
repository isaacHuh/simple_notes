function parseChecklist(markdownText) {
  const lines = markdownText.split('\n');
  const items = [];
  let currentParent = null;

  for (const line of lines) {
    // Check for indented sub-item (2+ spaces or tab before the marker)
    const subMatch = line.match(/^(?:\t| {2,})[-*]\s*\[([ xX])\]\s*(.+)/);
    // Check for top-level item
    const topMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);

    if (subMatch && currentParent) {
      currentParent.children.push({
        id: generateId(),
        text: subMatch[2].trim(),
        completed: subMatch[1].toLowerCase() === 'x',
        createdAt: new Date().toISOString(),
      });
    } else if (topMatch) {
      currentParent = {
        id: generateId(),
        text: topMatch[2].trim(),
        completed: topMatch[1].toLowerCase() === 'x',
        children: [],
        createdAt: new Date().toISOString(),
      };
      items.push(currentParent);
    }
  }

  return items;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = { parseChecklist };
