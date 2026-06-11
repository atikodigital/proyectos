import type { ContentItem } from "../api";
import { statusMeta } from "../lib/status";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

const names = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarView({ items, onSelect }: { items: ContentItem[]; onSelect: (i: ContentItem) => void }) {
  const week = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week);
    d.setDate(d.getDate() + i);
    return d;
  });
  const byDay = (d: Date) =>
    items.filter((it) => it.scheduledAt && new Date(it.scheduledAt).toDateString() === d.toDateString());

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => (
        <div key={i} className="bg-[#0e1729] rounded-xl p-2 min-h-[240px] border border-slate-800/60">
          <div className="text-[11px] text-slate-500 mb-2 font-medium">
            {names[i]} {d.getDate()}
          </div>
          {byDay(d).map((it) => {
            const m = statusMeta(it.status);
            return (
              <button
                key={it.id}
                onClick={() => onSelect(it)}
                className="w-full text-left rounded-lg p-2 mb-1 bg-[#15233f] hover:bg-[#1b2c4d] transition-colors"
                style={{ borderLeft: "3px solid " + m.dot }}
              >
                <div className="text-[10px] text-slate-400">
                  {new Date(it.scheduledAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="text-[11px] text-slate-200 truncate">{it.caption || it.format}</div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
