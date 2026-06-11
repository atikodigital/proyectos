import { useState } from "react";
import { generateReel, generatePost, createContent } from "../api";

const FORMATS: [string, string][] = [
  ["reel", "🎬 Reel"], ["post", "🖼️ Post"], ["carousel", "🖼️ Carrusel"], ["story", "📲 Historia"],
];
const NETWORKS: [string, string][] = [["instagram", "Instagram"], ["facebook", "Facebook"]];

export function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("reel");
  const [network, setNetwork] = useState("instagram");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let mediaUrl: string, caption: string, hashtags: string[];
      if (format === "reel") {
        const r = await generateReel(topic);
        mediaUrl = r.publicUrl; caption = r.caption; hashtags = r.hashtags;
      } else {
        const r = await generatePost(topic, format);
        mediaUrl = r.imageUrls[0]; caption = r.caption; hashtags = r.hashtags;
      }
      await createContent({ clientId: "atiko", format, network, mediaUrl, caption, hashtags });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-[#0e1729] border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Crear contenido</h3>

        <label className="text-xs text-slate-400">Tema</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          placeholder="5 errores al vender por WhatsApp"
          className="w-full mt-1 mb-3 bg-[#0b1220] border border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="text-xs text-slate-400">Formato</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full mt-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2.5 text-sm outline-none">
              {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-400">Red</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full mt-1 bg-[#0b1220] border border-slate-700 rounded-lg p-2.5 text-sm outline-none">
              {NETWORKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        {busy && <p className="text-blue-300 text-xs mb-2">⏳ Generando con IA… (un reel puede tardar 1-2 min)</p>}
        {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800">Cancelar</button>
          <button
            onClick={submit}
            disabled={busy || !topic.trim()}
            className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-gradient-to-br from-blue-500 to-violet-500 disabled:opacity-50"
          >
            {busy ? "Generando…" : "Generar"}
          </button>
        </div>
      </div>
    </div>
  );
}
