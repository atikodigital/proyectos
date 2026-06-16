# Jarvis Clone — Agente conversacional Matico

Extraido del proyecto dashboard-matico para clonarlo en otros proyectos.

## Archivos
- `jarvis-agent-blueprint.json` — Arquitectura completa documentada (modelos, flujo, tools, prompts, UI).
- `VoiceAgentChat.jsx` — Componente React completo: esfera animada (canvas, 4 estados), microfono (Web Speech API continuo), TTS, chat de texto y camara.
- `agent-backend.js` — Codigo backend extraido de server/index.js:
  1. Constantes/modelos (gpt-5-mini, gpt-4o-mini-tts, gpt-4o-mini-transcribe)
  2. AGENT_TOOLS — definicion de las 17 herramientas (formato OpenAI function calling)
  3. executeAgentTool — dispatcher que ejecuta cada tool (consultas Supabase)
  4. POST /api/agent/chat — cerebro con tool-calling, vision pre-analisis de imagenes, modo entrenamiento
  5. POST /api/agent/tts — texto a voz
  6. POST /api/agent/stt — voz a texto (fallback server)

## Para adaptarlo a otro proyecto
1. Reemplaza las consultas Supabase dentro de executeAgentTool por las de TU base de datos.
2. Reescribe los nombres/descripciones de AGENT_TOOLS segun tu dominio (CRM, ventas, etc.).
3. Cambia el system prompt (rol, tono, reglas). Conserva: respuestas cortas, regla "lo hago?" antes de escrituras, save_training para memoria.
4. En VoiceAgentChat.jsx: cambia authFetch por tu cliente HTTP y ajusta colores/branding.
5. Variables de entorno: OPENAI_API_KEY, AGENT_CONVERSATION_MODEL, AGENT_TTS_MODEL, AGENT_STT_MODEL, AGENT_MAX_TOKENS=500, AGENT_MAX_TOOL_ITERATIONS=4, AGENT_HISTORY_MESSAGES=8.

NOTA: agent-backend.js NO corre solo: es codigo de referencia para pegar en tu server Express
(necesita el cliente openai, supabase, multer y middleware JWT ya inicializados).
