//! CUDA のドライバー API（nvcuda.dll。GPU のドライバーに入っている）と NVRTC（実行時コンパイラ）を
//! 直接呼ぶ。CUDA Toolkit も Visual Studio も要らない。


/// DLL を読む（kernel32 の LoadLibraryExW / GetProcAddress をそのまま使う）
struct Library(*mut c_void);

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryExW(name: *const u16, file: *mut c_void, flags: u32) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
    fn SetDllDirectoryW(path: *const u16) -> i32;
}

impl Library {
    fn load_with_flags(path: impl AsRef<std::ffi::OsStr>, flags: u32) -> Result<Library, String> {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path.as_ref().encode_wide().chain([0]).collect();
        let h = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), flags) };
        if h.is_null() {
            Err(format!("{}", std::io::Error::last_os_error()))
        } else {
            Ok(Library(h))
        }
    }
    fn new(path: &str) -> Result<Library, String> {
        Self::load_with_flags(path, 0)
    }
    /// T は関数ポインタの型
    unsafe fn get<T: Copy>(&self, name: &[u8]) -> Result<T, String> {
        let p = GetProcAddress(self.0, name.as_ptr() as *const c_char);
        if p.is_null() {
            Err("見つかりません".into())
        } else {
            Ok(std::mem::transmute_copy(&p))
        }
    }
}
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::PathBuf;

type CuResult = i32;
type CuCtx = *mut c_void;
type CuModule = *mut c_void;
type CuFunction = *mut c_void;
type DevPtr = u64;
type NvrtcProgram = *mut c_void;

struct Driver {
    _lib: Library,
    get_error_string: unsafe extern "system" fn(CuResult, *mut *const c_char) -> CuResult,
    ctx_set_current: unsafe extern "system" fn(CuCtx) -> CuResult,
    module_load_data: unsafe extern "system" fn(*mut CuModule, *const c_void) -> CuResult,
    module_get_function: unsafe extern "system" fn(*mut CuFunction, CuModule, *const c_char) -> CuResult,
    mem_alloc: unsafe extern "system" fn(*mut DevPtr, usize) -> CuResult,
    mem_free: unsafe extern "system" fn(DevPtr) -> CuResult,
    htod: unsafe extern "system" fn(DevPtr, *const c_void, usize) -> CuResult,
    dtoh: unsafe extern "system" fn(*mut c_void, DevPtr, usize) -> CuResult,
    launch: unsafe extern "system" fn(
        CuFunction,
        u32,
        u32,
        u32,
        u32,
        u32,
        u32,
        u32,
        *mut c_void,
        *mut *mut c_void,
        *mut *mut c_void,
    ) -> CuResult,
    synchronize: unsafe extern "system" fn() -> CuResult,
}

macro_rules! sym {
    ($lib:expr, $name:literal) => {
        match $lib.get(concat!($name, "\0").as_bytes()) {
            Ok(f) => f,
            Err(e) => return Err(format!("{}: {e}", $name)),
        }
    };
}

pub struct Gpu {
    drv: Driver,
    ctx: CuCtx,
    pub name: String,
    pub sm: (i32, i32),
    pub sm_count: i32,
}

// コンテキストは 1 つのスレッドから順に使う
unsafe impl Send for Gpu {}

impl Gpu {
    fn check(&self, r: CuResult, what: &str) -> Result<(), String> {
        if r == 0 {
            return Ok(());
        }
        let mut s: *const c_char = std::ptr::null();
        unsafe { (self.drv.get_error_string)(r, &mut s) };
        let msg = if s.is_null() { String::new() } else { unsafe { CStr::from_ptr(s) }.to_string_lossy().into_owned() };
        Err(format!("{what} に失敗（CUDA {r}: {msg}）"))
    }

