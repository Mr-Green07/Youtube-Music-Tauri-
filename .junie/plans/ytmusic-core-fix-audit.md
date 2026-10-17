---
sessionId: session-261018-004749-1usx
---

# Audit Findings

### Goal
Identify the major issues in the YouTube Music (Tauri 2 + React 19 + TS) project and define the order in which they should be fixed. The UI is largely complete, but core functionality (streaming, auth, real data) is mocked or broken.

### P0 — Blockers
1. **Audio streaming never wired up.** `fetchAudioStream` (src/services/tauriBridge.ts) only calls `ytm_get_stream`, which (innertube.rs `extract_best_audio_stream`) ignores `signatureCipher`/`n`-param formats and falls back to one Freesound sample. The working `resolve_audio` cascade (yt-dlp → Piped → Invidious) in resolver.rs is never called from the frontend.
2. **yt-dlp sidecar missing.** tauri.conf.json declares `externalBin: binaries/yt-dlp` but `src-tauri/binaries/` does not exist → bundle build fails and sidecar cannot spawn.
3. **Fake authentication.** auth.rs `open_google_login` opens the real Google WebView then immediately saves a hardcoded dummy session (`SAPISID=sample_token_xyz`), never reading real cookies; SAPISIDHASH is invalid.
4. **Stubbed InnerTube parsing.** `parse_home_feed` / `parse_search_results` ignore live responses and return curated mock data, so Home/Search never show real content.

### P1 — High
5. **Invalid dependency versions** in package.json: `typescript ~6.0.3`, `vite ^8`, `lucide-react ^1.58.0`, `@vitejs/plugin-react ^6` — likely unresolvable/broken install & build.
6. **SMTC not implemented.** smtc.rs `smtc_update_playback` only stores a payload in a Mutex; no Windows SMTC API calls. Real media control relies solely on WebView MediaSession.
7. **Spotify module dead code.** `spotify_search`/`spotify_get_track` registered in lib.rs but never used.
8. **App is mock-driven** (mockData.ts, Rust fallbacks, dummy session) — behaves as a UI prototype.

### P2 — Medium
9. **Errors swallowed** — failures silently replaced with mock/sample data; no user feedback.
10. **Security gaps** — CSP disabled (`csp: null`); cookies stored as plaintext JSON despite UI claiming encryption.
11. **Unvalidated localStorage parse** in App.tsx can crash initial render on corrupt data.
12. **Manual Rust/TS type duplication** (music.ts vs Rust structs) prone to drift.
13. **No tests / CI** for fragile external integrations.

# Delivery Steps

###   Step 1: Stabilize build and dependencies
The project installs and builds cleanly.

- Correct invalid versions in package.json (typescript, vite, lucide-react, @vitejs/plugin-react) to real compatible releases.
- Add per-platform yt-dlp sidecar binaries under src-tauri/binaries/ matching the externalBin entry in tauri.conf.json.
- Verify `pnpm install`, `tsc`, and `tauri build` succeed.

###   Step 2: Wire up real audio streaming
Playing a track resolves and streams real audio instead of the demo clip.

- Route `fetchAudioStream` in src/services/tauriBridge.ts through the `resolve_audio` cascade command.
- Fix innertube.rs `extract_best_audio_stream` or defer fully to the resolver cascade.
- Surface resolution failures to the UI instead of silently using the Freesound fallback.

###   Step 3: Implement real authentication and data parsing
Login captures a real session and Home/Search show real YouTube Music data.

- Capture real cookies from the Google auth WebView in auth.rs and store/validate SAPISID for SAPISIDHASH.
- Implement `parse_home_feed` and `parse_search_results` against live InnerTube responses, keeping curated data only as an offline fallback.
- Wire or remove the unused Spotify metadata commands.

###   Step 4: Harden robustness and security
The app fails safely, protects secrets, and is testable.

- Implement real Windows SMTC in smtc.rs (or clearly document MediaSession-only support).
- Add surfaced error states for stream/auth/network failures.
- Enable a proper CSP and encrypt the stored session vault (OS keychain/stronghold).
- Validate localStorage parsing in App.tsx and add tests for the resolver cascade and InnerTube parsing.