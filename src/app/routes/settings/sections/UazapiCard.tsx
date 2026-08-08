import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Loader2, QrCode, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/providers/AuthProvider';

type UazapiStatus = {
  configured: boolean;
  connected?: boolean;
  logged_in?: boolean;
  instance_name?: string | null;
  webhook_url?: string | null;
  error?: string;
};

type QrPairingResponse = {
  success: boolean;
  configured: boolean;
  phase?: string;
  qrcode?: string | null;
  message?: string;
  error?: string;
};

// Card de saúde da conexão Uazapi (API não-oficial). O status vem de
// GET /instance/status via /api/uazapi-status (token nunca no browser).
// Inclui a URL do webhook a cadastrar na Uazapi + registro automático.
// `refreshKey` força re-fetch quando as credenciais Uazapi mudam abaixo.
export function UazapiCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<UazapiStatus | null>(null);
  const [registering, setRegistering] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/uazapi-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = (await res.json()) as UazapiStatus & { success?: boolean };
      if (res.ok) setStatus(body);
    } catch {
      // status é informativo
    }
  }, [session]);

  useEffect(() => {
    void load();
    stopPolling();
    setQrImage(null);
  }, [load, refreshKey, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const pollQrCode = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (!session) return;
      try {
        const res = await fetch('/api/uazapi-qr', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const body = (await res.json()) as QrPairingResponse;
        if (!res.ok || !body.success) return;
        if (body.phase === 'connected') {
          stopPolling();
          setQrImage(null);
          setPairing(false);
          toast.success('WhatsApp conectado!');
          void load();
          return;
        }
        setQrImage(body.qrcode ?? null);
      } catch {
        // poll seguinte tenta de novo
      }
    }, 3000);
  }, [session, stopPolling, load]);

  const startPairing = async () => {
    if (!session) return;
    setPairing(true);
    try {
      const res = await fetch('/api/uazapi-qr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = (await res.json()) as QrPairingResponse;
      if (!res.ok || !body.success) {
        throw new Error(body.message ?? 'Falha ao iniciar o pareamento.');
      }
      pollQrCode();
    } catch (err) {
      setPairing(false);
      toast.error('Falha ao conectar', {
        description: err instanceof Error ? err.message : 'Erro interno',
      });
    }
  };

  const disconnect = async () => {
    if (!session) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/uazapi-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'logout' }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message ?? 'Falha ao desconectar.');
      toast.success('WhatsApp desconectado.');
      stopPolling();
      setQrImage(null);
      await load();
    } catch (err) {
      toast.error('Falha ao desconectar', {
        description: err instanceof Error ? err.message : 'Erro interno',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const registerWebhook = async () => {
    setRegistering(true);
    try {
      const res = await fetch('/api/uazapi-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message ?? 'Falha ao registrar.');
      toast.success('Webhook registrado na Uazapi.');
    } catch (err) {
      toast.error('Falha ao registrar o webhook', {
        description: err instanceof Error ? err.message : 'Erro interno',
      });
    } finally {
      setRegistering(false);
    }
  };

  const copyHook = async () => {
    if (!status?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(status.webhook_url);
      toast.success('URL do webhook copiada.');
    } catch {
      toast.error('Não foi possível copiar — copie manualmente.');
    }
  };

  return (
    <div className="rounded-xl border border-[rgba(59,130,246,0.15)] bg-white/[0.02] p-5 backdrop-blur-[40px]">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)]">
          <Smartphone className="h-5 w-5 text-[#F59E0B]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#94A3B8]">
              WhatsApp via Uazapi
            </span>
            {status === null ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-text-secondary)]" />
            ) : !status.configured ? (
              <span className="rounded-full bg-[rgba(148,163,184,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--color-text-secondary)]">
                Não configurado
              </span>
            ) : (
              <span
                className={[
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]',
                  status.connected
                    ? 'bg-[rgba(16,185,129,0.12)] text-[#10B981]'
                    : 'bg-[rgba(239,68,68,0.12)] text-[#EF4444]',
                ].join(' ')}
              >
                {status.connected ? 'Conectado' : 'Não conectado'}
              </span>
            )}
          </div>

          {status?.configured ? (
            <>
              {status.instance_name ? (
                <div className="mt-1 text-lg font-semibold text-[#F8FAFC]">{status.instance_name}</div>
              ) : null}
              {status.error ? (
                <p className="mt-1 text-sm text-[#EF4444]">{status.error}</p>
              ) : null}

              {!status.connected ? (
                <div className="mt-3 space-y-3">
                  {qrImage ? (
                    <div className="flex flex-col items-start gap-2">
                      <img
                        src={qrImage}
                        alt="QR Code para conectar o WhatsApp"
                        className="h-56 w-56 rounded-lg border border-[rgba(59,130,246,0.2)] bg-white p-2"
                      />
                      <p className="text-[13px] text-[var(--color-text-secondary)]">
                        Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho, e
                        escaneie o código acima. Ele expira em alguns segundos e é renovado
                        automaticamente.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => void startPairing()}
                      disabled={pairing}
                      className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {pairing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4" />
                      )}
                      {pairing ? 'Gerando QR Code…' : 'Conectar via QR Code'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => void disconnect()}
                  disabled={disconnecting}
                  className="mt-3 rounded-lg border border-[rgba(239,68,68,0.3)] px-4 py-2 text-sm font-semibold text-[#EF4444] transition hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-50"
                >
                  {disconnecting ? 'Desconectando…' : 'Desconectar WhatsApp'}
                </button>
              )}

              {status.webhook_url ? (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Webhook para receber mensagens (cadastre na Uazapi)
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] px-3 py-2 text-xs text-[var(--color-text-primary)]">
                      {status.webhook_url}
                    </code>
                    <button
                      onClick={copyHook}
                      aria-label="Copiar URL do webhook"
                      className="rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] p-2 text-[var(--color-text-secondary)] transition hover:border-[var(--accent-primary)] hover:text-[var(--color-text-primary)]"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={registerWebhook}
                    disabled={registering}
                    className="rounded-lg bg-gradient-to-br from-[#1E3A8A] to-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {registering ? 'Registrando…' : 'Registrar webhook automaticamente'}
                  </button>
                </div>
              ) : null}
            </>
          ) : status !== null ? (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Preencha a Uazapi Server URL e o Instance Token nos campos abaixo para ativar.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
