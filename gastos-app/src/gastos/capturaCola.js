// Cola de captura multi-documento. Cuando el usuario escanea varios documentos
// con "seguir escaneando", EvidenceIntake entrega todos los items juntos; GastosApp
// registra el primero y encola el resto para procesarlos uno por uno (cada uno con
// su confirmación, igual que el flujo de 1 documento).

// Convierte los items de EvidenceIntake en la lista de documentos a registrar.
// Filtra los que no traen imagen y normaliza el mimeType.
export function docsDeItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.imageBase64)
    .map((it) => ({ imageBase64: it.imageBase64, mimeType: it.imageMimeType || 'image/jpeg' }));
}
