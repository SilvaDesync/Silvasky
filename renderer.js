let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let micEnabled = true;

const webview = document.getElementById('web-view');
const urlInput = document.getElementById('url-input');
const btnGo = document.getElementById('btn-go');
const logsContainer = document.getElementById('logs-container');
const btnRecord = document.getElementById('btn-record');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnConnectApp = document.getElementById('btn-connect-app');
const portInput = document.getElementById('port-input');
const btnClear = document.getElementById('btn-clear');

// Navegação
btnGo.addEventListener('click', () => {
  let url = urlInput.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  webview.src = url;
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnGo.click();
});

// Eventos do WebView (Monitora troca de página e erros sem perder dados)
webview.addEventListener('did-navigate', (e) => {
  urlInput.value = e.url;
  window.electronAPI.sendLog({
    type: 'NAVIGATION',
    timestamp: new Date().toISOString(),
    message: `Navegou para: ${e.url}`
  });
});

webview.addEventListener('console-message', (e) => {
  if (e.level >= 2) { // Errors & Warnings
    window.electronAPI.sendLog({
      type: 'CONSOLE_ERROR',
      timestamp: new Date().toISOString(),
      message: e.message,
      line: e.line,
      source: e.sourceId
    });
  }
});

// Receber novos logs do processo principal
window.electronAPI.onNewLog((log) => {
  renderLog(log);
});

function renderLog(log) {
  const div = document.createElement('div');
  div.className = `log-item ${log.type}`;
  
  let content = `<span class="time">[${new Date(log.timestamp).toLocaleTimeString()}] ${log.type}</span>`;
  if (log.message) content += `<div>${log.message}</div>`;
  if (log.url) content += `<div style="color:#aaa;">URL: ${log.url}</div>`;
  if (log.statusCode) content += `<div>Status: ${log.statusCode}</div>`;

  div.innerHTML = content;
  logsContainer.appendChild(div);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Microfone Toggle
btnToggleMic.addEventListener('click', () => {
  micEnabled = !micEnabled;
  if (micEnabled) {
    btnToggleMic.textContent = '🎤 Mic ON';
    btnToggleMic.className = 'btn-success';
  } else {
    btnToggleMic.textContent = '🎙️ Mic OFF';
    btnToggleMic.className = '';
  }
});

// Gravação de Tela
btnRecord.addEventListener('click', async () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

async function startRecording() {
  try {
    const sources = await window.electronAPI.getSources();
    const primarySource = sources[0]; // Tela principal

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id
        }
      }
    });

    if (micEnabled) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (err) {
        console.warn("Microfone não disponível:", err);
      }
    }

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = saveVideo;
    mediaRecorder.start(1000);

    isRecording = true;
    btnRecord.textContent = '⏹️ Parar Gravação';
    btnRecord.style.backgroundColor = '#ff9800';
  } catch (err) {
    alert("Erro ao iniciar gravação de tela: " + err.message);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording = false;
    btnRecord.textContent = '🔴 Iniciar Gravação';
    btnRecord.className = 'btn-danger';
  }
}

function saveVideo() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error_report_${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

// Conexão com Gestor Multipedidos (App Externo)
btnConnectApp.addEventListener('click', async () => {
  const port = portInput.value.trim() || 9222;
  btnConnectApp.textContent = "Conectando...";
  const res = await window.electronAPI.connectExternalApp(port);
  alert(res.message);
  btnConnectApp.textContent = "Conectar Console";
});

// Limpar Logs
btnClear.addEventListener('click', async () => {
  await window.electronAPI.clearLogs();
  logsContainer.innerHTML = '';
});
