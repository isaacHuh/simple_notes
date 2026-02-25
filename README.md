# SimpleNotes

A macOS menu bar app that turns freeform notes into actionable checklists using a local AI model (Ollama + Qwen 2.5). Lives in your menu bar, no cloud required.

## Prerequisites

- **macOS** with Apple Silicon (M1/M2/M3/M4) or Intel
- **Node.js** v18 or later — [download here](https://nodejs.org/)
- **16 GB RAM** recommended (the Qwen 2.5 7B model uses ~8 GB)

## Setup Guide

### Step 1: Install Ollama

Ollama runs AI models locally on your Mac. Install it with Homebrew:

```bash
brew install ollama
```

Or download directly from [ollama.com](https://ollama.com/download).

Then start the Ollama server:

```bash
ollama serve
```

This runs in the background on `http://localhost:11434`. Keep this terminal open (or add it to your login items).

### Step 2: Pull the Qwen 2.5 model

Download the model that SimpleNotes uses for task extraction:

```bash
ollama pull qwen2.5:7b
```

This downloads ~4.7 GB. The model uses about 8 GB of RAM when running, which fits comfortably on a 16 GB Mac.

**Why Qwen 2.5 7B?** It's the best balance of speed and quality for 16 GB Macs — you'll get ~30+ tokens/second on Apple Silicon with enough RAM headroom for the rest of your apps.

### Step 3: Verify Ollama is working

Quick test to confirm everything is set up:

```bash
ollama run qwen2.5:7b "List 3 things to do before a road trip"
```

You should see a response in a few seconds. Press `Ctrl+D` to exit the chat.

### Step 4: Install SimpleNotes

```bash
git clone https://github.com/isaacHuh/simple_notes.git
cd simple_notes
npm install
```

### Step 5: Run the app

```bash
npm start
```

A notepad icon will appear in your macOS menu bar. Click it to open the SimpleNotes panel.

## Usage

1. **Type a note** in the text area at the bottom — anything like "Meeting notes: discuss Q3 budget, review hiring pipeline, schedule team offsite"
2. **Click "Process"** (or press `Cmd+Enter`) — the note is sent to your local Qwen model, which extracts actionable items
3. **Check off items** as you complete them — they move to the "Completed" section
4. **Right-click** any item to delete it
5. **"+ Add Context"** lets you provide extra context to help the AI better understand your note
6. **Green dot** in the title bar = Ollama is running. **Red dot** = Ollama is not reachable.

Your checklist is saved automatically to `~/Library/Application Support/NoteFlow/data.json` and persists across restarts.

## Troubleshooting

**Red status dot / "Ollama is not running"**
- Make sure `ollama serve` is running in a terminal
- Check that nothing else is using port 11434: `lsof -i :11434`

**"Model not found"**
- Run `ollama pull qwen2.5:7b` to download the model
- Verify with `ollama list` — you should see `qwen2.5:7b` in the output

**Slow responses**
- Close memory-heavy apps (browsers with many tabs, Docker, etc.) to free up RAM for the model
- Check Activity Monitor — "Memory Pressure" should be green/yellow, not red

**App doesn't appear in menu bar**
- Look for the notepad icon in the top-right area of your menu bar
- On macOS with a notch, the icon may be hidden — try `Cmd+drag` to rearrange menu bar icons

## Build for Distribution

To package into a standalone `.app`:

```bash
npm run build
```

The output will be in the `dist/` directory (DMG and ZIP).

## Tech Stack

- **Electron** + **menubar** — tray icon and floating panel
- **Ollama** — local AI inference server
- **Qwen 2.5 7B** — language model for task extraction
- Vanilla HTML/CSS/JS — no frontend framework
