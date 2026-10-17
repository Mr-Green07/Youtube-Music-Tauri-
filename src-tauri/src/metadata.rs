/// Spotify Metadata API - Secure server-side credential handling via dotenvy.
///
/// This module loads SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET from .env at
/// compile/runtime, authenticates via the OAuth 2.0 Client Credentials flow,
/// caches the bearer token in-memory, and exposes Tauri commands for the frontend
/// to query track/artist metadata WITHOUT ever exposing the raw API keys.
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

// ── Spotify OAuth Response ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SpotifyTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
}

// ── Cached Token ─────────────────────────────────────────────────────────────

struct CachedToken {
    access_token: String,
    expires_at: Instant,
}

// ── Public Response Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
    pub thumbnail: String,
    pub preview_url: Option<String>,
    pub external_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifySearchResult {
    pub tracks: Vec<SpotifyTrack>,
}

// ── State Manager ────────────────────────────────────────────────────────────

pub struct SpotifyClient {
    http: reqwest::Client,
    client_id: String,
    client_secret: String,
    token_cache: Mutex<Option<CachedToken>>,
}

impl SpotifyClient {
    /// Constructs the client, reading secrets from environment (loaded by dotenvy).
    /// Returns None if credentials are missing — the app still works without Spotify.
    pub fn try_new() -> Option<Self> {
        let client_id = std::env::var("SPOTIFY_CLIENT_ID").ok()?;
        let client_secret = std::env::var("SPOTIFY_CLIENT_SECRET").ok()?;

        if client_id.is_empty() || client_secret.is_empty() {
            return None;
        }

        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        Some(Self {
            http,
            client_id,
            client_secret,
            token_cache: Mutex::new(None),
        })
    }

    /// Obtains a valid bearer token, refreshing from Spotify if expired/missing.
    async fn get_token(&self) -> Result<String, String> {
        // Check cache first
        {
            let guard = self.token_cache.lock().map_err(|e| e.to_string())?;
            if let Some(ref cached) = *guard {
                if Instant::now() < cached.expires_at {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        // Token missing or expired — request a fresh one via Client Credentials
        let credentials = format!("{}:{}", self.client_id, self.client_secret);
        let b64 = base64_encode(&credentials);

        let resp = self
            .http
            .post("https://accounts.spotify.com/api/token")
            .header(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Basic {b64}"))
                    .map_err(|e| format!("Header error: {e}"))?,
            )
            .header(
                CONTENT_TYPE,
                HeaderValue::from_static("application/x-www-form-urlencoded"),
            )
            .body("grant_type=client_credentials")
            .send()
            .await
            .map_err(|e| format!("Token request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Spotify auth failed ({status}): {body}"));
        }

        let token_resp: SpotifyTokenResponse = resp
            .json()
            .await
            .map_err(|e| format!("Token parse error: {e}"))?;

        let token = token_resp.access_token.clone();
        let expires_at =
            Instant::now() + Duration::from_secs(token_resp.expires_in.saturating_sub(60));

        // Cache the token
        {
            let mut guard = self.token_cache.lock().map_err(|e| e.to_string())?;
            *guard = Some(CachedToken {
                access_token: token_resp.access_token,
                expires_at,
            });
        }

        Ok(token)
    }

    /// Searches Spotify for tracks matching `query`.
    pub async fn search_tracks(&self, query: &str, limit: u8) -> Result<SpotifySearchResult, String> {
        let token = self.get_token().await?;
        let limit = limit.min(50).max(1);

        let url = format!(
            "https://api.spotify.com/v1/search?q={}&type=track&limit={limit}",
            urlencoding(query)
        );

        let resp = self
            .http
            .get(&url)
            .header(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {token}"))
                    .map_err(|e| format!("Header error: {e}"))?,
            )
            .send()
            .await
            .map_err(|e| format!("Spotify search failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Spotify API error ({status}): {body}"));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {e}"))?;

        Ok(parse_spotify_tracks(&data))
    }

    /// Fetches details for a single track by Spotify ID.
    pub async fn get_track(&self, track_id: &str) -> Result<SpotifyTrack, String> {
        let token = self.get_token().await?;

        let url = format!("https://api.spotify.com/v1/tracks/{track_id}");

        let resp = self
            .http
            .get(&url)
            .header(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {token}"))
                    .map_err(|e| format!("Header error: {e}"))?,
            )
            .send()
            .await
            .map_err(|e| format!("Track fetch failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Spotify track error ({status}): {body}"));
        }

        let data: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {e}"))?;

        parse_single_track(&data).ok_or_else(|| "Failed to parse track data".to_string())
    }
}

// ── JSON Parsing Helpers ─────────────────────────────────────────────────────

fn parse_spotify_tracks(data: &serde_json::Value) -> SpotifySearchResult {
    let mut tracks = Vec::new();

    if let Some(items) = data
        .pointer("/tracks/items")
        .and_then(|v| v.as_array())
    {
        for item in items {
            if let Some(track) = parse_single_track(item) {
                tracks.push(track);
            }
        }
    }

    SpotifySearchResult { tracks }
}

fn parse_single_track(item: &serde_json::Value) -> Option<SpotifyTrack> {
    let id = item.get("id")?.as_str()?.to_string();
    let name = item.get("name")?.as_str()?.to_string();

    let artist = item
        .pointer("/artists/0/name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Artist")
        .to_string();

    let album = item
        .pointer("/album/name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Album")
        .to_string();

    let duration_ms = item
        .get("duration_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    let thumbnail = item
        .pointer("/album/images/0/url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let preview_url = item
        .get("preview_url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let external_url = item
        .pointer("/external_urls/spotify")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Some(SpotifyTrack {
        id,
        name,
        artist,
        album,
        duration_ms,
        thumbnail,
        preview_url,
        external_url,
    })
}

// ── Utility Functions ────────────────────────────────────────────────────────

/// Minimal Base64 encoder (avoids pulling in the `base64` crate for one use).
fn base64_encode(input: &str) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = input.as_bytes();
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);

    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Minimal percent-encoding for URL query params.
fn urlencoding(input: &str) -> String {
    let mut result = String::with_capacity(input.len() * 3);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("%20"),
            _ => {
                result.push('%');
                result.push_str(&format!("{byte:02X}"));
            }
        }
    }
    result
}

// ── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn spotify_search(
    query: String,
    limit: Option<u8>,
    client: State<'_, Option<SpotifyClient>>,
) -> Result<SpotifySearchResult, String> {
    let client = client
        .inner()
        .as_ref()
        .ok_or_else(|| "Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env".to_string())?;

    client.search_tracks(&query, limit.unwrap_or(10)).await
}

#[tauri::command]
pub async fn spotify_get_track(
    track_id: String,
    client: State<'_, Option<SpotifyClient>>,
) -> Result<SpotifyTrack, String> {
    let client = client
        .inner()
        .as_ref()
        .ok_or_else(|| "Spotify credentials not configured".to_string())?;

    client.get_track(&track_id).await
}
