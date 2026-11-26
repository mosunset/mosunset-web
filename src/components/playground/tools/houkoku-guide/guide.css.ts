// 報告・相談の手引きの見た目（元の HTML の style をほぼそのまま、.hk の中だけに効くようにしたもの）
// 色は light-dark() で、サイトのテーマ（html の color-scheme）に合わせて切り替わる。
// 書体は CSP で Google Fonts を読めないので、サイトの書体を使う
export const guideCss = `
.hk{--bg:light-dark(#fff,#0e0e0e);--ink:light-dark(#111,#f1f1f1);--grey:light-dark(#666,#9c9c9c);--line:light-dark(#dcdcdc,#2d2d2d);--soft:light-dark(#f3f3f3,#191919);--red:light-dark(#e4002b,#ff4058);background:var(--bg);color:var(--ink);font-size:16px;line-height:1.75;overflow-x:clip}
.hk *{box-sizing:border-box;min-width:0}
.hk a{color:inherit}
.hk .band{padding:clamp(28px,4vw,64px) clamp(16px,3vw,32px)}
.hk header.band{border-top:12px solid var(--ink);padding-bottom:clamp(24px,3vw,40px)}
.hk h2,.hk .k,.hk .nm{font-weight:900;letter-spacing:-.02em}
.hk .lead{font-size:17px;max-width:38em;margin:0}
.hk .lead strong{background:linear-gradient(transparent 62%,color-mix(in srgb,var(--red) 28%,transparent) 62%)}
.hk .src{color:var(--grey);font-size:13px;margin:12px 0 0}
.hk .pic{margin-top:32px;display:grid;gap:14px}
.hk .cap{font-size:14px;font-weight:700;margin:0;display:flex;flex-wrap:wrap;gap:4px 10px}
.hk .cap span{color:var(--grey);font-weight:400}
.hk .dots{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:6px 0 10px}
.hk .chip{display:inline-block;border:1.5px solid var(--grey);color:var(--grey);padding:3px 10px;font-size:14px;line-height:1.5;background:var(--bg);white-space:nowrap}
.hk .dots .chip:nth-child(3n){transform:rotate(-5deg)}
.hk .dots .chip:nth-child(3n+1){transform:rotate(3deg) translateY(5px)}
.hk .route{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));position:relative}
.hk .route::before{content:"";position:absolute;left:10%;right:10%;top:22px;height:8px;background:var(--red)}
.hk .route li{position:relative;text-align:center}
.hk .route a{display:block;text-decoration:none;padding:0 4px 6px;border-radius:4px}
.hk .route a:focus-visible{outline:3px solid var(--red);outline-offset:2px}
.hk .st{display:block;width:52px;height:52px;margin:0 auto 10px;border:8px solid var(--red);border-radius:50%;background:var(--bg);transition:transform .2s}
.hk .route a:hover .st{transform:scale(1.08)}
.hk .nm{display:block;font-size:22px;line-height:1.2}
.hk .gist{display:block;color:var(--grey);font-size:14px;line-height:1.4}
@media(max-width:719px){.hk .route{grid-template-columns:minmax(0,1fr)}.hk .route::before{left:22px;right:auto;top:26px;bottom:44px;width:8px;height:auto}.hk .route li{text-align:left}.hk .route a{display:grid;grid-template-columns:52px minmax(0,1fr);column-gap:16px;align-items:center;padding:0 0 18px}.hk .st{margin:0;grid-row:span 2}.hk .nm{font-size:20px;align-self:end}.hk .gist{align-self:start}}
.hk nav.toc{display:flex;gap:4px 22px;overflow-x:auto;padding:0 clamp(16px,3vw,32px);border-block:1px solid var(--line);background:var(--bg);white-space:nowrap}
.hk nav.toc a{flex:none;font-weight:700;font-size:14px;text-decoration:none;display:flex;align-items:center;min-height:48px}
.hk nav.toc a:hover{color:var(--red)}
.hk section.band{border-top:4px solid var(--ink);scroll-margin-top:calc(var(--header-height,56px) + 8px)}
.hk .view{scroll-margin-top:calc(var(--header-height,56px) + 8px)}
.hk .sec{display:grid;grid-template-columns:minmax(0,1fr);gap:8px 48px}
@media(min-width:900px){.hk .sec{grid-template-columns:250px minmax(0,1fr)}.hk .sec>h2{position:sticky;top:calc(var(--header-height,56px) + 16px);align-self:start}}
.hk h2{font-size:clamp(26px,3.4vw,34px);line-height:1.15;margin:0 0 8px;text-wrap:balance}
.hk h3{font-size:18px;font-weight:700;line-height:1.4;margin:28px 0 6px}
.hk p{margin:8px 0;max-width:42em}
.hk ul.plain{margin:8px 0;padding-left:1.2em;max-width:42em;list-style:disc}
.hk ul.plain li{margin:4px 0}
.hk b{font-weight:700}
.hk .note{background:var(--soft);padding:14px 18px;max-width:42em;margin:16px 0}
.hk .note p{margin:4px 0}
.hk .tool{display:grid;gap:24px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1100px){.hk .tool{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}.hk .side{position:sticky;top:calc(var(--header-height,56px) + 16px);align-self:start}}
.hk .field{margin-bottom:18px}
.hk .field label{display:block;font-weight:700;font-size:16px;line-height:1.5}
.hk .hint{display:block;font-weight:400;color:var(--grey);font-size:14px;margin-bottom:6px}
.hk textarea{display:block;width:100%;font:inherit;font-size:16px;line-height:1.6;padding:10px 12px;border:1.5px solid var(--ink);background:var(--bg);color:var(--ink);border-radius:0;min-height:92px;resize:vertical}
.hk textarea.tall{min-height:130px}
.hk textarea:focus-visible{outline:3px solid var(--red);outline-offset:2px}
.hk .example{font-size:14px;color:var(--red);font-weight:700;margin:0 0 14px}
.hk .side{background:var(--soft);padding:18px 20px}
.hk .side h3{margin-top:0}
.hk .found{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}
.hk .found li{font-size:15px;line-height:1.5}
.hk .found b{color:var(--red)}
.hk .found .none{color:var(--grey)}
.hk .checks{margin-top:22px}
.hk .checks label{display:flex;gap:10px;align-items:flex-start;font-size:15px;line-height:1.5;padding:7px 0;cursor:pointer}
.hk .checks input{width:22px;height:22px;accent-color:var(--red);flex:none;margin:0}
.hk .btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center}
.hk button{font:inherit;font-weight:700;font-size:15px;line-height:1;min-height:44px;padding:0 18px;border:2px solid var(--ink);background:var(--ink);color:var(--bg);cursor:pointer;border-radius:0}
.hk button.ghost{background:transparent;color:var(--ink)}
.hk button:hover{opacity:.85}
.hk button:focus-visible{outline:3px solid var(--red);outline-offset:2px}
.hk .status{font-size:14px;color:var(--grey);min-height:1.5em;margin:8px 0 0}
.hk .say{font-size:17px;font-weight:700;line-height:1.6;padding:16px 18px;border:2px solid var(--ink);max-width:42em;margin:10px 0}
.hk .pair{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:14px 0;border-top:1px solid var(--line);max-width:58em}
@media(min-width:720px){.hk .pair{grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:28px}}
.hk .tag{display:block;font-size:13px;font-weight:700;line-height:1.4}
.hk .ng{color:var(--grey)}
.hk .ok .tag{color:var(--red)}
.hk .chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}
.hk .view{display:grid;grid-template-columns:minmax(0,1fr);gap:2px 28px;padding:22px 0;border-top:1px solid var(--line)}
.hk .view:first-of-type{border-top:0;padding-top:4px}
@media(min-width:720px){.hk .view{grid-template-columns:3.2em minmax(0,1fr)}}
.hk .k{font-size:clamp(34px,5vw,46px);line-height:1;color:var(--red)}
@media(min-width:720px){.hk .k{writing-mode:vertical-rl;letter-spacing:.06em}}
.hk .q{font-weight:700;font-size:18px;line-height:1.5;margin:0 0 4px}
.hk .when{display:block;font-size:13px;font-weight:700;color:var(--grey);margin-top:12px;line-height:1.4}
.hk .view p{margin:2px 0 6px}
.hk footer.band{border-top:4px solid var(--ink);font-size:14px;color:var(--grey)}
.hk footer p{max-width:50em}
@media(prefers-reduced-motion:reduce){.hk .st{transition:none}}
`
