package app.matico.dashboard;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Cliente HTTP del backend Atiko (CRM). Reusa el endpoint del overlay:
 *   POST /api/crm/overlay/pedido/suggest   -> arma el pedido con NEXO
 *   POST /api/crm/overlay/pedido/:id/sent  -> marca enviado
 * Auth: JWT del portal (un solo login). Se obtiene con login() y vive en SharedPreferences.
 *
 * Las llamadas son síncronas: invocar SIEMPRE fuera del hilo principal.
 */
public class AtikoBackend {

    // Hash IA → backend de GASTOS (gastos.atikodigital.cl). El APK del CRM usa otra base.
    public static final String BASE = "https://gastos.atikodigital.cl";
    private static final String PREFS = "atiko_overlay";
    private static final String KEY_TOKEN = "portal_token";

    public static String getToken(Context ctx) {
        return prefs(ctx).getString(KEY_TOKEN, null);
    }

    public static boolean hasToken(Context ctx) {
        String t = getToken(ctx);
        return t != null && !t.isEmpty();
    }

    /** Login del portal. Guarda el token. Devuelve true si quedó autenticado. */
    public static boolean login(Context ctx, String usuario, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("usuario", usuario);
        body.put("password", password);
        JSONObject res = post(BASE + "/api/app/login", body, null);
        String token = res.optString("token", "");
        if (token.isEmpty()) return false;
        prefs(ctx).edit().putString(KEY_TOKEN, token).apply();
        return true;
    }

    /** Pide a NEXO que arme el pedido desde el texto de la conversación. */
    public static JSONObject suggest(Context ctx, String channel, String contactName,
                                     String contactPhone, String conversation) throws Exception {
        JSONObject contact = new JSONObject();
        if (contactName != null) contact.put("name", contactName);
        if (contactPhone != null) contact.put("phone", contactPhone);
        JSONObject body = new JSONObject();
        body.put("channel", channel == null ? "whatsapp" : channel);
        body.put("contact", contact);
        body.put("conversation", conversation == null ? "" : conversation);
        return post(BASE + "/api/app/overlay/pedido/suggest", body, getToken(ctx));
    }

    /** Marca el pedido como enviado (el teléfono ya lo mandó por el chat real). */
    public static void markSent(Context ctx, String pedidoId) throws Exception {
        post(BASE + "/api/app/overlay/pedido/" + pedidoId + "/sent", new JSONObject(), getToken(ctx));
    }

    /** Agrega un mensaje a la bandeja "Chat" (desde notificaciones o "compartir"). */
    public static void ingest(Context ctx, String channel, String contact, String text, String source) throws Exception {
        JSONObject body = new JSONObject();
        body.put("channel", channel == null ? "whatsapp" : channel);
        if (contact != null && !contact.isEmpty()) body.put("contact", contact);
        body.put("text", text == null ? "" : text);
        body.put("source", source == null ? "notif" : source);
        post(BASE + "/api/app/chat/ingest", body, getToken(ctx));
    }

    // ── HTTP ──────────────────────────────────────────────────────────────
    private static JSONObject post(String urlStr, JSONObject body, String bearer) throws Exception {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            if (bearer != null && !bearer.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + bearer);
            }
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) { os.write(payload); }

            int code = conn.getResponseCode();
            InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
            String text = readAll(is);
            JSONObject json;
            try { json = new JSONObject(text); } catch (JSONException e) { json = new JSONObject(); }
            if (code < 200 || code >= 300) {
                String err = json.optString("error", "HTTP " + code);
                throw new Exception(err);
            }
            return json;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream is) throws Exception {
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
