const MODEL_TIERS = {
  low:    { model: 'qwen3.5:2b' },
  medium: { model: 'qwen3.5:4b' },
  high:   { model: 'qwen3.5:9b' },
};

const modelPullSection = document.getElementById('model-pull-section');
const modelPullLabel = document.getElementById('model-pull-label');
const modelPullProgressFill = document.getElementById('model-pull-progress-fill');
const modelPullProgressText = document.getElementById('model-pull-progress-text');
const themeControl = document.getElementById('theme-control');

let currentSettings = {};

// ── Apply helpers ──

function applyThemeLocally(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeControl.dataset.active = theme;
  themeControl.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function applyColorSchemeLocally(scheme) {
  if (!scheme || scheme === 'purple') {
    document.documentElement.removeAttribute('data-color-scheme');
  } else {
    document.documentElement.setAttribute('data-color-scheme', scheme);
  }
  document.querySelectorAll('.color-dot').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scheme === (scheme || 'purple'));
  });
}

function getTierForModel(modelName) {
  for (const [tier, info] of Object.entries(MODEL_TIERS)) {
    if (info.model === modelName) return tier;
  }
  return null;
}

function updateModelUI() {
  const currentTier = getTierForModel(currentSettings.ollamaModel || 'qwen3.5:2b');
  document.querySelectorAll('.model-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.tier === currentTier);
  });
}

// ── Init ──

async function init() {
  currentSettings = await window.settingsApi.getSettings();
  applyThemeLocally(currentSettings.theme || 'dark');
  applyColorSchemeLocally(currentSettings.colorScheme || 'purple');
  updateModelUI();
}

// ── Theme ──

themeControl.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.theme;
    applyThemeLocally(theme);
    currentSettings.theme = theme;
    window.settingsApi.updateSetting('theme', theme);
  });
});

// ── Color ──

document.querySelector('.color-pickers').addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  const scheme = dot.dataset.scheme;
  applyColorSchemeLocally(scheme);
  currentSettings.colorScheme = scheme;
  window.settingsApi.updateSetting('colorScheme', scheme);
});

// ── Model ──

document.querySelector('.model-cards').addEventListener('click', async (e) => {
  const card = e.target.closest('.model-card');
  if (!card) return;
  const tier = card.dataset.tier;
  const tierInfo = MODEL_TIERS[tier];
  if (!tierInfo) return;

  currentSettings.ollamaModel = tierInfo.model;
  currentSettings.modelTier = tier;
  await window.settingsApi.updateSetting('ollamaModel', tierInfo.model);
  await window.settingsApi.updateSetting('modelTier', tier);
  updateModelUI();

  try {
    const models = await window.settingsApi.listModels();
    const hasModel = models.some((m) => m === tierInfo.model);
    if (!hasModel) {
      modelPullSection.classList.remove('hidden');
      modelPullLabel.textContent = `Downloading ${tierInfo.model}...`;
      modelPullProgressFill.style.width = '0%';
      modelPullProgressText.textContent = 'Starting...';

      try {
        await window.settingsApi.pullModel(tierInfo.model);
        modelPullSection.classList.add('hidden');
      } catch (err) {
        modelPullLabel.textContent = `Failed`;
        modelPullProgressText.textContent = err.message;
      }
    }
  } catch {
    // Ollama not running
  }
});

// ── Pull progress ──

window.settingsApi.onPullProgress((data) => {
  if (modelPullSection.classList.contains('hidden')) return;
  if (data.total && data.completed) {
    const pct = Math.round((data.completed / data.total) * 100);
    modelPullProgressFill.style.width = `${pct}%`;
    const mb = (n) => (n / 1024 / 1024).toFixed(0);
    modelPullProgressText.textContent = `${mb(data.completed)} / ${mb(data.total)} MB`;
  } else if (data.status) {
    modelPullProgressText.textContent = data.status;
  }
});

// ── External sync ──

window.settingsApi.onSettingsChanged(({ key, value }) => {
  currentSettings[key] = value;
  if (key === 'theme') applyThemeLocally(value);
  if (key === 'colorScheme') applyColorSchemeLocally(value);
  if (key === 'ollamaModel' || key === 'modelTier') updateModelUI();
});

document.getElementById('close-btn').addEventListener('click', () => {
  window.settingsApi.closeSettings();
});

document.addEventListener('DOMContentLoaded', init);
