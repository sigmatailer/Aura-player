use serde::{Deserialize, Serialize};
use regex::Regex;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ExternalTrackInfo {
    pub title: String,
    pub artist: String,
    #[serde(default)]
    pub yandex_id: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub duration_sec: Option<u32>,
    #[serde(default)]
    pub cover_url: Option<String>,
}

impl ExternalTrackInfo {
    pub fn new(title: impl Into<String>, artist: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            artist: artist.into(),
            ..Default::default()
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExternalPlaylistData {
    pub title: String,
    pub cover_url: Option<String>,
    pub platform: String,
    pub tracks: Vec<ExternalTrackInfo>,
}

fn build_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(12))
        .build()
        .unwrap_or_default()
}

fn parse_yandex_playlist_result(res: &serde_json::Value) -> Result<ExternalPlaylistData, String> {
    let title = res.get("title").and_then(|v| v.as_str()).unwrap_or("Плейлист Яндекс Музыки").to_string();
    let cover_url = res.get("cover")
        .and_then(|c| c.get("uri"))
        .and_then(|u| u.as_str())
        .map(|u| format!("https://{}", u.replace("%%", "1000x1000")))
        .or_else(|| res.get("ogImage").and_then(|u| u.as_str()).map(|u| format!("https://{}", u.replace("%%", "1000x1000"))));

    let mut tracks = Vec::new();
    if let Some(track_items) = res.get("tracks").and_then(|t| t.as_array()) {
        for item in track_items {
            let track_obj = item.get("track").unwrap_or(item);
            if let Some(t_title) = track_obj.get("title").and_then(|v| v.as_str()) {
                let artist = track_obj.get("artists")
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                            .collect::<Vec<_>>()
                            .join(", ")
                    })
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Неизвестный исполнитель".to_string());

                let yandex_id = track_obj.get("id").and_then(|id| {
                    if let Some(s) = id.as_str() {
                        Some(s.to_string())
                    } else if let Some(n) = id.as_i64() {
                        Some(n.to_string())
                    } else {
                        None
                    }
                });

                let album = track_obj.get("albums")
                    .and_then(|a| a.as_array())
                    .and_then(|a| a.first())
                    .and_then(|a| a.get("title"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());

                let duration_sec = track_obj.get("durationMs")
                    .and_then(|d| d.as_u64())
                    .map(|ms| (ms / 1000) as u32);

                let t_cover_url = track_obj.get("coverUri")
                    .and_then(|c| c.as_str())
                    .map(|u| format!("https://{}", u.replace("%%", "1000x1000")))
                    .or_else(|| {
                        track_obj.get("albums")
                            .and_then(|a| a.as_array())
                            .and_then(|a| a.first())
                            .and_then(|a| a.get("coverUri"))
                            .and_then(|c| c.as_str())
                            .map(|u| format!("https://{}", u.replace("%%", "1000x1000")))
                    });

                tracks.push(ExternalTrackInfo {
                    title: t_title.to_string(),
                    artist,
                    yandex_id,
                    album,
                    duration_sec,
                    cover_url: t_cover_url,
                });
            }
        }
    }

    Ok(ExternalPlaylistData {
        title,
        cover_url,
        platform: "Yandex Music".to_string(),
        tracks,
    })
}

