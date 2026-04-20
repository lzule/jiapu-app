# Jiapu Offline Family Tree Web App

An offline-first family tree web application. Data is stored in a local folder selected by the user, making it suitable for long-term family record maintenance.

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Quick Start](#quick-start)
- [Frequent Actions](#frequent-actions)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Data Files](#data-files)
- [Import and Export](#import-and-export)
- [Project Structure](#project-structure)
- [Development Notes](#development-notes)
- [Important Notes](#important-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

- Pure front-end offline app, no backend required.
- Supports member management, relationship management, undo/redo, and version snapshots.
- Includes layout/rendering improvements for larger family trees.
- Supports full-tree vector and high-resolution image export.

## Core Features

- Member management: add, edit, delete.
- Relationship management: spouse, parent/child, sibling.
- Relationship creation:
  - Right-click context menu.
  - `Alt + drag` from one node to another, then select relation type.
- Layout and view:
  - Top-down / left-right layout toggle.
  - Pan, zoom, fit-to-screen.
  - Sibling drag-and-drop ordering.
- Search and focus: search by name, notes, etc.
- History: undo, redo, save/restore snapshots.
- Export:
  - `SVG` (full-tree vector output)
  - high-resolution `PNG`
  - `JSON` backup

## Quick Start

1. Open `jiapu.html` in Chrome or Edge.
2. Click **Connect** and choose a local data folder.
3. Add the first person (root node).
4. Create relationships via right-click or `Alt + drag`.
5. Save a version snapshot after each major update.

## Frequent Actions

- Double-click blank canvas: create an independent node quickly.
- Double-click a node: edit node details.
- Select a node and press `Delete`: remove the node.
- Right-click a node: open node actions menu.
- `Alt + drag` between nodes: create relationship quickly.
- Drag sibling nodes: reorder siblings.

## Keyboard Shortcuts

### Global defaults

- `Ctrl + Z`: Undo
- `Ctrl + Y`: Redo
- `Ctrl + S`: Save version
- `Ctrl + Shift + N`: Add person
- `Ctrl + E`: Edit selected person
- `Delete`: Delete selected person
- `Ctrl + F`: Search
- `Ctrl + 0`: Fit to screen
- `Ctrl + =`: Zoom in
- `Ctrl + -`: Zoom out
- `Ctrl + /`: Shortcut settings
- `Ctrl + B`: Toggle sidebar
- `Esc`: Cancel/close
- Arrow keys: Navigate between relatives

### Menu defaults

- Context menu: `A/S/D/F/E/X`
- Relation menu: `A/D/S/F`

> Menu shortcuts are customizable in Shortcut Settings.

## Data Files

After connecting a local folder, the app maintains files under `data/`:

- `state.json`: current family tree state
- `history.json`: operation history
- `shortcuts.json`: shortcut configuration
- `settings.json`: app settings
- `versions/`: saved version snapshots

## Import and Export

### Export

The **Export Image** action now exports both:

- `familytree_YYYY-MM-DD.svg` (full-tree vector)
- `familytree_YYYY-MM-DD_uhd.png` (full-tree high-resolution bitmap)

JSON export is also available for backup/migration.

### Import

- Importing JSON replaces current data (undo is available).
- If a folder is connected, imported data is synced to local files.

## Project Structure

```text
jiapu_app/
├─ jiapu.html
├─ css/
│  └─ styles.css
├─ js/
│  ├─ state.js
│  ├─ history.js
│  ├─ filesystem.js
│  ├─ layout.js
│  ├─ renderer.js
│  ├─ shortcuts.js
│  └─ ui.js
├─ data/
├─ scripts/
└─ README*.md
```

## Development Notes

- This is a static web app and can run directly in a browser.
- Main files for feature work:
  - Layout/coordinates: `js/layout.js`
  - Rendering/drag behavior: `js/renderer.js`
  - UI/events/export: `js/ui.js`
  - Keyboard shortcuts: `js/shortcuts.js`

## Important Notes

- Remove private family data before open-source release.
- Keep using one data folder to avoid split version history.
- Save snapshots before and after major structure changes.
- Avoid manual edits to `data/*.json`; use UI flows when possible.

## Roadmap

- Relationship consistency checker (isolated/conflicting nodes).
- More export options (resolution, page layout, pagination).
- Additional optimization for very large trees.
- More complete multilingual UI text.

## Contributing

Contributions are welcome via Issue / PR:

1. Fork the repository and create a feature branch.
2. Commit with a clear change summary.
3. Open a PR with reproduction/validation details when possible.

## License

MIT is recommended (add a `LICENSE` file before public release if missing).
