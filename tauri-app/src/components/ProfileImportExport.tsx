import { useState } from "react";
import { Loader2, FileJson, Share2 } from "lucide-react";
import {
  applyImportedMerge,
  applyImportedReplace,
  decodeShareCode,
  getLocalProfiles,
  type ProfilesMap,
} from "../lib/profilesIO";

type Props = {
  /** Refresca la vista de perfiles de App.tsx tras importar. */
  onProfilesChanged?: (profiles: ProfilesMap, active: string) => void;
};

export default function ProfileImportExport({ onProfilesChanged }: Props) {
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mergeMode, setMergeMode] = useState<"merge" | "replace">("merge");
  const [shareCode, setShareCode] = useState("");
  const [busyShare, setBusyShare] = useState(false);
  const [localCount, setLocalCount] = useState(
    () => Object.keys(getLocalProfiles()).length
  );

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000);
  };

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
          onChange={(e) => setShareCode(e.target.value)}
          rows={2}
          spellCheck={false}
          placeholder="Paste share code (LFT…)"
          aria-label="Share code"
          className="mt-1.5 w-full rounded-xl bg-surface-container-highest border border-outline-variant text-[11px] font-mono px-3 py-2 text-on-surface focus:outline-none focus:border-primary transition-colors resize-none"
        />
        <button
          onClick={async () => {
            if (!shareCode.trim() || busyShare) return;
            if (
              mergeMode === "replace" &&
              !window.confirm("Replace ALL local profiles with this share code? This cannot be undone.")
            )
              return;
            setBusyShare(true);
            setMsg(null);
            try {
              const decoded = decodeShareCode(shareCode);
              const single: ProfilesMap = { [decoded.id]: decoded.profile };
              const applied =
                mergeMode === "merge" ? applyImportedMerge(single) : applyImportedReplace(single);
              setLocalCount(Object.keys(applied.profiles).length);
              onProfilesChanged?.(applied.profiles, applied.active);
              setShareCode("");
              flash("ok", `Imported "${decoded.profile.display_name}" from share code ✓`);
            } catch (e) {
              flash("err", e instanceof Error ? e.message : "Invalid share code.");
            } finally {
              setBusyShare(false);
            }
          }}
          disabled={!shareCode.trim() || busyShare}
          className="mt-2 w-full h-9 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[12px] font-medium flex items-center justify-center gap-1.5 hover:border-primary disabled:opacity-60 m3-pressable active:scale-[0.98]"
        >
          {busyShare ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
          {busyShare ? "Importing…" : "Import share code"}
        </button>
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
    </div>
  );
}
