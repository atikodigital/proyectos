package cl.atikodigital.hashia;

import android.provider.Settings;
import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * Motor del overlay "Crear pedido". Servicio de Accesibilidad que:
 *  - sabe qué app está adelante (currentPackage),
 *  - entrega el árbol de la ventana activa,
 *  - lee la conversación y escribe+envía vía el adaptador del canal,
 *  - hospeda el overlay (burbuja + cuadro) — al ser long-lived no necesita foreground service.
 *
 * NO se mete con nada de Hash IA: es additivo y self-contained.
 */
public class PedidoAccessibilityService extends AccessibilityService {

    public static PedidoAccessibilityService instance;
    public static volatile String currentPackage = "";

    private OverlayUi overlay;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        tryShowOverlay();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence pkg = event.getPackageName();
        if (pkg == null) return;
        String p = pkg.toString();
        if (p.equals(getPackageName())) return; // ignora nuestra propia ventana
        if (p.equals(currentPackage)) return;   // sin cambio real
        currentPackage = p;
        updateBubble();
    }

    /** La burbuja "Crear pedido" solo aparece cuando estás en un chat soportado (WhatsApp). */
    private void updateBubble() {
        if (overlay == null) return;
        if (currentAdapter() != null) overlay.showBubble();
        else overlay.hideBubble();
    }

    @Override
    public void onInterrupt() { }

    @Override
    public void onDestroy() {
        if (overlay != null) { overlay.destroy(); overlay = null; }
        if (instance == this) instance = null;
        super.onDestroy();
    }

    /** Muestra la burbuja si hay permiso de overlay. Idempotente. Llamable tras conceder permiso. */
    public void tryShowOverlay() {
        try {
            if (!Settings.canDrawOverlays(this)) return;
            if (overlay == null) overlay = new OverlayUi(this);
            updateBubble();
        } catch (Throwable ignored) { }
    }

    /** Re-intenta mostrar el overlay (lo llama el plugin cuando el usuario vuelve de Ajustes). */
    public static void refresh() {
        if (instance != null) instance.tryShowOverlay();
    }

    public AccessibilityNodeInfo getRoot() {
        try { return getRootInActiveWindow(); } catch (Throwable t) { return null; }
    }

    public ChannelAdapter currentAdapter() {
        if ("com.whatsapp".equals(currentPackage) || "com.whatsapp.w4b".equals(currentPackage)) {
            return new WhatsappAdapter();
        }
        return null;
    }

    public String leerConversacionActual() {
        ChannelAdapter a = currentAdapter();
        AccessibilityNodeInfo root = getRoot();
        if (a == null || root == null) return "";
        try { return a.leerConversacion(root); }
        finally { try { root.recycle(); } catch (Throwable ignored) {} }
    }

    public String leerContactoActual() {
        ChannelAdapter a = currentAdapter();
        AccessibilityNodeInfo root = getRoot();
        if (a == null || root == null) return null;
        try { return a.readContactName(root); }
        finally { try { root.recycle(); } catch (Throwable ignored) {} }
    }

    public String canalActual() {
        ChannelAdapter a = currentAdapter();
        return a == null ? null : a.channelName();
    }

    public boolean enviarEnChatActual(String texto) {
        ChannelAdapter a = currentAdapter();
        AccessibilityNodeInfo root = getRoot();
        if (a == null || root == null) return false;
        try { return a.escribirYEnviar(root, texto); }
        finally { try { root.recycle(); } catch (Throwable ignored) {} }
    }
}
