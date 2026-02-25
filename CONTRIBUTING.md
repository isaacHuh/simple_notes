# Contributing to SimpleNotes

Thank you for your interest in contributing to SimpleNotes! We welcome contributions from everyone. This guide will help you get started.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please open a [GitHub issue](https://github.com/isaacHuh/simple_notes/issues/new?template=bug_report.md) and include:

- A clear, descriptive title
- Steps to reproduce the issue
- What you expected to happen vs. what actually happened
- Your OS and version (macOS / Windows)
- Electron and Node.js versions (`node -v`)
- Screenshots if applicable

### Suggesting Features

Feature requests are welcome! Please open a [GitHub issue](https://github.com/isaacHuh/simple_notes/issues/new?template=feature_request.md) and describe:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Submitting Changes

1. **Fork** the repository
2. **Create a branch** from `main` for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** — keep commits focused and descriptive
4. **Test your changes** locally:
   ```bash
   npm install
   npm start
   ```
5. **Push** your branch and open a **Pull Request**

### Pull Request Guidelines

- Keep PRs focused on a single change
- Write a clear description of what the PR does and why
- Reference any related issues (e.g., "Closes #12")
- Make sure the app runs without errors before submitting

## Development Setup

### Prerequisites

- **Node.js** v18 or later
- **Ollama** installed and running (see [README](README.md) for setup instructions)

### Getting Started

```bash
git clone https://github.com/isaacHuh/simple_notes.git
cd simple_notes
npm install
npm start
```

### Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.js    # App entry point, menubar setup, IPC handlers
│   ├── ollama.js   # Ollama API client and AI prompts
│   ├── parser.js   # Markdown checklist parser
│   └── store.js    # Data persistence layer
├── preload/
│   └── preload.js  # IPC bridge (renderer ↔ main)
└── renderer/       # Frontend UI
    ├── index.html   # HTML template
    ├── app.js       # UI logic and event handlers
    └── styles.css   # Styles (dark and light themes)
```

## Style Guide

- Use vanilla JavaScript (no TypeScript, no frameworks)
- Use `const` and `let` — never `var`
- Use meaningful variable and function names
- Keep functions small and focused
- Follow the existing code style in the project

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior by opening an issue.

## Questions?

If you have questions about contributing, feel free to open an issue and we'll be happy to help.
