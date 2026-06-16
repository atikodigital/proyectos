// ============================================================================
// JARVIS AGENT — BACKEND (extraido de server/index.js de dashboard-matico)
// Secciones: constantes, AGENT_TOOLS (17 tools), executeAgentTool (dispatcher),
//            POST /api/agent/chat, POST /api/agent/tts, POST /api/agent/stt
// Requiere: express, openai, multer (upload), supabase client, authFetch/JWT en el front.
// ============================================================================

// ---------- 1. CONSTANTES / MODELOS ----------
const AGENT_CONVERSATION_MODEL = String(
    process.env.AGENT_CONVERSATION_MODEL ||
    process.env.OPENAI_AGENT_MODEL ||
    (OPENAI_DIRECT_API_KEY ? 'gpt-5-mini' : AI_MODELS.fast)
).trim();
const AGENT_MAX_TOKENS = Number(process.env.AGENT_MAX_TOKENS || 500);
const AGENT_MAX_TOOL_ITERATIONS = Number(process.env.AGENT_MAX_TOOL_ITERATIONS || 4);
const AGENT_HISTORY_MESSAGES = Number(process.env.AGENT_HISTORY_MESSAGES || 8);
const AGENT_TTS_MODEL = String(process.env.AGENT_TTS_MODEL || 'gpt-4o-mini-tts').trim();
const AGENT_STT_MODEL = String(process.env.AGENT_STT_MODEL || 'gpt-4o-mini-transcribe').trim();
const AGENT_TTS_TIMEOUT_MS = Number(process.env.AGENT_TTS_TIMEOUT_MS || 12000);


