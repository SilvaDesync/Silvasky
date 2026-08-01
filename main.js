const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

let mainWindow;
let sessionLogs = [];
let launchedProcess = null;
let activeDebuggerWs = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 650,
    title: "Error Collector Launcher",
    alwaysOnTop: true,
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

// 1. Lógica para Abrir o Programa/Atalho e injetar o coletor de erros
ipcMain.handle('launch-app-and-collect', async (event, appPath) => {
  try {
    const debugPort = 9222;

    // Executa o aplicativo/navegador inserindo a flag de depuração de forma transparente
    launchedProcess = spawn(appPath, [`--remote-debugging-port=${debugPort}`], {
      detached: true,
      stdio: 'ignore'
    });
    launchedProcess.unref();

    addLog({
      type: 'SYSTEM',
      timestamp: new Date().toISOString(),
      message: `🚀 Programa iniciado: ${path.basename(appPath)}`
    });

    // Inicia a tentativa de conexão com o console do app aberto
    connectToLaunchedApp(debugPort);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Seleção de arquivo via caixa de diálogo caso o usuário prefira clicar
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Executáveis e Atalhos', extensions: ['exe', 'lnk', 'app'] }
    ]
  });
  return result.filePaths[0] || null;
});

// 2. Conexão via WebSocket CDP no programa aberto
function connectToLaunchedApp(port, retries = 10) {
  if (retries === 0) return;

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
    
    if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
      addLog({
        type: 'CONSOLE_ERROR',
        timestamp: new Date().toISOString(),
        message: msg.params.message.text,
        url: msg.params.message.url || ''
      });
    }

    if (msg.method === 'Runtime.exceptionThrown') {
      addLog({
        type: 'CONSOLE_ERROR',
        timestamp: new Date().toISOString(),
        message: msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text
      });
    }
  });
}

ipcMain.handle('get-desktop-sources', async () => {
  return await desktopCapturer.getSources({ types: ['screen'] });
});

ipcMain.handle('clear-logs', () => {
  sessionLogs = [];
  return true;
});

app.whenReady().then(createWindow);
