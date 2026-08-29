# 🎵 Now Playing — Spotify Live Stream

A minimalist, typography-driven real-time Spotify "Now Playing" web experience built with **Svelte 5**, **SvelteKit**, **Tailwind CSS v4**, and **Adapter Node**.

Designed to be deployed on **Dokploy** under the custom domain [music.n3-rd.xyz](https://music.n3-rd.xyz).

---

## ✨ Features

- **SSR-Powered Dynamic Social Previews (Open Graph & Twitter Cards)**:
  - Live album artwork is rendered server-side as the `og:image` and `twitter:image`.
  - The page title and description dynamically update to the track name, artist, and album for web scrapers (Telegram, Discord, Twitter/X, iMessage, WhatsApp).
- **Desktop & Mobile Specialized Interfaces**:
  - **Desktop**: Interactive variable typography ("NOWPLAYING") with distance-reactive font weighting and cursor tracking.
  - **Mobile**: Spinning vinyl record player with real-time playback progress bar and Apple Music styled ambient mesh glow.
- **Dynamic Color Extraction**:
  - Automatically samples the dominant background color and high-contrast typography color palette directly from the album art pixels in real-time.
- **Audio Previews**:
  - Plays 30-second Spotify track previews when available with volume fade and mute state persistence.

---

## 🚀 Local Development

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token
PORT=3000
```

### 3. Start Dev Server
```bash
pnpm dev
```

---

## 🚢 Dokploy Deployment Guide

### 1. Push to GitHub
Create a new repository on GitHub (e.g. `n3-rd/music`) and run:
```bash
git remote add origin https://github.com/n3-rd/music.git
git branch -M main
git push -u origin main
```

### 2. Configure in Dokploy
1. **Create Application**: In Dokploy dashboard, create a new Application linked to your GitHub repo `n3-rd/music`.
2. **Build Type**: Select **Dockerfile**.
3. **Environment Variables**: Add your production variables in the Dokploy dashboard:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REFRESH_TOKEN`
   - `PORT=3000`
4. **Domains**: Add `music.n3-rd.xyz` (Dokploy will automatically provision Let's Encrypt SSL/TLS certificates).
5. **DNS Setup**: In your DNS provider (Cloudflare, Namecheap, etc.), create a **CNAME** or **A record**:
   - Host: `music`
   - Target: Your Dokploy server IP or main domain.
6. **Deploy**: Click **Deploy** in Dokploy.

---

## 🛠 Tech Stack
- **Framework**: Svelte 5 / SvelteKit
- **Styling**: Tailwind CSS v4
- **Adapter**: `@sveltejs/adapter-node`
- **Container**: Docker multi-stage build (Node 22 Alpine)
