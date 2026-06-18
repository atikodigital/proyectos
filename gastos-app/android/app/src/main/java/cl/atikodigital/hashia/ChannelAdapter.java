package cl.atikodigital.hashia;

import android.view.accessibility.AccessibilityNodeInfo;

/**
 * Contrato de un canal (WhatsApp, IG, Telegram, Gmail) para el motor de pedidos.
 * Cada app cambia su UI con el tiempo: si algo deja de leer/enviar, se ajusta acá.
 */
public interface ChannelAdapter {
    /** Identificador del canal para el backend (ej. "whatsapp"). */
    String channelName();

    /** Concatena los mensajes visibles del chat activo (orden de pantalla). "" si no hay. */
    String leerConversacion(AccessibilityNodeInfo root);

    /** Nombre/título del contacto del chat (cabecera). null si no se pudo. */
    String readContactName(AccessibilityNodeInfo root);

    /** Escribe el texto en la barra de escribir y toca enviar. true si lo logró. */
    boolean escribirYEnviar(AccessibilityNodeInfo root, String text);
}
