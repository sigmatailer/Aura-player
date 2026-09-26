#[cfg(not(any(target_os = "android", target_os = "ios")))]
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use tauri::State;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Emitter};
use lazy_static::lazy_static;

mod yandex_oauth;
mod playlist_importer;

lazy_static! {
    static ref WORKING_PROXY: Mutex<Option<String>> = Mutex::new(None);
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
struct DiscordState {
    client: Mutex<Option<DiscordIpcClient>>,
}

#[cfg(any(target_os = "android", target_os = "ios"))]
struct DiscordState {}

#[tauri::command]
fn update_discord_rpc(
    _state: State<'_, DiscordState>,
    _title: String,
    _artist: String,
    _duration: f64,
    _progress: f64,
    _playing: bool,
    _cover_url: Option<String>,
) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut client_opt = _state.client.lock().unwrap();

        // Инициализируем клиент, если он еще не создан
        if client_opt.is_none() {
            let mut new_client = DiscordIpcClient::new("1541121909008236735");
            let _ = new_client.connect(); // Игнорируем ошибку, если Discord не запущен
            *client_opt = Some(new_client);
        }

        if let Some(client) = client_opt.as_mut() {
            let cover_str = _cover_url.unwrap_or_default();

            let mut activity = activity::Activity::new()
                .state(&_artist)
                .details(&_title)
                .activity_type(activity::ActivityType::Listening);

            let mut assets = activity::Assets::new();
            if !cover_str.is_empty() {
                assets = assets.large_image(&cover_str);
            }
            activity = activity.assets(assets);

            if _playing {
                let start_time = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64 - (_progress as i64);
                let end_time = start_time + (_duration as i64);
                activity = activity.timestamps(activity::Timestamps::new().start(start_time).end(end_time));
            }

            let _ = client.set_activity(activity);
        }
    }
}

