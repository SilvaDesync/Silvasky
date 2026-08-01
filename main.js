const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const WebSocket = require('ws');

let mainWindow;
let sessionLogs = [];
let wss;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    title: "Error Collector Global",
    alwaysOnTop: true, // Fica flutuando por cima para você controlar a gravação
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  // Inicia Servidor WebSocket Local para receber erros do Chrome/Edge/Apps
  wss = new WebSocket.Server({ port: 8080 });

  wss.on('connection', (ws) => {
    addLog({
      type: 'SYSTEM',
      timestamp: new Date().toISOString(),
      message: '🔌 Nova página/navegador se conectou ao coletor!'
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        addLog(data);
      } catch (err) {
        console.error("Erro ao ler mensagem:", err);
      }
    });
  });
}

function addLog(logData) {
  sessionLogs.push(logData);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('new-log', logData);
  }
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
