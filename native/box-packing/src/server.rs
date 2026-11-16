//! 使う人のための画面（ui.html）を出す小さな Web サーバー。
//!   box-packing serve [ポート]   → http://127.0.0.1:8787/ をブラウザーで開く
//! 自分の PC からだけつながる（127.0.0.1）。計算は 1 度に 1 つ（新しく始めると前のは止める）。
//!
//! サイトの箱詰めのページ（mosunset.com と、開発中の localhost）からも、/api/page/* で計算を頼める。
//! ページはネイティブ版を「速い計算係」として使い、ブラウザーの計算係（search.worker.ts）と同じ知らせ
//! （いちばん良い結果・部門別のいちばん・試した数・終わった）を、0.5 秒ごとに聞きに来る。
//!   box-packing serve --no-open --idle-quit   → ブラウザーを開かず、10 分だれからも聞かれなければ終わる（起動役から使う）

use crate::model::PackInput;
use crate::{run_solve, Args, Job, SolveOptions};
use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

const UI: &str = include_str!("ui.html");
/// --idle-quit のとき、この秒数だれからも聞かれなければ終わる
const IDLE_QUIT_SECS: f64 = 600.0;
/// ページからの頼みごとの形を変えたら上げる（ページは違う版のネイティブ版を使わない）
const PAGE_API: u32 = 1;
/// 1 回の計算の上限（24 時間）。ページの MAX_SEARCH_MS とそろえる
const MAX_SECONDS: f64 = 24.0 * 3600.0;
/// ページから頼まれた計算で、GPU と並べて動かす CPU の探す係の数（--cpu-threads で変えられる）。
/// GPU を使うと CPU の係を全部動かさなくても速さはほぼ同じなので、ほかのアプリのために CPU を空けておく
const SERVE_CPU_THREADS: usize = 2;

/// 問い合わせてよいページ（それ以外のサイトからは答えない）
fn allowed_origin(origin: &str) -> bool {
    let local = |rest: &str| rest.is_empty() || (rest.starts_with(':') && rest[1..].chars().all(|c| c.is_ascii_digit()));
    origin == "https://mosunset.com"
        || origin == "https://www.mosunset.com"
        || origin.strip_prefix("http://localhost").is_some_and(local)
        || origin.strip_prefix("http://127.0.0.1").is_some_and(local)
}

#[derive(Deserialize)]
struct PageRun {
    token: u64,
    input: PackInput,
}

#[derive(Deserialize)]
struct PageStop {
    token: u64,
}

#[derive(Deserialize)]
struct SolveRequest {
    input: PackInput,
    seconds: f64,
    gpu: bool,
}

struct Current {
    /// ページから頼まれた計算なら、その頼みごとの番号
    token: Option<u64>,
    job: Arc<Job>,
    input: Arc<PackInput>,
    error: Arc<Mutex<Option<String>>>,
}

struct State {
    current: Mutex<Option<Current>>,
    /// 最後に何か聞かれた時刻（--idle-quit で、しばらく聞かれなければ終わる）
    last_request: Mutex<std::time::Instant>,
    /// GPU の名前（立ち上げたときに調べる。使えなければ None）
    gpu_name: Mutex<Option<String>>,
    threads: usize,
    /// GPU を使うときの CPU の探す係の数（--cpu-threads。無ければ SERVE_CPU_THREADS）
    cpu_threads: usize,
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
    let state = Arc::new(State {
        current: Mutex::new(None),
        last_request: Mutex::new(std::time::Instant::now()),
        gpu_name: Mutex::new(None),
        threads: args.threads,
        cpu_threads: args.cpu_threads.unwrap_or(SERVE_CPU_THREADS),
        batch: args.batch,
    });
    {
        // ページの「ネイティブ版で計算（GPU の名前・…）」に出すため、最初に GPU の名前だけ調べておく
        let state = state.clone();
        std::thread::spawn(move || {
            if let Ok(gpu) = crate::cuda::Gpu::open() {
                *state.gpu_name.lock().unwrap() = Some(gpu.name.clone());
            }
        });
    }
    if args.pos.iter().any(|p| p == "--idle-quit") {
        let state = state.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(15));
            let idle = state.last_request.lock().unwrap().elapsed().as_secs_f64();
            let busy = state.current.lock().unwrap().as_ref().is_some_and(|c| !c.job.done.load(Ordering::Relaxed));
            if idle > IDLE_QUIT_SECS && !busy {
                std::process::exit(0);
            }
        });
    }
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
    let mut origin: Option<String> = None;
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h)? == 0 || h == "\r\n" || h == "\n" {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            if k.trim().eq_ignore_ascii_case("content-length") {
                length = v.trim().parse().unwrap_or(0);
            } else if k.trim().eq_ignore_ascii_case("origin") {
                origin = Some(v.trim().to_string());
            }
        }
    }
    let mut body = vec![0u8; length.min(8 << 20)];
    reader.read_exact(&mut body)?;
    let (path, query) = target.split_once('?').unwrap_or((target.as_str(), ""));
    *state.last_request.lock().unwrap() = std::time::Instant::now();
    // ほかのサイトからの問い合わせには答えない（自分のサイトと localhost だけ）
    let cors = match origin.as_deref() {
        None => String::new(),
        Some(o) if allowed_origin(o) => format!(
            "Access-Control-Allow-Origin: {o}\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
        ),
        Some(_) => {
            write!(stream, "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")?;
            return stream.flush();
        }
    };

    let (status, kind, out): (&str, &str, String) = match (method.as_str(), path) {
        ("OPTIONS", _) => ("204 No Content", "text/plain", String::new()),
        ("GET", "/") => ("200 OK", "text/html; charset=utf-8", UI.to_string()),
        ("GET", "/api/hello") => ("200 OK", "application/json", hello_json(state)),
        ("POST", "/api/page/run") => match serde_json::from_slice::<PageRun>(&body) {
            Err(e) => ("400 Bad Request", "application/json", json_error(&format!("入力の形が違います: {e}"))),
            Ok(req) => match check(&req.input) {
                Some(msg) => ("400 Bad Request", "application/json", json_error(&msg)),
                None => {
                    start_page(state, req);
                    ("200 OK", "application/json", "{\"ok\":true}".into())
                }
            },
        },
        ("GET", "/api/page/poll") => ("200 OK", "application/json", page_poll_json(state, query)),
        ("POST", "/api/page/stop") => {
            if let Ok(req) = serde_json::from_slice::<PageStop>(&body) {
                if let Some(c) = state.current.lock().unwrap().as_ref() {
                    if c.token == Some(req.token) {
                        c.job.stop.store(true, Ordering::Relaxed);
                    }
                }
            }
            ("200 OK", "application/json", "{\"ok\":true}".into())
        }
        ("POST", "/api/quit") => {
            if let Some(c) = state.current.lock().unwrap().as_ref() {
                c.job.stop.store(true, Ordering::Relaxed);
            }
            // 返事を返してから終わる
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_millis(200));
                std::process::exit(0);
            });
            ("200 OK", "application/json", "{\"ok\":true}".into())
        }
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
        "HTTP/1.1 {status}\r\n{cors}Content-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
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
    let seconds = req.seconds.clamp(1.0, MAX_SECONDS);
    let job = Arc::new(Job::new(seconds, false));
    let error = Arc::new(Mutex::new(None));
    let opt = SolveOptions { seconds, threads: state.threads, gpu: req.gpu, batch: state.batch, main_threads: None, cpu_threads: Some(state.cpu_threads) };
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
    *cur = Some(Current { token: None, job, input, error });
}

