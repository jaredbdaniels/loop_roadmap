"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useLoop } from "./store";

interface McpKey {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Self-serve personal MCP keys: mint, name, and revoke a key that lets an
// MCP client (Claude Desktop, Claude Code, Cowork) read the live roadmap as
// *you* — see loop-app/src/lib/mcp/keys.ts and ../../../mcp-server/README.md
// for the client-side setup. Read-only by construction on the server side;
// this UI never claims otherwise.
export function McpKeysModal() {
  const { mcpKeysOpen, setMcpKeysOpen, toast } = useLoop();
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-keys", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { keys: McpKey[] };
      setKeys(data.keys);
    } catch {
      toast("Could not load your MCP keys.", true);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (mcpKeysOpen) load();
    else setRevealed(null);
  }, [mcpKeysOpen, load]);

  if (!mcpKeysOpen) return null;

  const close = () => setMcpKeysOpen(false);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      setRevealed(data.key);
      setName("");
      await load();
    } catch {
      toast("Could not create a key.", true);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mcp-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Key revoked.");
      await load();
    } catch {
      toast("Could not revoke the key.", true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Key copied to clipboard.");
    } catch {
      toast("Could not copy — select and copy manually.", true);
    }
  };

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>MCP keys</h2>
          <button className="modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="helper" style={{ marginBottom: 16 }}>
            A personal key lets an MCP client (Claude Desktop, Claude Code,
            Cowork) read the live roadmap as you — read-only, no write access.
            Each key is tied to your account, so reads are attributed to you,
            not a shared secret.
          </p>

          {revealed && (
            <div className="field">
              <label>Your new key — copy it now, it won&apos;t be shown again</label>
              <div className="share-link-row">
                <input
                  type="text"
                  readOnly
                  value={revealed}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="cm-button--outlined cm-button"
                  onClick={() => copy(revealed)}
                >
                  <Copy size={15} strokeWidth={2.2} />
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label>Create a new key</label>
            <div className="field-row">
              <input
                type="text"
                placeholder="Label (e.g. Claude Desktop)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button className="cm-button" onClick={create} disabled={busy}>
                <KeyRound size={15} strokeWidth={2.2} />
                Create key
              </button>
            </div>
          </div>

          <div className="settings-divider" />

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Your keys</label>
            {loading ? (
              <p className="helper">Loading…</p>
            ) : active.length === 0 ? (
              <p className="helper">No active keys yet.</p>
            ) : (
              active.map((k) => (
                <div
                  key={k.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--cm-border)",
                    gap: 12,
                  }}
                >
                  <div>
                    <div>{k.name || "Untitled key"}</div>
                    <div className="helper" style={{ margin: 0 }}>
                      {k.keyPrefix}… · created {formatDate(k.createdAt)} · last
                      used {formatDate(k.lastUsedAt)}
                    </div>
                  </div>
                  <button
                    className="link-button"
                    onClick={() => revoke(k.id)}
                    disabled={busy}
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="modal-actions">
          <span className="helper">
            See mcp-server/README.md for how to register a key with your MCP
            client.
          </span>
          <button className="cm-button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
