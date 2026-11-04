import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PORT = 5173
let server

// Chromium's animated wheel scrolling feels sluggish on Linux, and a software compositor makes it worse.
app.commandLine.appendSwitch('disable-smooth-scrolling')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
// On X11 + NVIDIA, EGL SwapBuffers blocks on vsync for 100ms+ a frame once the window settles; scrolling then stutters.
app.commandLine.appendSwitch('disable-gpu-vsync')

async function startServer() {
  // Dev: `npm run desktop:dev` already runs vite on PORT. Otherwise serve dist/ (with the /api/agent and /ollama middleware) ourselves.
  if (process.env.ELECTRON_DEV) return
  const { preview } = await import('vite')
  server = await preview({ root, configFile: path.join(root, 'vite.config.ts'), preview: { host: '127.0.0.1', port: PORT, strictPort: true, open: false } })
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, title: 'Local LLM', autoHideMenuBar: true, backgroundColor: '#09090b',
    webPreferences: { preload: path.join(root, 'electron/preload.cjs'), contextIsolation: true, sandbox: true },
  })
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  await win.loadURL(`http://127.0.0.1:${PORT}`)
}

ipcMain.handle('pick-folder', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const r = await dialog.showOpenDialog(win, { title: 'Choose project folder', properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await startServer()
  await createWindow()
  // The GPU process only reports its real status after the first window has rendered.
  setTimeout(() => {
    const g = app.getGPUFeatureStatus()
    console.log(`[gpu] compositing=${g.gpu_compositing} rasterization=${g.rasterization}`)
  }, 3000)
})
app.on('window-all-closed', async () => {
  await server?.close()
  app.quit()
})
