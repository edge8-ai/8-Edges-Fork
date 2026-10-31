// The offline copy's stylesheet (RP.7; spec "Offline download"). The file
// opens from disk on a scanner with no signal, so it cannot read
// app/styles/tokens.css or the scanner's stylesheet: both are inlined here.
//
// The rules are the scanner's own (app/styles/replenishment-scanner.css), cut
// down to what the offline screen draws and with the same class names, so the
// two screens look alike. The colours are copies of tokens, each keyed by the
// token it copies; offline-style.test.ts resolves every key in tokens.css and
// fails when a value drifts, which is what keeps the copy honest.

/** Every token the offline file paints with, by its name in tokens.css, and its value there. */
export const OFFLINE_TOKENS: Readonly<Record<string, string>> = {
  "admin-bg": "#F1F3F5", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-surface": "#FFFFFF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-ink": "#101014", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-muted-ink": "#5C6178", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-line": "#E6E6E6", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-input-line": "#A8B2BD", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-accent": "#287BE8", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-accent-strong": "#1D6AD4", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-accent-on-dark": "#FFFFFF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-info-bg": "#E2ECFD", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-info-ink": "#1A5FBF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-amber-bg": "#FAEEDA", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-amber-ink": "#854F0B", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-sidebar-bg": "#101014", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-sidebar-strong": "#FFFFFF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-sidebar-ink": "#C4C7CC", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-on-dark-strong": "rgba(255, 255, 255, 0.25)", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-on-dark-active": "rgba(255, 255, 255, 0.12)", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-ok-bg": "#D8F3E8", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-ok-ink": "#157A5A", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-warn-bg": "#FBF0CF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-warn-ink": "#7A5D0D", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-err-bg": "#FDE4E4", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-err-ink": "#B0332F", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-scrim": "rgba(4, 16, 45, 0.45)", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-focus-ring": "0 0 0 3px rgba(40, 123, 232, 0.25)", // colour-ok: copy of the token for a file that cannot read tokens.css
  "admin-radius": "12px",
  "admin-radius-sm": "8px",
  "admin-radius-xs": "6px",
  "admin-radius-pill": "9999px",
  // Only fonts already on the device: the file loads nothing.
  "font-body": "'Manrope', 'Helvetica Neue', Arial, sans-serif",
  // The scanner's dark mode (RP.5).
  "color-scanner-dark-bg": "#16171C", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-scanner-dark-surface": "#1F2128", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-scanner-dark-line": "#33363F", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-scanner-dark-accent": "#9CC2FF", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-scanner-dark-chip": "#24324A", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-scanner-dark-amber": "#3A3122", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-grey-75": "#F1F3F5", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-grey-300": "#BCC1C7", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-grey-600": "#5C6178", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-accent-line": "#CFE0FB", // colour-ok: copy of the token for a file that cannot read tokens.css
  "color-amber-bg": "#FAEEDA", // colour-ok: copy of the token for a file that cannot read tokens.css
};

const ROOT = `:root{${Object.entries(OFFLINE_TOKENS)
  .map(([name, value]) => `--${name}:${value};`)
  .join("")}}`;

const DARK = `--scan-bg:var(--color-scanner-dark-bg);--scan-surface:var(--color-scanner-dark-surface);--scan-ink:var(--color-grey-75);
--scan-muted:var(--color-grey-300);--scan-line:var(--color-scanner-dark-line);--scan-input-line:var(--color-grey-600);
--scan-accent:var(--color-scanner-dark-accent);--scan-chip-bg:var(--color-scanner-dark-chip);--scan-chip-ink:var(--color-accent-line);
--scan-amber-bg:var(--color-scanner-dark-amber);--scan-amber-ink:var(--color-amber-bg);`;

