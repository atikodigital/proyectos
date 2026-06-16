package app.matico.dashboard;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Captura pasiva para la bandeja "Chat": lee el texto de las notificaciones de
 * WhatsApp / Messenger / Instagram / Telegram y lo manda al backend (/chat/ingest).
 * No lee nada más: ignora cualquier otra app. Solo guarda si hay sesión iniciada.
 */
public class NexoNotificationListener extends NotificationListenerService {

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            final String channel = channelFor(sbn.getPackageName());
            if (channel == null) return;
            Notification n = sbn.getNotification();
            if (n == null || n.extras == null) return;
            if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return; // notif persistente (servicio)
            Bundle ex = n.extras;
            final String contact = str(ex.getCharSequence(Notification.EXTRA_TITLE));
            final String text = str(ex.getCharSequence(Notification.EXTRA_TEXT));
            if (text.isEmpty() || esResumen(text)) return;
            if (!AtikoBackend.hasToken(this)) return; // sin login no guardamos
            new Thread(() -> {
                try { AtikoBackend.ingest(this, channel, contact, text, "notif"); } catch (Exception ignored) {}
            }).start();
        } catch (Throwable ignored) {}
    }

    private static String channelFor(String pkg) {
        if (pkg == null) return null;
        if (pkg.startsWith("com.whatsapp")) return "whatsapp";
        if (pkg.equals("com.facebook.orca")) return "messenger";
        if (pkg.equals("com.instagram.android")) return "instagram";
        if (pkg.startsWith("org.telegram")) return "telegram";
        return null;
    }

    /** Filtra notificaciones-resumen ("3 mensajes nuevos", "checking for messages", etc.). */
    private static boolean esResumen(String t) {
        String s = t.toLowerCase();
        if (s.contains("mensaje nuevo") || s.contains("mensajes nuevos")) return true;
        if (s.contains("new message") || s.contains("checking for")) return true;
        if (s.contains("revisando si hay") || s.contains("buscando mensajes")) return true;
        return s.matches(".*\\d+\\s+(mensaje|message|chat)s?.*");
    }

    private static String str(CharSequence c) { return c == null ? "" : c.toString().trim(); }
}
