# YT Music Minimal (Tauri v2 + React + TypeScript)

A lightweight, native YouTube Music desktop client for Windows with **live online
streaming** and a **local, saved playlist library**.

---

## Features

### Online streaming (real YouTube Music data)

Audio is resolved through a layered cascade so playback keeps working even when one
provider is blocked or rate-limited:

| Layer | Where | Resolver |
| --- | --- | --- |
| 1 | Rust backend | `resolve_audio` → yt-dlp sidecar → Piped → Invidious |
| 2 | Rust backend | `ytm_get_stream` → Innertube `player` endpoint |
| 3 | WebView | bundled yt-dlp sidecar invoked directly |
| 4 | WebView / browser | Piped / Invidious public APIs over `fetch` |
| 5 | local | royalty-free demo sample (offline mode only) |

* Search, home shelves and playlist track lists come from the private
  `music.youtube.com/youtubei/v1` endpoints (`browse` / `search` / `player`) — no
  YouTube Data API key required.
* The player bar shows **which resolver is live** (`LIVE · Piped`, `LIVE · Innertube`,
  `LIVE · yt-dlp`, …) or `Demo sample` when offline.
* Stream URLs are signed and expire, so they are never persisted. Every playback —
  including auto-advance, next/previous and saved playlists — resolves a fresh URL,
  with one automatic retry if a URL has expired.

### Save to playlist

* Every song row, song card and the player bar expose a **Save to playlist** button.
* The dialog lists your playlists, toggles membership (checkmark), and lets you create
  a new playlist on the spot.
* Playlists are persisted in `localStorage` (`ytm_user_playlists_v1`) and survive
  restarts — no Google account required.
* Playlist detail view supports rename, remove track, delete, play all, shuffle.
* YouTube Music playlists opened from search can be **saved into your local library**
  with all of their tracks in one click.
* Stream URLs are stripped before saving, so a saved song is re-resolved (not frozen
  on a dead CDN link) the next day.

### Desktop integration

* Native frameless window controls, minimize-to-tray.
* Windows SMTC (system media transport controls) + MediaSession metadata.
* Isolated Google login WebView with a local cookie vault for authenticated requests.

---

## Architecture

```
src-tauri/src
├── auth.rs        Google login WebView, SAPISIDHASH + cookie vault
├── innertube.rs   YouTube Music browse/search/player JSON parsing  ← online streaming
├── resolver.rs    yt-dlp sidecar → Piped → Invidious audio resolver
├── metadata.rs    optional Spotify metadata enrichment
└── smtc.rs        Windows media controls + tray

src/
├── services
│   ├── playlistStore.ts   persisted user playlists (save-to-playlist backend)
│   ├── onlineStream.ts    Piped/Invidious client (search, streams, playlists)
│   ├── audioResolver.ts   cascading resolver used by the player
│   ├── audioEngine.ts     queue, repeat/shuffle, auto-advance, stream retries
│   └── tauriBridge.ts     typed bridge to the Rust commands
├── components
│   ├── SaveToPlaylistModal.tsx
│   ├── TrackTable.tsx  (like / save / remove actions)
│   ├── PlayerBar.tsx   (live stream source badge)
│   └── Toast.tsx
└── views
    ├── HomeView / SearchView (online feed + search)
    ├── LibraryView (liked songs, playlists, history)
    └── PlaylistView (playlist detail + import)
```

---

## Getting started

See [`start.md`](start.md) for prerequisites, `pnpm tauri dev`, browser-only mode
(`pnpm dev`) and production builds.

Quick start:

```bash
pnpm install
pnpm tauri dev     # full desktop app (online streaming + playlists)
pnpm dev           # browser UI (streaming through Piped/Invidious)
```

### Notes

* In browser-only mode (`pnpm dev`) there is no Rust/yt-dlp layer, so streaming and
  search fall back to public Piped/Invidious instances.
* The Rust side needs `cargo check`/`cargo build` on a machine with a Rust toolchain
  (the bundled sidecar is Windows x64).
* Public instances can be rate-limited; the UI degrades to the demo sample rather than
  failing playback.