/** The whole stylesheet, light by default and dark when the device prefers it. */
export const OFFLINE_CSS = `${ROOT}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--admin-bg)}
.rp-scan{--scan-bg:var(--admin-bg);--scan-surface:var(--admin-surface);--scan-ink:var(--admin-ink);--scan-muted:var(--admin-muted-ink);
--scan-line:var(--admin-line);--scan-input-line:var(--admin-input-line);--scan-accent:var(--admin-accent-strong);
--scan-chip-bg:var(--admin-info-bg);--scan-chip-ink:var(--admin-info-ink);--scan-amber-bg:var(--admin-amber-bg);--scan-amber-ink:var(--admin-amber-ink);
position:fixed;inset:0;display:flex;flex-direction:column;background:var(--scan-bg);color:var(--scan-ink);
font-family:var(--font-body);font-size:16px;line-height:1.35;overscroll-behavior:contain}
@media (prefers-color-scheme:dark){.rp-scan{${DARK}}body{background:var(--color-scanner-dark-bg)}}
:where(.rp-scan) :where(h1,h2,p,dl,dd){margin:0}
.rp-scan button{font:inherit;cursor:pointer}
.rp-scan button:disabled{cursor:default;opacity:.5}
.rp-scan :focus-visible{outline:none;box-shadow:var(--admin-focus-ring)}
.rp-scan [hidden]{display:none!important}
.rp-scan-top{flex:none;background:var(--admin-sidebar-bg);color:var(--admin-sidebar-strong);padding-top:env(safe-area-inset-top)}
.rp-scan-bar{display:flex;align-items:center;gap:10px;padding:8px max(14px,env(safe-area-inset-right)) 8px max(14px,env(safe-area-inset-left))}
.rp-scan-icon{flex:none;width:52px;height:52px;border:none;border-radius:var(--admin-radius-pill);background:var(--admin-on-dark-active);
color:var(--admin-sidebar-strong);font-size:22px;font-weight:800}
.rp-scan-title{flex:1;min-width:0}
.rp-scan-name{font-weight:700}
.rp-scan-sub{color:var(--admin-sidebar-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rp-scan-counter{flex:none;min-width:3.4em;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.rp-scan-progress{display:block;width:100%;height:6px;border:none;appearance:none;-webkit-appearance:none;
background:var(--admin-on-dark-strong);color:var(--admin-accent)}
.rp-scan-progress::-webkit-progress-bar{background:var(--admin-on-dark-strong)}
.rp-scan-progress::-webkit-progress-value{background:var(--admin-accent)}
.rp-scan-progress::-moz-progress-bar{background:var(--admin-accent)}
.rp-scan-offline{padding:8px max(14px,env(safe-area-inset-right)) 10px max(14px,env(safe-area-inset-left));color:var(--admin-sidebar-ink)}
.rp-scan-offline strong{color:var(--admin-sidebar-strong)}
.rp-scan-main{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
padding:14px max(14px,env(safe-area-inset-right)) 20px max(14px,env(safe-area-inset-left))}
.rp-scan-warn{margin-bottom:12px;padding:10px 12px;border-radius:var(--admin-radius-sm);background:var(--admin-warn-bg);color:var(--admin-warn-ink);font-weight:600}
.rp-scan-card{background:var(--scan-surface);border:1px solid var(--scan-line);border-radius:var(--admin-radius);padding:16px}
.rp-js .rp-scan-job{display:none}
.rp-js .rp-scan-job.rp-scan-on{display:block}
.rp-scan-job+.rp-scan-job{margin-top:12px}
.rp-scan-centre{text-align:center;padding:28px 18px}
.rp-scan-big{font-size:20px;font-weight:800;margin-bottom:6px}
.rp-scan-muted{color:var(--scan-muted)}
.rp-scan-strong{font-weight:700}
.rp-scan-grow{flex:1;min-width:0;overflow-wrap:anywhere}
.rp-scan-small{margin-top:6px}
.rp-scan-tick{width:52px;height:52px;margin:0 auto 12px;border-radius:var(--admin-radius-pill);background:var(--admin-ok-bg);color:var(--admin-ok-ink);
display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800}
.rp-scan-head{display:flex;align-items:flex-start;gap:8px}
.rp-scan-item{flex:1;min-width:0;font-size:22px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.rp-scan-done{flex:none;padding:4px 10px;border-radius:var(--admin-radius-pill);background:var(--admin-ok-bg);color:var(--admin-ok-ink);font-weight:700}
.rp-scan-desc{margin:4px 0 8px;color:var(--scan-muted);overflow-wrap:anywhere}
.rp-scan-chip{display:inline-block;margin-bottom:14px;padding:3px 8px;border-radius:var(--admin-radius-xs);background:var(--scan-chip-bg);color:var(--scan-chip-ink);font-weight:600}
.rp-scan-figures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.rp-scan-figure{border:1px solid var(--scan-line);border-radius:var(--admin-radius-sm);padding:8px 4px;text-align:center}
.rp-scan-figure dt{color:var(--scan-muted);font-weight:600;overflow-wrap:anywhere}
.rp-scan-figure dd{font-size:22px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
.rp-scan-figure--move{border:2px solid var(--scan-accent);padding:7px 4px}
.rp-scan-figure--move dd{font-size:28px;font-weight:800;line-height:1.15;color:var(--scan-accent)}
.rp-scan-accent{color:var(--scan-accent)}
.rp-scan-hint{margin-bottom:14px;padding:8px 10px;border-radius:var(--admin-radius-sm);background:var(--scan-amber-bg);color:var(--scan-amber-ink)}
.rp-scan-label{display:block;margin-bottom:6px;color:var(--scan-muted);font-size:16px;font-weight:700}
.rp-scan-rows{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:6px}
.rp-scan-row{display:flex;align-items:center;gap:8px;border:1px solid var(--scan-line);border-radius:var(--admin-radius-sm);padding:9px 10px}
.rp-scan-row--start{border:2px solid var(--scan-ink);padding:8px 9px}
.rp-scan-start{flex:none;color:var(--scan-muted);font-weight:700}
.rp-scan-qty{flex:none;min-width:2.5em;text-align:right;font-variant-numeric:tabular-nums}
.rp-scan-rule{margin-bottom:8px;color:var(--scan-muted)}
.rp-scan-nopick{margin-bottom:16px;padding:10px;border:1px dashed var(--scan-input-line);border-radius:var(--admin-radius-sm)}
.rp-scan-summary{text-align:left;margin-top:16px}
.rp-scan-field{display:block}
.rp-scan-input{display:block;width:100%;min-height:56px;margin-top:6px;padding:10px 12px;border:2px solid var(--scan-input-line);
border-radius:var(--admin-radius-sm);background:var(--scan-amber-bg);color:var(--scan-ink);font:inherit;font-size:20px;font-weight:700}
.rp-scan-input:focus{outline:none;border-color:var(--scan-accent)}
.rp-scan-notice{margin-top:10px;padding:8px 10px;border-radius:var(--admin-radius-sm);background:var(--admin-err-bg);color:var(--admin-err-ink);font-weight:600}
.rp-scan-foot{flex:none;border-top:1px solid var(--scan-line);background:var(--scan-surface);
padding:0 max(14px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(14px,env(safe-area-inset-left))}
.rp-scan-controls{display:flex;gap:8px;padding:10px 0}
.rp-scan-btn{flex:1;min-height:52px;padding:0 10px;border-radius:var(--admin-radius-sm);border:1px solid var(--scan-input-line);
background:var(--scan-surface);color:var(--scan-ink);font-size:16px;font-weight:700}
.rp-scan-btn--wide{flex:1.3}
.rp-scan-btn--full{width:100%;margin-top:14px}
.rp-scan-centre .rp-scan-btn{width:100%;margin-top:16px}
.rp-scan-btn--primary{border:none;background:var(--admin-accent-strong);color:var(--admin-accent-on-dark)}
.rp-scan-footer{padding:0 0 8px;text-align:center;color:var(--scan-muted)}
.rp-scan-foot>.rp-scan-footer:first-child{padding-top:10px}
.rp-scan-overlay{position:absolute;inset:0;display:flex;align-items:flex-end}
.rp-scan-scrim{position:absolute;inset:0;width:100%;border:none;background:var(--admin-scrim)}
.rp-scan-sheet{position:relative;width:100%;background:var(--scan-surface);color:var(--scan-ink);border-radius:14px 14px 0 0;
padding:20px max(20px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));max-height:85%;overflow-y:auto}
.rp-scan-steps{margin:0;padding-left:20px;line-height:1.5;display:flex;flex-direction:column;gap:6px}`;
