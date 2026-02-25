function parseChecklist(markdownText) {
  const lines = markdownText.split('\n');
  const items = [];
  let currentParent = null;

  for (const line of lines) {
    // Check for indented sub-item with checkbox (2+ spaces or tab before the marker)
    const subMatch = line.match(/^(?:\t| {2,})[-*]\s*\[([ xX])\]\s*(.+)/);
    // Check for indented context note without checkbox (2+ spaces or tab before the marker)
    const contextMatch = line.match(/^(?:\t| {2,})[-*]\s+(?!\[[ xX]\])(.+)/);
    // Check for top-level item
    const topMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);

    if (subMatch && currentParent) {
      currentParent.children.push({
        id: generateId(),
        text: subMatch[2].trim(),
        completed: subMatch[1].toLowerCase() === 'x',
        isContext: false,
        createdAt: new Date().toISOString(),
      });
    } else if (contextMatch && currentParent) {
      currentParent.children.push({
        id: generateId(),
        text: contextMatch[1].trim(),
        completed: false,
        isContext: true,
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

function parseSubItems(markdownText) {
  const lines = markdownText.split('\n');
  const children = [];

  for (const line of lines) {
    // Sub-item with checkbox (may or may not be indented since these are returned as top-level)
    const checkboxMatch = line.match(/^[ \t]*[-*]\s*\[([ xX])\]\s*(.+)/);
    // Context note without checkbox
    const contextMatch = line.match(/^[ \t]*[-*]\s+(?!\[[ xX]\])(.+)/);

    if (checkboxMatch) {
      children.push({
        id: generateId(),
        text: checkboxMatch[2].trim(),
        completed: checkboxMatch[1].toLowerCase() === 'x',
        isContext: false,
        createdAt: new Date().toISOString(),
      });
    } else if (contextMatch) {
      children.push({
        id: generateId(),
        text: contextMatch[1].trim(),
        completed: false,
        isContext: true,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return children;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

module.exports = { parseChecklist, parseSubItems };
