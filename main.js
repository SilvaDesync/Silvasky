const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');
const WebSocket = require('ws');

let mainWindow;
let sessionLogs = [];
let externalAppWs = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Error Collector Desktop & Screen Recorder",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    }
  });

  mainWindow.loadFile('index.html');

  // Configura interceptação de tráfego de rede para logs HTTP
  const filter = { urls: ['<all_urls>'] };
  
  session.defaultSession.webRequest.onCompleted(filter, (details) => {
    if (details.statusCode >= 400) {
      addLog({
        type: 'HTTP_ERROR',
        timestamp: new Date().toISOString(),
        url: details.url,
        method: details.method,
        statusCode: details.statusCode
      });
    }
  });

  session.defaultSession.webRequest.onErrorOccurred(filter, (details) => {
    addLog({
      type: 'NETWORK_ERROR',
      timestamp: new Date().toISOString(),
      url: details.url,
      error: details.error
    });
  });
}

function addLog(logData) {
  sessionLogs.push(logData);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-log', logData);
  }
}

// IPC Handlers
ipcMain.handle('get-desktop-sources', async () => {
  return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

ipcMain.handle('get-logs', () => {
  return sessionLogs;
});

ipcMain.handle('clear-logs', () => {
  sessionLogs = [];
  return true;
});

ipcMain.on('log-entry', (event, logData) => {
  addLog(logData);
});

// Conexão via Remote Debugging Protocol (Porta 9222) para apps como Gestor Multipedidos
ipcMain.handle('connect-external-app', async (event, port = 9222) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await response.json();
    const pageTarget = targets.find(t => t.type === 'page' || t.type === 'app');

    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
      return { success: false, message: 'Nenhum app com porta de depuração encontrada.' };
    }

    if (externalAppWs) {
      externalAppWs.close();
    }

    externalAppWs = new WebSocket(pageTarget.webSocketDebuggerUrl);

    externalAppWs.on('open', () => {
      externalAppWs.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
      externalAppWs.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
      addLog({
        type: 'SYSTEM',
        timestamp: new Date().toISOString(),
        message: `Conectado com sucesso ao App Externo na porta ${port}`
      });
    });

    externalAppWs.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Console.messageAdded') {
        const { level, text, url, line } = msg.params.message;
        addLog({
          type: 'EXTERNAL_APP_CONSOLE',
          level: level,
          message: text,
          url: url || 'App Local',
          line: line || 0,
          timestamp: new Date().toISOString()
        });
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        addLog({
          type: 'EXTERNAL_APP_CONSOLE',
          level: msg.params.type,
          message: text,
          timestamp: new Date().toISOString()
        });
      }
    });

    externalAppWs.on('error', (err) => {
      addLog({
        type: 'EXTERNAL_APP_ERROR',
        message: `Erro no WebSocket do App Externo: ${err.message}`,
        timestamp: new Date().toISOString()
      });
    });

    return { success: true, message: `Conectado ao app: ${pageTarget.title || 'App Externo'}` };
  } catch (error) {
    return { success: false, message: `Erro ao conectar: ${error.message}` };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
