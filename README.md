# SimpleNotes

A menu bar app that turns freeform notes into actionable checklists using a local AI model (Ollama + Qwen). Lives in your menu bar, no cloud required. Works on **macOS** and **Windows**.

## Prerequisites

- **macOS** (Apple Silicon or Intel) or **Windows** 10/11
- **Node.js** v18 or later — [download here](https://nodejs.org/) (only needed for development)
- **16 GB RAM** recommended (the Qwen 3 8B model uses ~8 GB)

## Quick Start

### From a packaged build (recommended)

1. Download the latest release for your platform (`.dmg` for macOS, `.exe` installer for Windows)
2. Open the app — a setup wizard will walk you through installing Ollama and downloading the AI model
3. Start using it

### From source

```bash
git clone https://github.com/isaacHuh/simple_notes.git
cd simple_notes
npm install
npm start
```

On first launch, the **setup wizard** will guide you through any remaining setup (installing Ollama, pulling the model). You can also set things up manually — see below.

## Setup Wizard

When you first open SimpleNotes (or if Ollama/the model becomes unavailable), a guided setup wizard appears:

**Step 1 — Ollama installed & running**
- The app checks if the Ollama server is reachable at `localhost:11434`
- If not found, click **"Download Ollama"** to open the correct download page for your platform
- After installing, open the Ollama app and click **"Check again"**

**Step 2 — Model ready**
- The app checks if the configured model (default: `qwen3:8b`) is downloaded
- If not, click **"Pull Model"** to download it directly from the app with a live progress bar
- The download is ~4.7 GB

Once both steps show green checkmarks, click **"Get Started"**.

You can also click **"Skip setup"** if you prefer to configure things manually or use a different model.

## Manual Setup (alternative)

If you prefer to set up Ollama yourself instead of using the wizard:

### Install Ollama

**macOS:**
```bash
brew install ollama
```
Or download from [ollama.com/download/mac](https://ollama.com/download/mac).

**Windows:**
Download the installer from [ollama.com/download/windows](https://ollama.com/download/windows).

### Start the Ollama server

**macOS:** Open the Ollama app, or run in a terminal:
```bash
ollama serve
```

**Windows:** Open Ollama from the Start menu. The server starts automatically.

The server runs on `http://localhost:11434`.

### Pull the model

```bash
ollama pull qwen3:8b
```

### Verify it works

```bash
ollama run qwen3:8b "List 3 things to do before a road trip"
```

## Usage

1. **Type a note** in the input bar at the bottom — anything like "Meeting notes: discuss Q3 budget, review hiring pipeline, schedule team offsite"
2. **Press Enter** — the note is sent to your local model, which extracts actionable checklist items
3. **Check off items** as you complete them — they move to the "Completed" section
4. **Drag and drop** one task onto another to merge them with AI
5. **Click +** on any task to add context or sub-tasks
6. **Right-click** any item to delete it
7. **Green dot** in the title bar = Ollama is connected. **Red dot** = Ollama is not reachable.

Your checklist is saved automatically and persists across restarts.

- **macOS:** `~/Library/Application Support/NoteFlow/data.json`
- **Windows:** `%APPDATA%/NoteFlow/data.json`

## Troubleshooting

**Red status dot / "Ollama is not running"**
- Make sure Ollama is open (macOS: check menu bar; Windows: check system tray)
- Or run `ollama serve` in a terminal
- Check that nothing else is using port 11434

**"Model not found"**
- Run `ollama pull qwen3:8b` to download the model
- Or use the setup wizard (it will appear automatically)
- Verify with `ollama list`

**Slow responses**
- Close memory-heavy apps (browsers with many tabs, Docker, etc.) to free up RAM
- Check Activity Monitor (macOS) or Task Manager (Windows) — memory usage should have headroom

**App doesn't appear in menu bar / system tray**
- macOS: Look for the icon in the top-right area of your menu bar. On Macs with a notch, try `Cmd+drag` to rearrange icons
- Windows: Check the system tray (bottom-right, click the ^ arrow if hidden)

## Build for Distribution

**macOS** (produces `.dmg` and `.zip`):
```bash
npm run build
```

**Windows** (produces NSIS installer and `.zip`):
```bash
npm run build:win
```

**Both platforms:**
```bash
npm run build:all
```

Output goes to the `dist/` directory.

## Tech Stack

- **Electron** + **menubar** — tray icon and floating panel
- **Ollama** — local AI inference server
- **Qwen 3 8B** — language model for task extraction
- **electron-builder** — packaging for macOS (DMG) and Windows (NSIS)
- Vanilla HTML/CSS/JS — no frontend framework