#[tauri::command]
fn clear_discord_rpc(_state: State<'_, DiscordState>) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let mut client_opt = _state.client.lock().unwrap();
        if let Some(client) = client_opt.as_mut() {
            let _ = client.clear_activity();
        }
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

async fn get_working_proxy() -> Option<String> {
    {
        let proxy = WORKING_PROXY.lock().unwrap();
        if let Some(p) = proxy.as_ref() {
            return Some(p.clone());
        }
    }
    
    let client = reqwest::Client::new();
    if let Ok(resp) = client.get("https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=all").send().await {
        if let Ok(text) = resp.text().await {
            let proxies: Vec<&str> = text.lines().filter(|l| !l.is_empty()).collect();
            for p in proxies.into_iter().take(10) {
                let proxy_url = format!("http://{}", p);
                if let Ok(proxy) = reqwest::Proxy::http(&proxy_url) {
                    if let Ok(test_client) = reqwest::Client::builder().proxy(proxy).timeout(std::time::Duration::from_secs(5)).build() {
                        if test_client.get("https://www.youtube.com/").send().await.is_ok() {
                            *WORKING_PROXY.lock().unwrap() = Some(proxy_url.clone());
                            return Some(proxy_url);
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn get_youtube_stream(query: String) -> Result<String, String> {
    use rusty_ytdl::search::{YouTube, SearchOptions, SearchType};
    use rusty_ytdl::{Video, VideoOptions, VideoQuality, VideoSearchOptions, RequestOptions};

    let proxy_url = get_working_proxy().await;
    
    let mut req_opts = RequestOptions::default();
    if let Some(p_url) = &proxy_url {
        if let Ok(proxy) = rusty_ytdl::reqwest::Proxy::http(p_url) {
            req_opts.proxy = Some(proxy);
        }
    }

    let yt = YouTube::new().map_err(|e| e.to_string())?;
    let search_options = SearchOptions {
        limit: 1,
        search_type: SearchType::Video,
        safe_search: false,
    };

    let search_result = yt.search(&query, Some(&search_options)).await.map_err(|e| e.to_string())?;
    
    if let Some(first_video) = search_result.first() {
        if let rusty_ytdl::search::SearchResult::Video(video) = first_video {
            let video_opts = VideoOptions {
                quality: VideoQuality::HighestAudio,
                filter: VideoSearchOptions::Audio,
                request_options: req_opts,
                ..Default::default()
            };
            
            let vid = Video::new_with_options(&video.url, video_opts).map_err(|e| e.to_string())?;
            let info = vid.get_info().await.map_err(|e| e.to_string())?;
            
            // Находим формат только с аудио (с наивысшим битрейтом)
            let mut formats: Vec<_> = info.formats.into_iter().filter(|f| f.has_audio && !f.has_video).collect();
            formats.sort_by(|a, b| b.audio_bitrate.unwrap_or(0).cmp(&a.audio_bitrate.unwrap_or(0)));
            
            if let Some(format) = formats.first() {
                if format.url.is_empty() {
                    return Err("Format URL is empty (YouTube blocking)".to_string());
                }
                return Ok(format.url.clone());
            }
        }
    }
    
    Err("No video found".to_string())
}

#[tauri::command]
async fn search_invidious(query: String) -> Result<(String, String), String> {
    let instances = vec![
        // Invidious APIs
        "https://invidious.jing.rocks",
        "https://invidious.nerdvpn.de",
        "https://vid.puffyan.us",
        "https://inv.tux.pizza",
        "https://invidious.fdn.fr",
        "https://invidious.perennialte.ch",
        "https://inv.nadeko.net",
        // Piped APIs
        "https://pipedapi.kavin.rocks",
        "https://pipedapi.adminforge.de",
        "https://pipedapi.moomoo.me",
        "https://pipedapi.smnz.de",
        "https://api.piped.projectsegfau.lt",
    ];
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = String::new();
    
    for instance in instances {
        let is_piped = instance.contains("piped");
        let search_url = if is_piped {
            format!("{}/search?q={}&filter=music_songs", instance, urlencoding::encode(&query))
        } else {
            format!("{}/api/v1/search?q={}&type=video", instance, urlencoding::encode(&query))
        };

        match client.get(&search_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        // VERIFY it's valid JSON before returning!
                        if serde_json::from_str::<serde_json::Value>(&text).is_ok() {
                            let result_json = serde_json::json!({
                                "type": if is_piped { "piped" } else { "invidious" },
                                "instance": instance,
                                "data": text
                            });
                            return Ok((instance.to_string(), result_json.to_string()));
                        } else {
                            last_err = format!("{} returned invalid JSON (probably HTML)", instance);
                        }
                    }
                } else {
                    last_err = format!("{} returned {}", instance, resp.status());
                }
            },
            Err(e) => {
                last_err = format!("{} error: {}", instance, e);
            }
        }
    }
    Err(format!("All mirrors failed. Last error: {}", last_err))
}

#[tauri::command]
async fn search_youtube_api(query: String) -> Result<String, String> {
    use rusty_ytdl::search::{YouTube, SearchOptions, SearchType};
    use rusty_ytdl::RequestOptions;

    let proxy_url = get_working_proxy().await;
    
    let mut yt = YouTube::new().map_err(|e| e.to_string())?;
    
    if let Some(p_url) = &proxy_url {
        if let Ok(proxy) = rusty_ytdl::reqwest::Proxy::http(p_url) {
            let req_opts = RequestOptions {
                proxy: Some(proxy),
                ..Default::default()
            };
            if let Ok(yt_with_options) = YouTube::new_with_options(&req_opts) {
                yt = yt_with_options;
            }
        }
    }
    
    let search_options = SearchOptions {
        limit: 15,
        search_type: SearchType::Video,
        safe_search: false,
    };

    let search_result = yt.search(&query, Some(&search_options)).await.map_err(|e| e.to_string())?;
    
    // Convert to JSON
    let mut results = Vec::new();
    for item in search_result {
        if let rusty_ytdl::search::SearchResult::Video(video) = item {
            // map it to match our frontend invidious format approximately
            let json = serde_json::json!({
                "videoId": video.id,
                "title": video.title,
                "author": video.channel.name,
                "lengthSeconds": video.duration / 1000,
                "videoThumbnails": [
                    { "url": video.thumbnails.first().map(|t| t.url.clone()).unwrap_or_default(), "quality": "maxresdefault" }
                ]
            });
            results.push(json);
        }
    }

    Ok(serde_json::to_string(&results).unwrap_or_default())
}
#[tauri::command]
async fn get_invidious_stream(instance: String, video_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    let is_piped = instance.contains("piped");
    let url = if is_piped {
        format!("{}/streams/{}", instance, video_id)
    } else {
        format!("{}/api/v1/videos/{}", instance, video_id)
    };

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn download_audio_temp(url: String) -> Result<Vec<u8>, String> {
    let create_builder = || {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .no_brotli()
            .no_gzip()
            .no_deflate()
            .timeout(std::time::Duration::from_secs(30))
    };

    let mut builder = create_builder();
    let use_proxy_first = url.contains("googlevideo.com") || url.contains("youtube.com");
    
    if use_proxy_first {
        if let Some(p_url) = get_working_proxy().await {
            if let Ok(proxy) = reqwest::Proxy::http(&p_url) {
                builder = builder.proxy(proxy);
            }
        }
    }
    
    let client = builder.build().map_err(|e| format!("reqwest builder error: {}", e))?;
    
    let attempt1 = match client.get(&url).send().await {
        Ok(resp) => {
            match resp.bytes().await {
                Ok(bytes) => Ok(bytes.to_vec()),
                Err(e) => Err(format!("reqwest bytes error: {}", e))
            }
        },
        Err(e) => Err(format!("reqwest get error: {}", e))
    };

    match attempt1 {
        Ok(bytes) => return Ok(bytes),
        Err(e) => {
            if use_proxy_first {
                return Err(e);
            }
        }
    }

    // FALLBACK TO PROXY for SoundCloud / mp3party if direct connection drops
    if let Some(p_url) = get_working_proxy().await {
        if let Ok(proxy) = reqwest::Proxy::http(&p_url) {
            let proxy_client = create_builder().proxy(proxy).build().map_err(|e| e.to_string())?;
            let resp = proxy_client.get(&url).send().await.map_err(|e| format!("proxy send error: {}", e))?;
            let bytes = resp.bytes().await.map_err(|e| format!("proxy bytes error: {}", e))?;
            return Ok(bytes.to_vec());
        }
    }

    Err("Все попытки загрузки аудиопотока не удались (прямая загрузка оборвалась, прокси не помог).".to_string())
}

#[tauri::command]
async fn search_sefon(query: String) -> Result<String, String> {
    // We are using mp3party.net now because Sefon encrypts and YouTube blocks.
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()
        .map_err(|e| e.to_string())?;

    let search_url = format!("https://mp3party.net/search?q={}", urlencoding::encode(&query));
    let html = client.get(&search_url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    
    let mut results = vec![];
    let parts: Vec<&str> = html.split("<div class=\"track__imageWrapper\"").collect();
    
    for part in parts.iter().skip(1) {
        let url = if let Some(href_idx) = part.find("href=\"https://dl") {
            if let Some(end_idx) = part[href_idx + 6..].find("\"") {
                part[href_idx + 6 .. href_idx + 6 + end_idx].to_string()
            } else { String::new() }
        } else { String::new() };
        
        let title_artist = if let Some(title_idx) = part.find("<a class=\"track__title") {
            if let Some(close_bracket) = part[title_idx..].find(">") {
                let start = title_idx + close_bracket + 1;
                if let Some(end_idx) = part[start..].find("</a>") {
                    let mut raw = part[start .. start + end_idx].trim().to_string();
                    raw = raw.replace("&amp;", "&");
                    raw
                } else { String::new() }
            } else { String::new() }
        } else { String::new() };
        
        let duration = if let Some(info_idx) = part.find("<div class=\"track__info-item\">") {
            let start = info_idx + "<div class=\"track__info-item\">".len();
            if let Some(end_idx) = part[start..].find("</div>") {
                let time_str = part[start .. start + end_idx].trim();
                let time_parts: Vec<&str> = time_str.split(':').collect();
                if time_parts.len() == 2 {
                    let m = time_parts[0].parse::<u32>().unwrap_or(0);
                    let s = time_parts[1].parse::<u32>().unwrap_or(0);
                    m * 60 + s
                } else { 0 }
            } else { 0 }
        } else { 0 };

        let mut thumb = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop".to_string();
        if let Some(img_idx) = part.find("<img class=\"track__image\"") {
            if let Some(src_idx) = part[img_idx..].find("src=\"") {
                let start = img_idx + src_idx + 5;
                if let Some(end_idx) = part[start..].find("\"") {
                    thumb = part[start .. start + end_idx].to_string();
                }
            }
        }

        if !url.is_empty() && !title_artist.is_empty() {
            let mut author = "Unknown Artist".to_string();
            let mut title = title_artist.clone();
            
            if title_artist.contains(" – ") {
                let parts: Vec<&str> = title_artist.split(" – ").collect();
                author = parts[0].to_string();
                title = parts[1..].join(" – ");
            } else if title_artist.contains(" — ") {
                let parts: Vec<&str> = title_artist.split(" — ").collect();
                author = parts[0].to_string();
                title = parts[1..].join(" — ");
            } else if title_artist.contains(" - ") {
                let parts: Vec<&str> = title_artist.split(" - ").collect();
                author = parts[0].to_string();
                title = parts[1..].join(" - ");
            }
            
            results.push(serde_json::json!({
                "videoId": url.clone(),
                "title": title.trim(),
                "author": author.trim(),
                "videoThumbnails": [{"url": thumb, "width": 150, "height": 150}],
                "lengthSeconds": duration,
                "url": url,
                "isSefon": true
            }));
        }
    }
    
    Ok(serde_json::to_string(&results).unwrap())
}

#[tauri::command]
async fn search_soundcloud(query: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Get Client ID
    let html = client.get("https://soundcloud.com").send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    
    let mut client_id = "V87wHqD4pEw2PryrX8g4jP7UaM98lMhD".to_string(); // fallback
    let script_urls: Vec<&str> = html.split("src=\"").filter(|s| s.starts_with("https://a-v2.sndcdn.com/assets/") && s.contains(".js")).map(|s| s.split("\"").next().unwrap_or("")).collect();
    
    for url in script_urls.into_iter().rev() {
        if let Ok(js_resp) = client.get(url).send().await {
            if let Ok(js) = js_resp.text().await {
                if let Some(idx) = js.find("client_id:\"") {
                    let start = idx + 11;
                    if let Some(end) = js[start..].find("\"") {
                        if end == 32 {
                            client_id = js[start..start+end].to_string();
                            break;
                        }
                    }
                }
            }
        }
    }

    // 2. Search API
    let search_url = format!("https://api-v2.soundcloud.com/search/tracks?q={}&client_id={}&limit=20", urlencoding::encode(&query), client_id);
    let search_resp = client.get(&search_url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    
    let parsed: serde_json::Value = serde_json::from_str(&search_resp).map_err(|e| e.to_string())?;
    let mut results = vec![];

    if let Some(collection) = parsed.get("collection").and_then(|c| c.as_array()) {
        for item in collection {
            let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string();
            let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let user = item.get("user").and_then(|v| v.get("username")).and_then(|v| v.as_str()).unwrap_or("Unknown Artist").to_string();
            let duration_ms = item.get("duration").and_then(|v| v.as_i64()).unwrap_or(0);
            let artwork = item.get("artwork_url").and_then(|v| v.as_str())
                .or_else(|| item.get("user").and_then(|v| v.get("avatar_url")).and_then(|v| v.as_str()))
                .unwrap_or("https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop").to_string();
            
            // replace large for better quality
            let artwork = artwork.replace("-large.", "-t500x500.");

            results.push(serde_json::json!({
                "videoId": id,
                "title": title,
                "author": user,
                "videoThumbnails": [{"url": artwork, "width": 500, "height": 500}],
                "lengthSeconds": duration_ms / 1000,
                "url": format!("https://api-v2.soundcloud.com/tracks/{}?client_id={}", id, client_id),
                "isSoundcloud": true,
                "clientId": client_id
            }));
        }
    }

    Ok(serde_json::to_string(&results).unwrap())
}

#[tauri::command]
async fn get_soundcloud_stream(track_id: String, client_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://api-v2.soundcloud.com/tracks/{}?client_id={}", track_id, client_id);
    let resp = client.get(&url)
        .header("Origin", "https://soundcloud.com")
        .header("Referer", "https://soundcloud.com/")
        .send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    
    let parsed: serde_json::Value = serde_json::from_str(&resp).map_err(|e| e.to_string())?;
    
    let media = parsed.get("media").and_then(|v| v.get("transcodings")).and_then(|v| v.as_array()).ok_or("No media found")?;
    let track_auth = parsed.get("track_authorization").and_then(|v| v.as_str()).unwrap_or("");
    
    let mut progressive_url = String::new();
    let mut hls_url = String::new();

    for trans in media {
        let format = trans.get("format").and_then(|v| v.get("protocol")).and_then(|v| v.as_str()).unwrap_or("");
        let stream_url = trans.get("url").and_then(|v| v.as_str()).unwrap_or("");
        
        // Skip encrypted streams! We can't play them without DRM decrypt
        if stream_url.contains("encrypted") || format.contains("encrypted") {
            continue;
        }

        if format == "progressive" {
            progressive_url = stream_url.to_string();
        } else if format == "hls" && hls_url.is_empty() {
            hls_url = stream_url.to_string();
        }
    }

    let target_url = if !progressive_url.is_empty() { progressive_url } else { hls_url };
    if target_url.is_empty() {
        return Err("Не удалось найти доступный аудиопоток (возможно, трек доступен только по платной подписке Go+)".to_string());
    }

    let separator = if target_url.contains('?') { "&" } else { "?" };
    let target_url = format!("{}{separator}client_id={}&track_authorization={}", target_url, client_id, track_auth);
    
    let stream_info = client.get(&target_url)
        .header("Origin", "https://soundcloud.com")
        .header("Referer", "https://soundcloud.com/")
        .send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let parsed_info: serde_json::Value = serde_json::from_str(&stream_info).map_err(|e| format!("Failed to parse stream info: {} (response: {})", e, stream_info))?;
    
    let final_url = parsed_info.get("url").and_then(|v| v.as_str()).ok_or(format!("No final URL found in response: {}", stream_info))?;
    Ok(final_url.to_string())
}

fn format_yandex_auth_header(token: &str) -> String {
    let t = token.trim();
    if t.starts_with("Bearer ") || t.starts_with("OAuth ") {
        t.to_string()
    } else if t.starts_with("ey") {
        format!("Bearer {}", t)
    } else {
        format!("OAuth {}", t)
    }
}

#[tauri::command]
async fn yandex_api_request(url: String, token: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("YandexMusicAndroid/24023231")
        .build()
        .map_err(|e| e.to_string())?;

    let trimmed_token = token.trim();
    let mut req = client.get(&url)
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231");

    if !trimmed_token.is_empty() {
        req = req.header("Authorization", format_yandex_auth_header(trimmed_token));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    // If unauthorized / invalid token, automatically retry WITHOUT token!
    if (status.as_u16() == 401 || text.contains("\"error\":\"not-authorized\"") || text.contains("\"error\":\"Unauthorized\"")) && !trimmed_token.is_empty() {
        if let Ok(retry_resp) = client.get(&url)
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
            .send().await {
            if let Ok(retry_text) = retry_resp.text().await {
                return Ok(retry_text);
            }
        }
    }

    Ok(text)
}

#[tauri::command]
async fn yandex_api_post(url: String, token: String, body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("YandexMusicAndroid/24023231")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.post(&url)
        .header("Authorization", format_yandex_auth_header(&token))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023231")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send().await.map_err(|e| e.to_string())?;
        
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn get_yandex_stream(track_id: String, token: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("YandexMusicAndroid/24023231")
        .build()
        .map_err(|e| e.to_string())?;

    // 1. Get download info
    let info_url = format!("https://api.music.yandex.net/tracks/{}/download-info", track_id);
    let resp = client.get(&info_url)
        .header("Authorization", format_yandex_auth_header(&token))
        .send().await.map_err(|e| e.to_string())?;
        
    let mut info_text = resp.text().await.map_err(|e| e.to_string())?;
    if (info_text.contains("\"error\":\"Unauthorized\"") || info_text.contains("\"error\":\"not-authorized\"")) && !token.trim().is_empty() {
        if let Ok(retry_resp) = client.get(&info_url).send().await {
            if let Ok(retry_text) = retry_resp.text().await {
                info_text = retry_text;
            }
        }
    }
    let info_json: serde_json::Value = serde_json::from_str(&info_text).map_err(|e| e.to_string())?;
    
    let result_array = info_json.get("result").and_then(|v| v.as_array()).ok_or("No result array in download-info")?;
    if result_array.is_empty() {
        return Err("Empty download-info result".to_string());
    }
    
    // Pick highest bitrate mp3 (filter out preview, find max bitrateInKbps e.g. 320)
    let mut best_url = String::new();
    let mut highest_bitrate: i64 = 0;
    for item in result_array {
        let codec = item.get("codec").and_then(|v| v.as_str()).unwrap_or("");
        let preview = item.get("preview").and_then(|v| v.as_bool()).unwrap_or(false);
        if preview {
            continue;
        }
        if codec == "mp3" {
            let bitrate = item.get("bitrateInKbps").and_then(|v| v.as_i64()).unwrap_or(0);
            if let Some(url) = item.get("downloadInfoUrl").and_then(|v| v.as_str()) {
                if bitrate >= highest_bitrate {
                    highest_bitrate = bitrate;
                    best_url = url.to_string();
                }
            }
        }
    }
    
    // If no full track is available (only 30s preview), signal preview_only for full audio fallback
    if best_url.is_empty() {
        return Err("preview_only".to_string());
    }
    
    // 2. Fetch the XML from downloadInfoUrl
    let xml_resp = client.get(&best_url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    
    // Parse XML manually since it's very simple
    // <download-info><host>...</host><path>...</path><ts>...</ts><s>...</s></download-info>
    let host = xml_resp.split("<host>").nth(1).and_then(|s| s.split("</host>").next()).unwrap_or("");
    let path = xml_resp.split("<path>").nth(1).and_then(|s| s.split("</path>").next()).unwrap_or("");
    let ts = xml_resp.split("<ts>").nth(1).and_then(|s| s.split("</ts>").next()).unwrap_or("");
    let s = xml_resp.split("<s>").nth(1).and_then(|s| s.split("</s>").next()).unwrap_or("");
    
    if host.is_empty() || path.is_empty() || ts.is_empty() || s.is_empty() {
        return Err(format!("Failed to parse XML: {}", xml_resp));
    }
    
    // 3. Generate MD5 hash
    let salt = "XGRlBW9FXlekgbPrRHuCG";
    let sign_string = format!("{}{}{}", salt, &path[1..], s);
    let hash = format!("{:x}", md5::compute(sign_string.as_bytes()));
    
    // 4. Construct final MP3 URL
    let final_url = format!("https://{}/get-mp3/{}/{}{}", host, hash, ts, path);
    
    // 5. Verify if track is full or preview (< 1.2 MB is a 25-30s snippet)
    let is_preview = if let Ok(resp) = client.head(&final_url).send().await {
        if let Some(cl) = resp.headers().get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok()) 
        {
            cl < 1_200_000
        } else {
            false
        }
    } else {
        false
    };

    if is_preview {
        return Err("preview_only".to_string());
    }

    Ok(final_url)
}

#[tauri::command]
async fn get_full_audio_stream(query: String, _track_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    // Attempt 1: mp3party.net (fast direct full mp3)
    let search_url = format!("https://mp3party.net/search?q={}", urlencoding::encode(&query));
    if let Ok(resp) = client.get(&search_url).send().await {
        if let Ok(html) = resp.text().await {
            let mut direct_url = String::new();
            for part in html.split("\"") {
                if part.starts_with("https://dl") && part.ends_with(".mp3") {
                    direct_url = part.to_string();
                    break;
                }
            }
            if !direct_url.is_empty() {
                return Ok(direct_url);
            }
        }
    }

    // Attempt 2: SoundCloud
    if let Ok(sc_json) = search_soundcloud(query.clone()).await {
        if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&sc_json) {
            if let Some(first) = items.first() {
                if let (Some(sc_id), Some(sc_client)) = (
                    first.get("videoId").and_then(|v| v.as_str()),
                    first.get("clientId").and_then(|v| v.as_str())
                ) {
                    if let Ok(stream_url) = get_soundcloud_stream(sc_id.to_string(), sc_client.to_string()).await {
                        return Ok(stream_url);
                    }
                }
            }
        }
    }

    // Attempt 3: YouTube fallback
    if let Ok(yt_stream_url) = get_youtube_stream(query).await {
        return Ok(yt_stream_url);
    }

    Err("Не удалось загрузить полный трек ни из одного источника".to_string())
}

#[tauri::command]
fn resize_window(_window: tauri::Window, _width: f64, _height: f64, _always_on_top: bool) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Size;
        use tauri::LogicalSize;
        use tauri::Position;
        use tauri::LogicalPosition;
        
        // Вытаскиваем окно из прилипаний (Aero Snap)
        let _ = _window.unmaximize();
        
        // Перемещаем в безопасную зону на экране только при возврате в большое окно
        if _width >= 800.0 {
            let _ = _window.set_position(Position::Logical(LogicalPosition { x: 100.0, y: 100.0 }));
        }
        
        // Устанавливаем поверх всех окон
        let _ = _window.set_always_on_top(_always_on_top);
        
        // Разрешаем окну быть маленьким (100x50) и снимаем максимумы
        let _ = _window.set_min_size(Some(Size::Logical(LogicalSize { width: 100.0, height: 50.0 })));
        let _ = _window.set_max_size(None::<Size>);
        
        // Меняем размер на запрошенный
        _window.set_size(Size::Logical(LogicalSize { width: _width, height: _height })).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_mini_height(_window: tauri::Window, _height: f64) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::Size;
        use tauri::LogicalSize;
        let scale_factor = _window.scale_factor().map_err(|e| e.to_string())?;
        let current_size = _window.inner_size().map_err(|e| e.to_string())?;
        let width = current_size.width as f64 / scale_factor;
        _window.set_size(Size::Logical(LogicalSize { width, height: _height })).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_audio_files_recursive(dir_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let audio_exts = ["mp3", "wav", "flac", "ogg", "m4a"];
    
    // Simple recursive function
    fn visit_dirs(dir: &std::path::Path, files: &mut Vec<String>, exts: &[&str]) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in std::fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, files, exts)?;
                } else {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if exts.contains(&ext.to_lowercase().as_str()) {
                            files.push(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
        Ok(())
    }
    
    visit_dirs(std::path::Path::new(&dir_path), &mut files, &audio_exts)
        .map_err(|e| e.to_string())?;
        
    Ok(files)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct CacheStats {
    pub total_bytes: u64,
    pub file_count: usize,
    pub formatted_size: String,
}

fn get_tracks_cache_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tracks_cache");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

fn resolve_local_path(input: &str) -> Option<std::path::PathBuf> {
    let mut s = input;
    if s.starts_with("asset://localhost/") {
        s = s.trim_start_matches("asset://localhost/");
    } else if s.starts_with("http://asset.localhost/") {
        s = s.trim_start_matches("http://asset.localhost/");
    } else if s.starts_with("https://asset.localhost/") {
        s = s.trim_start_matches("https://asset.localhost/");
    } else if s.starts_with("asset://") {
        s = s.trim_start_matches("asset://");
    } else if s.starts_with("file:///") {
        s = s.trim_start_matches("file:///");
    } else if s.starts_with("file://") {
        s = s.trim_start_matches("file://");
    }

    let decoded = urlencoding::decode(s).unwrap_or(std::borrow::Cow::Borrowed(s)).to_string();
    let mut clean_str = decoded.as_str();

    // On Windows, paths like "/C:/Users" -> "C:/Users"
    if clean_str.starts_with('/') && clean_str.chars().nth(2) == Some(':') {
        clean_str = &clean_str[1..];
    } else if clean_str.starts_with('\\') && clean_str.chars().nth(2) == Some(':') {
        clean_str = &clean_str[1..];
    }

    let p = std::path::PathBuf::from(clean_str);
    if p.exists() {
        return Some(p);
    }

    // Try normalized with backslashes
    let normalized = clean_str.replace('/', "\\");
    let p_norm = std::path::PathBuf::from(&normalized);
    if p_norm.exists() {
        return Some(p_norm);
    }

    // If input was already a direct path
    let raw_p = std::path::PathBuf::from(input);
    if raw_p.exists() {
        return Some(raw_p);
    }

    None
}

#[tauri::command]
async fn cache_track(
    app: tauri::AppHandle,
    track_id: String,
    source_path_or_url: String,
    is_yandex: bool,
    yandex_token: Option<String>,
) -> Result<String, String> {
    let cache_dir = get_tracks_cache_dir(&app)?;
    let clean_id = sanitize_filename(&track_id);

    // 1. If it's a Yandex track
    if is_yandex || source_path_or_url.starts_with("yandex:") {
        let actual_track_id = if source_path_or_url.starts_with("yandex:") {
            source_path_or_url.trim_start_matches("yandex:").to_string()
        } else if track_id.starts_with("ya_") {
            track_id.trim_start_matches("ya_").to_string()
        } else {
            track_id.clone()
        };

        let token = yandex_token.ok_or_else(|| "Yandex token is required for caching".to_string())?;
        
        let client = reqwest::Client::builder()
            .user_agent("YandexMusicAndroid/24023231")
            .build()
            .map_err(|e| e.to_string())?;

        let info_url = format!("https://api.music.yandex.net/tracks/{}/download-info", actual_track_id);
        let resp = client.get(&info_url)
            .header("Authorization", format_yandex_auth_header(&token))
            .send().await.map_err(|e| e.to_string())?;
            
        let info_text = resp.text().await.map_err(|e| e.to_string())?;
        let info_json: serde_json::Value = serde_json::from_str(&info_text).map_err(|e| e.to_string())?;
        
        let result_array = info_json.get("result").and_then(|v| v.as_array()).ok_or("No result array in download-info")?;
        let mut best_url = String::new();
        let mut highest_bitrate: i64 = 0;
        for item in result_array {
            let codec = item.get("codec").and_then(|v| v.as_str()).unwrap_or("");
            let preview = item.get("preview").and_then(|v| v.as_bool()).unwrap_or(false);
            if preview {
                continue;
            }
            if codec == "mp3" {
                let bitrate = item.get("bitrateInKbps").and_then(|v| v.as_i64()).unwrap_or(0);
                if let Some(url) = item.get("downloadInfoUrl").and_then(|v| v.as_str()) {
                    if bitrate >= highest_bitrate {
                        highest_bitrate = bitrate;
                        best_url = url.to_string();
                    }
                }
            }
        }
        if best_url.is_empty() {
            for item in result_array {
                if item.get("codec").and_then(|v| v.as_str()) == Some("mp3") {
                    if let Some(url) = item.get("downloadInfoUrl").and_then(|v| v.as_str()) {
                        best_url = url.to_string();
                        break;
                    }
                }
            }
        }
        if best_url.is_empty() {
            return Err("No MP3 download info URL found".to_string());
        }

        let xml_resp = client.get(&best_url).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
        let host = xml_resp.split("<host>").nth(1).and_then(|s| s.split("</host>").next()).unwrap_or("");
        let path = xml_resp.split("<path>").nth(1).and_then(|s| s.split("</path>").next()).unwrap_or("");
        let ts = xml_resp.split("<ts>").nth(1).and_then(|s| s.split("</ts>").next()).unwrap_or("");
        let s = xml_resp.split("<s>").nth(1).and_then(|s| s.split("</s>").next()).unwrap_or("");
        
        if host.is_empty() || path.is_empty() || ts.is_empty() || s.is_empty() {
            return Err(format!("Failed to parse XML: {}", xml_resp));
        }

        let salt = "XGRlBW9FXlekgbPrRHuCG";
        let sign_string = format!("{}{}{}", salt, &path[1..], s);
        let hash = format!("{:x}", md5::compute(sign_string.as_bytes()));
        let final_url = format!("https://{}/get-mp3/{}/{}{}", host, hash, ts, path);

        let mp3_resp = client.get(&final_url).send().await.map_err(|e| e.to_string())?;
        let bytes = mp3_resp.bytes().await.map_err(|e| e.to_string())?;
        let dest_path = cache_dir.join(format!("{}.mp3", clean_id));
        std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;

        return Ok(dest_path.to_string_lossy().to_string());
    }

    // 2. Check if it's a local file (including asset:// or http://asset.localhost/ or Windows path)
    if let Some(local_path) = resolve_local_path(&source_path_or_url) {
        let ext = local_path.extension().and_then(|e| e.to_str()).unwrap_or("mp3");
        let dest_path = cache_dir.join(format!("{}.{}", clean_id, ext));
        std::fs::copy(&local_path, &dest_path).map_err(|e| format!("Failed to copy file to cache: {}", e))?;
        return Ok(dest_path.to_string_lossy().to_string());
    }

    // 3. If it's an external remote URL (http/https not asset.localhost)
    if (source_path_or_url.starts_with("http://") || source_path_or_url.starts_with("https://")) 
        && !source_path_or_url.contains("asset.localhost") 
    {
        let client = reqwest::Client::new();
        let resp = client.get(&source_path_or_url).send().await.map_err(|e| e.to_string())?;
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let ext = source_path_or_url.split('?').next().unwrap_or("").rsplit('.').next().unwrap_or("mp3");
        let safe_ext = if ext.len() <= 4 && ext.chars().all(|c| c.is_alphanumeric()) { ext } else { "mp3" };
        let dest_path = cache_dir.join(format!("{}.{}", clean_id, safe_ext));
        std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;
        return Ok(dest_path.to_string_lossy().to_string());
    }

    Err(format!("Не удалось найти исходный файл для кэширования: {}", source_path_or_url))
}

#[tauri::command]
fn get_cached_track_path(app: tauri::AppHandle, track_id: String) -> Result<Option<String>, String> {
    let cache_dir = get_tracks_cache_dir(&app)?;
    let clean_id = sanitize_filename(&track_id);
    
    let extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac"];
    for ext in extensions {
        let p = cache_dir.join(format!("{}.{}", clean_id, ext));
        if p.exists() {
            return Ok(Some(p.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

#[tauri::command]
fn remove_cached_track(app: tauri::AppHandle, track_id: String) -> Result<bool, String> {
    let cache_dir = get_tracks_cache_dir(&app)?;
    let clean_id = sanitize_filename(&track_id);
    
    let mut removed = false;
    let extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac"];
    for ext in extensions {
        let p = cache_dir.join(format!("{}.{}", clean_id, ext));
        if p.exists() {
            if let Ok(_) = std::fs::remove_file(&p) {
                removed = true;
            }
        }
    }
    Ok(removed)
}

#[tauri::command]
fn get_cache_stats(app: tauri::AppHandle) -> Result<CacheStats, String> {
    let cache_dir = get_tracks_cache_dir(&app)?;
    let mut total_bytes: u64 = 0;
    let mut file_count: usize = 0;

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_bytes += meta.len();
                    file_count += 1;
                }
            }
        }
    }

    let formatted_size = if total_bytes < 1024 * 1024 {
        format!("{:.1} КБ", total_bytes as f64 / 1024.0)
    } else if total_bytes < 1024 * 1024 * 1024 {
        format!("{:.1} МБ", total_bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} ГБ", total_bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    };

    Ok(CacheStats {
        total_bytes,
        file_count,
        formatted_size,
    })
}

#[tauri::command]
fn clear_tracks_cache(app: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = get_tracks_cache_dir(&app)?;
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn parse_external_playlist(url: String) -> Result<playlist_importer::ExternalPlaylistData, String> {
    let proxy_url = get_working_proxy().await;
    playlist_importer::parse_playlist_url(&url, proxy_url).await
}

#[tauri::command]
fn set_minimize_to_tray(_enabled: bool) {}

#[tauri::command]
fn set_autostart(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    Ok(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DiscordState {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            client: std::sync::Mutex::new(None),
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            update_discord_rpc, 
            clear_discord_rpc, 
            get_youtube_stream,
            search_invidious,
            get_invidious_stream,
            search_youtube_api,
            download_audio_temp,
            search_sefon,
            search_soundcloud,
            get_soundcloud_stream,
            yandex_api_request,
            yandex_api_post,
            yandex_oauth::start_yandex_oauth,
            get_yandex_stream,
            get_full_audio_stream,
            resize_window,
            set_mini_height,
            read_audio_files_recursive,
            cache_track,
            get_cached_track_path,
            remove_cached_track,
            get_cache_stats,
            clear_tracks_cache,
            parse_external_playlist,
            set_minimize_to_tray,
            set_autostart,
            get_autostart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
