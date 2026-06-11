import type { ContentItem } from "../api";
import { ContentCard } from "./ContentCard";

export function ListView({ items, onSelect }: { items: ContentItem[]; onSelect: (i: ContentItem) => void }) {
  if (!items.length) {
    return <p className="text-slate-500 text-sm">Aún no hay contenido. Crea el primero con “+ Crear contenido”.</p>;
  }
  return (
    <div className="grid gap-2">
      {items.map((it) => (
        <ContentCard key={it.id} item={it} onClick={() => onSelect(it)} />
      ))}
    </div>
  );
}
