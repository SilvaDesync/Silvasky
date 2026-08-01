let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let micEnabled = true;

const btnRecord = document.getElementById('btn-record');
const btnMic = document.getElementById('btn-mic');
const logsContainer = document.getElementById('logs');
const btnClear = document.getElementById('btn-clear');

btnMic.addEventListener('click', () => {
  micEnabled = !micEnabled;
  btnMic.textContent = micEnabled ? '🎤 Microfone: ON' : '🎙️ Microfone: OFF';
  btnMic.className = micEnabled ? 'btn-mic' : '';
});

btnRecord.addEventListener('click', async () => {
  if (!isRecording) {
    // Pega a Tela Inteira do Windows
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

    if (micEnabled) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (e) {
        console.warn("Microfone não encontrado:", e);
      }
    }

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
      a.download = `gravacao_tela_global_${Date.now()}.webm`;
      a.click();
    };

    mediaRecorder.start(1000);
    isRecording = true;
    btnRecord.textContent = '⏹️ Parar e Salvar Gravação';
    btnRecord.style.background = '#ff9800';
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btnRecord.textContent = 'Iniciar Gravação Global';
    btnRecord.className = 'btn-record';
  }
});

window.electronAPI.onNewLog((log) => {
  const div = document.createElement('div');
  div.className = `log-item ${log.type || ''}`;
  div.innerHTML = `
    <small style="color:#aaa">${new Date(log.timestamp).toLocaleTimeString()}</small>
    <div><b>[${log.page || 'Sistema'}]</b> ${log.message}</div>
  `;
  logsContainer.appendChild(div);
  logsContainer.scrollTop = logsContainer.scrollHeight;
});

btnClear.addEventListener('click', async () => {
  await window.electronAPI.clearLogs();
  logsContainer.innerHTML = '';
});
