const clients = ["Atiko Digital", "CASA LUXE", "Dulmom"];
const views = [
  { id: "calendar", label: "Calendario", icon: "🗓️" },
  { id: "list", label: "Lista", icon: "📃" },
];

export function Sidebar({
  client, setClient, view, setView,
}: {
  client: string; setClient: (c: string) => void; view: string; setView: (v: string) => void;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-800/80 bg-[#0e1729] p-3 flex flex-col">
      <div className="flex items-center gap-2.5 px-1.5 mb-6 mt-1">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-lg shadow-blue-500/20" />
        <div className="leading-tight">
          <b className="text-white text-[15px]">Atiko</b>
          <div className="text-[10px] text-slate-500">Content Studio</div>
        </div>
      </div>

      <div className="text-[10px] font-semibold tracking-widest text-slate-500 px-2 mb-2">CLIENTES</div>
      {clients.map((c) => (
        <button
          key={c}
          onClick={() => setClient(c)}
          className={
            "w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-1 text-sm transition-colors " +
            (client === c ? "bg-blue-600/20 text-white ring-1 ring-blue-500/30" : "text-slate-300 hover:bg-slate-800/60")
          }
        >
          <span className={"w-5 h-5 rounded-md " + (client === c ? "bg-gradient-to-br from-blue-500 to-violet-500" : "bg-slate-700")} />
          {c}
        </button>
      ))}

      <div className="text-[10px] font-semibold tracking-widest text-slate-500 px-2 mt-6 mb-2">VISTAS</div>
      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={
            "w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-1 text-sm transition-colors " +
            (view === v.id ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60")
          }
        >
          <span>{v.icon}</span>{v.label}
        </button>
      ))}

      <div className="mt-auto px-2 py-2 text-[10px] text-slate-600">v0.1 · Fase 4d</div>
    </aside>
  );
}
