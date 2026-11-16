//! 使う人のための画面（ui.html）を出す小さな Web サーバー。
//!   box-packing serve [ポート]   → http://127.0.0.1:8787/ をブラウザーで開く
//! 自分の PC からだけつながる（127.0.0.1）。計算は 1 度に 1 つ（新しく始めると前のは止める）。

use crate::model::PackInput;
use crate::{run_solve, Args, Job, SolveOptions};
use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

const UI: &str = include_str!("ui.html");

#[derive(Deserialize)]
struct SolveRequest {
    input: PackInput,
    seconds: f64,
    gpu: bool,
}

struct Current {
    job: Arc<Job>,
    input: Arc<PackInput>,
    error: Arc<Mutex<Option<String>>>,
}

struct State {
    current: Mutex<Option<Current>>,
    threads: usize,
    batch: usize,
}

pub fn serve(args: &Args) {
    let port: u16 = args.pos.get(1).and_then(|p| p.parse().ok()).unwrap_or(8787);
    let listener = TcpListener::bind(("127.0.0.1", port)).unwrap_or_else(|e| panic!("ポート {port} を使えません: {e}"));
    println!("箱詰めの画面: http://127.0.0.1:{port}/ をブラウザーで開いてください（Ctrl+C で終わる）");
    if !args.pos.iter().any(|p| p == "--no-open") {
        // ふだん使うブラウザーで開く
        let _ = std::process::Command::new("cmd").args(["/C", "start", "", &format!("http://127.0.0.1:{port}/")]).spawn();
    }
    let state = Arc::new(State { current: Mutex::new(None), threads: args.threads, batch: args.batch });
    for stream in listener.incoming().flatten() {
        let state = state.clone();
        std::thread::spawn(move || {
            if let Err(e) = handle(stream, &state) {
                eprintln!("つなぎ方の問題: {e}");
            }
        });
    }
}

fn handle(mut stream: TcpStream, state: &State) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("/").to_string();
    let mut length = 0usize;
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0);
            }
        }
    }
    let mut body = vec![0u8; length.min(8 << 20)];
    reader.read_exact(&mut body)?;
    let (path, query) = target.split_once('?').unwrap_or((target.as_str(), ""));

    let (status, kind, out): (&str, &str, String) = match (method.as_str(), path) {
        ("GET", "/") => ("200 OK", "text/html; charset=utf-8", UI.to_string()),
        ("POST", "/api/solve") => match serde_json::from_slice::<SolveRequest>(&body) {
            Err(e) => ("400 Bad Request", "application/json", json_error(&format!("入力の形が違います: {e}"))),
            Ok(req) => match check(&req.input) {
                Some(msg) => ("400 Bad Request", "application/json", json_error(&msg)),
                None => {
                    start(state, req);
                    ("200 OK", "application/json", "{\"ok\":true}".into())
                }
            },
        },
        ("POST", "/api/stop") => {
            if let Some(c) = state.current.lock().unwrap().as_ref() {
                c.job.stop.store(true, Ordering::Relaxed);
            }
            ("200 OK", "application/json", "{\"ok\":true}".into())
        }
        ("GET", "/api/status") => {
            let since: u64 = query
                .split('&')
                .find_map(|kv| kv.strip_prefix("v="))
                .and_then(|v| v.parse().ok())
                .unwrap_or(u64::MAX);
            ("200 OK", "application/json", status_json(state, since))
        }
        _ => ("404 Not Found", "text/plain; charset=utf-8", "見つかりません".into()),
    };
    let bytes = out.as_bytes();
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        bytes.len()
    )?;
    stream.write_all(bytes)?;
    stream.flush()
}

fn json_error(msg: &str) -> String {
    serde_json::json!({ "error": msg }).to_string()
}

/// 計算できない入力（画面の確かめと同じ考え方）
fn check(input: &PackInput) -> Option<String> {
    let size = |n: i64| (1..=20000).contains(&n);
    if !size(input.floor_x) || !size(input.floor_y) {
        return Some("床の幅と奥行きは 1〜20000 mm で入れてください。".into());
    }
    if input.gap < 0 || input.edge_gap < 0 || input.floor_x <= 2 * input.edge_gap || input.floor_y <= 2 * input.edge_gap {
        return Some("床が、端のすき間より狭くなっています。".into());
    }
    let mut total = 0;
    for (i, b) in input.boxes.iter().enumerate() {
        let label = if b.tag.trim().is_empty() { format!("箱 {}", i + 1) } else { b.tag.clone() };
        if !size(b.x) || !size(b.y) || !size(b.z) {
            return Some(format!("「{label}」の寸法は 1〜20000 mm で入れてください。"));
        }
        if b.count < 0 {
            return Some(format!("「{label}」の個数は 0 以上にしてください。"));
        }
        total += b.count;
    }
    if total == 0 {
        return Some("箱を 1 個以上入れてください。".into());
    }
    if total > 400 {
        return Some("箱は全部で 400 個までにしてください。".into());
    }
    None
}

fn start(state: &State, req: SolveRequest) {
    let mut cur = state.current.lock().unwrap();
    if let Some(c) = cur.as_ref() {
        c.job.stop.store(true, Ordering::Relaxed);
    }
    let seconds = req.seconds.clamp(1.0, 3600.0);
    let job = Arc::new(Job::new(seconds, false));
    let error = Arc::new(Mutex::new(None));
    let opt = SolveOptions { seconds, threads: state.threads, gpu: req.gpu, batch: state.batch, main_threads: None };
    let input = Arc::new(req.input);
    let (j, e, inp) = (job.clone(), error.clone(), input.clone());
    std::thread::spawn(move || {
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_solve(&inp, &opt, &j)));
        if r.is_err() {
            *e.lock().unwrap() = Some("計算の途中で問題が起きました。".into());
            j.stop.store(true, Ordering::Relaxed);
            j.done.store(true, Ordering::Relaxed);
        }
    });
    *cur = Some(Current { job, input, error });
}

fn status_json(state: &State, since: u64) -> String {
    let cur = state.current.lock().unwrap();
    let Some(c) = cur.as_ref() else {
        return "{\"running\":false,\"idle\":true}".into();
    };
    let job = &c.job;
    let sh = job.shared.lock().unwrap();
    let elapsed = job.started.elapsed().as_secs_f64().min(job.seconds);
    let (ce, ge) = (job.cpu_evals.load(Ordering::Relaxed), job.gpu_evals.load(Ordering::Relaxed));
    serde_json::json!({
        "running": !job.done.load(Ordering::Relaxed),
        "elapsed": elapsed,
        "seconds": job.seconds,
        "cpuEvals": ce,
        "gpuEvals": ge,
        "cpuThreads": job.cpu_threads.load(Ordering::Relaxed),
        "gpu": *job.gpu.lock().unwrap(),
        "error": *c.error.lock().unwrap(),
        "version": sh.version,
        "by": sh.by,
        "result": if sh.version != since { serde_json::to_value(&sh.result).unwrap() } else { serde_json::Value::Null },
        "input": if sh.version != since { serde_json::to_value(&*c.input).unwrap() } else { serde_json::Value::Null },
    })
    .to_string()
}
