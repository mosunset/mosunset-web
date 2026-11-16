//! 起動役。サイトの箱詰めのページの「ネイティブ版を起動」（box-packing:// の呼び出し）から呼ばれる。
//! 窓を出さずに、となりの box-packing.exe を `serve --no-open --idle-quit` で裏で立ち上げて終わる。
//! すでに動いていれば（127.0.0.1:8787 につながれば）、何もしない。
//! 登録は `box-packing install`（main.rs の cmd_install）。
#![windows_subsystem = "windows"]

use std::net::{SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::time::Duration;

/// 窓を作らずに子を立ち上げる（CREATE_NO_WINDOW）
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PORT: u16 = 8787;

fn main() {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
        return;
    }
    let Ok(me) = std::env::current_exe() else { return };
    let Some(dir) = me.parent() else { return };
    let _ = std::process::Command::new(dir.join("box-packing.exe"))
        .args(["serve", "--no-open", "--idle-quit"])
        .current_dir(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}
