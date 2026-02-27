const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const dataPath = path.join(app.getPath('userData'), 'data.json');

const defaultData = {
  items: [],
  settings: {
    ollamaModel: 'exaone3.5:2.4b',
    ollamaUrl: 'http://localhost:11434',
  },
};

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
  return JSON.parse(JSON.stringify(defaultData));
}

function saveData(data) {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { loadData, saveData };
