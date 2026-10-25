# Starting the Application Locally

To start the YouTube Music application locally in development mode, follow these steps:

## Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- [pnpm](https://pnpm.io/) (or npm/yarn)
- Rust toolchain (for Tauri backend) - install via [rustup](https://rustup.rs/)
- System dependencies for Tauri (refer to [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))

## Installation

1. Clone the repository (if not already done)
2. Install dependencies:
   ```bash
   pnpm install
   ```

## Development Mode

To start the application in development mode with hot reload:

```bash
pnpm tauri dev
```

This command:
- Starts the Vite development server for the frontend
- Launches the Tauri application in development mode
- Enables hot module replacement for frontend changes
- Provides debugging capabilities

## Alternative Commands

If you prefer using npm or yarn:

```bash
# npm
npm run tauri dev

# yarn
yarn tauri dev
```

## Frontend-only Development

For faster iteration when only frontend changes are needed (without rebuilding the Rust backend):

```bash
pnpm dev
```

Note: In this mode, Tauri-specific APIs (system tray, native menus, etc.) will not be available.

## Production Build

To create a production build:

```bash
pnpm tauri build
```

The built application will be available in `src-tauri/target/release/bundle/`.

## Troubleshooting

- If you encounter issues with Tauri, ensure your Rust toolchain is up to date: `rustup update`
- For Windows, make sure you have the [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) installed
- Check the [Tauri troubleshooting guide](https://tauri.app/v1/guides/getting-started/troubleshooting) for common issues

## Additional Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Documentation](https://react.dev/learn)

## Online Streaming & Playlists

### Streaming

Playback resolves through a cascade, so a single blocked provider does not stop the music:

1. `resolve_audio` (Rust) — yt-dlp sidecar → Piped → Invidious
2. `ytm_get_stream` (Rust) — YouTube Music Innertube `player` endpoint
3. yt-dlp sidecar invoked directly from the WebView
4. Piped / Invidious public APIs from the WebView (this is what `pnpm dev` uses)
5. Demo sample — only when every network layer fails

The player bar badge tells you which layer is currently live, e.g. `LIVE · Piped`,
`LIVE · Innertube`, `LIVE · yt-dlp`, or `Demo sample`.

Stream URLs expire, so they are resolved fresh for every playback (including
next/previous and auto-advance). If a URL has expired mid-track, the engine
re-resolves it once automatically.

### Saving music to playlists

Hover any song row or card and press the **Save to playlist** icon (also available in
the player bar). In the dialog you can:

* toggle the song in/out of an existing playlist,
* create a new playlist and save the song into it immediately.

Playlists are stored locally (`ytm_user_playlists_v1` in `localStorage`) and appear in
**Library → Your Playlists**, where you can rename, delete, play, shuffle and remove
tracks. Opening a YouTube Music playlist from search or the home feed offers
**Save playlist to library** to import all of its tracks at once.
