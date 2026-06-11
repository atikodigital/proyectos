require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const chatRoutes = require("./routes/chat");
const webhookRoutes = require("./routes/webhook");
const socialRoutes = require("./routes/social");
const reelsRoutes = require("./routes/reels");
const postsRoutes = require("./routes/posts");
const contentRoutes = require("./routes/content");
const realtime = require("./services/realtime");

const app = express();
const PORT = process.env.PORT || 3000;

// Necesario cuando Express esta detras de Caddy/Nginx como proxy inverso
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = [
  "https://atikodigital.cl",
  "https://www.atikodigital.cl",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (origin === "null") return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith("http://localhost:")) return true;
  if (origin.startsWith("http://127.0.0.1:")) return true;
  return false;
}

app.use(cors({
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS bloqueado: " + origin));
    }
  },
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Capturar body raw para debug de errores JSON (Caddy proxy)
app.use(function(req, res, next) {
  var raw = "";
  req.on("data", function(chunk) { raw += chunk; });
  req.on("end", function() { req.rawBody = raw; });
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera un momento.", retryAfter: 60 },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Generar un reel es caro (Gemini + render Remotion): límite estricto.
const reelsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas generaciones de reel. Espera unos minutos.", retryAfter: 300 },
});

// Posts/imágenes: más barato que un reel pero también consume Gemini + render.
const postsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas generaciones de posts. Espera unos minutos.", retryAfter: 300 },
});

app.use("/widget", express.static(path.join(__dirname, "public")));
// Panel web (Fase 4d): build estático de la SPA React (panel/dist), servido en /panel
app.use("/panel", express.static(path.join(__dirname, "..", "panel", "dist")));
app.use("/api/chat", chatLimiter, chatRoutes);
app.use("/api/whatsapp/webhook", webhookLimiter, webhookRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/reels", reelsLimiter, reelsRoutes);
app.use("/api/posts", postsLimiter, postsRoutes);
app.use("/api/content", contentRoutes);

app.get("/health", function(req, res) {
  res.json({
    status: "ok",
    agent: "Atiko AI Agent",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    env: {
      provider: process.env.AGENT_PROVIDER || "openai",
      openai: process.env.OPENAI_API_KEY ? "configurado" : "falta OPENAI_API_KEY",
      deepseek: process.env.DEEPSEEK_API_KEY ? "configurado" : "falta DEEPSEEK_API_KEY",
      whatsapp: (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) ? "configurado" : "pendiente",
      gemini: process.env.GEMINI_API_KEY ? "configurado" : "pendiente",
    }
  });
});

app.get("/", function(req, res) {
  res.json({
    message: "Atiko AI Agent corriendo",
    endpoints: {
      chat: "POST /api/chat",
      tts: "POST /api/chat/tts",
      stt: "POST /api/chat/stt",
      whatsapp: "GET/POST /api/whatsapp/webhook",
      health: "GET /health",
    }
  });
});

app.use(function(err, req, res, next) {
  console.error("[Server Error]", err.message);
  if (err.type === "entity.parse.failed") {
    console.error("[JSON Debug] Raw body:", JSON.stringify(req.rawBody));
    console.error("[JSON Debug] Content-Type:", req.headers["content-type"]);
    return res.status(400).json({ error: "JSON invalido" });
  }
  res.status(500).json({ error: "Error interno del servidor" });
});

// ── Servidor HTTP + WebSocket (voz en tiempo real) ──────────────
const server = http.createServer(app);

// WS sin servidor propio: gestionamos el upgrade manualmente para validar ruta y origin
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", function(req, socket, head) {
  const pathname = (req.url || "").split("?")[0];

  if (pathname !== "/api/voice/live") {
    socket.destroy();
    return;
  }

  if (!isOriginAllowed(req.headers.origin)) {
    console.warn("[Realtime] WS origin bloqueado: " + req.headers.origin);
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, function(ws) {
    realtime.handleConnection(ws);
  });
});

server.listen(PORT, function() {
  console.log("");
  console.log("  ATIKO AI AGENT");
  console.log("  Puerto: " + PORT);
  console.log("  OpenAI: " + (process.env.OPENAI_API_KEY ? "OK" : "FALTA KEY"));
  console.log("  DeepSeek: " + (process.env.DEEPSEEK_API_KEY ? "OK" : "FALTA KEY"));
  console.log("  Voz tiempo real (WS): /api/voice/live · modelo " + realtime.REALTIME_MODEL + " · voz " + realtime.REALTIME_VOICE);
  console.log("  WhatsApp: " + ((process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) ? "OK" : "pendiente"));
  console.log("");
});

module.exports = app;