// 1. Yandex Music Parser
pub async fn parse_yandex_music(url: &str) -> Result<ExternalPlaylistData, String> {
    let client = build_client();

    // Check if it's a UUID playlist: /playlists/{uuid} or /playlist/{uuid}
    // e.g. https://music.yandex.by/playlists/2bc77780-1408-b7e6-4911-83a06290c3d4
    let uuid_re = Regex::new(r"/playlists?/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})").unwrap();
    if let Some(caps) = uuid_re.captures(url) {
        let uuid = &caps[1];
        let api_url = format!("https://api.music.yandex.net/playlist/{}", uuid);

        let resp = client.get(&api_url)
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
            .send().await.map_err(|e| e.to_string())?;

        let text = resp.text().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let res = json.get("result").ok_or("Не удалось получить данные плейлиста из Яндекс Музыки")?;

        return parse_yandex_playlist_result(res);
    }

    // Check if it's a user playlist: /users/{user}/playlists/{kind}
    let pl_re = Regex::new(r"/users/([^/]+)/playlists/(\d+)").unwrap();
    if let Some(caps) = pl_re.captures(url) {
        let user = &caps[1];
        let kind = &caps[2];
        let api_url = format!("https://api.music.yandex.net/users/{}/playlists/{}", user, kind);

        let resp = client.get(&api_url)
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
            .send().await.map_err(|e| e.to_string())?;

        let text = resp.text().await.map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let res = json.get("result").ok_or("Не удалось получить данные плейлиста пользователя из Яндекс Музыки")?;

        return parse_yandex_playlist_result(res);
    }

    // Check if it's an album: /album/{id}
    if url.contains("/album/") {
        let alb_re = Regex::new(r"/album/(\d+)").unwrap();
        if let Some(caps) = alb_re.captures(url) {
            let album_id = &caps[1];
            let api_url = format!("https://api.music.yandex.net/albums/{}/with-tracks", album_id);

            let resp = client.get(&api_url)
                .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
                .send().await.map_err(|e| e.to_string())?;

            let text = resp.text().await.map_err(|e| e.to_string())?;
            let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let res = json.get("result").ok_or("Не удалось получить альбом из Яндекс Музыки")?;

            let title = res.get("title").and_then(|v| v.as_str()).unwrap_or("Альбом Яндекс Музыки").to_string();
            let cover_url = res.get("coverUri")
                .and_then(|u| u.as_str())
                .map(|u| format!("https://{}", u.replace("%%", "1000x1000")));

            let default_artist = res.get("artists")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Неизвестный исполнитель".to_string());

            let mut tracks = Vec::new();
            if let Some(volumes) = res.get("volumes").and_then(|v| v.as_array()) {
                for vol in volumes {
                    if let Some(track_list) = vol.as_array() {
                        for t in track_list {
                            if let Some(t_title) = t.get("title").and_then(|v| v.as_str()) {
                                let artist = t.get("artists")
                                    .and_then(|a| a.as_array())
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                                            .collect::<Vec<_>>()
                                            .join(", ")
                                    })
                                    .filter(|s| !s.is_empty())
                                    .unwrap_or_else(|| default_artist.clone());

                                let yandex_id = t.get("id").and_then(|id| {
                                    if let Some(s) = id.as_str() {
                                        Some(s.to_string())
                                    } else if let Some(n) = id.as_i64() {
                                        Some(n.to_string())
                                    } else {
                                        None
                                    }
                                });

                                let album = t.get("albums")
                                    .and_then(|a| a.as_array())
                                    .and_then(|a| a.first())
                                    .and_then(|a| a.get("title"))
                                    .and_then(|s| s.as_str())
                                    .map(|s| s.to_string())
                                    .or_else(|| Some(title.clone()));

                                let duration_sec = t.get("durationMs")
                                    .and_then(|d| d.as_u64())
                                    .map(|ms| (ms / 1000) as u32);

                                let t_cover_url = t.get("coverUri")
                                    .and_then(|c| c.as_str())
                                    .map(|u| format!("https://{}", u.replace("%%", "1000x1000")))
                                    .or_else(|| cover_url.clone());

                                tracks.push(ExternalTrackInfo {
                                    title: t_title.to_string(),
                                    artist,
                                    yandex_id,
                                    album,
                                    duration_sec,
                                    cover_url: t_cover_url,
                                });
                            }
                        }
                    }
                }
            }

            return Ok(ExternalPlaylistData {
                title,
                cover_url,
                platform: "Yandex Music".to_string(),
                tracks,
            });
        }
    }

    // Check if it's an artist: /artist/{id}
    if url.contains("/artist/") {
        let art_re = Regex::new(r"/artist/(\d+)").unwrap();
        if let Some(caps) = art_re.captures(url) {
            let artist_id = &caps[1];
            let api_url = format!("https://api.music.yandex.net/artists/{}/tracks?page=0&pageSize=100", artist_id);

            let resp = client.get(&api_url)
                .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
                .send().await.map_err(|e| e.to_string())?;

            let text = resp.text().await.map_err(|e| e.to_string())?;
            let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let res = json.get("result").ok_or("Не удалось получить треки артиста из Яндекс Музыки")?;

            let title = format!("Треки артиста {}", artist_id);
            let mut tracks = Vec::new();
            if let Some(track_items) = res.get("tracks").and_then(|t| t.as_array()) {
                for track_obj in track_items {
                    if let Some(t_title) = track_obj.get("title").and_then(|v| v.as_str()) {
                        let artist = track_obj.get("artists")
                            .and_then(|a| a.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            })
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "Неизвестный исполнитель".to_string());

                        let yandex_id = track_obj.get("id").and_then(|id| {
                            if let Some(s) = id.as_str() {
                                Some(s.to_string())
                            } else if let Some(n) = id.as_i64() {
                                Some(n.to_string())
                            } else {
                                None
                            }
                        });

                        let album = track_obj.get("albums")
                            .and_then(|a| a.as_array())
                            .and_then(|a| a.first())
                            .and_then(|a| a.get("title"))
                            .and_then(|s| s.as_str())
                            .map(|s| s.to_string());

                        let duration_sec = track_obj.get("durationMs")
                            .and_then(|d| d.as_u64())
                            .map(|ms| (ms / 1000) as u32);

                        let t_cover_url = track_obj.get("coverUri")
                            .and_then(|c| c.as_str())
                            .map(|u| format!("https://{}", u.replace("%%", "1000x1000")));

                        tracks.push(ExternalTrackInfo {
                            title: t_title.to_string(),
                            artist,
                            yandex_id,
                            album,
                            duration_sec,
                            cover_url: t_cover_url,
                        });
                    }
                }
            }

            return Ok(ExternalPlaylistData {
                title,
                cover_url: None,
                platform: "Yandex Music".to_string(),
                tracks,
            });
        }
    }

    Err("Не удалось распознать ссылку на плейлист или альбом Яндекс Музыки".to_string())
}

