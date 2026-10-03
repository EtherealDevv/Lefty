import { useRef, useState } from "react";
import { Download, Upload, Loader2, FileJson } from "lucide-react";
import {
  exportProfilesToFile,
  parseProfilesFile,
  applyImportedMerge,
  applyImportedReplace,
  getLocalProfiles,
  type ProfilesMap,
} from "../lib/profilesIO";

type Props = {
  /** Refresca la vista de perfiles de App.tsx tras importar. */
  onProfilesChanged?: (profiles: ProfilesMap, active: string) => void;
};

export default function ProfileImportExport({ onProfilesChanged }: Props) {
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [mergeMode, setMergeMode] = useState<"merge" | "replace">("merge");
  const [localCount, setLocalCount] = useState(
    () => Object.keys(getLocalProfiles()).length
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000);
  };

  const handleExport = () => {
    setBusy("export");
    setMsg(null);
    try {
      const filename = exportProfilesToFile();
      flash("ok", `Exported ${localCount} profile(s) → ${filename}`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (mergeMode === "replace") {
      if (
        !window.confirm(
          "Replace ALL local profiles with the imported file? This cannot be undone."
        )
      )
        return;
    }
    setBusy("import");
    setMsg(null);
    try {
      const imported = await parseProfilesFile(file);
      const applied =
        mergeMode === "merge"
          ? applyImportedMerge(imported)
          : applyImportedReplace(imported);
      setLocalCount(Object.keys(applied.profiles).length);
      onProfilesChanged?.(applied.profiles, applied.active);
      const n = Object.keys(imported).length;
      flash(
        "ok",
        mergeMode === "merge"
          ? `Imported & merged ✓ (${n} profile(s) from file)`
          : `Replaced from file ✓ (${n} profile(s))`
      );
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-xl bg-surface-container-high border border-outline-variant p-4">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-[12px] bg-secondary-container text-on-secondary-container grid place-items-center flex-shrink-0">
          <FileJson size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-on-surface">
            Import / Export profiles
          </div>
          <div className="text-[11px] leading-relaxed text-on-surface-variant mt-1">
            Save your layouts to a <span className="font-mono bg-surface-container-highest border border-outline-variant px-1.5 py-0.5 rounded-full">.json</span> file
            to back them up or move them to another PC. {localCount} profile(s) saved locally.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          onClick={handleExport}
          disabled={busy !== null || localCount === 0}
          className="h-10 rounded-full bg-primary text-on-primary text-[12px] font-medium flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-60 m3-pressable active:scale-[0.98]"
        >
          {busy === "export" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {busy === "export" ? "Exporting…" : "Export to file"}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="h-10 rounded-full bg-surface-container-highest border border-outline-variant text-on-surface text-[12px] font-medium flex items-center justify-center gap-1.5 hover:bg-surface-container-high disabled:opacity-60 m3-pressable active:scale-[0.98]"
        >
          {busy === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {busy === "import" ? "Importing…" : "Import from file"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-3">
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
