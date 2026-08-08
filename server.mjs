// Express server — substitui as Vercel Serverless Functions no VPS
// Serve os arquivos estáticos do React E as rotas /api/*
import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3060;

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Adaptador: converte req/res Express → assinatura Vercel handler ──────────
function vercelAdapter(handler) {
  return (req, res) => handler(req, res);
}

// ── Rotas da API ─────────────────────────────────────────────────────────────
async function loadApis() {
  try {
    const { default: health } = await import('./api-compiled/health.js');
    app.all('/api/health', vercelAdapter(health));
  } catch (e) { console.warn('health handler failed:', e.message); }

  try {
    const { default: validate } = await import('./api-compiled/validate.js');
    app.all('/api/validate', vercelAdapter(validate));
  } catch (e) { console.warn('validate handler failed:', e.message); }

  try {
    const { default: credentials } = await import('./api-compiled/credentials.js');
    app.all('/api/credentials', vercelAdapter(credentials));
  } catch (e) { console.warn('credentials handler failed:', e.message); }

  try {
    const { default: bootstrap } = await import('./api-compiled/bootstrap.js');
    app.all('/api/bootstrap', vercelAdapter(bootstrap));
  } catch (e) { console.warn('bootstrap handler failed:', e.message); }

  try {
    const { default: bootstrapStatus } = await import('./api-compiled/bootstrap-status.js');
    app.all('/api/bootstrap-status', vercelAdapter(bootstrapStatus));
  } catch (e) { console.warn('bootstrap-status handler failed:', e.message); }

  try {
    const { default: zernioConnect } = await import('./api-compiled/zernio-connect.js');
    app.all('/api/zernio-connect', vercelAdapter(zernioConnect));
  } catch (e) { console.warn('zernio-connect handler failed:', e.message); }

  try {
    const { default: uazapiStatus } = await import('./api-compiled/uazapi-status.js');
    app.all('/api/uazapi-status', vercelAdapter(uazapiStatus));
  } catch (e) { console.warn('uazapi-status handler failed:', e.message); }

  try {
    const { default: uazapiQr } = await import('./api-compiled/uazapi-qr.js');
    app.all('/api/uazapi-qr', vercelAdapter(uazapiQr));
  } catch (e) { console.warn('uazapi-qr handler failed:', e.message); }

  // Fallback para rotas de API não encontradas
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // ── Arquivos estáticos do React ──────────────────────────────────────────
  app.use(express.static(join(__dirname, 'dist'), { index: false }));

  // SPA fallback — todas as outras rotas retornam o index.html
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`CRM IA rodando na porta ${PORT}`);
  });
}

loadApis().catch(console.error);
