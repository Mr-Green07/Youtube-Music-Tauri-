mod auth;
mod innertube;
mod metadata;
mod resolver;
mod smtc;

use std::sync::Arc;

use auth::{clear_auth_session, get_auth_session, open_google_login, AuthManager};
use innertube::{ytm_get_home, ytm_get_playlist, ytm_get_stream, ytm_search, InnertubeClient};
use metadata::{spotify_get_track, spotify_search, SpotifyClient};
use resolver::{resolve_audio, ytdlp_extract_audio};
use smtc::{hide_to_tray, smtc_update_playback, SmtcManager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env secrets BEFORE any module reads env vars.
    // Uses dotenvy which silently succeeds if .env is missing (production builds).
    let _ = dotenvy::dotenv();

    let auth_manager = Arc::new(AuthManager::new());
    let innertube_client = Arc::new(InnertubeClient::new(auth_manager.clone()));
    let smtc_manager = SmtcManager::new();

    // SpotifyClient is Optional — app works without credentials.
    let spotify_client: Option<SpotifyClient> = SpotifyClient::try_new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(auth_manager.clone())
        .manage(innertube_client)
        .manage(smtc_manager)
        .manage(spotify_client)
        .setup(move |app| {
            auth_manager.init(app.handle());

            if let Err(e) = smtc::setup_system_tray(app.handle()) {
                eprintln!("System tray initialization note: {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            open_google_login,
            get_auth_session,
            clear_auth_session,
            // InnerTube (YouTube Music internal API)
            ytm_get_home,
            ytm_search,
            ytm_get_playlist,
            ytm_get_stream,
            // Spotify Metadata (secure server-side)
            spotify_search,
            spotify_get_track,
            // Audio Resolver (yt-dlp sidecar + Piped/Invidious fallback)
            resolve_audio,
            ytdlp_extract_audio,
            // System media controls
            smtc_update_playback,
            hide_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
