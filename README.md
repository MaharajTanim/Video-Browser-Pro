# 🎬 Video Browser Pro

A sleek, client-side video browser and player built with vanilla HTML, CSS, and JavaScript. Browse, organize, and play local video files directly in your browser — no server required.

🔗 **Live Demo:** [https://videobrowserpro1.netlify.app/](https://videobrowserpro1.netlify.app/)

## Features

- **Folder Browsing** — Open a local folder using the File System Access API and instantly browse all video files
- **Drag & Drop** — Drop video files directly into the browser window
- **Video Playback** — Built-in player with Picture-in-Picture, playback speed control, looping, fullscreen, and snapshot capture
- **Search & Filter** — Search by filename, filter by format (MP4, MOV, AVI, MKV, WebM) and quality (4K, 1080p, 720p, SD)
- **Sort** — Sort videos by name, date, size, or duration
- **Favorites** — Mark videos as favorites and filter to view only favorites
- **Playlists** — Create, save, load, and manage custom playlists
- **Tags** — Add custom tags to videos for easy organization; view popular tags
- **Batch Operations** — Select multiple videos to add to favorites, apply tags, or delete in bulk
- **Compare Mode** — Side-by-side video comparison with optional synced playback
- **Export/Import** — Export and import favorites, playlists, and tags as JSON
- **Dark/Light Theme** — Toggle between themes; preference is saved
- **Grid/List View** — Switch between grid and list layouts
- **Keyboard Shortcuts** — Space (play/pause), F (fullscreen), P (PiP), arrow keys (seek/volume), Esc (close), Ctrl+F (search)
- **Persistent Storage** — Favorites, playlists, tags, and theme are saved in localStorage/IndexedDB across sessions

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/MaharajTanim/Video-Browser-Pro.git
   cd Video-Browser-Pro
   ```

2. Open `index.html` in a modern browser (Chrome, Edge, or another Chromium-based browser recommended for full File System Access API support).

3. Click **Open Folder** to select a folder containing video files, or drag and drop videos onto the page.

> **Note:** This is a fully client-side application. No build tools, frameworks, or servers are needed.

## Project Structure

```
├── index.html   — App layout and modals
├── style.css    — Styling and theming
├── script.js    — All application logic
└── README.md    — This file
```

## Browser Compatibility

| Feature                | Chrome | Edge | Firefox | Safari |
| ---------------------- | ------ | ---- | ------- | ------ |
| Core playback          | ✅     | ✅   | ✅      | ✅     |
| File System Access API | ✅     | ✅   | ❌      | ❌     |
| Drag & Drop            | ✅     | ✅   | ✅      | ✅     |
| Picture-in-Picture     | ✅     | ✅   | ✅      | ✅     |

## Keyboard Shortcuts

| Key        | Action             |
| ---------- | ------------------ |
| `Space`    | Play / Pause       |
| `F`        | Fullscreen         |
| `P`        | Picture-in-Picture |
| `← / →`    | Seek ±5 seconds    |
| `↑ / ↓`    | Volume ±10%        |
| `Esc`      | Close player       |
| `Ctrl + F` | Focus search bar   |

## License

This project is open source and available under the [MIT License](LICENSE).
