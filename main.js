const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

let mainWindow;
let sessionLogs = [];
let activeDebuggerWs = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    title: "Error Collector Automático",
    alwaysOnTop: true, // Fica flutuando no canto da tela para facilitar
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  
  // Inicia o monitoramento de conexões ativas nos navegadores
  autoConnectToActiveBrowser();
}

function addLog(logData) {
  sessionLogs.push(logData);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-log', logData);
  }
}

// Escuta portas de depuração padrão do Chrome/Edge (9222) automaticamente
function autoConnectToActiveBrowser() {
  setInterval(() => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          // Pega a aba/página que está visível/focada no momento
          const activePage = targets.find(t => t.type === 'page');

          if (activePage && activePage.webSocketDebuggerUrl) {
            connectCDP(activePage.webSocketDebuggerUrl, activePage.title, activePage.url);
          }
        } catch (e) {}
      });
    }).on('error', () => {
      // Navegador não está com porta CDP aberta ainda
    });
  }, 2000); // Verifica a cada 2 segundos a troca de janela/página
}

function connectCDP(wsUrl, title, url) {
  if (activeDebuggerWs && activeDebuggerWs.url === wsUrl) return; // Já conectado

  if (activeDebuggerWs) activeDebuggerWs.close();

  activeDebuggerWs = new WebSocket(wsUrl);

  activeDebuggerWs.on('open', () => {
    // Ativa captura de Console e Exceções na página detectada
    activeDebuggerWs.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
    activeDebuggerWs.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    
    addLog({
      type: 'NAVIGATION',
      timestamp: new Date().toISOString(),
      message: `🎯 Coletando automaticamente de: [${title}] (${url})`
    });
  });

  activeDebuggerWs.on('message', (messageStr) => {
    const msg = JSON.parse(messageStr);
    
    // Captura erros de console (console.error)
    if (msg.method === 'Console.messageAdded' && msg.params.message.level === 'error') {
      addLog({
        type: 'CONSOLE_ERROR',
        timestamp: new Date().toISOString(),
        message: msg.params.message.text,
        url: msg.params.message.url
      });
    }

    // Captura erros JS não tratados (Uncaught exceptions)
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
