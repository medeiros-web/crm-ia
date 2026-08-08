import { getCredential } from '../src/lib/credentials.js';
import { requireAdmin } from '../src/lib/admin-auth.js';

// Pareamento por QR Code da instancia Uazapi (ou qualquer bridge compativel
// com o mesmo contrato — ver supabase/functions/_shared/whatsapp/uazapi-provider.ts
// e a ponte self-hosted em VPS que fala esse mesmo protocolo).
// GET  aqui  → { configured, phase, qrcode, ignoreGroups } — poll do card em
//              /settings/credentials.
// POST aqui  → inicia o pareamento (POST /instance/init na bridge) e registra o
//              webhook de inbound automaticamente (mesmo endpoint usado por
//              api/uazapi-status.ts).
// POST {action:'logout'} → encerra a sessao (POST /instance/logout na bridge).
// POST {action:'set-ignore-groups', value:boolean} → liga/desliga o filtro de
//      mensagens de grupo na bridge (GET/POST /settings).

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  end: () => void;
};

function webhookUrl(): string | null {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/functions/v1/whatsapp-inbound?provider=uazapi` : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

    const auth = await requireAdmin(req.headers?.authorization ?? req.headers?.Authorization);
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, message: auth.message });
    }

    const serverUrl = ((await getCredential('uazapi_server_url')) ?? '').replace(/\/$/, '');
    const token = (await getCredential('uazapi_instance_token')) ?? '';

    if (!serverUrl || !token) {
      return res.status(200).json({
        success: true,
        configured: false,
        message: 'Preencha a Uazapi Server URL e o Instance Token abaixo antes de conectar.',
      });
    }

    const body = (req.body ?? {}) as { action?: string; value?: boolean };

    if (req.method === 'POST' && body.action === 'logout') {
      const r = await fetch(`${serverUrl}/instance/logout`, {
        method: 'POST',
        headers: { token },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return res.status(200).json({ success: false, message: `Falha ao desconectar (HTTP ${r.status}).` });
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'POST' && body.action === 'set-ignore-groups') {
      const r = await fetch(`${serverUrl}/settings`, {
        method: 'POST',
        headers: { token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignoreGroups: Boolean(body.value) }),
        signal: AbortSignal.timeout(10000),
      });
      const settingsBody = (await r.json().catch(() => ({}))) as { ignoreGroups?: boolean };
      if (!r.ok) {
        return res.status(200).json({ success: false, message: `Falha ao atualizar (HTTP ${r.status}).` });
      }
      return res.status(200).json({ success: true, ignoreGroups: Boolean(settingsBody.ignoreGroups) });
    }

    if (req.method === 'POST') {
      const initRes = await fetch(`${serverUrl}/instance/init`, {
        method: 'POST',
        headers: { token },
        signal: AbortSignal.timeout(15000),
      });
      if (!initRes.ok) {
        return res.status(200).json({
          success: false,
          message: `A bridge nao respondeu ao iniciar o pareamento (HTTP ${initRes.status}).`,
        });
      }

      const hook = webhookUrl();
      if (hook) {
        await fetch(`${serverUrl}/webhook`, {
          method: 'POST',
          headers: { token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: true,
            url: hook,
            events: ['messages', 'connection'],
            excludeMessages: ['wasSentByApi', 'isGroupYes'],
          }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => {
          // Nao bloqueia o pareamento — o card de status ainda permite registrar manualmente.
        });
      }

      return res.status(200).json({ success: true });
    }

    // GET — status do pareamento para o polling do card.
    const [qrRes, settingsRes] = await Promise.all([
      fetch(`${serverUrl}/instance/qrcode`, { headers: { token }, signal: AbortSignal.timeout(10000) }),
      fetch(`${serverUrl}/settings`, { headers: { token }, signal: AbortSignal.timeout(10000) }).catch(() => null),
    ]);
    const qrBody = (await qrRes.json().catch(() => ({}))) as { qrcode?: string | null; phase?: string };
    const settingsBody = (await settingsRes?.json().catch(() => ({}))) as { ignoreGroups?: boolean } | undefined;
    if (!qrRes.ok) {
      return res.status(200).json({
        success: true,
        configured: true,
        phase: 'error',
        qrcode: null,
        error: `Bridge respondeu ${qrRes.status}`,
      });
    }
    return res.status(200).json({
      success: true,
      configured: true,
      phase: qrBody.phase ?? 'idle',
      qrcode: qrBody.qrcode ?? null,
      ignoreGroups: settingsBody?.ignoreGroups ?? true,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Erro interno',
    });
  }
}
