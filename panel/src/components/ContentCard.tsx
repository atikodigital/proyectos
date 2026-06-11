import type { ContentItem } from "../api";
import { statusMeta } from "../lib/status";

const ICON: Record<string, string> = { reel: "🎬", post: "🖼️", carousel: "🖼️", story: "📲" };

export function ContentCard({ item, onClick }: { item: ContentItem; onClick: () => void }) {
  const m = statusMeta(item.status);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#0e1729] hover:bg-[#13203a] border border-slate-800/80 rounded-xl p-3 flex gap-3 items-center transition-colors"
    >
      <span className="text-xl shrink-0">{ICON[item.format] || "📄"}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-slate-100 truncate">{item.caption || "(sin caption)"}</span>
        <span className="block text-xs text-slate-500 capitalize">
          {item.network} · {item.format}
          {item.scheduledAt ? " · " + new Date(item.scheduledAt).toLocaleString() : ""}
        </span>
      </span>
      <span className={"text-xs px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 " + m.chip}>● {m.label}</span>
    </button>
  );
}