// 2. Apple Music Parser
pub async fn parse_apple_music(url: &str) -> Result<ExternalPlaylistData, String> {
    let client = build_client();

    let resp = client.get(url)
        .header("Accept-Language", "en-US,en;q=0.9,ru;q=0.8")
        .send().await.map_err(|e| e.to_string())?;

    let html = resp.text().await.map_err(|e| e.to_string())?;

    // Extract title from og:title
    let title_re = Regex::new(r#"<meta\s+property="og:title"\s+content="([^"]+)""#).unwrap();
    let mut title = title_re.captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or("Apple Music Playlist")
        .to_string();

    title = title.replace(" on Apple Music", "")
        .replace(" в Apple Music", "")
        .trim()
        .to_string();

    // Extract cover from og:image
    let cover_re = Regex::new(r#"<meta\s+property="og:image"\s+content="([^"]+)""#).unwrap();
    let cover_url = cover_re.captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    let mut tracks = Vec::new();

    // Serialized JSON pattern inside Apple Music SSR HTML:
    // "title":"Song Title", ... "subtitleLinks":[{"title":"Artist Name"}]
    let track_re = Regex::new(r#""title":"([^"]+)",(?:(?!"title":).)*?"subtitleLinks":\[\{"title":"([^"]+)""#).unwrap();
    for cap in track_re.captures_iter(&html) {
        let t_name = cap[1].replace("\\\"", "\"").replace("\\u0026", "&");
        let a_name = cap[2].replace("\\\"", "\"").replace("\\u0026", "&");

        // Avoid adding the playlist title itself if matched
        if t_name != title && !tracks.iter().any(|t: &ExternalTrackInfo| t.title == t_name && t.artist == a_name) {
            tracks.push(ExternalTrackInfo::new(t_name, a_name));
        }
    }

    // Fallback: Check schema ld+json if regex didn't find tracks
    if tracks.is_empty() {
        let schema_re = Regex::new(r#"<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>"#).unwrap();
        for cap in schema_re.captures_iter(&html) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&cap[1]) {
                if let Some(track_arr) = val.get("track").and_then(|t| t.as_array()) {
                    for item in track_arr {
                        if let Some(t_name) = item.get("name").and_then(|n| n.as_str()) {
                            let a_name = item.get("byArtist")
                                .and_then(|b| b.get("name"))
                                .and_then(|n| n.as_str())
                                .unwrap_or("Unknown Artist");

                            tracks.push(ExternalTrackInfo::new(t_name, a_name));
                        }
                    }
                }
            }
        }
    }

    if tracks.is_empty() {
        return Err("Не удалось найти треки на странице Apple Music. Возможно, плейлист закрыт.".to_string());
    }

    Ok(ExternalPlaylistData {
        title,
        cover_url,
        platform: "Apple Music".to_string(),
        tracks,
    })
}

// 3. Spotify Parser
pub async fn parse_spotify(url: &str, proxy_url: Option<String>) -> Result<ExternalPlaylistData, String> {
    let client = build_client();

    // 1. Always fetch oEmbed first (gives title and cover even without authorization)
    let oembed_url = format!("https://open.spotify.com/oembed?url={}", urlencoding::encode(url));
    let oembed_res = client.get(&oembed_url).send().await;

    let mut title = "Spotify Playlist".to_string();
    let mut cover_url = None;

    if let Ok(resp) = oembed_res {
        if resp.status().is_success() {
            if let Ok(text) = resp.text().await {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(t) = json.get("title").and_then(|v| v.as_str()) {
                        title = t.to_string();
                    }
                    if let Some(thumb) = json.get("thumbnail_url").and_then(|v| v.as_str()) {
                        cover_url = Some(thumb.to_string());
                    }
                }
            }
        }
    }

    // Extract ID and type (playlist or album)
    let sp_re = Regex::new(r"spotify\.com/(playlist|album)/([a-zA-Z0-9]+)").unwrap();
    let (entity_type, entity_id) = match sp_re.captures(url) {
        Some(caps) => (caps[1].to_string(), caps[2].to_string()),
        None => return Err("Неверный формат ссылки Spotify (ожидается playlist или album)".to_string()),
    };

    let embed_url = format!("https://open.spotify.com/embed/{}/{}", entity_type, entity_id);

    // Try fetching embed page directly or with proxy
    let mut embed_html = String::new();
    if let Ok(resp) = client.get(&embed_url).send().await {
        if resp.status().is_success() {
            embed_html = resp.text().await.unwrap_or_default();
        }
    }

    // If embed returned 451 or blocked, try using proxy
    if embed_html.is_empty() || embed_html.contains("status\":451") {
        if let Some(p_url) = proxy_url {
            if let Ok(proxy) = reqwest::Proxy::http(&p_url) {
                if let Ok(proxy_client) = reqwest::Client::builder().proxy(proxy).timeout(Duration::from_secs(8)).build() {
                    if let Ok(resp) = proxy_client.get(&embed_url).send().await {
                        if resp.status().is_success() {
                            embed_html = resp.text().await.unwrap_or_default();
                        }
                    }
                }
            }
        }
    }

    let mut tracks = Vec::new();

    // Parse __NEXT_DATA__
    let next_data_re = Regex::new(r#"<script id="__NEXT_DATA__"[^>]*>(.*?)</script>"#).unwrap();
    if let Some(caps) = next_data_re.captures(&embed_html) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&caps[1]) {
            let entity = val.pointer("/props/pageProps/state/data/entity");
            if let Some(ent) = entity {
                if let Some(name) = ent.get("name").and_then(|v| v.as_str()) {
                    title = name.to_string();
                }
                if let Some(c_url) = ent.pointer("/coverArt/sources/0/url").and_then(|v| v.as_str()) {
                    cover_url = Some(c_url.to_string());
                }

                if let Some(track_list) = ent.get("trackList").and_then(|t| t.as_array()) {
                    for t in track_list {
                        let t_title = t.get("title").and_then(|v| v.as_str()).unwrap_or_default();
                        let t_artist = t.get("subtitle").and_then(|v| v.as_str()).unwrap_or("Unknown Artist");
                        if !t_title.is_empty() {
                            tracks.push(ExternalTrackInfo::new(t_title, t_artist));
                        }
                    }
                }
            }
        }
    }

    // If tracks are still empty (e.g. region block), try public Spotify mirror resolvers
    if tracks.is_empty() {
        let mirror_urls = vec![
            format!("https://api.allorigins.win/raw?url={}", urlencoding::encode(&embed_url)),
        ];

        for m_url in mirror_urls {
            if let Ok(resp) = client.get(&m_url).send().await {
                if resp.status().is_success() {
                    let m_html = resp.text().await.unwrap_or_default();
                    if let Some(caps) = next_data_re.captures(&m_html) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&caps[1]) {
                            if let Some(ent) = val.pointer("/props/pageProps/state/data/entity") {
                                if let Some(track_list) = ent.get("trackList").and_then(|t| t.as_array()) {
                                    for t in track_list {
                                        let t_title = t.get("title").and_then(|v| v.as_str()).unwrap_or_default();
                                        let t_artist = t.get("subtitle").and_then(|v| v.as_str()).unwrap_or("Unknown Artist");
                                        if !t_title.is_empty() {
                                            tracks.push(ExternalTrackInfo::new(t_title, t_artist));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if !tracks.is_empty() {
                break;
            }
        }
    }

    if tracks.is_empty() {
        return Err("Не удалось извлечь треки из Spotify (возможно, сервис заблокирован в вашем регионе без VPN).".to_string());
    }

    Ok(ExternalPlaylistData {
        title,
        cover_url,
        platform: "Spotify".to_string(),
        tracks,
    })
}

// 4. YouTube / YouTube Music Parser
pub async fn parse_youtube_playlist(url: &str) -> Result<ExternalPlaylistData, String> {
    let client = build_client();

    let list_re = Regex::new(r"[?&]list=([a-zA-Z0-9_-]+)").unwrap();
    let list_id = match list_re.captures(url) {
        Some(caps) => caps[1].to_string(),
        None => return Err("В ссылке YouTube не найден параметр ?list=ID".to_string()),
    };

    let yt_url = format!("https://www.youtube.com/playlist?list={}", list_id);
    let resp = client.get(&yt_url)
        .header("Accept-Language", "en-US,en;q=0.9,ru;q=0.8")
        .header("Cookie", "CONSENT=PENDING+999; SOCS=CAESEwgDEgk2MjgwMDU0OTgaAmVuIAEaBgiA_LyaBg;")
        .send().await.map_err(|e| e.to_string())?;

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let html = String::from_utf8_lossy(&bytes).to_string();

    let title_re = Regex::new(r#"<meta\s+property="og:title"\s+content="([^"]+)""#).unwrap();
    let mut title = title_re.captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
        .unwrap_or("YouTube Playlist")
        .to_string();

    let cover_re = Regex::new(r#"<meta\s+property="og:image"\s+content="([^"]+)""#).unwrap();
    let mut cover_url = cover_re.captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    let mut tracks = Vec::new();
    let mut visited = std::collections::HashSet::new();

    // Look for ytInitialData JSON in HTML using string slicing for speed & safety
    let mut json_data: Option<serde_json::Value> = None;
    if let Some(idx) = html.find("var ytInitialData = ") {
        let start = idx + "var ytInitialData = ".len();
        if let Some(end) = html[start..].find(";</script>") {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&html[start..start + end]) {
                json_data = Some(val);
            }
        }
    } else if let Some(idx) = html.find("ytInitialData = ") {
        let start = idx + "ytInitialData = ".len();
        if let Some(end) = html[start..].find(";</script>") {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&html[start..start + end]) {
                json_data = Some(val);
            }
        }
    }

    if let Some(ref data) = json_data {
        // Fallback title / cover from JSON if meta was generic
        if title == "YouTube Playlist" || title.is_empty() {
            if let Some(t) = data.pointer("/metadata/playlistMetadataRenderer/title").and_then(|v| v.as_str()) {
                title = t.to_string();
            } else if let Some(t) = data.pointer("/microformat/microformatDataRenderer/title").and_then(|v| v.as_str()) {
                title = t.to_string();
            }
        }
        if cover_url.is_none() {
            if let Some(c) = data.pointer("/microformat/microformatDataRenderer/thumbnail/thumbnails/0/url").and_then(|v| v.as_str()) {
                cover_url = Some(c.to_string());
            }
        }

        cover_url = cover_url.map(|u| u.replace("&amp;", "&"));

        // Recursively extract tracks supporting lockupViewModel, playlistVideoRenderer, and musicResponsiveListItemRenderer
        extract_yt_tracks(data, &mut tracks, &mut visited);
    }

    if tracks.is_empty() {
        return Err("Не удалось получить список видео из плейлиста YouTube.".to_string());
    }

    Ok(ExternalPlaylistData {
        title,
        cover_url,
        platform: "YouTube Music".to_string(),
        tracks,
    })
}

fn extract_yt_tracks(
    val: &serde_json::Value,
    tracks: &mut Vec<ExternalTrackInfo>,
    visited: &mut std::collections::HashSet<String>,
) {
    match val {
        serde_json::Value::Object(map) => {
            // 1. Modern YouTube Polymer: lockupViewModel
            if let Some(vm) = map.get("lockupViewModel") {
                let title = vm.pointer("/metadata/lockupMetadataViewModel/title/content")
                    .and_then(|v| v.as_str());
                let author = vm.pointer("/metadata/lockupMetadataViewModel/metadata/contentMetadataViewModel/metadataRows/0/metadataParts/0/text/content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if let Some(t) = title {
                    let key = format!("{} - {}", author, t);
                    if !visited.contains(&key) {
                        visited.insert(key);
                        let (artist, song_title) = clean_youtube_title(t, author);
                        if !song_title.is_empty() {
                            tracks.push(ExternalTrackInfo::new(song_title, artist));
                        }
                    }
                }
            }

            // 2. Legacy YouTube: playlistVideoRenderer
            if let Some(pvr) = map.get("playlistVideoRenderer") {
                let title = pvr.pointer("/title/runs/0/text")
                    .or_else(|| pvr.pointer("/title/simpleText"))
                    .and_then(|v| v.as_str());
                let author = pvr.pointer("/shortBylineText/runs/0/text")
                    .or_else(|| pvr.pointer("/shortBylineText/simpleText"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if let Some(t) = title {
                    let key = format!("{} - {}", author, t);
                    if !visited.contains(&key) {
                        visited.insert(key);
                        let (artist, song_title) = clean_youtube_title(t, author);
                        if !song_title.is_empty() {
                            tracks.push(ExternalTrackInfo::new(song_title, artist));
                        }
                    }
                }
            }

            // 3. YouTube Music: musicResponsiveListItemRenderer
            if let Some(mrli) = map.get("musicResponsiveListItemRenderer") {
                let title = mrli.pointer("/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                    .and_then(|v| v.as_str());
                let author = mrli.pointer("/flexColumns/1/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if let Some(t) = title {
                    let key = format!("{} - {}", author, t);
                    if !visited.contains(&key) {
                        visited.insert(key);
                        let (artist, song_title) = clean_youtube_title(t, author);
                        if !song_title.is_empty() {
                            tracks.push(ExternalTrackInfo::new(song_title, artist));
                        }
                    }
                }
            }

            for v in map.values() {
                extract_yt_tracks(v, tracks, visited);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                extract_yt_tracks(v, tracks, visited);
            }
        }
        _ => {}
    }
}

fn clean_youtube_title(full_title: &str, author: &str) -> (String, String) {
    let mut clean = full_title.to_string();
    let tags = [
        "(Official Music Video)",
        "(Official Video)",
        "(Official Audio)",
        "(Lyric video)",
        "(Lyric Video)",
        "(Lyrics)",
        "(Audio)",
        "(Mood video)",
        "(Mood Video)",
        "(Visualizer)",
        "[Official Music Video]",
        "[Official Video]",
        "[Official Audio]",
        "[Lyrics]",
        "[Audio]",
        "[Visualizer]",
    ];
    for tag in &tags {
        clean = clean.replace(tag, "");
    }

    let trimmed = clean.trim();
    if let Some((a, t)) = trimmed.split_once(" - ") {
        (a.trim().to_string(), t.trim().to_string())
    } else if let Some((a, t)) = trimmed.split_once(" – ") {
        (a.trim().to_string(), t.trim().to_string())
    } else if let Some((a, t)) = trimmed.split_once(" — ") {
        (a.trim().to_string(), t.trim().to_string())
    } else {
        (author.replace(" - Topic", "").trim().to_string(), trimmed.to_string())
    }
}

fn decode_cp1251(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len());
    for &b in bytes {
        if b < 128 {
            s.push(b as char);
        } else if b >= 192 {
            let code = 0x0410 + (b - 192) as u32;
            if let Some(c) = char::from_u32(code) {
                s.push(c);
            }
        } else if b == 168 {
            s.push('Ё');
        } else if b == 184 {
            s.push('ё');
        } else {
            s.push(b as char);
        }
    }
    s
}

fn unescape_html(s: &str) -> String {
    let mut res = s.to_string();
    res = res.replace("&amp;", "&");
    res = res.replace("&quot;", "\"");
    res = res.replace("&#39;", "'");
    res = res.replace("&lt;", "<");
    res = res.replace("&gt;", ">");
    let num_re = Regex::new(r"&#(\d+);").unwrap();
    res = num_re.replace_all(&res, |caps: &regex::Captures| {
        if let Ok(code) = caps[1].parse::<u32>() {
            if let Some(c) = char::from_u32(code) {
                return c.to_string();
            }
        }
        caps[0].to_string()
    }).to_string();
    res
}

// 5. VK Music Parser
pub async fn parse_vk_music(url: &str) -> Result<ExternalPlaylistData, String> {
    let client = build_client();

    let decoded_url = urlencoding::decode(url).unwrap_or(std::borrow::Cow::Borrowed(url)).to_string();

    // Check if it's the personal /audios page which VK always redirects to login
    if decoded_url.contains("/audios") {
        return Err("Страница «Моя музыка» ВКонтакте закрыта от прямого доступа без входа. Пожалуйста, создайте плейлист в ВК («Музыка» ➔ «Создать плейлист»), добавьте треки и скопируйте ссылку на плейлист (vk.com/music/playlist/...), либо вставьте список треков текстом.".to_string());
    }

    // Extract owner_id, playlist_id, and access_hash
    let vk_pl_re = Regex::new(r"(?:audio_playlist|music/playlist/)(-?\d+)_(\d+)(?:[/_]([a-zA-Z0-9_-]+))?").unwrap();
    let (owner_id, playlist_id, access_hash) = match vk_pl_re.captures(&decoded_url) {
        Some(caps) => (
            caps[1].to_string(),
            caps[2].to_string(),
            caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default()
        ),
        None => {
            return Err("Не удалось распознать ID плейлиста ВКонтакте из ссылки.".to_string());
        }
    };

    // 1. Get anonymous API token from VK login service
    let mut token = String::new();
    let token_urls = ["https://login.vk.ru/?act=get_anonym_token", "https://login.vk.com/?act=get_anonym_token"];
    for t_url in token_urls {
        if let Ok(resp) = client.post(t_url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body("client_id=6287487")
            .send().await 
        {
            if let Ok(bytes) = resp.bytes().await {
                let text = String::from_utf8_lossy(&bytes);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(tok) = json.get("data").and_then(|d| d.get("access_token")).and_then(|t| t.as_str()) {
                        token = tok.to_string();
                        break;
                    }
                }
            }
        }
    }

    // 2. Fetch playlist metadata and check for original cloned source via web.api.vk.ru
    let mut title = "Плейлист ВКонтакте".to_string();
    let mut cover_url = None;
    let mut target_owner = owner_id.clone();
    let mut target_id = playlist_id.clone();
    let mut target_hash = access_hash.clone();

    if !token.is_empty() {
        let body_str = if !access_hash.is_empty() {
            format!(
                "access_token={}&owner_id={}&playlist_id={}&need_playlist=1&access_key={}",
                urlencoding::encode(&token),
                urlencoding::encode(&owner_id),
                urlencoding::encode(&playlist_id),
                urlencoding::encode(&access_hash)
            )
        } else {
            format!(
                "access_token={}&owner_id={}&playlist_id={}&need_playlist=1",
                urlencoding::encode(&token),
                urlencoding::encode(&owner_id),
                urlencoding::encode(&playlist_id)
            )
        };

        if let Ok(resp) = client.post("https://web.api.vk.ru/method/audio.getPlaylistById?v=5.288&client_id=6287487")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body_str)
            .send().await
        {
            if let Ok(bytes) = resp.bytes().await {
                let text = String::from_utf8_lossy(&bytes);
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(resp_obj) = json.get("response") {
                        if let Some(t) = resp_obj.get("title").and_then(|v| v.as_str()) {
                            title = t.to_string();
                        }
                        if let Some(photo) = resp_obj.get("photo") {
                            cover_url = photo.get("photo_1200")
                                .or_else(|| photo.get("photo_600"))
                                .or_else(|| photo.get("photo_300"))
                                .or_else(|| photo.get("photo_270"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                        // Check if this playlist is a copy/clone of an original playlist
                        if let Some(orig) = resp_obj.get("original") {
                            if let (Some(o_owner), Some(o_id)) = (
                                orig.get("owner_id").and_then(|v| v.as_i64()),
                                orig.get("playlist_id").and_then(|v| v.as_i64()),
                            ) {
                                target_owner = o_owner.to_string();
                                target_id = o_id.to_string();
                                if let Some(o_hash) = orig.get("access_key").and_then(|v| v.as_str()) {
                                    target_hash = o_hash.to_string();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. Load tracks via al_audio.php load_section
    let mut tracks = Vec::new();
    let mut offset = 0;
    let mut has_more = true;

    while has_more && offset < 500 {
        let referer = format!("https://vk.com/music/playlist/{}_{}_{}", target_owner, target_id, target_hash);
        let req_body = format!(
            "act=load_section&al=1&claim=0&owner_id={}&playlist_id={}&access_hash={}&type=playlist&offset={}",
            urlencoding::encode(&target_owner),
            urlencoding::encode(&target_id),
            urlencoding::encode(&target_hash),
            offset
        );

        let req = client.post("https://vk.com/al_audio.php")
            .header("Referer", referer)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(req_body);

        let resp_bytes = match req.send().await {
            Ok(r) => r.bytes().await.unwrap_or_default(),
            Err(_) => break,
        };

        let decoded = decode_cp1251(&resp_bytes);
        let sec_json: serde_json::Value = match serde_json::from_str(&decoded) {
            Ok(v) => v,
            Err(_) => break,
        };

        let payload_item = sec_json.get("payload")
            .and_then(|p| p.get(1))
            .and_then(|arr| arr.get(0).filter(|v| v.is_object()).or_else(|| arr.get(1).filter(|v| v.is_object())));

        let data = match payload_item {
            Some(d) => d,
            None => {
                if target_owner != owner_id {
                    target_owner = owner_id.clone();
                    target_id = playlist_id.clone();
                    target_hash = access_hash.clone();
                    offset = 0;
                    continue;
                }
                break;
            }
        };

        let list = match data.get("list").and_then(|l| l.as_array()) {
            Some(l) if !l.is_empty() => l,
            _ => {
                if target_owner != owner_id {
                    target_owner = owner_id.clone();
                    target_id = playlist_id.clone();
                    target_hash = access_hash.clone();
                    offset = 0;
                    continue;
                }
                break;
            }
        };

        if title == "Плейлист ВКонтакте" || title.is_empty() {
            if let Some(t) = data.get("title").and_then(|v| v.as_str()) {
                title = unescape_html(t);
            }
        }
        if cover_url.is_none() {
            if let Some(c) = data.get("coverUrl").and_then(|v| v.as_str()) {
                cover_url = Some(c.to_string());
            }
        }

        let chunk_count = list.len();
        for item in list {
            if let Some(item_arr) = item.as_array() {
                if item_arr.len() >= 5 {
                    let song_title = item_arr[3].as_str().unwrap_or_default();
                    let song_artist = item_arr[4].as_str().unwrap_or_default();
                    if !song_title.is_empty() {
                        tracks.push(ExternalTrackInfo::new(unescape_html(song_title), unescape_html(song_artist)));
                    }
                }
            }
        }

        has_more = data.get("hasMore").and_then(|v| v.as_bool()).unwrap_or(false) && chunk_count > 0;
        offset += chunk_count;
    }

    // Fallback: if load_section didn't find tracks, try scraping HTML
    if tracks.is_empty() {
        let web_url = format!("https://vk.com/music/playlist/{}_{}_{}", owner_id, playlist_id, access_hash);
        if let Ok(resp) = client.get(&web_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .send().await
        {
            if let Ok(html) = resp.text().await {
                let row_re = Regex::new(r#"class="audio_row__title[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>.*?class="audio_row__performers"[^>]*>.*?<a[^>]*>([^<]+)</a>"#).unwrap();
                for cap in row_re.captures_iter(&html) {
                    tracks.push(ExternalTrackInfo::new(unescape_html(cap[1].trim()), unescape_html(cap[2].trim())));
                }
            }
        }
    }

    if tracks.is_empty() {
        return Err("Не удалось найти треки в плейлисте ВКонтакте (возможно, плейлист закрыт настройками приватности или доступен только друзьям).".to_string());
    }

    Ok(ExternalPlaylistData {
        title,
        cover_url,
        platform: "VK Music".to_string(),
        tracks,
    })
}

// 6. Text / Tracklist Parser (for pasting copied lists or exported text)
pub fn parse_text_tracklist(text: &str) -> Result<ExternalPlaylistData, String> {
    let mut tracks = Vec::new();
    let num_prefix_re = Regex::new(r"^\d+[\.\)\s\-]+\s*").unwrap();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let clean_line = num_prefix_re.replace(trimmed, "").to_string();

        let (artist, title) = if let Some((a, t)) = clean_line.split_once(" - ") {
            (a.trim().to_string(), t.trim().to_string())
        } else if let Some((a, t)) = clean_line.split_once(" — ") {
            (a.trim().to_string(), t.trim().to_string())
        } else if let Some((a, t)) = clean_line.split_once(" – ") {
            (a.trim().to_string(), t.trim().to_string())
        } else {
            ("".to_string(), clean_line.to_string())
        };

        if !title.is_empty() {
            tracks.push(ExternalTrackInfo::new(title, artist));
        }
    }

    if tracks.is_empty() {
        return Err("Не удалось распознать ни одного трека в тексте.".to_string());
    }

    Ok(ExternalPlaylistData {
        title: "Импортированный список".to_string(),
        cover_url: None,
        platform: "Список треков".to_string(),
        tracks,
    })
}

// Main entry point dispatcher
pub async fn parse_playlist_url(url: &str, proxy_url: Option<String>) -> Result<ExternalPlaylistData, String> {
    let trimmed = url.trim();

    // If input contains multiple lines, treat as a text tracklist
    if trimmed.contains('\n') || (trimmed.lines().count() > 1 && !trimmed.starts_with("http")) {
        return parse_text_tracklist(trimmed);
    }

    if trimmed.contains("music.yandex") || trimmed.contains("yandex.ru/album") || trimmed.contains("yandex.com") {
        return parse_yandex_music(trimmed).await;
    }

    if trimmed.contains("music.apple.com") {
        return parse_apple_music(trimmed).await;
    }

    if trimmed.contains("spotify.com") {
        if trimmed.contains("/collection/tracks") {
            return Err("В Spotify раздел «Любимые треки» является приватным. В приложении Spotify нажмите Ctrl+A в любимых треках ➔ «Добавить в плейлист» ➔ скопируйте ссылку на созданный плейлист, либо нажмите Ctrl+C и вставьте список треков текстом.".to_string());
        }
        return parse_spotify(trimmed, proxy_url).await;
    }

    if trimmed.contains("youtube.com") || trimmed.contains("youtu.be") {
        return parse_youtube_playlist(trimmed).await;
    }

    if trimmed.contains("vk.com") || trimmed.contains("vk.ru") {
        return parse_vk_music(trimmed).await;
    }

    // Fallback: if it's single line "Artist - Title", parse as single track
    if trimmed.contains(" - ") || trimmed.contains(" — ") {
        return parse_text_tracklist(trimmed);
    }

    Err("Поддерживаются ссылки: Яндекс Музыка, Apple Music, Spotify, YouTube Music, VK Музыка (vk.com/vk.ru) или список треков текстом".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_parse_youtube() {
        let url = "https://music.youtube.com/playlist?list=PLQdn7YisXz3PS9dJjn3H35ohAkXleMoVM&si=UydQ5EJwy9Hqd-2p";
        let res = parse_youtube_playlist(url).await;
        println!("Result is_ok: {}", res.is_ok());
        if let Ok(pl) = res {
            println!("Title: {}", pl.title);
            println!("Cover: {:?}", pl.cover_url);
            println!("Tracks count: {}", pl.tracks.len());
            if let Some(t) = pl.tracks.first() {
                println!("First track: {} - {}", t.artist, t.title);
            }
            assert!(!pl.tracks.is_empty());
        } else if let Err(e) = res {
            panic!("Error parsing youtube playlist: {}", e);
        }
    }

    #[tokio::test]
    async fn test_parse_yandex_uuid() {
        let url = "https://music.yandex.by/playlists/2bc77780-1408-b7e6-4911-83a06290c3d4?utm_source=web&utm_medium=copy_link";
        let res = parse_yandex_music(url).await;
        println!("Yandex UUID Result is_ok: {}", res.is_ok());
        if let Ok(pl) = res {
            println!("Title: {}", pl.title);
            println!("Cover: {:?}", pl.cover_url);
            println!("Tracks count: {}", pl.tracks.len());
            assert!(!pl.tracks.is_empty());
            let first = &pl.tracks[0];
            println!("First track: {} - {} (id: {:?})", first.artist, first.title, first.yandex_id);
            assert!(first.yandex_id.is_some());
        } else if let Err(e) = res {
            panic!("Error parsing yandex playlist: {}", e);
        }
    }
}
