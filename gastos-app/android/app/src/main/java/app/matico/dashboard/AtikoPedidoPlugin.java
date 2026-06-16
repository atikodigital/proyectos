package app.matico.dashboard;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente JS↔nativo del overlay "Crear pedido".
 * - login(): autentica contra el portal Atiko y guarda el JWT (un solo login).
 * - status(): si hay token + permisos de accesibilidad y overlay concedidos.
 * - openAccessibilitySettings()/openOverlaySettings(): abren los ajustes para activarlos.
 * - refreshOverlay(): pinta la burbuja si ya están los permisos.
 */
@CapacitorPlugin(name = "AtikoPedido")
public class AtikoPedidoPlugin extends Plugin {

    @PluginMethod
    public void login(PluginCall call) {
        final String email = call.getString("email", "");
        final String password = call.getString("password", "");
        if (TextUtils.isEmpty(email) || TextUtils.isEmpty(password)) {
            call.reject("faltan_credenciales");
            return;
        }
        new Thread(() -> {
            try {
                boolean ok = AtikoBackend.login(getContext(), email, password);
                JSObject r = new JSObject();
                r.put("ok", ok);
                if (ok) call.resolve(r); else call.reject("login_failed");
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "login_error" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("hasToken", AtikoBackend.hasToken(getContext()));
        r.put("accessibilityEnabled", isAccessibilityEnabled(getContext()));
        r.put("overlayGranted", Settings.canDrawOverlays(getContext()));
        r.put("notificationAccess", isNotificationAccessEnabled(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void logout(PluginCall call) {
        getContext().getSharedPreferences("atiko_overlay", Context.MODE_PRIVATE)
                .edit().remove("portal_token").apply();
        call.resolve();
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void refreshOverlay(PluginCall call) {
        PedidoAccessibilityService.refresh();
        call.resolve();
    }

    private boolean isNotificationAccessEnabled(Context ctx) {
        String flat = Settings.Secure.getString(ctx.getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(ctx.getPackageName());
    }

    private boolean isAccessibilityEnabled(Context ctx) {
        String enabled = Settings.Secure.getString(
                ctx.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        String me = ctx.getPackageName() + "/" + PedidoAccessibilityService.class.getName();
        String meShort = ctx.getPackageName() + "/.PedidoAccessibilityService";
        return enabled.contains(me) || enabled.contains(meShort);
    }
}