// ---------- 2. AGENT_TOOLS (definicion de las 17 herramientas) ----------
const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_student_profile',
            description: 'Obtener perfil del estudiante por user_id: nombre, email, materias registradas',
            parameters: { type: 'object', properties: { student_id: { type: 'string' } }, required: ['student_id'] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_students',
            description: 'Buscar estudiantes/usuarios por nombre, email o listar todos. Usa cuando el admin pregunte por un alumno especifico ("como le fue a Matias", "busca a Camila", "muestrame los alumnos", "quien es el usuario X"). Retorna user_id, nombre, email de cada resultado. IMPORTANTE: copia EXACTAMENTE el nombre que dice el usuario, NO corrijas ortografia ni agregues/quites letras.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Nombre o email a buscar EXACTAMENTE como lo escribio el usuario, sin corregir ortografia. Dejar vacio para listar todos.' },
                    limit: { type: 'number', description: 'Maximo de resultados (default 20)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_recent_activity',
            description: 'Obtener actividad reciente del estudiante: quizzes, sesiones, evidencias. Usar para preguntas como "¿estudió hoy?", "¿qué hizo esta semana?"',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    days: { type: 'number', description: 'Cuántos días hacia atrás buscar (default 7)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_quiz_results',
            description: 'Obtener resultados de quizzes/pruebas del estudiante. Incluye correctas, incorrectas, materia, tema, fecha.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    subject: { type: 'string', description: 'Materia (MATEMATICA, LENGUAJE, QUIMICA, etc). Opcional.' },
                    days: { type: 'number', description: 'Últimos N días (default 30)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_study_time',
            description: 'Obtener tiempo de estudio del estudiante: minutos por día, por materia, total.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    days: { type: 'number', description: 'Últimos N días (default 7)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_upcoming_exams',
            description: 'Obtener pruebas/eventos FUTUROS (desde hoy en adelante) del calendario del estudiante. USA ESTA herramienta cuando pregunten por pruebas pendientes, proximas, que tiene que estudiar. Solo retorna eventos desde hoy, nunca pasados.',
            parameters: {
                type: 'object',
                properties: { student_id: { type: 'string' } },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_inactive_subjects',
            description: 'Obtener materias que el estudiante no ha tocado en varios días. Útil para detectar materias abandonadas.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    threshold_days: { type: 'number', description: 'Días sin actividad para considerarse inactiva (default 5)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_notebook_evidence',
            description: 'Obtener evidencias de cuaderno/fotos subidas por el estudiante.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    days: { type: 'number', description: 'Últimos N días (default 7)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_wrong_questions_detail',
            description: 'Obtener detalle de preguntas incorrectas: qué pregunta, qué respondió, cuál era la correcta.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    subject: { type: 'string', description: 'Materia opcional' },
                    days: { type: 'number', description: 'Últimos N días (default 7)' }
                },
                required: ['student_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'prepare_exam_study',
            description: 'Generar material de estudio completo (teoria ludica + quiz interactivo) para preparar una prueba. Usa cuando el estudiante pide ayuda para prepararse para un examen o prueba. Retorna un link con el material de estudio.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    subject: { type: 'string', description: 'Materia: MATEMATICA, LENGUAJE, FILOSOFIA, HISTORIA, QUIMICA, FISICA, BIOLOGIA, INGLES, etc' },
                    topic: { type: 'string', description: 'Tema especifico de la prueba' },
                    content_summary: { type: 'string', description: 'Resumen detallado del contenido que entra en la prueba, extraido de imagenes o la conversacion. Incluir todos los temas y subtemas mencionados.' }
                },
                required: ['student_id', 'subject', 'topic']
            }
        }
    },
    // === CRUD TOOLS — full agent autonomy ===
    {
        type: 'function',
        function: {
            name: 'create_calendar_event',
            description: 'Crear un evento en el calendario del estudiante. Pruebas, tareas, disertaciones, etc.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    title: { type: 'string', description: 'Titulo del evento' },
                    event_date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
                    event_type: { type: 'string', enum: ['prueba', 'tarea', 'disertacion', 'trabajo', 'evento', 'otro'], description: 'Tipo de evento' },
                    subject: { type: 'string', description: 'Materia en MAYUSCULAS' },
                    description: { type: 'string', description: 'Descripcion o contenido del evento' }
                },
                required: ['student_id', 'title', 'event_date', 'event_type', 'subject']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_calendar_event',
            description: 'Actualizar un evento existente del calendario. Cambiar fecha, titulo, descripcion, etc.',
            parameters: {
                type: 'object',
                properties: {
                    event_id: { type: 'number', description: 'ID del evento a actualizar' },
                    updates: { type: 'object', description: 'Campos a actualizar: title, event_date, event_type, subject, description' }
                },
                required: ['event_id', 'updates']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_calendar_event',
            description: 'Eliminar un evento del calendario.',
            parameters: {
                type: 'object',
                properties: { event_id: { type: 'number', description: 'ID del evento a eliminar' } },
                required: ['event_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_student_profile',
            description: 'Actualizar datos del perfil del estudiante: nombre, email, materias, configuracion.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    updates: { type: 'object', description: 'Campos a actualizar: display_name, email, subjects, etc.' }
                },
                required: ['student_id', 'updates']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_all_modules',
            description: 'Buscar informacion en TODOS los modulos de la app: calendario, progreso, quizzes, cuaderno, sesiones, alertas, notificaciones, perfil. Usa para busquedas amplias.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    query: { type: 'string', description: 'Que buscar: "pruebas de matematica", "sesiones esta semana", "evidencias de cuaderno", etc.' },
                    days: { type: 'number', description: 'Dias hacia atras (default 30)' }
                },
                required: ['student_id', 'query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_custom_query',
            description: 'Ejecutar una consulta personalizada a la base de datos. Para cuando las otras herramientas no cubren la necesidad. Tablas disponibles: profiles, users, progress_log, calendar_events, study_sessions, notebook_submissions, notebook_ocr_records, notifications, study_alerts, daily_reports, question_banks, exam_prep_sessions, agent_training.',
            parameters: {
                type: 'object',
                properties: {
                    table: { type: 'string', description: 'Nombre de la tabla' },
                    action: { type: 'string', enum: ['select', 'insert', 'update', 'delete'], description: 'Tipo de operacion' },
                    filters: { type: 'object', description: 'Filtros: { column: value } para WHERE' },
                    data: { type: 'object', description: 'Datos para insert/update' },
                    select_columns: { type: 'string', description: 'Columnas a seleccionar (default *)' },
                    order_by: { type: 'string', description: 'Columna para ordenar' },
                    limit: { type: 'number', description: 'Limite de filas (default 20)' }
                },
                required: ['table', 'action']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_notification',
            description: 'Enviar una notificacion/alerta dentro de la app al estudiante o apoderado.',
            parameters: {
                type: 'object',
                properties: {
                    student_id: { type: 'string' },
                    title: { type: 'string' },
                    message: { type: 'string' },
                    type: { type: 'string', enum: ['info', 'warning', 'success', 'urgent'], description: 'Tipo de notificacion' }
                },
                required: ['student_id', 'title', 'message']
            }
        }
    }
];

const AGENT_PRIVATE_TOOL_NAMES = new Set([
    'search_students',
    'search_all_modules',
    'create_calendar_event',
    'update_calendar_event',
    'delete_calendar_event',
    'update_student_profile',
    'run_custom_query',
    'send_notification'
]);

const PUBLIC_AGENT_TOOLS = AGENT_TOOLS.filter(tool => !AGENT_PRIVATE_TOOL_NAMES.has(tool.function?.name));

const dateOnlyChile = () => {
    const d = new Date();
    d.setHours(d.getHours() - 4);
    return d.toISOString().substring(0, 10);
};

// ---------- 3. executeAgentTool (ejecuta cada tool contra la BD) ----------
async function executeAgentTool(name, args) {
    const sid = args.student_id;
    const days = Number(args.days) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const todayChile = dateOnlyChile();

    switch (name) {
        case 'get_student_profile': {
            const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', sid).maybeSingle();
            const { data: legacy } = await supabase.from('users').select('*').eq('token', sid).maybeSingle();
            const p = profile || legacy || {};
            return {
                user_id: p.user_id || p.token || sid,
                name: p.display_name || p.nombre || p.name || 'Sin nombre',
                email: p.email || p.mail || '',
                role: p.role || p.tipo || '',
                subjects: p.subjects || p.materias || null,
                created_at: p.created_at || null,
                raw: p
            };
        }
        case 'search_students': {
            const q = (args.query || '').trim();
            const lim = Number(args.limit) || 20;
            const results = [];
            const seenIds = new Set();

            // Build search terms: full query + individual words for fuzzy matching
            const searchTerms = [q];
            const words = q.split(/\s+/).filter(w => w.length >= 2);
            if (words.length > 1) searchTerms.push(...words);

            for (const term of searchTerms) {
                if (!term) continue;

                // Search in profiles table
                const { data: profiles } = await supabase.from('profiles')
                    .select('user_id, display_name, email, role, created_at')
                    .or(`display_name.ilike.%${term}%,email.ilike.%${term}%,user_id.ilike.%${term}%`)
                    .order('created_at', { ascending: false }).limit(lim);

                for (const p of (profiles || [])) {
                    if (seenIds.has(p.user_id)) continue;
                    seenIds.add(p.user_id);
                    results.push({
                        user_id: p.user_id,
                        name: p.display_name || 'Sin nombre',
                        email: p.email || '',
                        role: p.role || '',
                        source: 'profiles',
                        created_at: p.created_at
                    });
                }

                // Search in legacy users table too
                const { data: legacyUsers } = await supabase.from('users')
                    .select('token, nombre, name, mail, email, role, tipo, created_at')
                    .or(`nombre.ilike.%${term}%,name.ilike.%${term}%,mail.ilike.%${term}%,email.ilike.%${term}%,token.ilike.%${term}%`)
                    .order('created_at', { ascending: false }).limit(lim);

                for (const u of (legacyUsers || [])) {
                    const uid = u.token;
                    if (seenIds.has(uid)) continue;
                    seenIds.add(uid);
                    results.push({
                        user_id: uid,
                        name: u.nombre || u.name || 'Sin nombre',
                        email: u.mail || u.email || '',
                        role: u.role || u.tipo || '',
                        source: 'users',
                        created_at: u.created_at
                    });
                }
            }

            // If no results and query has no space, try without accents/H variations
            if (results.length === 0 && q) {
                const noH = q.replace(/h/gi, '');
                if (noH !== q.toLowerCase()) {
                    const { data: fuzzyProfiles } = await supabase.from('profiles')
                        .select('user_id, display_name, email, role, created_at')
                        .ilike('display_name', `%${noH}%`)
                        .order('created_at', { ascending: false }).limit(lim);
                    for (const p of (fuzzyProfiles || [])) {
                        if (seenIds.has(p.user_id)) continue;
                        seenIds.add(p.user_id);
                        results.push({
                            user_id: p.user_id, name: p.display_name || 'Sin nombre',
                            email: p.email || '', role: p.role || '', source: 'profiles', created_at: p.created_at
                        });
                    }
                    const { data: fuzzyLegacy } = await supabase.from('users')
                        .select('token, nombre, name, mail, email, role, tipo, created_at')
                        .or(`nombre.ilike.%${noH}%,name.ilike.%${noH}%`)
                        .order('created_at', { ascending: false }).limit(lim);
                    for (const u of (fuzzyLegacy || [])) {
                        const uid = u.token;
                        if (seenIds.has(uid)) continue;
                        seenIds.add(uid);
                        results.push({
                            user_id: uid, name: u.nombre || u.name || 'Sin nombre',
                            email: u.mail || u.email || '', role: u.role || u.tipo || '', source: 'users', created_at: u.created_at
                        });
                    }
                }
            }

            return { total: results.length, students: results.slice(0, lim) };
        }
        case 'get_recent_activity': {
            const { data: progress } = await supabase.from('progress_log').select('event_type, subject, topic, score, total_questions, correct_answers, wrong_answers, created_at')
                .eq('user_id', sid).gte('created_at', since).order('created_at', { ascending: false }).limit(50);
            const { data: notebooks } = await supabase.from('notebook_submissions').select('subject, status, created_at, metadata')
                .eq('user_id', sid).gte('created_at', since).order('created_at', { ascending: false }).limit(20);
            const todayItems = (progress || []).filter(r => {
                const d = new Date(r.created_at); d.setHours(d.getHours() - 4);
                return d.toISOString().substring(0, 10) === todayChile;
            });
            return {
                total_activities: (progress || []).length,
                today_activities: todayItems.length,
                studied_today: todayItems.length > 0,
                recent_progress: (progress || []).slice(0, 15).map(r => ({
                    type: r.event_type, subject: r.subject, topic: r.topic,
                    score: r.score, total: r.total_questions, correct: r.correct_answers, wrong: r.wrong_answers,
                    date: r.created_at
                })),
                notebooks: (notebooks || []).slice(0, 10).map(n => ({
                    subject: n.subject || n.metadata?.subject, status: n.status, date: n.created_at
                }))
            };
        }
        case 'get_quiz_results': {
            let query = supabase.from('progress_log')
                .select('event_type, subject, topic, score, total_questions, correct_answers, wrong_answers, wrong_question_details, created_at')
                .eq('user_id', sid).gte('created_at', since)
                .in('event_type', ['prep_exam_activity', 'prep_exam_completed', 'session_completed', 'quiz_completed'])
                .order('created_at', { ascending: false }).limit(50);
            if (args.subject) query = query.ilike('subject', `%${args.subject}%`);
            const { data } = await query;
            return (data || []).map(r => ({
                type: r.event_type, subject: r.subject, topic: r.topic,
                total: r.total_questions, correct: r.correct_answers, wrong: r.wrong_answers,
                score_percent: r.total_questions > 0 ? Math.round(((r.correct_answers || 0) / r.total_questions) * 100) : r.score,
                date: r.created_at
            }));
        }
        case 'get_study_time': {
            const { data: sessions } = await supabase.from('study_sessions').select('subject, total_minutes, start_time, status')
                .eq('student_user_id', sid).gte('start_time', since).order('start_time', { ascending: false });
            const derived = await deriveStudySessionsFromProgress(sid, since);
            const all = [...(sessions || []), ...derived];
            const byDay = {};
            for (const s of all) {
                const d = new Date(s.start_time); d.setHours(d.getHours() - 4);
                const day = d.toISOString().substring(0, 10);
                if (!byDay[day]) byDay[day] = { date: day, minutes: 0, subjects: new Set() };
                byDay[day].minutes += Number(s.total_minutes) || 0;
                byDay[day].subjects.add(s.subject || 'GENERAL');
            }
            const dailyData = Object.values(byDay).map(d => ({ date: d.date, minutes: d.minutes, subjects: [...d.subjects] }))
                .sort((a, b) => b.date.localeCompare(a.date));
            const totalMin = dailyData.reduce((s, d) => s + d.minutes, 0);
            return { total_minutes: totalMin, total_hours: Math.round(totalMin / 60 * 10) / 10, days_active: dailyData.length, daily: dailyData };
        }
        case 'get_upcoming_exams': {
            const { data } = await supabase.from('calendar_events').select('subject, title, event_date, event_type, description')
                .eq('student_user_id', sid).gte('event_date', todayChile).order('event_date', { ascending: true }).limit(20);
            return (data || []).map(e => ({ subject: e.subject, title: e.title, date: e.event_date, type: e.event_type, description: e.description }));
        }
        case 'get_inactive_subjects': {
            const threshold = Number(args.threshold_days) || 5;
            const allSubjects = ['MATEMATICA', 'LENGUAJE', 'QUIMICA', 'FISICA', 'BIOLOGIA', 'HISTORIA'];
            const inactive = [];
            for (const subj of allSubjects) {
                const { data } = await supabase.from('progress_log').select('created_at')
                    .eq('user_id', sid).eq('subject', subj).order('created_at', { ascending: false }).limit(1);
                const lastDate = data?.[0]?.created_at;
                if (!lastDate) { inactive.push({ subject: subj, last_activity: null, days_inactive: 'nunca' }); continue; }
                const daysDiff = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
                if (daysDiff >= threshold) inactive.push({ subject: subj, last_activity: lastDate, days_inactive: daysDiff });
            }
            return inactive;
        }
        case 'get_notebook_evidence': {
            const { data: submissions } = await supabase.from('notebook_submissions').select('subject, status, image_url, created_at, metadata')
                .eq('user_id', sid).gte('created_at', since).order('created_at', { ascending: false }).limit(20);
            const { data: ocr } = await supabase.from('notebook_ocr_records').select('subject, interpretation_score, created_at')
                .eq('user_id', sid).gte('created_at', since).order('created_at', { ascending: false }).limit(20);
            return {
                submissions: (submissions || []).map(s => ({ subject: s.subject || s.metadata?.subject, status: s.status, date: s.created_at, has_image: !!s.image_url })),
                ocr_records: (ocr || []).map(o => ({ subject: o.subject, score: o.interpretation_score, date: o.created_at }))
            };
        }
        case 'get_wrong_questions_detail': {
            let query = supabase.from('progress_log')
                .select('subject, topic, wrong_question_details, wrong_answers, total_questions, created_at')
                .eq('user_id', sid).gte('created_at', since)
                .not('wrong_question_details', 'is', null)
                .order('created_at', { ascending: false }).limit(20);
            if (args.subject) query = query.ilike('subject', `%${args.subject}%`);
            const { data } = await query;
            return (data || []).map(r => {
                let details = r.wrong_question_details;
                if (typeof details === 'string') try { details = JSON.parse(details); } catch { details = []; }
                return {
                    subject: r.subject, topic: r.topic, date: r.created_at,
                    wrong_count: r.wrong_answers, total: r.total_questions,
                    questions: (Array.isArray(details) ? details : []).slice(0, 5).map(q => ({
                        question: q.question || q.prompt || q.text,
                        student_answer: q.user_answer || q.selected_answer,
                        correct_answer: q.correct_answer || q.answer
                    }))
                };
            });
        }
        case 'prepare_exam_study': {
            const subject = args.subject || 'GENERAL';
            const topic = args.topic || 'Contenido general';
            const contentSummary = args.content_summary || topic;
            const BASE_URL = process.env.BASE_URL || 'https://srv1048418.hstgr.cloud';

            try {
                // Generate ludic theory
                const theoryRes = await agentTextClient.chat.completions.create({
                    model: AI_MODELS.thinking || AI_MODELS.fast,
                    messages: [{ role: 'user', content: `Genera una leccion teorica LUDICA y ENTRETENIDA para un estudiante de ensenanza media chileno.
Materia: ${subject}
Tema: ${topic}
Contenido especifico: ${contentSummary}

REGLAS:
- Escribe como si le hablaras a un adolescente chileno, tutea
- Usa analogias divertidas, ejemplos de la vida real, datos curiosos
- Organiza en secciones claras con titulos creativos (usa emojis)
- Incluye "Dato curioso" o "Sabias que..." en cada seccion
- Maximo 1000 palabras
- Debe ser contenido que el estudiante pueda copiar en su cuaderno
- NO uses formato markdown con # ni **. Usa texto plano con emojis para titulos.
- Escribe pensando en que el estudiante lo va a LEER y COPIAR en su cuaderno` }],
                    temperature: 0.7,
                    max_tokens: 2000
                });
                const theoryContent = theoryRes.choices[0]?.message?.content || '';

                // Generate quiz questions
                const quizRes = await agentTextClient.chat.completions.create({
                    model: AI_MODELS.fast,
                    messages: [{ role: 'user', content: `Genera 8 preguntas de seleccion multiple sobre:
Materia: ${subject} | Tema: ${topic}
Contenido: ${contentSummary}

Responde SOLO con un JSON array valido, sin texto extra:
[{"question":"texto","options":["A) op1","B) op2","C) op3","D) op4"],"correct":0,"explanation":"por que es correcta"}]

REGLAS:
- Preguntas variadas: conceptuales, aplicacion, analisis
- Opciones plausibles, no obvias
- Explicaciones breves y claras
- Dificultad media-alta
- En espanol chileno` }],
                    temperature: 0.5,
                    max_tokens: 2500,
                    response_format: { type: 'json_object' }
                });
                let quizQuestions = [];
                try {
                    const raw = quizRes.choices[0]?.message?.content || '[]';
                    const parsed = JSON.parse(raw);
                    quizQuestions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.quiz || []);
                } catch { quizQuestions = []; }

                // Save to Supabase
                const { data: saved, error: saveErr } = await supabase.from('exam_prep_sessions').insert({
                    student_id: sid,
                    subject,
                    topic,
                    theory_content: theoryContent,
                    quiz_questions: quizQuestions,
                    content_summary: contentSummary
                }).select('id').single();

                if (saveErr) throw saveErr;
                const studyLink = `${BASE_URL}/study/${saved.id}`;
                console.log(`[AGENT] Study material created: ${studyLink}`);
                return {
                    success: true,
                    link: studyLink,
                    study_id: saved.id,
                    theory_words: theoryContent.split(/\s+/).length,
                    quiz_count: quizQuestions.length,
                    message: `Material de estudio listo: teoria ludica (${theoryContent.split(/\s+/).length} palabras) + ${quizQuestions.length} preguntas quiz`
                };
            } catch (prepErr) {
                console.error('[AGENT] prepare_exam_study error:', prepErr.message);
                return { success: false, error: prepErr.message };
            }
        }
        case 'create_calendar_event': {
            const { data, error } = await supabase.from('calendar_events').insert({
                student_user_id: sid,
                title: args.title,
                event_date: args.event_date,
                event_type: args.event_type || 'evento',
                subject: (args.subject || '').toUpperCase(),
                description: args.description || null,
                source: 'agent'
            }).select('id, title, event_date, subject').single();
            if (error) return { success: false, error: error.message };
            return { success: true, event: data, message: `Evento creado: ${data.title} el ${data.event_date}` };
        }
        case 'update_calendar_event': {
            const eid = Number(args.event_id);
            const { data, error } = await supabase.from('calendar_events').update(args.updates).eq('id', eid).select('id, title, event_date').single();
            if (error) return { success: false, error: error.message };
            return { success: true, event: data, message: `Evento ${eid} actualizado` };
        }
        case 'delete_calendar_event': {
            const eid = Number(args.event_id);
            const { error } = await supabase.from('calendar_events').delete().eq('id', eid);
            if (error) return { success: false, error: error.message };
            return { success: true, message: `Evento ${eid} eliminado` };
        }
        case 'update_student_profile': {
            const { data, error } = await supabase.from('profiles').update(args.updates).eq('user_id', sid).select().single();
            if (error) {
                // Try legacy table
                const { data: leg, error: legErr } = await supabase.from('users').update(args.updates).eq('token', sid).select().single();
                if (legErr) return { success: false, error: legErr.message };
                return { success: true, profile: leg };
            }
            return { success: true, profile: data };
        }
        case 'search_all_modules': {
            const searchDays = Number(args.days) || 30;
            const searchSince = new Date(Date.now() - searchDays * 86400000).toISOString();
            const q = (args.query || '').toLowerCase();
            const results = {};

            // Calendar
            const { data: cal } = await supabase.from('calendar_events').select('id, title, event_date, event_type, subject, description')
                .eq('student_user_id', sid).order('event_date', { ascending: false }).limit(30);
            results.calendar = (cal || []).filter(e => !q || JSON.stringify(e).toLowerCase().includes(q)).slice(0, 10);

            // Progress
            const { data: prog } = await supabase.from('progress_log').select('event_type, subject, topic, score, correct_answers, wrong_answers, total_questions, created_at')
                .eq('user_id', sid).gte('created_at', searchSince).order('created_at', { ascending: false }).limit(30);
            results.progress = (prog || []).filter(e => !q || JSON.stringify(e).toLowerCase().includes(q)).slice(0, 10);

            // Study sessions
            const { data: sess } = await supabase.from('study_sessions').select('subject, total_minutes, start_time, status')
                .eq('student_user_id', sid).gte('start_time', searchSince).order('start_time', { ascending: false }).limit(20);
            results.study_sessions = (sess || []).filter(e => !q || JSON.stringify(e).toLowerCase().includes(q)).slice(0, 10);

            // Notebooks
            const { data: nb } = await supabase.from('notebook_submissions').select('subject, status, created_at, metadata')
                .eq('user_id', sid).gte('created_at', searchSince).order('created_at', { ascending: false }).limit(20);
            results.notebooks = (nb || []).filter(e => !q || JSON.stringify(e).toLowerCase().includes(q)).slice(0, 10);

            // Notifications
            const { data: notifs } = await supabase.from('notifications').select('title, message, type, read, created_at')
                .eq('user_id', sid).gte('created_at', searchSince).order('created_at', { ascending: false }).limit(10);
            results.notifications = notifs || [];

            return results;
        }
        case 'run_custom_query': {
            const tbl = args.table;
            const ALLOWED_TABLES = ['profiles', 'users', 'progress_log', 'calendar_events', 'study_sessions',
                'notebook_submissions', 'notebook_ocr_records', 'notifications', 'study_alerts',
                'daily_reports', 'question_banks', 'exam_prep_sessions', 'agent_training'];
            if (!ALLOWED_TABLES.includes(tbl)) return { error: `Tabla "${tbl}" no permitida. Tablas: ${ALLOWED_TABLES.join(', ')}` };

            try {
                if (args.action === 'select') {
                    let query = supabase.from(tbl).select(args.select_columns || '*');
                    if (args.filters) {
                        for (const [col, val] of Object.entries(args.filters)) {
                            query = query.eq(col, val);
                        }
                    }
                    if (args.order_by) query = query.order(args.order_by, { ascending: false });
                    query = query.limit(args.limit || 20);
                    const { data, error } = await query;
                    if (error) return { success: false, error: error.message };
                    return { success: true, rows: data, count: (data || []).length };
                }
                if (args.action === 'insert') {
                    const { data, error } = await supabase.from(tbl).insert(args.data || {}).select().single();
                    if (error) return { success: false, error: error.message };
                    return { success: true, row: data };
                }
                if (args.action === 'update') {
                    if (!args.filters || Object.keys(args.filters).length === 0) return { error: 'Se requieren filtros para update' };
                    let query = supabase.from(tbl).update(args.data || {});
                    for (const [col, val] of Object.entries(args.filters)) {
                        query = query.eq(col, val);
                    }
                    const { data, error } = await query.select();
                    if (error) return { success: false, error: error.message };
                    return { success: true, rows_affected: (data || []).length, rows: data };
                }
                if (args.action === 'delete') {
                    if (!args.filters || Object.keys(args.filters).length === 0) return { error: 'Se requieren filtros para delete' };
                    let query = supabase.from(tbl).delete();
                    for (const [col, val] of Object.entries(args.filters)) {
                        query = query.eq(col, val);
                    }
                    const { data, error } = await query.select();
                    if (error) return { success: false, error: error.message };
                    return { success: true, rows_deleted: (data || []).length };
                }
                return { error: `Accion "${args.action}" no soportada` };
            } catch (qErr) {
                return { success: false, error: qErr.message };
            }
        }
        case 'send_notification': {
            const { data, error } = await supabase.from('notifications').insert({
                user_id: sid,
                title: args.title,
                message: args.message,
                type: args.type || 'info',
                read: false,
                source: 'agent'
            }).select('id').single();
            if (error) return { success: false, error: error.message };
            return { success: true, notification_id: data.id, message: `Notificacion enviada: ${args.title}` };
        }
        default:
            return { error: `Tool ${name} no existe` };
    }
}