    pub fn open() -> Result<Gpu, String> {
        unsafe {
            let lib = Library::new("nvcuda.dll").map_err(|e| format!("nvcuda.dll を読めません: {e}"))?;
            let init: unsafe extern "system" fn(u32) -> CuResult = sym!(lib, "cuInit");
            let device_get: unsafe extern "system" fn(*mut i32, i32) -> CuResult = sym!(lib, "cuDeviceGet");
            let device_get_name: unsafe extern "system" fn(*mut c_char, i32, i32) -> CuResult =
                sym!(lib, "cuDeviceGetName");
            let device_get_attribute: unsafe extern "system" fn(*mut i32, i32, i32) -> CuResult =
                sym!(lib, "cuDeviceGetAttribute");
            let primary_ctx_retain: unsafe extern "system" fn(*mut CuCtx, i32) -> CuResult =
                sym!(lib, "cuDevicePrimaryCtxRetain");
            let primary_ctx_set_flags: unsafe extern "system" fn(i32, u32) -> CuResult =
                sym!(lib, "cuDevicePrimaryCtxSetFlags_v2");
            let drv = Driver {
                get_error_string: sym!(lib, "cuGetErrorString"),
                ctx_set_current: sym!(lib, "cuCtxSetCurrent"),
                module_load_data: sym!(lib, "cuModuleLoadData"),
                module_get_function: sym!(lib, "cuModuleGetFunction"),
                mem_alloc: sym!(lib, "cuMemAlloc_v2"),
                mem_free: sym!(lib, "cuMemFree_v2"),
                htod: sym!(lib, "cuMemcpyHtoD_v2"),
                dtoh: sym!(lib, "cuMemcpyDtoH_v2"),
                launch: sym!(lib, "cuLaunchKernel"),
                synchronize: sym!(lib, "cuCtxSynchronize"),
                _lib: lib,
            };
            if init(0) != 0 {
                return Err("cuInit に失敗".into());
            }
            let mut dev = 0;
            if device_get(&mut dev, 0) != 0 {
                return Err("GPU が見つかりません".into());
            }
            let mut name = [0 as c_char; 256];
            device_get_name(name.as_mut_ptr(), 256, dev);
            let name = CStr::from_ptr(name.as_ptr()).to_string_lossy().into_owned();
            let (mut major, mut minor, mut sms) = (0, 0, 0);
            device_get_attribute(&mut major, 75, dev);
            device_get_attribute(&mut minor, 76, dev);
            device_get_attribute(&mut sms, 16, dev);
            // GPU の計算が終わるのを待つあいだ、CPU を回し続けずに眠らせる（CU_CTX_SCHED_BLOCKING_SYNC）。
            // 既定（AUTO）では、待つスレッドが 1 コアを使い切っていた。使い口を作る前に決める
            primary_ctx_set_flags(dev, 0x04);
            let mut ctx = std::ptr::null_mut();
            if primary_ctx_retain(&mut ctx, dev) != 0 {
                return Err("コンテキストを作れません".into());
            }
            let gpu = Gpu { drv, ctx, name, sm: (major, minor), sm_count: sms };
            gpu.check((gpu.drv.ctx_set_current)(ctx), "cuCtxSetCurrent")?;
            Ok(gpu)
        }
    }

    pub fn bind(&self) -> Result<(), String> {
        self.check(unsafe { (self.drv.ctx_set_current)(self.ctx) }, "cuCtxSetCurrent")
    }

    pub fn load(&self, cubin: &[u8], function: &str) -> Result<CuFunction, String> {
        let mut module = std::ptr::null_mut();
        self.check(unsafe { (self.drv.module_load_data)(&mut module, cubin.as_ptr() as *const c_void) }, "cuModuleLoadData")?;
        let mut f = std::ptr::null_mut();
        let name = CString::new(function).unwrap();
        self.check(unsafe { (self.drv.module_get_function)(&mut f, module, name.as_ptr()) }, "cuModuleGetFunction")?;
        Ok(f)
    }

    pub fn alloc(&self, bytes: usize) -> Result<DevPtr, String> {
        let mut p = 0;
        self.check(unsafe { (self.drv.mem_alloc)(&mut p, bytes.max(4)) }, "cuMemAlloc")?;
        Ok(p)
    }

    pub fn free(&self, p: DevPtr) {
        unsafe { (self.drv.mem_free)(p) };
    }

    pub fn upload<T: Copy>(&self, dst: DevPtr, src: &[T]) -> Result<(), String> {
        if src.is_empty() {
            return Ok(());
        }
        self.check(
            unsafe { (self.drv.htod)(dst, src.as_ptr() as *const c_void, std::mem::size_of_val(src)) },
            "cuMemcpyHtoD",
        )
    }

    pub fn download<T: Copy>(&self, dst: &mut [T], src: DevPtr) -> Result<(), String> {
        if dst.is_empty() {
            return Ok(());
        }
        self.check(
            unsafe { (self.drv.dtoh)(dst.as_mut_ptr() as *mut c_void, src, std::mem::size_of_val(dst)) },
            "cuMemcpyDtoH",
        )
    }

    /// params は、引数の値を指すポインタの列
    pub fn launch(&self, f: CuFunction, grid: u32, block: u32, params: &mut [*mut c_void]) -> Result<(), String> {
        self.check(
            unsafe {
                (self.drv.launch)(
                    f,
                    grid,
                    1,
                    1,
                    block,
                    1,
                    1,
                    0,
                    std::ptr::null_mut(),
                    params.as_mut_ptr(),
                    std::ptr::null_mut(),
                )
            },
            "cuLaunchKernel",
        )?;
        self.check(unsafe { (self.drv.synchronize)() }, "cuCtxSynchronize")
    }
}

