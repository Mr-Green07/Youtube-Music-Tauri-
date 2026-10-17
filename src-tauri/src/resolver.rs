/// yt-dlp Sidecar Audio Resolver
///
/// Executes the bundled yt-dlp sidecar binary to extract direct audio stream
/// URLs from YouTube videos. Falls back to Piped/Invidious public instances
/// when yt-dlp is unavailable. This approach bypasses YouTube Data API v3
/// quota limits entirely.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Quality tiers for audio extraction
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioQuality {
    /// Best available audio (usually Opus ~160kbps or AAC ~256kbps)
    Best,
    /// Medium quality (Opus ~70kbps or AAC ~128kbps)
    Medium,
    /// Data-saver quality (lowest available audio)
    Worst,
}

impl AudioQuality {
    fn to_format_selector(self) -> &'static str {
        match self {
            AudioQuality::Best => "ba",        // best audio
            AudioQuality::Medium => "ba[abr<=128]",
            AudioQuality::Worst => "wa",       // worst audio
        }
    }
}

impl Default for AudioQuality {
    fn default() -> Self {
        AudioQuality::Best
    }
}

/// Result payload returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamResult {
    pub url: String,
    pub source: String, // "yt-dlp" | "piped" | "invidious"
    pub format: Option<String>,
    pub quality: Option<String>,
}



// ── Piped / Invidious Instance Lists ─────────────────────────────────────────

const PIPED_INSTANCES: &[&str] = &[
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.yt",
];

const INVIDIOUS_INSTANCES: &[&str] = &[
    "https://inv.nadeko.net",
    "https://invidious.snopyta.org",
    "https://invidious.kavin.rocks",
];

// ── Core Resolution Logic ────────────────────────────────────────────────────

/// Primary resolver: Execute yt-dlp sidecar to get the direct audio CDN URL.
///
/// Runs: `yt-dlp -g -f ba --no-playlist --no-warnings <url>`
/// Returns the raw CDN URL printed to stdout.
async fn resolve_via_ytdlp(
    app: &AppHandle,
    video_id: &str,
    quality: AudioQuality,
) -> Result<AudioStreamResult, String> {
    let shell = app.shell();
    let video_url = format!("https://www.youtube.com/watch?v={video_id}");
    let format_selector = quality.to_format_selector();

    let output = shell
        .sidecar("yt-dlp")
        .map_err(|e| format!("Sidecar spawn error: {e}"))?
        .args([
            "-g",                   // Print URL only (no download)
            "-f", format_selector,  // Audio format selector
            "--no-playlist",        // Don't resolve playlists
            "--no-warnings",        // Suppress non-critical warnings
            "--no-check-certificates", // Avoid TLS issues on some systems
            &video_url,
        ])
        .output()
        .await
        .map_err(|e| format!("yt-dlp execution failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp exited with error: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let url = stdout.trim().to_string();

    if url.is_empty() || !url.starts_with("http") {
        return Err("yt-dlp returned empty or invalid URL".to_string());
    }

    Ok(AudioStreamResult {
        url,
        source: "yt-dlp".to_string(),
        format: Some(format_selector.to_string()),
        quality: Some(format!("{quality:?}")),
    })
}

/// Fallback resolver: Query Piped API public instances for audio streams.
///
/// Piped proxies YouTube content through decentralized instances and returns
/// JSON with `audioStreams` containing direct CDN URLs.
async fn resolve_via_piped(
    http: &reqwest::Client,
    video_id: &str,
) -> Result<AudioStreamResult, String> {
    for instance in PIPED_INSTANCES {
        let url = format!("{instance}/streams/{video_id}");

        let resp = match http.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };

        let data: serde_json::Value = match resp.json().await {
            Ok(d) => d,
            Err(_) => continue,
        };

        // Extract the highest bitrate audio stream
        if let Some(streams) = data.get("audioStreams").and_then(|v| v.as_array()) {
            let best = streams
                .iter()
                .filter_map(|s| {
                    let url = s.get("url")?.as_str()?.to_string();
                    let bitrate = s.get("bitrate").and_then(|b| b.as_u64()).unwrap_or(0);
                    let mime = s.get("mimeType").and_then(|m| m.as_str()).unwrap_or("");
                    let quality_label = s.get("quality").and_then(|q| q.as_str()).unwrap_or("");
                    Some((url, bitrate, mime.to_string(), quality_label.to_string()))
                })
                .max_by_key(|(_, bitrate, _, _)| *bitrate);

            if let Some((stream_url, _, format, quality)) = best {
                return Ok(AudioStreamResult {
                    url: stream_url,
                    source: format!("piped:{instance}"),
                    format: Some(format),
                    quality: Some(quality),
                });
            }
        }
    }

    Err("All Piped instances failed to resolve audio".to_string())
}

/// Secondary fallback: Query Invidious API for audio-only adaptive formats.
async fn resolve_via_invidious(
    http: &reqwest::Client,
    video_id: &str,
) -> Result<AudioStreamResult, String> {
    for instance in INVIDIOUS_INSTANCES {
        let url = format!("{instance}/api/v1/videos/{video_id}");

        let resp = match http.get(&url).send().await {
            Ok(r) if r.status().is_success() => r,
            _ => continue,
        };

        let data: serde_json::Value = match resp.json().await {
            Ok(d) => d,
            Err(_) => continue,
        };

        // Invidious returns `adaptiveFormats` with audio-only entries
        if let Some(formats) = data.get("adaptiveFormats").and_then(|v| v.as_array()) {
            let audio_stream = formats
                .iter()
                .filter(|f| {
                    f.get("type")
                        .and_then(|t| t.as_str())
                        .map(|t| t.starts_with("audio/"))
                        .unwrap_or(false)
                })
                .filter_map(|f| {
                    let url = f.get("url")?.as_str()?.to_string();
                    let bitrate = f.get("bitrate").and_then(|b| b.as_u64()).unwrap_or(0);
                    let mime_type = f.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    Some((url, bitrate, mime_type))
                })
                .max_by_key(|(_, bitrate, _)| *bitrate);

            if let Some((stream_url, _, format)) = audio_stream {
                return Ok(AudioStreamResult {
                    url: stream_url,
                    source: format!("invidious:{instance}"),
                    format: Some(format),
                    quality: None,
                });
            }
        }
    }

    Err("All Invidious instances failed to resolve audio".to_string())
}

// ── Cascading Resolver ───────────────────────────────────────────────────────

/// Resolves a YouTube video ID to a direct audio stream URL using a cascading
/// strategy: yt-dlp sidecar → Piped API → Invidious API.
///
/// Each layer is attempted in order; the first successful resolution wins.
pub async fn resolve_audio_stream(
    app: &AppHandle,
    http: &reqwest::Client,
    video_id: &str,
    quality: AudioQuality,
) -> Result<AudioStreamResult, String> {
    // Layer 1: yt-dlp sidecar (most reliable, handles age-gated/DRM content)
    match resolve_via_ytdlp(app, video_id, quality).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            eprintln!("[resolver] yt-dlp failed: {e}");
        }
    }

    // Layer 2: Piped public instances
    match resolve_via_piped(http, video_id).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            eprintln!("[resolver] Piped failed: {e}");
        }
    }

    // Layer 3: Invidious public instances
    match resolve_via_invidious(http, video_id).await {
        Ok(result) => return Ok(result),
        Err(e) => {
            eprintln!("[resolver] Invidious failed: {e}");
        }
    }

    Err("All audio resolvers exhausted. Check network connectivity and yt-dlp installation.".to_string())
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

