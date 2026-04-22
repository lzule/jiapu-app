# KinCanvas Family Tree

KinCanvas is an offline-first web app for managing family trees visually, with member/relationship editing, full-tree high-quality export, and version rollback.

## Table of Contents

- [Overview](#overview)
- [UI Preview](#ui-preview)
- [Recent Updates](#recent-updates)
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

## UI Preview

![Anonymous UI preview](./docs/images/preview-anonymous.svg)

> This preview uses anonymized demo content only (no private family data).

## Recent Updates

- 2026-04-22: Added subtree collapse per node and one-click **Expand All**.
- 2026-04-22: Search now auto-expands collapsed branches to reveal matched nodes.
- 2026-04-22: Added `Shift + Wheel` horizontal panning on the canvas.
- 2026-04-22: Added `Ctrl + Shift + ←/→` sibling order adjustment.
- 2026-04-22: Added photo removal and full-screen photo preview (`Ctrl + mouse` quick zoom supported).

## Core Features

- Member management: add, edit, delete.
- Relationship management: spouse, parent/child, sibling.
- Relationship creation:
  - Right-click context menu.
  - `Alt + drag` from one node to another, then select relation type.
- Layout and view:
  - Top-down / left-right layout toggle.
  - Pan, zoom, `Shift + wheel` horizontal pan, fit-to-screen.
  - Sibling drag-and-drop ordering.
  - Per-node subtree collapse and one-click expand-all.
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
- Click the node collapse button: collapse/expand all descendants of that node.
- Click **Expand All** in toolbar: restore full tree visibility.
- Click a node photo: open full-screen preview (`Ctrl + mouse` quick zoom also works).

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
- `Ctrl + Shift + ←`: Move selected node left within siblings
- `Ctrl + Shift + →`: Move selected node right within siblings
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
- Export always uses the full tree even if some branches are currently collapsed on screen.

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
