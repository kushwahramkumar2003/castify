"use client";

import { useEffect, useState } from "react";
import { api, type StreamKey } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  RiKeyLine,
  RiAddLine,
  RiFileCopyLine,
  RiEyeLine,
  RiEyeOffLine,
  RiDeleteBinLine,
  RiRefreshLine,
  RiShieldLine,
  RiErrorWarningLine,
  RiInfoCardLine,
  RiCheckboxCircleLine,
  RiLoader4Line,
} from "react-icons/ri";

const GREEN = "#3ecf8e";
const AMBER = "#e5b83b";
const RTMP_SERVER = "rtmp://localhost:1935/live";

function KeyRow({ streamKey, onRevoke }: { streamKey: StreamKey; onRevoke: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(streamKey.key);
      setCopied(true);
      toast.success("Stream key copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }

  const maskedKey =
    streamKey.key.length > 12
      ? `${streamKey.key.slice(0, 6)}${"•".repeat(16)}${streamKey.key.slice(-4)}`
      : "••••••••••••";

  return (
    <div className="supabase-panel p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Badge className="text-[10px] font-semibold px-2.5 py-0.5 rounded border bg-emerald-500/8 text-emerald-400 border-emerald-500/20">
            {streamKey.label ?? "Unnamed Keyset"}
          </Badge>
          <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">
            {new Date(streamKey.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>

        <code
          className="block text-[11px] sm:text-xs font-mono break-all select-all rounded-md px-3 py-2.5"
          style={{
            background: "#121212",
            border: "1px solid var(--border)",
            color: visible ? "#ededed" : "#8a8a8a",
            letterSpacing: visible ? "normal" : "0.06em",
          }}
        >
          {visible ? streamKey.key : maskedKey}
        </code>

        {visible && (
          <div className="rounded-md px-2.5 py-1.5 text-[10px] font-mono break-all bg-emerald-500/5 border border-emerald-500/15 text-emerald-400/90">
            {RTMP_SERVER}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          className="btn-secondary-flat gap-1.5 text-xs h-9 px-3 flex-1 sm:flex-initial"
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <RiEyeOffLine className="size-4" /> : <RiEyeLine className="size-4" />}
          {visible ? "Hide" : "Reveal"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded hover:bg-emerald-500/10"
          onClick={handleCopy}
          title="Copy key"
          aria-label="Copy key"
        >
          {copied ? (
            <RiCheckboxCircleLine className="size-4 text-emerald-400" />
          ) : (
            <RiFileCopyLine className="size-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded hover:bg-destructive/10 text-[#8a8a8a] hover:text-destructive"
          onClick={() => onRevoke(streamKey.id)}
          title="Revoke key"
          aria-label="Revoke key"
        >
          <RiDeleteBinLine className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default function StreamKeysPage() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<StreamKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .getStreamKeys()
      .then((r) => setKeys(r.data))
      .catch(() => toast.error("Failed to load stream keys"))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await api.createStreamKey({ label: `Key ${keys.length + 1}` });
      setKeys((p) => [...p, res.data]);
      toast.success("New stream key generated");
    } catch (err: unknown) {
      toast.error(
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed"
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    const ok = await confirm({
      title: "Revoke this stream key?",
      description:
        "Active broadcasts using this key will disconnect. You will need a new key to go live again.",
      confirmLabel: "Revoke key",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await api.revokeStreamKey({ keyId });
      setKeys((p) => p.filter((k) => k.id !== keyId));
      toast.success("Stream key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  async function handleRotateAll() {
    const ok = await confirm({
      title: "Rotate all stream keys?",
      description:
        "This drops all active streaming inputs. Every previous key is invalidated and replaced.",
      confirmLabel: "Rotate all",
      cancelLabel: "Cancel",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const res = await api.regenerateStreamKey();
      setKeys([res.data]);
      toast.success("All previous keys rotated");
    } catch {
      toast.error("Failed to rotate keys");
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up min-w-0">
      <PageHeader
        title="Stream keys"
        description="Secrets for OBS and other encoders."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              className="btn-secondary-flat text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1"
              onClick={handleRotateAll}
              disabled={keys.length === 0}
              title="Rotate all keys"
            >
              <RiRefreshLine className="size-3.5" />
              <span className="page-action-label hidden sm:inline">Rotate all</span>
            </Button>
            <Button
              size="sm"
              className="btn-primary-flat gap-1.5"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <RiLoader4Line className="size-3.5 spin" />
              ) : (
                <RiAddLine className="size-3.5" />
              )}
              <span className="page-action-label">Generate</span>
            </Button>
          </>
        }
      />

      <div className="callout-warn">
        <RiShieldLine className="size-5 shrink-0 mt-0.5" style={{ color: AMBER }} />
        <div className="text-xs leading-relaxed min-w-0">
          <span className="font-bold block mb-0.5" style={{ color: AMBER }}>
            Credentials protection
          </span>
          <span className="text-muted-foreground">
            Anyone with these tokens can stream to your channel. Never share them publicly or
            commit them to source control.
          </span>
        </div>
      </div>

      <div className="supabase-panel p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <RiInfoCardLine className="size-4 text-emerald-400 shrink-0" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            OBS / Encoder target
          </h3>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {[
            { label: "Stream Server URL", value: RTMP_SERVER, copyable: true },
            {
              label: "Ingest Key",
              value: "Copy a key from the list below",
              copyable: false,
            },
          ].map((row) => (
            <div key={row.label} className="space-y-1.5 min-w-0">
              <span className="section-label font-mono">{row.label}</span>
              <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2.5 bg-[#121212] border border-border">
                <code className="text-[11px] sm:text-xs font-mono truncate text-foreground/80">
                  {row.value}
                </code>
                {row.copyable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(row.value);
                        toast.success("Server URL copied");
                      } catch {
                        toast.error("Could not copy");
                      }
                    }}
                    aria-label="Copy server URL"
                  >
                    <RiFileCopyLine className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="section-label flex items-center gap-2 px-0.5">
          <RiKeyLine className="size-3.5" style={{ color: GREEN }} />
          Active keyset tokens
          <Badge
            variant="secondary"
            className="rounded-full text-[9px] font-mono px-2 bg-[#1f1f1f]"
          >
            {keys.length}
          </Badge>
        </h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-24 rounded-lg animate-pulse bg-[#1a1a1a] border border-border"
              />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="supabase-panel empty-state">
            <div className="flex size-12 items-center justify-center rounded-md mb-4 bg-emerald-500/8 border border-emerald-500/20">
              <RiKeyLine className="size-5 text-emerald-400" />
            </div>
            <p className="text-sm font-bold">No active keys</p>
            <p className="text-xs text-muted-foreground mt-1 mb-5 max-w-xs">
              Create an ingest key to link OBS or another encoder.
            </p>
            <Button size="sm" className="btn-primary-flat px-4 h-9 text-xs" onClick={handleCreate}>
              <RiAddLine className="size-4 mr-1.5" /> Generate Key
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {keys.map((key) => (
              <KeyRow key={key.id} streamKey={key} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>

      {keys.length > 0 && (
        <div className="callout-danger flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-0.5 flex gap-3 min-w-0">
            <RiErrorWarningLine className="size-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-red-400">Danger zone</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Invalidate all ingest credentials. Active broadcasts will disconnect immediately.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="btn-secondary-flat text-destructive border-destructive/20 hover:bg-destructive/10 shrink-0 h-9 text-xs w-full sm:w-auto"
            onClick={handleRotateAll}
          >
            Rotate all keys
          </Button>
        </div>
      )}
    </div>
  );
}