/// NVRTC の DLL の場所（NVRTC_DLL で指定できる）
fn nvrtc_path() -> PathBuf {
    if let Ok(p) = std::env::var("NVRTC_DLL") {
        return PathBuf::from(p);
    }
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let base = PathBuf::from(home).join(".local/share/cuda-nvrtc");
    if let Ok(entries) = std::fs::read_dir(&base) {
        for e in entries.flatten() {
            let dir = e.path().join("bin/x64");
            if let Ok(files) = std::fs::read_dir(&dir) {
                for f in files.flatten() {
                    let n = f.file_name().to_string_lossy().into_owned();
                    if n.starts_with("nvrtc64_") && n.ends_with(".dll") {
                        return f.path();
                    }
                }
            }
        }
    }
    PathBuf::from("nvrtc64_130_0.dll")
}

/// CUDA C を、この GPU 用の機械語（cubin）にコンパイルする
pub fn compile(src: &str, sm: (i32, i32), defines: &[(&str, String)]) -> Result<Vec<u8>, String> {
    unsafe {
        let path = nvrtc_path();
        // NVRTC はコンパイルのときに nvrtc-builtins を名前だけで読むので、同じフォルダーを探す場所に入れる
        if let Some(dir) = path.parent() {
            use std::os::windows::ffi::OsStrExt;
            let wide: Vec<u16> = dir.as_os_str().encode_wide().chain([0]).collect();
            SetDllDirectoryW(wide.as_ptr());
        }
        // LOAD_WITH_ALTERED_SEARCH_PATH: nvrtc-builtins を同じフォルダーから読む
        let lib = Library::load_with_flags(path.as_os_str(), 0x8).map_err(|e| format!("{} を読めません: {e}", path.display()))?;
        let create: unsafe extern "C" fn(
            *mut NvrtcProgram,
            *const c_char,
            *const c_char,
            i32,
            *const *const c_char,
            *const *const c_char,
        ) -> i32 = sym!(lib, "nvrtcCreateProgram");
        let compile: unsafe extern "C" fn(NvrtcProgram, i32, *const *const c_char) -> i32 = sym!(lib, "nvrtcCompileProgram");
        let log_size: unsafe extern "C" fn(NvrtcProgram, *mut usize) -> i32 = sym!(lib, "nvrtcGetProgramLogSize");
        let get_log: unsafe extern "C" fn(NvrtcProgram, *mut c_char) -> i32 = sym!(lib, "nvrtcGetProgramLog");
        let cubin_size: unsafe extern "C" fn(NvrtcProgram, *mut usize) -> i32 = sym!(lib, "nvrtcGetCUBINSize");
        let get_cubin: unsafe extern "C" fn(NvrtcProgram, *mut c_char) -> i32 = sym!(lib, "nvrtcGetCUBIN");
        let destroy: unsafe extern "C" fn(*mut NvrtcProgram) -> i32 = sym!(lib, "nvrtcDestroyProgram");

        let src_c = CString::new(src).unwrap();
        let name = CString::new("kernel.cu").unwrap();
        let mut prog = std::ptr::null_mut();
        if create(&mut prog, src_c.as_ptr(), name.as_ptr(), 0, std::ptr::null(), std::ptr::null()) != 0 {
            return Err("nvrtcCreateProgram に失敗".into());
        }
        let mut opts: Vec<CString> = vec![
            CString::new(format!("--gpu-architecture=sm_{}{}", sm.0, sm.1)).unwrap(),
            CString::new("-std=c++17").unwrap(),
        ];
        for (k, v) in defines {
            opts.push(CString::new(format!("-D{k}={v}")).unwrap());
        }
        let ptrs: Vec<*const c_char> = opts.iter().map(|s| s.as_ptr()).collect();
        let r = compile(prog, ptrs.len() as i32, ptrs.as_ptr());
        let mut n = 0;
        log_size(prog, &mut n);
        let mut log = vec![0u8; n.max(1)];
        get_log(prog, log.as_mut_ptr() as *mut c_char);
        let log = String::from_utf8_lossy(&log[..n.saturating_sub(1)]).into_owned();
        if r != 0 {
            destroy(&mut prog);
            return Err(format!("コンパイルに失敗:\n{log}"));
        }
        let mut n = 0;
        cubin_size(prog, &mut n);
        let mut out = vec![0u8; n];
        get_cubin(prog, out.as_mut_ptr() as *mut c_char);
        destroy(&mut prog);
        Ok(out)
    }
}
