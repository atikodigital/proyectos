import { useState } from "react";
import { type ContentItem, approveContent, scheduleContent } from "../api";
import { statusMeta } from "../lib/status";

export function ContentDetail({
  item, onClose, onChanged,
}: {
  item: ContentItem; onClose: () => void; onChanged: () => void;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = statusMeta(item.status);
  const isVideo = item.format === "reel";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end z-20" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0e1729] border-l border-slate-800 h-full p-5 overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <span className={"text-xs px-2.5 py-1 rounded-full " + m.chip}>● {m.label}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        {item.mediaUrl && (isVideo ? (
          <video src={item.mediaUrl} controls className="w-full rounded-xl bg-black mb-3" />
        ) : (
          <img src={item.mediaUrl} className="w-full rounded-xl mb-3" />
        ))}

        <p className="text-sm text-slate-200 whitespace-pre-wrap mb-1">{item.caption}</p>
        <p className="text-xs text-blue-300 mb-4">{(item.hashtags || []).map((h) => "#" + h).join(" ")}</p>

        {item.error && <p className="text-red-400 text-xs mb-3">⚠ {item.error}</p>}

        {item.status === "draft" && (
          <button
            disabled={busy}
            onClick={() => run(() => approveContent(item.id))}
            className="w-full text-sm font-semibold px-4 py-2.5 rounded-lg text-white bg-violet-600 hover:bg-violet-500 mb-2 disabled:opacity-50"
          >
            ✓ Aprobar
          </button>
        )}

        {item.status === "approved" && (
          <div>
            <label className="text-xs text-slate-400">Programar publicación</label>
            <div className="flex gap-2 mt-1">
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="flex-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2 text-sm outline-none"
              />
              <button
                disabled={busy || !when}
                onClick={() => run(() => scheduleContent(item.id, new Date(when).toISOString()))}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                Programar
              </button>
            </div>
          </div>
        )}

        {err && <p className="text-red-400 text-xs mt-2">{err}</p>}
      </div>
    </div>
  );
}