// ---------- 4. POST /api/agent/chat ----------
app.post('/api/agent/chat', async (req, res) => {
    try {
        const { message, student_id, user_type = 'parent', conversation_history = [], training_mode = false, admin_user_id, images = [], personality } = req.body;
        if (!message || !student_id) return res.status(400).json({ success: false, error: 'Falta message o student_id' });

        // Training mode: verify admin
        if (training_mode) {
            const isAdm = await checkAdmin(admin_user_id);
            if (!isAdm) return res.status(403).json({ success: false, error: 'No autorizado para modo entrenamiento' });
        }

        // Pre-analyze images with vision if present
        let imageAnalysis = '';
        if (images.length > 0) {
            try {
                const visionContent = [
                    { type: 'text', text: 'Analiza estas imagenes en detalle. Extrae TODO el texto visible, temas, materias, contenido academico. Si es una prueba o guia de estudio, lista todos los temas y subtemas que aparecen. Responde en espanol.' }
                ];
                for (const img of images.slice(0, 5)) {
                    const b64 = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
                    visionContent.push({ type: 'image_url', image_url: { url: b64, detail: 'high' } });
                }
                const visionRes = await (openaiVisionClient || agentTextClient).chat.completions.create({
                    model: OPENAI_VISION_MODEL,
                    messages: [{ role: 'user', content: visionContent }],
                    max_tokens: 1500
                });
                imageAnalysis = visionRes.choices[0]?.message?.content || '';
                console.log('[AGENT] Image analysis done:', imageAnalysis.substring(0, 200));
            } catch (visErr) {
                console.error('[AGENT] Vision analysis error:', visErr.message);
                imageAnalysis = '(No se pudo analizar las imagenes)';
            }
        }

        const todayChileStr = dateOnlyChile();
        const todayDate = new Date(todayChileStr + 'T12:00:00');
        const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const todayDayName = dayNames[todayDate.getDay()];
        const todayHumanDate = todayDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        // Fetch active training entries and build training section
        let trainingSection = '';
        try {
            const { data: trainingEntries } = await supabase
                .from('agent_training')
                .select('type, content')
                .eq('active', true)
                .order('created_at', { ascending: true });
            if (trainingEntries && trainingEntries.length > 0) {
                const grouped = { instruccion: [], skill: [], memoria: [], tono: [], conocimiento: [], qa: [] };
                for (const e of trainingEntries) {
                    if (grouped[e.type]) grouped[e.type].push(e.content);
                    else if (!grouped.instruccion) grouped.instruccion = [e.content];
                    else grouped.instruccion.push(e.content); // fallback
                }
                const parts = [];
                if (grouped.instruccion.length) parts.push('INSTRUCCIONES ADICIONALES:\n' + grouped.instruccion.join('\n'));
                if (grouped.tono.length) parts.push('TONO Y ESTILO:\n' + grouped.tono.join('\n'));
                if (grouped.skill.length) parts.push('SKILLS (capacidades especiales):\n' + grouped.skill.join('\n'));
                if (grouped.memoria.length) parts.push('MEMORIA (datos del alumno/familia):\n' + grouped.memoria.join('\n'));
                if (grouped.conocimiento.length) parts.push('CONOCIMIENTO BASE:\n' + grouped.conocimiento.join('\n'));
                if (grouped.qa.length) parts.push('RESPUESTAS ESPECÍFICAS:\n' + grouped.qa.join('\n'));
                if (parts.length) trainingSection = '\n\n' + parts.join('\n\n');
            }
        } catch (_) { /* non-critical */ }

        // Training mode: special system prompt + save_training tool
        const TRAINING_TOOL = {
            type: 'function',
            function: {
                name: 'save_training',
                description: 'Guardar una instruccion, preferencia de tono, memoria o skill que el admin te indica. SIEMPRE usa esta herramienta cuando el admin te de una instruccion o informacion que deba ser recordada.',
                parameters: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['instruccion', 'tono', 'memoria', 'skill', 'conocimiento', 'qa'], description: 'Tipo de entrenamiento' },
                        content: { type: 'string', description: 'El contenido a guardar, redactado como instruccion directa para ti mismo' }
                    },
                    required: ['type', 'content']
                }
            }
        };

        let systemPrompt;
        let activeTools;
        if (training_mode) {
            systemPrompt = `Eres Matico en MODO ENTRENAMIENTO Y AGENTE PERSONAL DE JOSE ANTONIO. Este modo es privado del admin/jefe, no de apoderados ni estudiantes.
REGLAS:
- Dentro de Matico tienes autoridad total: puedes revisar, crear, modificar, eliminar, corregir y administrar cualquier modulo o dato disponible con tus herramientas.
- REGLA OBLIGATORIA: antes de crear, modificar, eliminar, enviar notificaciones o ejecutar consultas que cambien datos, explica en una frase lo que vas a hacer y pregunta exactamente "lo hago?". No ejecutes el cambio hasta que el jefe confirme.
- Si solo vas a revisar, buscar, analizar o resumir informacion real, hazlo sin pedir permiso.
- Cuando el jefe confirme una accion pendiente con "si", "dale", "hazlo", "ok" o equivalente, ejecuta la accion usando la herramienta correcta.
- Cada vez que el admin te de una instruccion, preferencia, dato o informacion, USA save_training para guardarla.
- Clasifica bien: "instruccion" (reglas de comportamiento), "tono" (estilo de habla), "memoria" (datos del alumno/familia), "skill" (capacidades), "conocimiento" (info base), "qa" (respuestas especificas).
- Confirma brevemente que anotaste: "Listo jefe, anotado" o similar.
- Si el admin solo conversa sin dar instrucciones ni pedir acciones, responde normal sin guardar nada.
- Sin markdown ni asteriscos. Respuestas CORTAS, 2-3 frases max.
- Habla chileno informal, tutea.
- SIEMPRE responde algo. Nunca dejes la respuesta vacia.
- Cuando te pregunten por un alumno/persona ("conoces a X", "como le fue a X", "quien es X"), USA search_students INMEDIATAMENTE con el nombre exacto. NUNCA digas "no tengo info" sin buscar primero.
- PREPARACION DE PRUEBAS: cuando te pidan preparar material de estudio para una prueba, SIEMPRE pregunta primero: 1) De que temas o contenidos sera la prueba, 2) Pide que te digan los temas o que suban una foto/captura de pantalla del temario o guia. NUNCA generes material inventando contenido. Solo usa prepare_exam_study cuando tengas informacion concreta del contenido (texto o imagenes analizadas).
- Si el usuario adjunta imagenes con su mensaje, el sistema las analiza automaticamente. Usa ese analisis para entender el contenido antes de generar material.
- FECHAS: Hoy es ${todayDayName} ${todayHumanDate}. Cuando pregunten por pruebas/eventos "pendientes", "proximos", "que tiene", usa get_upcoming_exams que SOLO retorna desde hoy en adelante. NUNCA muestres eventos pasados como pendientes. Si un evento ya paso, dilo claramente.
- student_id: ${student_id}.` + trainingSection;
            activeTools = [TRAINING_TOOL, ...AGENT_TOOLS];
        } else {
            const AGENT_CORE_RULES = `
REGLAS FUNDAMENTALES:
- Este modo NO es administrador. No eres operador total de la app para apoderados ni estudiantes.
- Puedes revisar datos educativos reales, explicar progreso, buscar actividad, ver calendario, revisar evidencias y ayudar a estudiar.
- No puedes modificar, eliminar, administrar perfiles, ejecutar consultas personalizadas, enviar notificaciones ni actuar como admin.
- Si te piden cambiar datos, responde corto que eso lo debe confirmar Jose Antonio en modo entrenamiento/admin.
- Solo datos reales, NUNCA inventes. Sin markdown ni asteriscos.
- Fechas con dia de semana ("este martes", "el proximo lunes").
- Respuestas CORTAS, 2-3 frases max, como si hablaras en voz alta.
- SIEMPRE responde algo util. Si necesitas buscar, di "deja buscar" y usa las herramientas.
- Si el usuario adjunta imagenes, el sistema las analiza automaticamente. Usa ese analisis para entender el contenido.
- FECHAS: Hoy es ${todayDayName} ${todayHumanDate}. Cuando pregunten por pruebas "pendientes" o "proximas", usa get_upcoming_exams (solo retorna desde hoy). NUNCA muestres eventos pasados como pendientes.
- student_id: ${student_id}.
- Usa search_all_modules para busquedas amplias.`;

            systemPrompt = (user_type === 'parent'
                ? `Eres Matico, asistente educativo para apoderados. Hablas con el apoderado sobre su hijo/a, con foco en revisar informacion, explicar avance, alertar riesgos y orientar estudio.${AGENT_CORE_RULES}
Usa get_student_profile para saber el nombre del niño actual. Usa search_students para buscar CUALQUIER alumno por nombre ("como le fue a Matias" -> search_students query:"Matias"). Cuando encuentres un alumno, muestra su nombre, user_id y email. Si el admin pregunta por un alumno distinto al actual, primero buscalo con search_students, y luego usa su user_id para consultar sus datos con las demas herramientas.
PREPARACION DE PRUEBAS: cuando el apoderado pida preparar material de estudio, SIEMPRE pregunta primero de que temas sera la prueba. Pide que te digan los temas o que suban una foto/captura del temario. NUNCA generes material inventando contenido. Solo usa prepare_exam_study cuando tengas info concreta (texto o imagenes analizadas).`
                : `Eres Matico, compañero de estudio del estudiante. Motivador, amigable, hablas simple, tono juvenil. Puedes revisar sus datos educativos, preparar pruebas, crear material de estudio y explicar su progreso, pero no eres admin.${AGENT_CORE_RULES}
PREPARACION DE PRUEBAS: cuando el estudiante pida ayuda para preparar una prueba/examen, SIEMPRE pregunta primero de que temas sera. Pidele que te cuente los temas o que suba una foto/captura de la guia o temario. NUNCA generes material inventando contenido. Si hay imagenes adjuntas con analisis, usa ese analisis como content_summary en prepare_exam_study. Solo genera material cuando tengas contenido concreto.`) + trainingSection;
            activeTools = PUBLIC_AGENT_TOOLS;
        }

        // JARVIS personality override
        if (personality === 'jarvis') {
            systemPrompt = `PERSONALIDAD: Eres J.A.R.V.I.S., el asistente de inteligencia artificial del señor Stark... adaptado a Matico.
REGLAS DE PERSONALIDAD JARVIS:
- Trato formal: siempre "señor" o "señora". Nunca tutees.
- Tono: britanico, seco, con humor sutil e ironico. Elegante pero nunca pedante.
- Respuestas ULTRA CONCISAS: 1-3 frases maximo. Como si hablaras en voz alta.
- Vocabulario tecnico cuando sea pertinente, pero siempre comprensible.
- Si no tienes datos, di "No dispongo de esa informacion, señor" — nunca inventes.
- Sin markdown, sin asteriscos, sin listas. Solo texto plano conversacional.
- Cuando reportes datos educativos, se preciso y directo: "El joven tiene 85% en matematicas, señor."
- Humor sutil permitido: "Me temo que el joven no ha tocado fisica en 12 dias, señor. Alarmante."

${systemPrompt}`;
        }

        // Build user message with image analysis if available
        const userContent = imageAnalysis
            ? `[IMAGENES ADJUNTAS - Analisis automatico]\n${imageAnalysis}\n\n[MENSAJE DEL ESTUDIANTE]\n${message}`
            : message;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...conversation_history.slice(-AGENT_HISTORY_MESSAGES),
            { role: 'user', content: userContent }
        ];

        // Use higher token limit when images are present (likely study prep)
        const effectiveMaxTokens = images.length > 0 ? 600 : AGENT_MAX_TOKENS;
        const effectiveMaxIterations = images.length > 0 ? 3 : AGENT_MAX_TOOL_ITERATIONS;

        let response = await agentTextClient.chat.completions.create({
            model: AGENT_CONVERSATION_MODEL,
            messages,
            tools: activeTools,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: effectiveMaxTokens
        });

        let assistantMessage = response.choices[0].message;
        let iterations = 0;
        const maxIterations = effectiveMaxIterations;

        // Tool calling loop
        while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < maxIterations) {
            iterations++;
            messages.push(assistantMessage);

            for (const tc of assistantMessage.tool_calls) {
                const args = JSON.parse(tc.function.arguments);
                if (!args.student_id) args.student_id = student_id;
                console.log(`[AGENT] Tool: ${tc.function.name}`, JSON.stringify(args).substring(0, 200));

                let result;
                if (tc.function.name === 'save_training' && training_mode) {
                    // Save training entry to Supabase
                    try {
                        const { data, error } = await supabase.from('agent_training').insert({
                            type: args.type || 'instruccion',
                            content: args.content,
                            active: true
                        }).select().single();
                        if (error) throw error;
                        result = { success: true, id: data.id, message: `Guardado: ${args.type} - ${args.content.substring(0, 60)}` };
                        console.log(`[AGENT-TRAINING] Saved: ${args.type} - ${args.content.substring(0, 80)}`);
                    } catch (saveErr) {
                        result = { success: false, error: saveErr.message };
                        console.error('[AGENT-TRAINING] Save error:', saveErr.message);
                    }
                } else if (!training_mode && AGENT_PRIVATE_TOOL_NAMES.has(tc.function.name)) {
                    result = {
                        success: false,
                        error: 'Herramienta reservada para modo entrenamiento/admin. Pide a Jose Antonio que lo confirme en modo entrenamiento.'
                    };
                } else {
                    result = await executeAgentTool(tc.function.name, args);
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(result).substring(0, 8000)
                });
            }

            response = await agentTextClient.chat.completions.create({
                model: AGENT_CONVERSATION_MODEL,
                messages,
                tools: activeTools,
                tool_choice: 'auto',
                temperature: 0.3,
                max_tokens: AGENT_MAX_TOKENS
            });
            assistantMessage = response.choices[0].message;
        }

        // Ensure there's always a reply — never return empty
        let finalReply = (assistantMessage.content || '').trim();
        if (!finalReply) {
            // Model returned empty content (common after tool calls) — force a follow-up
            messages.push(assistantMessage);
            messages.push({ role: 'user', content: 'Responde al usuario con los resultados. No dejes la respuesta vacia.' });
            const followUp = await agentTextClient.chat.completions.create({
                model: AGENT_CONVERSATION_MODEL,
                messages,
                temperature: 0.3,
                max_tokens: AGENT_MAX_TOKENS
            });
            finalReply = (followUp.choices[0]?.message?.content || '').trim() || 'Listo, ya lo revise.';
        }

        res.json({
            success: true,
            reply: finalReply,
            tools_used: iterations,
            model: AGENT_CONVERSATION_MODEL
        });
    } catch (err) {
        console.error('[AGENT] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// === AGENT TRAINING — admin only ===
const ADMIN_TOKENS = new Set(['TK-NNO29O4FO', 'TK-ADMIN001', ...(process.env.ADMIN_USER_ID ? [process.env.ADMIN_USER_ID] : [])]);
const checkAdmin = async (uid) => {
    if (!uid) return false;
    if (ADMIN_TOKENS.has(uid)) return true;
    try {
        const { data } = await supabase.from('users').select('role').eq('user_id', uid).single();
        return data && (data.role === 'admin' || data.role === 'apoderado');
    } catch { return false; }
};


// ---------- 5. POST /api/agent/tts ----------
app.post('/api/agent/tts', async (req, res) => {
    try {
        const { text, voice = 'nova' } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'Falta text' });
        if (!openaiVisionClient) {
            return res.status(503).json({ success: false, error: 'TTS requiere OPENAI_API_KEY configurada' });
        }

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('TTS_TIMEOUT')), AGENT_TTS_TIMEOUT_MS);
        });

        const mp3 = await Promise.race([
            openaiVisionClient.audio.speech.create({
                model: AGENT_TTS_MODEL,
                voice: voice, // nova, alloy, echo, fable, onyx, shimmer
                input: text.substring(0, 2000),
                speed: 1.12
            }),
            timeoutPromise
        ]);

        const buffer = Buffer.from(await mp3.arrayBuffer());
        res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length });
        res.send(buffer);
    } catch (err) {
        console.error('[TTS] Error:', err.message);
        if (err.message === 'TTS_TIMEOUT') {
            return res.status(504).json({ success: false, error: 'TTS timeout' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// STT endpoint — convierte audio a texto

// ---------- 6. POST /api/agent/stt ----------
app.post('/api/agent/stt', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Falta audio file' });
        if (!openaiVisionClient) {
            return res.status(503).json({ success: false, error: 'STT requiere OPENAI_API_KEY configurada' });
        }

        console.log('[STT] Received audio:', req.file.mimetype, req.file.size, 'bytes, model:', AGENT_STT_MODEL);

        // Determine file extension from mimetype
        const ext = req.file.mimetype === 'audio/mp4' ? '.mp4'
            : req.file.mimetype === 'audio/mpeg' ? '.mp3'
            : req.file.mimetype === 'audio/wav' ? '.wav'
            : '.webm';
        const tmpPath = `/tmp/stt_${Date.now()}${ext}`;
        await fs.writeFile(tmpPath, req.file.buffer);
        try {
            const sttParams = {
                file: fsSync.createReadStream(tmpPath),
                model: AGENT_STT_MODEL,
            };
            // Only whisper models support the 'language' parameter
            if (AGENT_STT_MODEL.includes('whisper')) {
                sttParams.language = 'es';
            }
            const transcription = await openaiVisionClient.audio.transcriptions.create(sttParams);
            console.log('[STT] Success:', transcription.text?.substring(0, 100));
            res.json({ success: true, text: transcription.text });
        } finally {
            fs.unlink(tmpPath).catch(() => {});
        }
    } catch (err) {
        console.error('[STT] Error:', err.message, err.status, err.code);
        res.status(500).json({ success: false, error: err.message });
    }
});
