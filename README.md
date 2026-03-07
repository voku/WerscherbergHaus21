# 🏠 Haus am Werscherberg — Epic Player

An atmospheric, production-ready music player for the Northern Viking epic track *"Haus am Werscherberg"*.

**Live demo:** https://voku.github.io/WerscherbergHaus21/

---

## Features

- 🎵 Synchronized lyrics that highlight and scroll as the track plays
- 🎚️ Draggable progress and volume controls with hover tooltips
- 🖼️ Atmospheric album art with animated zoom while playing
- 📱 Responsive layout (mobile, tablet, desktop)
- 🌑 Dark, cinematic UI with atmospheric background glows

---

## Run Locally

**Prerequisites:** Node.js ≥ 18

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The app runs at <http://localhost:3000>.

---

## Build for Production

```bash
npm run build
```

The optimised output is written to `dist/`. Preview it locally with:

```bash
npm run preview
```

---

## Deploy to GitHub Pages

Pushes to the `main` branch are automatically built and deployed to GitHub Pages via the [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) workflow.

---

## Key Files Detector

Use the prompt below when working with an AI assistant to quickly identify the most important files in this project:

```
List the key files in this repository and explain what each one does.
Focus on: entry points, main components, configuration files, and build/CI scripts.
```

Key files at a glance:

| File | Purpose |
|------|---------|
| `index.html` | HTML entry point – mounts the React app |
| `src/main.tsx` | React bootstrap – renders `<App />` into `#root` |
| `src/App.tsx` | Main application component (player UI + lyrics) |
| `src/index.css` | Global styles, Tailwind theme tokens |
| `vite.config.ts` | Vite build configuration (plugins, base path) |
| `public/cover.jpg` | Album artwork |
| `.github/workflows/ci.yml` | CI workflow – lint + build on every push/PR |
| `.github/workflows/deploy.yml` | CD workflow – deploy to GitHub Pages on push to `main` |

---

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 6](https://vitejs.dev) (build tool)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Lucide React](https://lucide.dev) (icons)
- [Motion](https://motion.dev) (animation)
