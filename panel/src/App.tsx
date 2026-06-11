import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ListView } from "./components/ListView";
import { CalendarView } from "./components/CalendarView";
import { CreateDialog } from "./components/CreateDialog";
import { ContentDetail } from "./components/ContentDetail";
import { listContent, type ContentItem } from "./api";

export default function App() {
  const [client, setClient] = useState("Atiko Digital");
  const [view, setView] = useState("calendar");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setItems(await listContent());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, []);

  const tabs: [string, string][] = [["calendar", "Calendario"], ["list", "Lista"]];

  return (
    <div className="flex min-h-screen">
      <Sidebar client={client} setClient={setClient} view={view} setView={setView} />
      <main className="flex-1 p-5">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h1 className="text-lg font-semibold text-white">{client}</h1>
            <p className="text-xs text-slate-500">{items.length} pieza(s) de contenido</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-[#0e1729] rounded-xl p-1 border border-slate-800/60">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={"text-sm px-3 py-1.5 rounded-lg transition-colors " + (view === id ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white")}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCreating(true)}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white bg-gradient-to-br from-blue-500 to-violet-500 shadow-lg shadow-blue-500/20"
            >
              + Crear contenido
            </button>
          </div>
        </div>

        {error && <p className="text-amber-400 text-xs mb-3">No se pudo cargar (¿agente corriendo?): {error}</p>}

        {view === "list" ? (
          <ListView items={items} onSelect={setSelected} />
        ) : (
          <CalendarView items={items} onSelect={setSelected} />
        )}
      </main>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {selected && <ContentDetail item={selected} onClose={() => setSelected(null)} onChanged={refresh} />}
    </div>
  );
}
