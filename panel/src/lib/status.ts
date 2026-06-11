export const STATUS_META: Record<string, { label: string; dot: string; chip: string }> = {
  draft:      { label: "Borrador",   dot: "#8aa0c2", chip: "bg-slate-700/40 text-slate-300" },
  approved:   { label: "Aprobado",   dot: "#7e5bef", chip: "bg-violet-700/30 text-violet-300" },
  scheduled:  { label: "Programado", dot: "#3b6fd4", chip: "bg-blue-700/30 text-blue-300" },
  publishing: { label: "Publicando", dot: "#e0a33b", chip: "bg-amber-700/30 text-amber-300" },
  published:  { label: "Publicado",  dot: "#3bd47e", chip: "bg-emerald-700/30 text-emerald-300" },
  failed:     { label: "Fallido",    dot: "#e0533b", chip: "bg-red-700/30 text-red-300" },
};

export function statusMeta(s: string) {
  return STATUS_META[s] || { label: "Desconocido", dot: "#888", chip: "bg-slate-700/40 text-slate-300" };
}
