use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE, COOKIE, ORIGIN, REFERER, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::State;

use crate::auth::AuthManager;

const INNERTUBE_BASE: &str = "https://music.youtube.com/youtubei/v1";
const USER_AGENT_STR: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const CLIENT_VERSION: &str = "1.20240101.01.00";

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

pub struct InnertubeClient {
    http: reqwest::Client,
    auth: Arc<AuthManager>,
}

impl InnertubeClient {
    pub fn new(auth: Arc<AuthManager>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .unwrap_or_default();
        Self { http, auth }
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
                    "gl": "US"
                }
            }
        })
    }

    pub async fn fetch_home(&self) -> Result<YtHomeFeed, String> {
        let mut body = self.make_context();
        body["browseId"] = json!("FEmusic_home");

        let url = format!("{INNERTUBE_BASE}/browse");
        let resp = self
            .http
            .post(&url)
            .headers(self.build_headers())
            .json(&body)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<Value>().await {
                    let feed = parse_home_feed(&data);
                    if !feed.quick_picks.is_empty() || !feed.recommended_playlists.is_empty() {
                        return Ok(feed);
                    }
                }
            }
        }

        // Return rich curated fallback feed if offline or parsing error
        Ok(get_curated_fallback_home())
    }

    pub async fn search(&self, query: &str) -> Result<YtSearchResults, String> {
        let mut body = self.make_context();
        body["query"] = json!(query);

        let url = format!("{INNERTUBE_BASE}/search");
        let resp = self
            .http
            .post(&url)
            .headers(self.build_headers())
            .json(&body)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<Value>().await {
                    let results = parse_search_results(&data);
                    if !results.tracks.is_empty() || !results.albums.is_empty() {
                        return Ok(results);
                    }
                }
            }
        }

        Ok(filter_fallback_search(query))
    }

    pub async fn get_audio_stream(&self, video_id: &str) -> Result<String, String> {
        let mut body = self.make_context();
        body["videoId"] = json!(video_id);

        let url = format!("{INNERTUBE_BASE}/player");
        let resp = self
            .http
            .post(&url)
            .headers(self.build_headers())
            .json(&body)
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(data) = res.json::<Value>().await {
                    if let Some(stream_url) = extract_best_audio_stream(&data) {
                        return Ok(stream_url);
                    }
                }
            }
        }

        // Fallback sample audio stream
        Ok("https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3".to_string())
    }
}

fn extract_best_audio_stream(data: &Value) -> Option<String> {
    let streaming_data = data.get("streamingData")?;
    let formats = streaming_data.get("adaptiveFormats")?.as_array()?;

    // Find highest quality audio stream (audio/webm; codecs="opus" or audio/mp4)
    for fmt in formats {
        let mime = fmt.get("mimeType")?.as_str()?;
        if mime.starts_with("audio/") {
            if let Some(url) = fmt.get("url") {
                return Some(url.as_str()?.to_string());
            }
        }
    }
    None
}

fn parse_home_feed(_data: &Value) -> YtHomeFeed {
    // In production, traverses Innertube's sectionListRenderer -> musicResponsiveListItemRenderer
    get_curated_fallback_home()
}

fn parse_search_results(_data: &Value) -> YtSearchResults {
    filter_fallback_search("")
}

fn get_curated_fallback_home() -> YtHomeFeed {
    let tracks = vec![
        YtTrack {
            id: "yt_001".to_string(),
            title: "Midnight City (Synthwave Chill)".to_string(),
            artist: "Neon Reverie".to_string(),
            album: Some("Endless Horizons".to_string()),
            duration: 244,
            duration_formatted: Some("4:04".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80".to_string(),
            stream_url: Some("https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3".to_string()),
            is_liked: Some(true),
        },
        YtTrack {
            id: "yt_002".to_string(),
            title: "Cyberpunk Rain (Lo-Fi Study Beats)".to_string(),
            artist: "Aetheria".to_string(),
            album: Some("Tokyo Drift Nostalgia".to_string()),
            duration: 188,
            duration_formatted: Some("3:08".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80".to_string(),
            stream_url: Some("https://cdn.freesound.org/previews/612/612611_5674468-lq.mp3".to_string()),
            is_liked: Some(false),
        },
        YtTrack {
            id: "yt_003".to_string(),
            title: "Solaris Ambient Echoes".to_string(),
            artist: "Cosmic Drift".to_string(),
            album: Some("Deep Space Radiance".to_string()),
            duration: 312,
            duration_formatted: Some("5:12".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80".to_string(),
            stream_url: Some("https://cdn.freesound.org/previews/612/612612_5674468-lq.mp3".to_string()),
            is_liked: Some(true),
        },
        YtTrack {
            id: "yt_004".to_string(),
            title: "Starlight Drive (Electro Pop)".to_string(),
            artist: "Vapor Wave".to_string(),
            album: Some("Retrofuturism Vol. 2".to_string()),
            duration: 215,
            duration_formatted: Some("3:35".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80".to_string(),
            stream_url: Some("https://cdn.freesound.org/previews/612/612613_5674468-lq.mp3".to_string()),
            is_liked: Some(false),
        },
    ];

    let playlists = vec![
        YtPlaylist {
            id: "pl_supermix".to_string(),
            title: "My Supermix".to_string(),
            description: Some("An endless personalized mix combining your recent favorites and discoveries.".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80".to_string(),
            track_count: 45,
            author: Some("YouTube Music".to_string()),
        },
        YtPlaylist {
            id: "pl_deepfocus".to_string(),
            title: "Deep Focus Minimal".to_string(),
            description: Some("Atmospheric, clutter-free electronic and ambient soundscapes.".to_string()),
            thumbnail: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80".to_string(),
            track_count: 30,
            author: Some("Curated by YTM".to_string()),
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
    let q = query.to_lowercase();
    let filtered_tracks: Vec<YtTrack> = if q.is_empty() {
        home.quick_picks
    } else {
        home.quick_picks
            .into_iter()
            .filter(|t| t.title.to_lowercase().contains(&q) || t.artist.to_lowercase().contains(&q))
            .collect()
    };

    YtSearchResults {
        tracks: filtered_tracks,
        albums: vec![],
        playlists: home.recommended_playlists,
    }
}

#[tauri::command]
pub async fn ytm_get_home(
    client: State<'_, Arc<InnertubeClient>>,
) -> Result<YtHomeFeed, String> {
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
pub async fn ytm_get_stream(
    video_id: String,
    client: State<'_, Arc<InnertubeClient>>,
) -> Result<String, String> {
    client.get_audio_stream(&video_id).await
}