/// Resolves a video ID through the cascade: yt-dlp → Piped → Invidious.
/// The frontend calls this when `ytm_get_stream` fails or is bypassed.
#[tauri::command]
pub async fn resolve_audio(
    app: AppHandle,
    video_id: String,
    quality: Option<AudioQuality>,
) -> Result<AudioStreamResult, String> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default();

    resolve_audio_stream(&app, &http, &video_id, quality.unwrap_or_default()).await
}

/// Directly invokes only the yt-dlp sidecar for a given YouTube URL.
/// Useful when the frontend already has a full YouTube URL (not just an ID).
#[tauri::command]
pub async fn ytdlp_extract_audio(
    app: AppHandle,
    video_url: String,
    quality: Option<AudioQuality>,
) -> Result<AudioStreamResult, String> {
    // Extract video ID from URL
    let video_id = extract_video_id(&video_url)
        .ok_or_else(|| format!("Cannot extract video ID from URL: {video_url}"))?;

    resolve_via_ytdlp(&app, &video_id, quality.unwrap_or_default()).await
}

/// Extracts a YouTube video ID from various URL formats
fn extract_video_id(url: &str) -> Option<String> {
    // Handle direct IDs (11 chars, alphanumeric + dash/underscore)
    if url.len() == 11 && url.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Some(url.to_string());
    }

    // Parse as URL
    if let Ok(parsed) = url::Url::parse(url) {
        // youtube.com/watch?v=ID
        if let Some(v) = parsed.query_pairs().find(|(k, _)| k == "v").map(|(_, v)| v.to_string()) {
            return Some(v);
        }
        // youtu.be/ID
        let path = parsed.path().trim_start_matches('/');
        if !path.is_empty() && path.len() <= 11 {
            return Some(path.to_string());
        }
    }

    None
}
