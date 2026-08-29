import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, Unplug } from "lucide-react";
import type { PartnerIntegration } from "../lib/types";
import {
  activateIntegration,
  deactivateIntegration,
  getIntegrationStatus,
} from "../lib/adspotBridge";
import { defaultIntegration } from "../lib/integrationState";

export interface IntegrateAdSpotButtonProps {
  partnerId: string;
  onStatusChange?: (integration: PartnerIntegration) => void;
}

export function IntegrateAdSpotButton({ partnerId, onStatusChange }: IntegrateAdSpotButtonProps) {
  const [integration, setIntegration] = useState<PartnerIntegration>(() =>
    defaultIntegration(partnerId),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = useCallback(
    (next: PartnerIntegration) => {
      setIntegration(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const remote = await getIntegrationStatus(partnerId);
        if (!cancelled) apply(remote);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load integration status");
          apply(defaultIntegration(partnerId));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId, apply]);

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await activateIntegration(partnerId);
      apply(next);
      setConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await deactivateIntegration(partnerId);
      apply(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deactivation failed");
    } finally {
      setBusy(false);
    }
  };

  const copyEmbed = async () => {
    const tag = integration.embedScript ?? integration.embedConfig?.scriptTag;
    if (!tag) return;
    await navigator.clipboard.writeText(tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isActive = integration.adspotLinked && integration.status === "active";

  if (loading) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 p-6 flex items-center gap-3 text-slate-600"
        data-testid="integrate-adspot-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking AdSpot link status…
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-6 transition-colors ${
        isActive
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-slate-200 bg-slate-50"
      }`}
      data-testid="integrate-adspot-panel"
      data-integration-status={integration.status}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link2 className={`h-5 w-5 ${isActive ? "text-emerald-600" : "text-slate-400"}`} />
            <h3 className="text-lg font-semibold text-slate-900">AdSpot integration</h3>
            {isActive ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                data-testid="integration-badge-active"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                AdSpot Connected
              </span>
            ) : (
              <span
                className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                data-testid="integration-badge-inactive"
              >
                Not connected
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 max-w-xl">
            {isActive
              ? "Campaigns route through AdSpot. Embed the tag below on your site to serve review slots."
              : "Manage your outlet profile and inventory without touching live AdSpot. Connect when you are ready to monetise review slots."}
          </p>
        </div>

        {!isActive ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#ea580c] disabled:opacity-60"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            data-testid="integrate-adspot-activate"
          >
            Integrate with AdSpot
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={handleDeactivate}
            disabled={busy}
            data-testid="integrate-adspot-disconnect"
          >
            <Unplug className="h-4 w-4" />
            Disconnect
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert" data-testid="integrate-adspot-error">
          {error}
        </p>
      )}

      {isActive && (
        <div className="mt-5 space-y-3" data-testid="integration-active-details">
          {integration.apiKey && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">API key</p>
              <code className="block rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs break-all">
                {integration.apiKey}
              </code>
            </div>
          )}
          {integration.webhookUrl && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">Webhook URL</p>
              <code className="block rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs break-all">
                {integration.webhookUrl}
              </code>
            </div>
          )}
          {(integration.embedScript ?? integration.embedConfig?.scriptTag) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Embed tag</p>
                <button
                  type="button"
                  onClick={copyEmbed}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#f97316] hover:underline"
                  data-testid="copy-embed-tag"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <code className="block rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs break-all whitespace-pre-wrap">
                {integration.embedScript ?? integration.embedConfig?.scriptTag}
              </code>
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="integrate-confirm-modal"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-slate-900 mb-2">Connect to AdSpot?</h4>
            <p className="text-sm text-slate-600 mb-6">
              This enables campaign routing, issues an API key, and generates your embed tag. You can disconnect later.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60 inline-flex items-center gap-2"
                onClick={handleActivate}
                disabled={busy}
                data-testid="integrate-confirm-activate"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Activate integration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
