import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import { DebateStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');
const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');
const DATA_FILE = path.join(SERVER_ROOT, 'data', 'state.json');
const CLIENT_DIST = path.join(PROJECT_ROOT, 'client', 'dist');
const PORT = Number(process.env.PORT) || 4000;

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

const store = new DebateStore({ file: DATA_FILE });
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  serveClient: false,
  pingInterval: 15000,
  pingTimeout: 20000,
});

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

/* --------------------------------- uploads -------------------------------- */

const ALLOWED_EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_EXTENSIONS[file.mimetype] || '.img';
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `flyer-${suffix}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXTENSIONS[file.mimetype]) {
      cb(new Error('Formato no permitido. Usa PNG, JPG, WEBP, GIF o AVIF.'));
      return;
    }
    cb(null, true);
  },
});

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    store.setFlyer(url);
    res.json({ ok: true, url });
  });
});

/* ------------------------------ audio uploads ----------------------------- */

const AUDIO_EXTENSIONS = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const AUDIO_ALLOWED_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.mp4',
  '.wav',
  '.ogg',
  '.aac',
  '.weba',
  '.webm',
]);

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const originalExt = path.extname(file.originalname || '').toLowerCase();
      const ext =
        AUDIO_EXTENSIONS[file.mimetype] ||
        (AUDIO_ALLOWED_EXTENSIONS.has(originalExt) ? originalExt : '.mp4');
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `audio-${suffix}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mimeOk =
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/mp4' ||
      file.mimetype === 'video/webm';
    if (!mimeOk && !AUDIO_ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error('Formato no permitido. Usa MP3, M4A, MP4, WAV, OGG o AAC.'));
      return;
    }
    cb(null, true);
  },
});

function decodeUploadName(value) {
  const text = String(value || 'Audio');
  try {
    const decoded = Buffer.from(text, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? text : decoded;
  } catch {
    return text;
  }
}

app.post('/api/audio', (req, res) => {
  audioUpload.single('file')(req, res, (error) => {
    if (error) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'No se recibió ningún archivo.' });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    const name = decodeUploadName(req.file.originalname)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160) || 'Audio';
    store.setAudio(url, name);
    res.json({ ok: true, url, name });
  });
});

app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '1h',
    fallthrough: true,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/state', (_req, res) => {
  res.json(store.snapshot());
});

/* -------------------------------- frontend -------------------------------- */

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

/* -------------------------------- realtime -------------------------------- */

const broadcast = (snapshot) => io.emit('state', snapshot);

store.subscribe(broadcast);

// Re-sincroniza el reloj de las pantallas cada 10s para evitar derivas.
setInterval(() => {
  io.emit('state', store.snapshot());
}, 10_000).unref();

const broadcastClients = () => {
  const count = io.engine.clientsCount;
  store.setClients(count);
  io.emit('clients', count);
};

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error) => ({ ok: false, error });

function handle(socket, event, fn) {
  socket.on(event, (payload, ack) => {
    try {
      const result = fn(payload ?? {});
      if (typeof ack === 'function') ack(ok({ state: result }));
    } catch (error) {
      console.error(`[socket] ${event}:`, error);
      if (typeof ack === 'function') ack(fail(error.message || 'Error inesperado'));
    }
  });
}

io.on('connection', (socket) => {
  broadcastClients();
  socket.emit('state', store.snapshot());

  handle(socket, 'config:update', (payload) => store.applyConfig(payload));
  handle(socket, 'timer:start', () => store.start());
  handle(socket, 'timer:pause', () => store.pause());
  handle(socket, 'timer:reset', () => store.reset());
  handle(socket, 'timer:add', (payload) => store.addTime(Number(payload.seconds) * 1000));
  handle(socket, 'view:set', (payload) => store.setView(payload.view));
  handle(socket, 'flyer:set', (payload) => store.setFlyer(payload.url, { show: Boolean(payload.show) }));
  handle(socket, 'audio:set', (payload) => store.setAudio(payload.url, payload.name));

  socket.on('disconnect', () => {
    broadcastClients();
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  DEBATE TIMER · servidor en marcha');
  console.log(`  Timer:    http://localhost:${PORT}/timer`);
  console.log(`  Control:  http://localhost:${PORT}/control`);
  console.log('');
});

function shutdown() {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
