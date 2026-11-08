export const serviceControlPanel = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenAula Service Control Panel</title>
<style>
  :root {
    --bg: #0e1114;
    --card: #161a1f;
    --card-2: #1d232a;
    --border: #2a323b;
    --text: #f2f5f8;
    --muted: #95a1ad;
    --accent: #ffd45c;
    --green: #2ee59d;
    --danger: #ff5c6c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 18px 56px;
    font: 14px/1.5 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: radial-gradient(circle at 50% 0%, #1a2129 0%, var(--bg) 65%);
    color: var(--text);
    min-height: 100vh;
  }
  .shell {
    max-width: 820px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px;
    padding: 20px 22px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.32);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .logo {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: linear-gradient(135deg, #ffd45c, #f0a500);
    color: #111417;
    font-weight: 800;
    font-size: 20px;
    display: grid;
    place-items: center;
  }
  .brand h1 {
    margin: 0;
    font-size: 19px;
    letter-spacing: -0.02em;
  }
  .brand p {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .badges {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background: var(--card-2);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .pill.is-online {
    background: rgba(46, 229, 157, 0.12);
    border-color: rgba(46, 229, 157, 0.45);
    color: var(--green);
  }
  .pill.is-offline {
    background: rgba(255, 92, 108, 0.12);
    border-color: rgba(255, 92, 108, 0.45);
    color: var(--danger);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }
  .card {
    padding: 18px 20px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
  }
  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .card h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .card p {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .metric {
    padding: 8px 10px;
    border-radius: 9px;
    background: var(--card-2);
    border: 1px solid rgba(255,255,255,0.04);
  }
  .metric span {
    display: block;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .metric strong {
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }
  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button, .btn-link {
    appearance: none;
    border: 1px solid var(--border);
    background: var(--card-2);
    color: var(--text);
    font: 600 13px/1 'Segoe UI', system-ui, sans-serif;
    padding: 10px 14px;
    border-radius: 9px;
    cursor: pointer;
    transition: all 0.14s ease;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: 1 1 auto;
  }
  button:hover:not(:disabled), .btn-link:hover {
    background: #262e37;
    border-color: #455261;
    transform: translateY(-1px);
  }
  button:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
  .btn-primary {
    background: var(--accent);
    border-color: #ffe082;
    color: #121518;
    font-weight: 700;
  }
  .btn-primary:hover:not(:disabled) {
    background: #ffdf7a;
    border-color: #ffea9f;
  }
  .btn-active {
    background: rgba(46, 229, 157, 0.14);
    border-color: rgba(46, 229, 157, 0.55);
    color: #7bf5c2;
  }
  .btn-danger {
    background: rgba(255, 92, 108, 0.1);
    border-color: rgba(255, 92, 108, 0.35);
    color: #ff8a96;
  }
  .btn-danger:hover:not(:disabled) {
    background: rgba(255, 92, 108, 0.2);
    border-color: var(--danger);
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 9px;
    background: var(--card-2);
    border: 1px dashed var(--border);
    font-size: 12px;
    color: var(--muted);
  }
  .file-row input[type="file"] {
    font-size: 12px;
    color: var(--muted);
    max-width: 100%;
  }
  .status-banner {
    margin: 0;
    font-size: 13px;
    color: var(--text);
    padding: 9px 12px;
    border-radius: 8px;
    background: var(--card-2);
  }
  progress {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
  }
  details {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 18px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--muted);
    user-select: none;
  }
  pre {
    margin: 12px 0 0;
    padding: 12px;
    background: #0b0d10;
    border-radius: 8px;
    border: 1px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
    font: 12px/1.45 Consolas, monospace;
    color: #cfd8e0;
    max-height: 320px;
    overflow: auto;
  }
</style>
</head>
<body>
<div class="shell">
  <header class="hero">
    <div class="brand">
      <div class="logo">A</div>
      <div>
        <h1>OpenAula Background Service</h1>
        <p id="version-line">Local HID Bridge, RGB Engine &amp; XInput Gamepad</p>
      </div>
    </div>
    <div class="badges">
      <span id="online-pill" class="pill is-online"><span class="dot"></span><span id="online-text">Online</span></span>
      <span id="device-pill" class="pill">Keyboard: Detecting…</span>
      <a class="btn-link btn-primary" href="https://open-hero68.pages.dev/" target="_blank" rel="noreferrer">Open Web App ↗</a>
    </div>
  </header>

  <div class="grid">
    <section class="card">
      <div class="card-head">
        <div>
          <h2>RGB Lighting Engine</h2>
          <p>Stream Custom RGB or Audio Rhythm Sync at 60 FPS, or restore onboard lighting.</p>
        </div>
        <span id="rgb-pill" class="pill">Onboard</span>
      </div>
      <div class="metrics">
        <div class="metric"><span>Mode</span><strong id="rgb-mode">Onboard</strong></div>
        <div class="metric"><span>Frame Rate</span><strong id="rgb-fps">0 FPS</strong></div>
      </div>
      <div class="file-row">
        <input id="file" type="file" accept=".json" aria-label="Preset JSON file">
      </div>
      <div class="btn-row">
        <button id="btn-rgb-start" onclick="start()">▶ Start saved RGB</button>
        <button id="btn-rgb-onboard" onclick="post('/mode',{mode:'onboard'})">■ Onboard RGB</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Analog &amp; Digital Gamepad</h2>
          <p>Map Hall travel curves and Rapid Trigger keys to a virtual Xbox 360 controller.</p>
        </div>
        <span id="gp-pill" class="pill">Stopped</span>
      </div>
      <div class="metrics">
        <div class="metric"><span>XInput Driver</span><strong id="gp-driver">Checking…</strong></div>
        <div class="metric"><span>Hall Polls</span><strong id="gp-polls">0</strong></div>
      </div>
      <div class="btn-row">
        <button id="btn-gp-start" onclick="post('/gamepad/start')">▶ Start saved Gamepad</button>
        <button id="btn-gp-stop" onclick="post('/gamepad/stop')">■ Stop Gamepad</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h2>Updates &amp; Service Control</h2>
          <p>Verify signed GitHub updates or safely shut down the background service.</p>
        </div>
      </div>
      <p id="update" class="status-banner" role="status">Ready</p>
      <progress id="progress" hidden></progress>
      <div class="btn-row">
        <button id="apply" class="btn-primary" onclick="apply()">↻ Update app / Cập nhật</button>
        <button class="btn-danger" onclick="post('/shutdown')">✕ Exit app</button>
      </div>
    </section>
  </div>

  <details>
    <summary>Raw Telemetry &amp; Diagnostic JSON</summary>
    <pre id="status"></pre>
  </details>
</div>
<script>
const vi=navigator.language.startsWith('vi'),labels={idle:['Ready','Sẵn sàng'],checking:['Checking for updates','Đang kiểm tra'],downloading:['Downloading','Đang tải'],verifying:['Verifying','Đang xác minh'],stopping:['Closing app safely','Đang đóng app an toàn'],installing:['Installing','Đang cài đặt'],restarting:['Restarting app','Đang mở lại app'],completed:['App is up to date','Ứng dụng đã cập nhật'], 'rolling-back':['Restoring previous version','Đang khôi phục bản cũ'],failed:['Update failed','Cập nhật thất bại']};
const modelNames={hero68Xs:'AULA HERO 68 XS',hero68:'AULA HERO 68 HE',hero84:'AULA HERO 84 HE',win68HeMax:'AULA WIN 68 HE MAX',win68:'AULA WIN 68 HE MAX'};
let pending=false;
async function post(url,data={}){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error);await refresh();return result}catch(e){alert(e.message);throw e}}
async function start(){try{const f=document.getElementById('file').files[0];const p=f?JSON.parse(await f.text()):{};await post('/start',p.profile||p)}catch(e){alert(e.message)}}
async function apply(){pending=true;document.getElementById('apply').disabled=true;try{await post('/updates/apply')}catch(e){pending=false;document.getElementById('update').textContent=e.message}}
async function refresh(){try{
 const s=await(await fetch('/status')).json(),u=await(await fetch('/updates')).json();document.getElementById('status').textContent=JSON.stringify(s,null,2);
 document.getElementById('online-pill').className='pill is-online';
 document.getElementById('online-text').textContent=vi?'Đang chạy':'Online';
 document.getElementById('version-line').textContent='Core v'+(s.coreVersion||'—')+' · Launcher v'+(s.launcherVersion||'—')+' · CPU '+Number(s.cpuPercent||0).toFixed(1)+'%';
 const devName=modelNames[s.deviceModel]||s.deviceModel||(vi?'Chưa kết nối phím':'No keyboard');
 document.getElementById('device-pill').textContent=(s.connected?'● ':'○ ')+devName;
 const rgbOn=Boolean(s.enabled&&s.mode!=='onboard');
 document.getElementById('rgb-pill').textContent=s.tachyon?'Tachyon 8K':rgbOn?(s.mode==='rhythm'?'Rhythm Sync':'Custom RGB'):'Onboard';
 document.getElementById('rgb-pill').className='pill'+(rgbOn?' is-online':'');
 document.getElementById('rgb-mode').textContent=s.tachyon?'Tachyon (LED Off)':String(s.mode||'onboard').toUpperCase();
 document.getElementById('rgb-fps').textContent=Math.round(s.fps||0)+' FPS';
 document.getElementById('btn-rgb-start').className=rgbOn?'btn-active':'';
 const gpOn=Boolean(s.gamepad&&s.gamepad.enabled);
 document.getElementById('gp-pill').textContent=gpOn?(vi?'Đang bật':'Active'):(vi?'Đang tắt':'Stopped');
 document.getElementById('gp-pill').className='pill'+(gpOn?' is-online':'');
 document.getElementById('gp-driver').textContent=s.driverInstalled?(vi?'Sẵn sàng (ViGEm)':'Ready (ViGEm)'):(vi?'Chưa cài':'Not installed');
 document.getElementById('gp-polls').textContent=String(s.hallPolls||0);
 document.getElementById('btn-gp-start').className=gpOn?'btn-active':'';
 const busy=!['idle','completed','failed'].includes(u.phase);pending=busy;document.getElementById('apply').disabled=busy||!s.supportsFullUpdate;
 document.getElementById('update').textContent=!s.supportsFullUpdate?(vi?'Chạy setup một lần để bật cập nhật tự động.':'Run setup once to enable automatic updates.'):(labels[u.phase]?.[vi?1:0]||u.phase)+(u.version?' '+u.version:'')+(u.error?' — '+u.error:'');
 const p=document.getElementById('progress');p.hidden=u.phase!=='downloading';p.max=u.total||1;p.value=u.downloaded||0;
 }catch{
 document.getElementById('online-pill').className='pill is-offline';
 document.getElementById('online-text').textContent=vi?'Ngoại tuyến':'Offline';
 document.getElementById('status').textContent=pending?(vi?'Ứng dụng đang khởi động lại. Windows không khởi động lại.':'App is restarting. Windows is not restarting.'):'App is offline';
 }}
setInterval(refresh,1000);refresh();
</script>
</body>
</html>`;
