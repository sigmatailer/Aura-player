use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const CLIENT_ID: &str = "23cabbbdc6cd418abb4b39c32c41195d";
const CLIENT_SECRET: &str = "53bc75238f0c4d08a118e51fe9203300";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    pub access_token: Option<String>,
    pub error: Option<String>,
    #[allow(dead_code)]
    pub error_description: Option<String>,
}

#[tauri::command]
pub async fn start_yandex_oauth(app: AppHandle) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    
    let mut params = HashMap::new();
    params.insert("client_id", CLIENT_ID);
    
    let res = client
        .post("https://oauth.yandex.ru/device/code")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Ошибка запроса кода устройства: {}", e))?;
        
    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Не удалось получить код устройства: {}", err_text));
    }
    
    let device_info: DeviceCodeResponse = res
        .json()
        .await
        .map_err(|e| format!("Ошибка обработки ответа Яндекса: {}", e))?;
        
    let device_code = device_info.device_code.clone();
    let poll_interval = if device_info.interval > 0 { device_info.interval } else { 4 };
    let app_clone = app.clone();
    
    // Spawn background poller that waits for user confirmation on https://oauth.yandex.ru/device
    tauri::async_runtime::spawn(async move {
        let poller = reqwest::Client::new();
        let start_time = std::time::Instant::now();
        let max_duration = std::time::Duration::from_secs(device_info.expires_in.min(600));
        
        while start_time.elapsed() < max_duration {
            tokio::time::sleep(std::time::Duration::from_secs(poll_interval)).await;
            
            let mut poll_params = HashMap::new();
            poll_params.insert("grant_type", "device_code");
            poll_params.insert("client_id", CLIENT_ID);
            poll_params.insert("client_secret", CLIENT_SECRET);
            poll_params.insert("code", &device_code);
            poll_params.insert("device_code", &device_code);
            
            match poller.post("https://oauth.yandex.ru/token").form(&poll_params).send().await {
                Ok(resp) => {
                    if let Ok(token_data) = resp.json::<TokenResponse>().await {
                        if let Some(token) = token_data.access_token {
                            let _ = app_clone.emit("yandex-token", token);
                            break;
                        }
                        if let Some(err) = token_data.error {
                            if err != "authorization_pending" {
                                println!("[Yandex OAuth] Poll response: {}", err);
                                if err == "invalid_grant" || err == "expired_token" || err == "access_denied" {
                                    break;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    println!("[Yandex OAuth] Network error during poll: {}", e);
                }
            }
        }
    });
    
    Ok(device_info)
}
