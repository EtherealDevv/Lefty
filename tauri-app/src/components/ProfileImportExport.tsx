import { useState } from "react";
import { Eye, Loader2, FileJson, Share2 } from "lucide-react";
import {
  applyImportedMerge,
  applyImportedReplace,
  createBackup,
  decodeShareCode,
  deleteBackup,
  getLocalProfiles,
  listBackups,
  restoreBackup,
  type ProfilesBackup,
  type Profile,
  type ProfilesMap,
} from "../lib/profilesIO";
import { resolveAccent } from "../theme/accent";

type Props = {
  /** Refresca la vista de perfiles de App.tsx tras importar. */
  onProfilesChanged?: (profiles: ProfilesMap, active: string) => void;
};

export default function ProfileImportExport({ onProfilesChanged }: Props) {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mergeMode, setMergeMode] = useState<"merge" | "replace">("merge");
  const [shareCode, setShareCode] = useState("");
  const [busyShare, setBusyShare] = useState(false);
  const [busyRestore, setBusyRestore] = useState<string | null>(null);
  const [backups, setBackups] = useState<ProfilesBackup[]>(() => listBackups());
  const [preview, setPreview] = useState<{ id: string; profile: Profile } | null>(null);
  const [localCount, setLocalCount] = useState(
    () => Object.keys(getLocalProfiles()).length
  );

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000);
  };

  const previewGames = preview
    ? new Set([...(preview.profile.autoApps ?? []), ...(preview.profile.playApps ?? [])]).size
    : 0;

  return (
    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
          <FileJson size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-on-surface">
            Import profile code
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-4">
        <span>On import:</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="profiles-merge"
            checked={mergeMode === "merge"}
            onChange={() => setMergeMode("merge")}
            className="accent-current"
          />
          Merge (safe)
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="profiles-merge"
            checked={mergeMode === "replace"}
            onChange={() => setMergeMode("replace")}
            className="accent-current"
          />
          Replace (overwrite)
        </label>
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-medium text-on-surface">Paste a share code</div>
        <textarea
          value={shareCode}
          onChange={(e) => { setShareCode(e.target.value); setPreview(null); }}
          rows={2}
          spellCheck={false}
          placeholder="Paste share code (LFT…)"
          aria-label="Share code"
          className="mt-1.5 w-full rounded-xl bg-surface-container-highest border border-outline-variant text-[11px] font-mono px-3 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors resize-none"
        />
        {!preview ? (
          <button
            onClick={() => {
              if (!shareCode.trim() || busyShare) return;
              setBusyShare(true);
              setMsg(null);
              try {
                setPreview(decodeShareCode(shareCode));
              } catch (e) {
                flash("err", e instanceof Error ? e.message : "Invalid share code.");
              } finally {
                setBusyShare(false);
              }
            }}
            disabled={!shareCode.trim() || busyShare}
            className="mt-2 w-full h-9 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[12px] font-medium flex items-center justify-center gap-1.5 hover:border-primary disabled:opacity-60 m3-pressable active:scale-[0.98]"
          >
            {busyShare ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            {busyShare ? "Reading…" : "Review share code"}
          </button>
        ) : (
          <div className="mt-2 rounded-xl bg-surface-container-highest border border-primary/50 px-3 py-2.5 animate-m3-fade-in">
            <div className="text-[12px] font-medium text-on-surface truncate">
              “{preview.profile.display_name}”
            </div>
            <div className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
              {preview.profile.mappings.length} mappings
              {previewGames > 0 ? ` · games: ${previewGames}` : ""}
              {preview.profile.accent ? ` · accent ${resolveAccent(preview.profile.accent).hex}` : ""}
              {preview.profile.disabled?.length ? ` · ${preview.profile.disabled.length} paused (arrive active)` : ""}
            </div>
            {mergeMode === "replace" && (
              <div className="text-[11px] font-medium text-on-surface mt-1.5">
                Replace will overwrite ALL {localCount} local profile{localCount === 1 ? "" : "s"}. A backup is saved first.
              </div>
            )}
            <div className="flex gap-2 mt-2.5">
              <button
                onClick={() => setPreview(null)}
                className="flex-1 h-9 rounded-full bg-surface-container-high border border-outline-variant text-on-surface text-[12px] font-medium hover:border-primary m3-pressable active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (busyShare) return;
                  setBusyShare(true);
                  setMsg(null);
                  try {
                    // Snapshot de seguridad antes de tocar nada.
                    const snap = createBackup(`pre-import (${mergeMode})`);
                    setBackups(listBackups());
                    const single: ProfilesMap = { [preview.id]: preview.profile };
                    const applied =
                      mergeMode === "merge" ? applyImportedMerge(single) : applyImportedReplace(single);
                    setLocalCount(Object.keys(applied.profiles).length);
                    onProfilesChanged?.(applied.profiles, applied.active);
                    setShareCode("");
                    setPreview(null);
                    flash("ok", `Imported "${applied.profiles[applied.active]?.display_name ?? preview.profile.display_name}" ✓${snap ? " (backup saved)" : ""}`);
                  } catch (e) {
                    flash("err", e instanceof Error ? e.message : "Invalid share code.");
                  } finally {
                    setBusyShare(false);
                  }
                }}
                disabled={busyShare}
                className="flex-1 h-9 rounded-full bg-primary text-on-primary text-[12px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 m3-pressable active:scale-[0.98]"
              >
                {busyShare ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                {busyShare ? "Importing…" : `Confirm ${mergeMode === "merge" ? "merge" : "replace"}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`mt-3 text-[11px] leading-relaxed rounded-xl border px-3 py-2 ${
            msg.kind === "ok"
              ? "bg-tertiary-container/40 border-outline-variant text-on-surface"
              : "bg-error-container/40 border-error/40 text-on-surface"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-outline-variant">
        <div className="text-[11px] font-medium text-on-surface">
          Automatic backups{backups.length > 0 ? ` (${backups.length})` : ""}
        </div>
        <p className="text-[11px] text-on-surface-variant mt-1">
          A snapshot is saved before every import or restore.
        </p>
        {backups.length === 0 ? (
          <p className="text-[11px] text-on-surface-variant mt-2 italic">No backups yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5 max-h-[148px] overflow-auto">
            {backups.map((b) => (
              <div key={b.stamp} className="flex items-center gap-2 rounded-xl bg-surface-container-highest border border-outline-variant px-3 py-2">
                <span className="flex-1 min-w-0 text-[11px] font-mono text-on-surface truncate" title={b.label}>
                  {b.label}
                </span>
                <button
                  onClick={() => {
                    if (busyRestore) return;
                    setBusyRestore(b.stamp);
                    try {
                      const r = restoreBackup(b.stamp);
                      setBackups(listBackups());
                      if (!r) {
                        flash("err", "Backup not found.");
                      } else {
                        setLocalCount(Object.keys(r.profiles).length);
                        onProfilesChanged?.(r.profiles, r.active);
                        flash("ok", "Backup restored ✓ (previous state kept as pre-restore)");
                      }
                    } finally {
                      setBusyRestore(null);
                    }
                  }}
                  disabled={busyRestore !== null}
                  className="h-7 px-3 rounded-full bg-surface-container-high border border-outline-variant text-on-surface text-[11px] font-medium hover:border-primary disabled:opacity-60 shrink-0 m3-pressable active:scale-[0.98]"
                >
                  {busyRestore === b.stamp ? "…" : "Restore"}
                </button>
                <button
                  onClick={() => setBackups(deleteBackup(b.stamp))}
                  aria-label={`Delete backup ${b.label}`}
                  title="Delete backup"
                  className="w-7 h-7 grid place-items-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
