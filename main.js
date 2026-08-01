const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

let mainWindow;
let sessionLogs = [];
let activeDebuggerWs = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 650,
    title: "Error Collector Launcher",
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

function addLog(logData) {
  sessionLogs.push(logData);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-log', logData);
  }
}

// 1. Executa Atalhos (.lnk), Executáveis (.exe) e injeta a porta de depuração do Windows
ipcMain.handle('launch-app-and-collect', async (event, appPath) => {
  return new Promise((resolve) => {
    const debugPort = 9222;
    const formattedPath = `"${appPath}"`;
    const command = `cmd.exe /c start "" ${formattedPath} --remote-debugging-port=${debugPort}`;

    exec(command, (error) => {
      if (error) {
        console.error("Erro ao abrir programa:", error);
        addLog({
          type: 'SYSTEM',
          timestamp: new Date().toISOString(),
          message: `❌ Erro ao abrir: ${error.message}`
        });
        resolve({ success: false, error: error.message });
      } else {
        addLog({
          type: 'SYSTEM',
          timestamp: new Date().toISOString(),
          message: `🚀 Programa iniciado: ${path.basename(appPath)}`
        });
        
        // Tenta conectar à escuta de logs do app aberto
        connectToLaunchedApp(debugPort);
        resolve({ success: true });
      }
    });
  });
});

// Seleção manual de arquivo (Caixa de Diálogo)
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Executáveis e Atalhos', extensions: ['exe', 'lnk', 'app'] }
    ]
  });
  return result.filePaths[0] || null;
});

// 2. Conecta automaticamente ao Console do Programa aberto via WebSocket (CDP)
function connectToLaunchedApp(port, retries = 10) {
  if (retries === 0) {
    addLog({
      type: 'SYSTEM',
      timestamp: new Date().toISOString(),
      message: '⚠️ Programa aberto, mas sem suporte a depuração remota (porta 9222).'
    });
    return;
  }

  setTimeout(() => {
    http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const activeTarget = targets.find(t => t.type === 'page' || t.type === 'app');

          if (activeTarget && activeTarget.webSocketDebuggerUrl) {
            startCDPListener(activeTarget.webSocketDebuggerUrl);
          } else {
            connectToLaunchedApp(port, retries - 1);
          }
        } catch (e) {
          connectToLaunchedApp(port, retries - 1);
        }
      });
    }).on('error', () => {
      connectToLaunchedApp(port, retries - 1);
    });
  }, 1000);
}

function startCDPListener(wsUrl) {
  if (activeDebuggerWs) activeDebuggerWs.close();

  activeDebuggerWs = new WebSocket(wsUrl);

  activeDebuggerWs.on('open', () => {
    activeDebuggerWs.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
    activeDebuggerWs.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    
    addLog({
      type: 'NAVIGATION',
      timestamp: new Date().toISOString(),
      message: '✅ Conectado com sucesso ao console do programa!'
    });
  });

  activeDebuggerWs.on('message', (messageStr) => {
    const msg = JSON.parse(messageStr);
    
    // Erros do Console (console.error)
    if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
      addLog({
        type: 'CONSOLE_ERROR',
        timestamp: new Date().toISOString(),
        message: msg.params.message.text,
        url: msg.params.message.url || ''
      });
    }

    // Exceções não tratadas do JavaScript
    if (msg.method === 'Runtime.exceptionThrown') {
      addLog({
        type: 'CONSOLE_ERROR',
        timestamp: new Date().toISOString(),
        message: msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text
      });
    }
  });
}

// Pega a tela para gravação de vídeo
ipcMain.handle('get-desktop-sources', async () => {
  return await desktopCapturer.getSources({ types: ['screen'] });
});

// Limpa o histórico de logs
ipcMain.handle('clear-logs', () => {
  sessionLogs = [];
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