/// ページからの計算を始める（前の計算は止める）。ブラウザーの計算係と同じく、90 秒良くならなければ止める。
/// ページを閉じて様子を聞かれなくなったら（WATCH_SECS）止める
fn start_page(state: &State, req: PageRun) {
    let mut cur = state.current.lock().unwrap();
    if let Some(c) = cur.as_ref() {
        c.job.stop.store(true, Ordering::Relaxed);
    }
    let seconds = MAX_SECONDS;
    let mut job = Job::new(seconds, false);
    job.stall = Some(90.0);
    job.watch = true;
    let job = Arc::new(job);
    let error = Arc::new(Mutex::new(None));
    let opt = SolveOptions { seconds, threads: state.threads, gpu: true, batch: state.batch, main_threads: None, cpu_threads: Some(state.cpu_threads) };
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
    *cur = Some(Current { token: Some(req.token), job, input, error });
}

fn hello_json(state: &State) -> String {
    let cur = state.current.lock().unwrap();
    let gpu = cur
        .as_ref()
        .and_then(|c| c.job.gpu.lock().unwrap().clone())
        .or_else(|| state.gpu_name.lock().unwrap().clone());
    serde_json::json!({
        "app": "box-packing",
        "api": PAGE_API,
        "threads": state.threads,
        "gpu": gpu,
        "busy": cur.as_ref().is_some_and(|c| !c.job.done.load(Ordering::Relaxed)),
    })
    .to_string()
}

/// ページへの知らせ。token の計算について、ページが知っている版（b: いちばん良い結果、m: 部門別をカンマ区切り）より
/// 新しいものだけ結果を付ける
fn page_poll_json(state: &State, query: &str) -> String {
    let get = |key: &str| query.split('&').find_map(|kv| kv.strip_prefix(key)).unwrap_or("");
    let token: Option<u64> = get("token=").parse().ok();
    let known_best: u64 = get("b=").parse().unwrap_or(0);
    let known_m: Vec<u64> = get("m=").split(',').map(|x| x.parse().unwrap_or(0)).collect();
    let cur = state.current.lock().unwrap();
    let Some(c) = cur.as_ref().filter(|c| c.token.is_some() && c.token == token) else {
        return serde_json::json!({ "token": token, "missing": true, "done": true }).to_string();
    };
    let job = &c.job;
    *job.last_seen.lock().unwrap() = std::time::Instant::now();
    let sh = job.shared.lock().unwrap();
    let best = if sh.version > known_best {
        serde_json::json!({ "v": sh.version, "result": sh.result })
    } else {
        serde_json::Value::Null
    };
    let metrics: Vec<serde_json::Value> = (0..crate::solver::METRICS.len())
        .map(|m| match &sh.metrics.best[m] {
            Some(r) if sh.metrics.version[m] > known_m.get(m).copied().unwrap_or(0) => {
                serde_json::json!({ "v": sh.metrics.version[m], "metric": crate::solver::METRICS[m], "result": r })
            }
            _ => serde_json::Value::Null,
        })
        .collect();
    let tried = job.cpu_evals.load(Ordering::Relaxed) + job.gpu_evals.load(Ordering::Relaxed);
    serde_json::json!({
        "token": token,
        "done": job.done.load(Ordering::Relaxed),
        "tried": tried,
        "elapsed": (job.started.elapsed().as_secs_f64() * 1000.0) as u64,
        "gpu": *job.gpu.lock().unwrap(),
        "error": *c.error.lock().unwrap(),
        "best": best,
        "metrics": metrics,
    })
    .to_string()
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
