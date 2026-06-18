import { createContext, useContext, useState, useCallback, useRef } from 'react';
import AgentProposalModal from './AgentProposalModal.jsx';
import EvidenceCaptureOverlay from './EvidenceCaptureOverlay.jsx';

const noop = {
  proponer: async () => null,
  pedirEvidencia: async () => null,
  interaccionAbierta: false,
};

const Ctx = createContext(noop);

export function useAgentInteraction() {
  return useContext(Ctx);
}

export function AgentInteractionProvider({ children }) {
  const [activa, setActiva] = useState(null); // { tipo:'propuesta'|'evidencia', ... }
  const resolverRef = useRef(null);

  const abrir = useCallback((interaccion) => {
    if (resolverRef.current) return Promise.resolve(null); // una a la vez
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setActiva(interaccion);
    });
  }, []);

  const cerrar = useCallback((valor) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setActiva(null);
    if (r) r(valor);
  }, []);

  const proponer = useCallback((propuesta) => abrir({ tipo: 'propuesta', propuesta }), [abrir]);
  const pedirEvidencia = useCallback((req) => abrir({ tipo: 'evidencia', req }), [abrir]);

  const value = { proponer, pedirEvidencia, interaccionAbierta: Boolean(activa) };

  return (
    <Ctx.Provider value={value}>
      {children}
      {activa && activa.tipo === 'propuesta' ? (
        <AgentProposalModal propuesta={activa.propuesta} onConfirmar={(datos) => cerrar(datos)} onCancelar={() => cerrar(null)} />
      ) : null}
      {activa && activa.tipo === 'evidencia' ? (
        <EvidenceCaptureOverlay motivo={activa.req?.motivo} onCapturar={(asset) => cerrar(asset)} onCancelar={() => cerrar(null)} />
      ) : null}
    </Ctx.Provider>
  );
}
