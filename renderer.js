const dropZone = document.getElementById('drop-zone');
const btnRecord = document.getElementById('btn-record');
const logsContainer = document.getElementById('logs');
const btnClear = document.getElementById('btn-clear');

let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];

// Drag and Drop de Atalhos / EXEs
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const filePath = files[0].path;
    handleLaunch(filePath);
  }
});

dropZone.addEventListener('click', async () => {
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    handleLaunch(filePath);
  }
});

async function handleLaunch(filePath) {
  dropZone.innerHTML = `⏳ Abrindo e Conectando ao App...<br><small style="color:#aaa;">${filePath}</small>`;
  const res = await window.electronAPI.launchApp(filePath);
  if (!res.success) {
    alert("Erro ao abrir aplicativo: " + res.error);
  }
}

// Gravação de Tela
btnRecord.addEventListener('click', async () => {
  if (!isRecording) {
    const sources = await window.electronAPI.getSources();
    const primaryScreen = sources[0];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primaryScreen.id
        }
      }
    });

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getAudioTracks().forEach(track => stream.addTrack(track));
    } catch (e) {}

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coleta_erros_${Date.now()}.webm`;
      a.click();
    };

    mediaRecorder.start(1000);
    isRecording = true;
    btnRecord.textContent = '⏹️ Parar Gravação';
    btnRecord.style.background = '#ff9800';
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btnRecord.textContent = '🔴 Iniciar Gravação de Tela';
    btnRecord.className = 'btn-record';
  }
});

window.electronAPI.onNewLog((log) => {
  const div = document.createElement('div');
  div.className = `log-item ${log.type || ''}`;
  div.innerHTML = `
    <small style="color:#aaa">${new Date(log.timestamp).toLocaleTimeString()}</small>
    <div>${log.message}</div>
  `;
  logsContainer.appendChild(div);
  logsContainer.scrollTop = logsContainer.scrollHeight;
});

btnClear.addEventListener('click', async () => {
  await window.electronAPI.clearLogs();
  logsContainer.innerHTML = '';
});
