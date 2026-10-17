use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SmtcPlaybackPayload {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumbnail: String,
    pub duration_seconds: u64,
    pub position_seconds: u64,
    pub is_playing: bool,
}

pub struct SmtcManager {
    current: Mutex<Option<SmtcPlaybackPayload>>,
}

impl SmtcManager {
    pub fn new() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }

    pub fn update(&self, payload: SmtcPlaybackPayload) {
        *self.current.lock().unwrap() = Some(payload);
    }
}

#[tauri::command]
pub fn smtc_update_playback(
    payload: SmtcPlaybackPayload,
    state: State<'_, SmtcManager>,
) -> Result<(), String> {
    state.update(payload);
    Ok(())
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    Ok(())
}

pub fn setup_system_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let play_pause_i = MenuItem::with_id(app, "tray_play_pause", "Play / Pause", true, None::<&str>)?;
    let next_i = MenuItem::with_id(app, "tray_next", "Next Track", true, None::<&str>)?;
    let prev_i = MenuItem::with_id(app, "tray_prev", "Previous Track", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "tray_show", "Show YouTube Music", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&play_pause_i, &next_i, &prev_i, &show_i, &quit_i],
    )?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("YouTube Music - Minimal")
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_play_pause" => {
                let _ = app.emit("smtc-action", "toggle");
            }
            "tray_next" => {
                let _ = app.emit("smtc-action", "next");
            }
            "tray_prev" => {
                let _ = app.emit("smtc-action", "previous");
            }
            "tray_show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
            }
            "tray_quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let is_visible = win.is_visible().unwrap_or(false);
                    if is_visible {
                        let _ = win.set_focus();
                    } else {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
