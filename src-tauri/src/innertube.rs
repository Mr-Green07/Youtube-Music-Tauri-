//! YouTube Music Innertube client.
//!
//! Talks directly to the private `music.youtube.com/youtubei/v1` endpoints used
//! by the web player, so the desktop app performs *real online streaming*:
//!
//! * `browse`  → home shelves (quick picks, mixes, charts)
//! * `search`  → songs / albums / playlists
//! * `browse`  → playlist track lists
//! * `player`  → direct audio stream URLs (with a yt-dlp / Piped / Invidious
//!   fallback handled by [`crate::resolver`] when Innertube refuses)
//!
//! No YouTube Data API v3 key is required — everything is scraped from the same
//! JSON payloads the official web client consumes.

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, COOKIE, ORIGIN, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::auth::AuthManager;
use crate::resolver::{resolve_audio_stream, AudioQuality};

const INNERTUBE_BASE: &str = "https://music.youtube.com/youtubei/v1";
const USER_AGENT_STR: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CLIENT_VERSION: &str = "1.20240101.01.00";
const REQUEST_TIMEOUT_SECS: u64 = 12;

// ── Serializable payloads (mirrored by `src/types/music.ts`) ─────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: u64,
    pub duration_formatted: Option<String>,
    pub thumbnail: String,
    pub stream_url: Option<String>,
    pub is_liked: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtPlaylist {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub thumbnail: String,
    pub track_count: usize,
    pub author: Option<String>,
    /// YouTube Music browse id (`VLPL...`, `MPRE...`) used to load the track list.
    pub browse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtAlbum {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub year: Option<String>,
    pub thumbnail: String,
    pub tracks: Vec<YtTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtHomeFeed {
    pub quick_picks: Vec<YtTrack>,
    pub recommended_playlists: Vec<YtPlaylist>,
    pub trending: Vec<YtTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtSearchResults {
    pub tracks: Vec<YtTrack>,
    pub albums: Vec<YtAlbum>,
    pub playlists: Vec<YtPlaylist>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtPlaylistDetail {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub thumbnail: String,
    pub tracks: Vec<YtTrack>,
}

// ── Client ───────────────────────────────────────────────────────────────────

pub struct InnertubeClient {
    http: reqwest::Client,
    auth: Arc<AuthManager>,
}

impl InnertubeClient {
    pub fn new(auth: Arc<AuthManager>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .unwrap_or_default();
        Self { http, auth }
    }

    /// Shared HTTP client (also used by the cascading audio resolver).
    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    fn build_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_STR));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(ORIGIN, HeaderValue::from_static("https://music.youtube.com"));
        headers.insert(REFERER, HeaderValue::from_static("https://music.youtube.com/"));
        headers.insert("X-YouTube-Client-Name", HeaderValue::from_static("67"));
        headers.insert(
            "X-YouTube-Client-Version",
            HeaderValue::from_static(CLIENT_VERSION),
        );
        headers.insert(
            "Accept-Language",
            HeaderValue::from_static("en-US,en;q=0.9"),
        );

        // Authenticated requests: SAPISIDHASH + cookies captured by the login WebView.
        if let Some(hash) = self.auth.get_sapisid_hash() {
            if let Ok(val) = HeaderValue::from_str(&hash) {
                headers.insert(AUTHORIZATION, val);
            }
        }

        if let Some(cookies) = self.auth.get_cookies() {
            if let Ok(val) = HeaderValue::from_str(&cookies) {
                headers.insert(COOKIE, val);
            }
        }

        headers
    }

    fn make_context(&self) -> Value {
        json!({
            "context": {
                "client": {
                    "clientName": "WEB_REMIX",
                    "clientVersion": CLIENT_VERSION,
                    "hl": "en",
                    "gl": "US",
                    "userAgent": USER_AGENT_STR
                },
                "user": {}
            }
        })
    }

    /// POSTs to an Innertube endpoint and returns the parsed JSON body.
    async fn post(&self, endpoint: &str, body: &Value) -> Option<Value> {
        let url = format!("{INNERTUBE_BASE}/{endpoint}");
        let response = self
            .http
            .post(&url)
            .headers(self.build_headers())
            .json(body)
            .send()
            .await;

        match response {
            Ok(res) if res.status().is_success() => res.json::<Value>().await.ok(),
            Ok(res) => {
                eprintln!("[innertube] {endpoint} returned HTTP {}", res.status());
                None
            }
            Err(err) => {
                eprintln!("[innertube] {endpoint} request failed: {err}");
                None
            }
        }
    }

    // ── Home ─────────────────────────────────────────────────────────────────

    pub async fn fetch_home(&self) -> Result<YtHomeFeed, String> {
        let mut body = self.make_context();
        body["browseId"] = json!("FEmusic_home");

        if let Some(data) = self.post("browse", &body).await {
            let feed = parse_home_feed(&data);
            if !feed.quick_picks.is_empty() || !feed.recommended_playlists.is_empty() {
                return Ok(feed);
            }
        }

        // Curated fallback keeps the UI populated when offline / blocked.
        Ok(get_curated_fallback_home())
    }

    // ── Search ───────────────────────────────────────────────────────────────

    pub async fn search(&self, query: &str) -> Result<YtSearchResults, String> {
        let mut body = self.make_context();
        body["query"] = json!(query);
        // No `params` => combined results (songs + albums + playlists + videos).

        if let Some(data) = self.post("search", &body).await {
            let results = parse_search_results(&data);
            if !results.tracks.is_empty() || !results.albums.is_empty() {
                return Ok(results);
            }
        }

        Ok(filter_fallback_search(query))
    }

    // ── Playlist track list ──────────────────────────────────────────────────

    pub async fn browse_playlist(&self, browse_id: &str) -> Result<YtPlaylistDetail, String> {
        if browse_id.trim().is_empty() {
            return Err("Missing playlist browse id".to_string());
        }

        let mut body = self.make_context();
        body["browseId"] = json!(browse_id);

        let data = self
            .post("browse", &body)
            .await
            .ok_or_else(|| "Innertube browse request failed".to_string())?;

        let detail = parse_playlist_detail(&data, browse_id);
        if detail.tracks.is_empty() {
            return Err("Playlist has no readable tracks".to_string());
        }
        Ok(detail)
    }

    // ── Playback ─────────────────────────────────────────────────────────────

    /// Attempts to obtain a direct audio URL from the Innertube `player` endpoint.
    /// Returns `None` when the response lacks a usable (non-ciphered) URL.
    pub async fn try_audio_stream(&self, video_id: &str) -> Option<String> {
        let mut body = self.make_context();
        body["videoId"] = json!(video_id);
        body["contentCheckOk"] = json!(true);
        body["racyCheckOk"] = json!(true);
        body["playbackContext"] = json!({
            "contentPlaybackContext": { "html5Preference": "HTML5_PREF_WANTS" }
        });

        let data = self.post("player", &body).await?;

        let status = data
            .get("playabilityStatus")
            .and_then(|s| s.get("status"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if status != "OK" {
            eprintln!("[innertube] player status for {video_id}: {status}");
        }

        // Some responses only expose `signatureCipher`, which needs the JS
        // deciphering routine — let the yt-dlp/Piped cascade handle those.
        extract_best_audio_stream(&data)
    }
}

// ── JSON traversal helpers ───────────────────────────────────────────────────

/// Depth-first lookup of the first value stored under `key`.
fn find_key<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key) {
                return Some(found);
            }
            for child in map.values() {
                if let Some(found) = find_key(child, key) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => {
            for child in items {
                if let Some(found) = find_key(child, key) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

/// Collects every value stored under `key` (does not descend into matches).
fn collect_key<'a>(value: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match value {
        Value::Object(map) => {
            if let Some(found) = map.get(key) {
                out.push(found);
                return;
            }
            for child in map.values() {
                collect_key(child, key, out);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_key(child, key, out);
            }
        }
        _ => {}
    }
}

/// Renders a YouTube Music text object (`{runs: [...]}` or `{simpleText}`).
fn text_of(value: &Value) -> String {
    if let Some(simple) = value.get("simpleText").and_then(Value::as_str) {
        return simple.to_string();
    }
    if let Some(runs) = value.get("runs").and_then(Value::as_array) {
        let mut text = String::new();
        for run in runs {
            if let Some(piece) = run.get("text").and_then(Value::as_str) {
                text.push_str(piece);
            }
        }
        return text;
    }
    String::new()
}

/// Picks the largest thumbnail URL found in a renderer.
fn thumbnail_of(value: &Value) -> Option<String> {
    let thumbnails = find_key(value, "thumbnails")?.as_array()?;
    thumbnails
        .iter()
        .rev()
        .find_map(|entry| entry.get("url").and_then(Value::as_str))
        .map(|url| url.to_string())
}

fn looks_like_duration(text: &str) -> bool {
    let trimmed = text.trim();
    !trimmed.is_empty()
        && trimmed.contains(':')
        && trimmed
            .split(':')
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

fn parse_duration_text(text: &str) -> u64 {
    let mut total = 0u64;
    for part in text.trim().split(':') {
        match part.trim().parse::<u64>() {
            Ok(value) => total = total * 60 + value,
            Err(_) => return 0,
        }
    }
    total
}

fn format_duration(seconds: u64) -> String {
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

fn browse_id_of(value: &Value) -> Option<String> {
    find_key(value, "browseEndpoint")
        .and_then(|endpoint| endpoint.get("browseId"))
        .and_then(Value::as_str)
        .map(|id| id.to_string())
}

fn watch_video_id_of(value: &Value) -> Option<String> {
    find_key(value, "watchEndpoint")
        .and_then(|endpoint| endpoint.get("videoId"))
        .and_then(Value::as_str)
        .map(|id| id.to_string())
}

/// Parses `"45 songs"` → `45`.
fn count_from_text(text: &str) -> usize {
    let digits: String = text
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse::<usize>().unwrap_or(0)
}

// ── Renderer parsing ─────────────────────────────────────────────────────────

/// Parses a `musicResponsiveListItemRenderer` (one song row) into a track.
fn track_from_responsive_item(item: &Value) -> Option<YtTrack> {
    let renderer = item.get("musicResponsiveListItemRenderer").unwrap_or(item);

    let flex_columns = renderer.get("flexColumns")?.as_array()?;

    let title = flex_columns
        .first()
        .and_then(|column| column.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|column| column.get("text"))
        .map(text_of)
        .unwrap_or_default();

    if title.trim().is_empty() {
        return None;
    }

    let video_id = renderer
        .get("playlistItemData")
        .and_then(|data| data.get("videoId"))
        .and_then(Value::as_str)
        .map(|id| id.to_string())
        .or_else(|| watch_video_id_of(renderer))?;

    // Subtitle runs: "Artist • Album • 3:08" (order varies by shelf type).
    let mut artist = String::new();
    let mut album: Option<String> = None;
    let mut duration = 0u64;

    if let Some(runs) = flex_columns
        .get(1)
        .and_then(|column| column.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|column| column.get("text"))
        .and_then(|text| text.get("runs"))
        .and_then(Value::as_array)
    {
        let mut textual: Vec<String> = Vec::new();
        for run in runs {
            let piece = match run.get("text").and_then(Value::as_str) {
                Some(text) => text.trim(),
                None => continue,
            };
            if piece.is_empty() || piece == "•" || piece == "·" || piece == "&" {
                continue;
            }
            if looks_like_duration(piece) {
                duration = parse_duration_text(piece);
                continue;
            }
            textual.push(piece.to_string());
        }

        if let Some(first) = textual.first() {
            artist = first.clone();
        }
        if let Some(second) = textual.get(1) {
            let is_year = second.len() == 4 && second.chars().all(|c| c.is_ascii_digit());
            if !is_year {
                album = Some(second.clone());
            }
        }
    }

    if artist.is_empty() {
        artist = "Unknown artist".to_string();
    }

    let thumbnail = thumbnail_of(renderer)
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"));

    Some(YtTrack {
        id: video_id,
        title,
        artist,
        album,
        duration,
        duration_formatted: if duration > 0 {
            Some(format_duration(duration))
        } else {
            None
        },
        thumbnail,
        stream_url: None,
        is_liked: None,
    })
}

/// Classifies a `musicTwoRowItemRenderer` (card) as album, playlist or track.
enum TwoRowItem {
    Album(YtAlbum),
    Playlist(YtPlaylist),
    Track(YtTrack),
}

fn parse_two_row_item(item: &Value) -> Option<TwoRowItem> {
    let renderer = item.get("musicTwoRowItemRenderer").unwrap_or(item);

    let title = renderer
        .get("title")
        .map(text_of)
        .unwrap_or_default()
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }

    let subtitle = renderer.get("subtitle").map(text_of).unwrap_or_default();
    let thumbnail = thumbnail_of(renderer).unwrap_or_default();
    let browse_id = browse_id_of(renderer);

    // Video cards (e.g. the "Videos" shelf) carry a watch endpoint instead.
    if browse_id.is_none() {
        if let Some(video_id) = watch_video_id_of(renderer) {
            return Some(TwoRowItem::Track(YtTrack {
                id: video_id.clone(),
                title,
                artist: subtitle
                    .split('•')
                    .next()
                    .unwrap_or("Unknown artist")
                    .trim()
                    .to_string(),
                album: None,
                duration: 0,
                duration_formatted: None,
                thumbnail: if thumbnail.is_empty() {
                    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
                } else {
                    thumbnail
                },
                stream_url: None,
                is_liked: None,
            }));
        }
        return None;
    }

    let browse_id = browse_id?;
    let track_count = count_from_text(&subtitle);
    let author = subtitle
        .split('•')
        .nth(1)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if browse_id.starts_with("MPRE") {
        return Some(TwoRowItem::Album(YtAlbum {
            id: browse_id,
            title,
            artist: subtitle
                .split('•')
                .next()
                .unwrap_or("Various artists")
                .trim()
                .to_string(),
            year: subtitle
                .split('•')
                .find(|part| {
                    let trimmed = part.trim();
                    trimmed.len() == 4 && trimmed.chars().all(|c| c.is_ascii_digit())
                })
                .map(|value| value.trim().to_string()),
            thumbnail,
            tracks: Vec::new(),
        }));
    }

    if browse_id.starts_with("VL") || browse_id.starts_with("PL") {
        return Some(TwoRowItem::Playlist(YtPlaylist {
            id: browse_id.clone(),
            title,
            description: None,
            thumbnail,
            track_count,
            author,
            browse_id: Some(browse_id),
        }));
    }

    None
}

fn collect_tracks(data: &Value) -> Vec<YtTrack> {
    let mut renderers = Vec::new();
    collect_key(data, "musicResponsiveListItemRenderer", &mut renderers);

    let mut seen = HashSet::new();
    let mut tracks = Vec::new();
    for renderer in renderers {
        if let Some(track) = track_from_responsive_item(renderer) {
            if seen.insert(track.id.clone()) {
                tracks.push(track);
            }
        }
    }
    tracks
}

fn collect_two_row_items(data: &Value) -> (Vec<YtAlbum>, Vec<YtPlaylist>) {
    let mut renderers = Vec::new();
    collect_key(data, "musicTwoRowItemRenderer", &mut renderers);

    let mut albums: Vec<YtAlbum> = Vec::new();
    let mut playlists: Vec<YtPlaylist> = Vec::new();
    let mut seen_albums = HashSet::new();
    let mut seen_playlists = HashSet::new();

    for renderer in renderers {
        match parse_two_row_item(renderer) {
            Some(TwoRowItem::Album(album)) => {
                if seen_albums.insert(album.id.clone()) {
                    albums.push(album);
                }
            }
            Some(TwoRowItem::Playlist(playlist)) => {
                if seen_playlists.insert(playlist.id.clone()) {
                    playlists.push(playlist);
                }
            }
            _ => {}
        }
    }

    (albums, playlists)
}

// ── Response parsers ─────────────────────────────────────────────────────────

fn parse_home_feed(data: &Value) -> YtHomeFeed {
    let tracks = collect_tracks(data);
    let (_, playlists) = collect_two_row_items(data);

    let quick_picks: Vec<YtTrack> = tracks.iter().take(6).cloned().collect();
    let mut trending: Vec<YtTrack> = tracks.iter().skip(6).take(10).cloned().collect();
    if trending.is_empty() {
        trending = tracks.clone();
    }

    YtHomeFeed {
        quick_picks,
        recommended_playlists: playlists.into_iter().take(6).collect(),
        trending,
    }
}

fn parse_search_results(data: &Value) -> YtSearchResults {
    let mut tracks = collect_tracks(data);
    let (albums, playlists) = collect_two_row_items(data);

    // Video cards parsed from the search page are playable songs too.
    let mut renderers = Vec::new();
    collect_key(data, "musicTwoRowItemRenderer", &mut renderers);
    let mut seen: HashSet<String> = tracks.iter().map(|track| track.id.clone()).collect();
    for renderer in renderers {
        if let Some(TwoRowItem::Track(track)) = parse_two_row_item(renderer) {
            if seen.insert(track.id.clone()) {
                tracks.push(track);
            }
        }
    }

    YtSearchResults {
        tracks,
        albums,
        playlists,
    }
}

fn parse_playlist_detail(data: &Value, browse_id: &str) -> YtPlaylistDetail {
    let tracks = collect_tracks(data);

    let header = find_key(data, "musicDetailHeaderRenderer")
        .or_else(|| find_key(data, "musicResponsiveHeaderRenderer"))
        .or_else(|| find_key(data, "musicEditablePlaylistDetailHeaderRenderer"));

    let title = header
        .and_then(|header| header.get("title"))
        .map(text_of)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| "YouTube Music playlist".to_string());

    let description = header
        .and_then(|header| find_key(header, "description"))
        .map(text_of)
        .filter(|text| !text.trim().is_empty());

    // `straplineTextOne` looks like "Playlist • Channel name" — keep the channel.
    let author = header
        .and_then(|header| {
            find_key(header, "straplineTextOne")
                .or_else(|| find_key(header, "subtitle"))
                .map(|value| {
                    text_of(value)
                        .split('•')
                        .last()
                        .unwrap_or("")
                        .trim()
                        .to_string()
                })
        })
        .filter(|text| !text.is_empty());

    let thumbnail = header
        .and_then(thumbnail_of)
        .or_else(|| tracks.first().map(|track| track.thumbnail.clone()))
        .unwrap_or_default();

    YtPlaylistDetail {
        id: browse_id.to_string(),
        title,
        author,
        description,
        thumbnail,
        tracks,
    }
}

/// Picks the highest-bitrate audio-only format that exposes a plain URL.
fn extract_best_audio_stream(data: &Value) -> Option<String> {
    let formats = data
        .get("streamingData")
        .and_then(|streaming| streaming.get("adaptiveFormats"))
        .and_then(Value::as_array)?;

    let mut best: Option<(u64, String)> = None;

    for format in formats {
        let mime = format
            .get("mimeType")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !mime.starts_with("audio/") {
            continue;
        }

        let url = match format.get("url").and_then(Value::as_str) {
            Some(url) => url,
            None => continue, // signatureCipher — needs deciphering
        };

        let bitrate = format.get("bitrate").and_then(Value::as_u64).unwrap_or(0);

        let is_better = match &best {
            Some((current, _)) => bitrate > *current,
            None => true,
        };
        if is_better {
            best = Some((bitrate, url.to_string()));
        }
    }

    best.map(|(_, url)| url)
}

// ── Offline fallbacks ────────────────────────────────────────────────────────

fn fallback_track(
    id: &str,
    title: &str,
    artist: &str,
    album: &str,
    duration: u64,
    thumbnail: &str,
    liked: bool,
) -> YtTrack {
    YtTrack {
        id: id.to_string(),
        title: title.to_string(),
        artist: artist.to_string(),
        album: Some(album.to_string()),
        duration,
        duration_formatted: Some(format_duration(duration)),
        thumbnail: thumbnail.to_string(),
        stream_url: Some(
            "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3".to_string(),
        ),
        is_liked: Some(liked),
    }
}

fn get_curated_fallback_home() -> YtHomeFeed {
    let tracks = vec![
        fallback_track(
            "yt_001",
            "Midnight City (Synthwave Chill)",
            "Neon Reverie",
            "Endless Horizons",
            244,
            "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
            true,
        ),
        fallback_track(
            "yt_002",
            "Cyberpunk Rain (Lo-Fi Study Beats)",
            "Aetheria",
            "Tokyo Drift Nostalgia",
            188,
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
            false,
        ),
        fallback_track(
            "yt_003",
            "Solaris Ambient Echoes",
            "Cosmic Drift",
            "Deep Space Radiance",
            312,
            "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
            true,
        ),
        fallback_track(
            "yt_004",
            "Starlight Drive (Electro Pop)",
            "Vapor Wave",
            "Retrofuturism Vol. 2",
            215,
            "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
            false,
        ),
    ];

    let playlists = vec![
        YtPlaylist {
            id: "pl_supermix".to_string(),
            title: "My Supermix".to_string(),
            description: Some(
                "An endless personalized mix combining your recent favorites and discoveries."
                    .to_string(),
            ),
            thumbnail:
                "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80"
                    .to_string(),
            track_count: 45,
            author: Some("YouTube Music".to_string()),
            browse_id: None,
        },
        YtPlaylist {
            id: "pl_deepfocus".to_string(),
            title: "Deep Focus Minimal".to_string(),
            description: Some(
                "Atmospheric, clutter-free electronic and ambient soundscapes.".to_string(),
            ),
            thumbnail:
                "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80"
                    .to_string(),
            track_count: 30,
            author: Some("Curated by YTM".to_string()),
            browse_id: None,
        },
    ];

    YtHomeFeed {
        quick_picks: tracks.clone(),
        recommended_playlists: playlists,
        trending: tracks,
    }
}

fn filter_fallback_search(query: &str) -> YtSearchResults {
    let home = get_curated_fallback_home();
    let needle = query.trim().to_lowercase();

    let tracks: Vec<YtTrack> = if needle.is_empty() {
        home.quick_picks
    } else {
        home.quick_picks
            .into_iter()
            .filter(|track| {
                track.title.to_lowercase().contains(&needle)
                    || track.artist.to_lowercase().contains(&needle)
            })
            .collect()
    };

    YtSearchResults {
        tracks,
        albums: Vec::new(),
        playlists: home.recommended_playlists,
    }
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ytm_get_home(client: State<'_, Arc<InnertubeClient>>) -> Result<YtHomeFeed, String> {
    client.fetch_home().await
}

#[tauri::command]
pub async fn ytm_search(
    query: String,
    client: State<'_, Arc<InnertubeClient>>,
) -> Result<YtSearchResults, String> {
    client.search(&query).await
}

#[tauri::command]
pub async fn ytm_get_playlist(
    browse_id: String,
    client: State<'_, Arc<InnertubeClient>>,
) -> Result<YtPlaylistDetail, String> {
    client.browse_playlist(&browse_id).await
}

/// Resolves a playable audio URL for a video id.
///
/// Layer 1: Innertube `player` (fast, works for most tracks).
/// Layer 2: cascading resolver — yt-dlp sidecar → Piped → Invidious.
#[tauri::command]
pub async fn ytm_get_stream(
    app: AppHandle,
    video_id: String,
    client: State<'_, Arc<InnertubeClient>>,
) -> Result<String, String> {
    if let Some(url) = client.try_audio_stream(&video_id).await {
        return Ok(url);
    }

    match resolve_audio_stream(&app, client.http(), &video_id, AudioQuality::Best).await {
        Ok(result) => Ok(result.url),
        Err(err) => Err(format!(
            "Unable to resolve a stream for {video_id}: {err}"
        )),
    }
}
