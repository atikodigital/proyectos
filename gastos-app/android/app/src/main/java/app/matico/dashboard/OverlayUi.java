package app.matico.dashboard;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * UI flotante del overlay "Crear pedido": una burbuja arrastrable y un cuadro emergente
 * editable. Orquesta el flujo leer→backend→cuadro→enviar usando el AccessibilityService.
 * El trabajo de red va en hilos aparte; la UI se toca solo en el hilo principal.
 */
public class OverlayUi {

    private final PedidoAccessibilityService service;
    private final WindowManager wm;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final int screenW, screenH;

    private View bubbleView;
    private WindowManager.LayoutParams bubbleParams;
    private View popupView;

    public OverlayUi(PedidoAccessibilityService service) {
        this.service = service;
        this.wm = (WindowManager) service.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics m = new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(m);
        screenW = m.widthPixels;
        screenH = m.heightPixels;
    }

    // ── Burbuja ──────────────────────────────────────────────────────────
    public void showBubble() {
        ui.post(() -> {
            if (bubbleView != null) { bubbleView.setVisibility(View.VISIBLE); return; }
            TextView b = new TextView(service);
            b.setText("Crear\npedido");
            b.setTextColor(0xFFFFFFFF);
            b.setTextSize(13f);
            b.setGravity(Gravity.CENTER);
            b.setTypeface(b.getTypeface(), Typeface.BOLD);
            GradientDrawable bg = new GradientDrawable();
            bg.setShape(GradientDrawable.RECTANGLE);
            bg.setColor(0xFFB8860B); // dorado Atiko
            bg.setCornerRadius(dp(28));
            bg.setStroke(dp(2), 0xFF000000);
            b.setBackground(bg);
            b.setElevation(dp(6));
            bubbleView = b;
            bubbleParams = bubbleLayout();
            attachDrag(b);
            try { wm.addView(bubbleView, bubbleParams); } catch (Throwable ignored) {}
        });
    }

    public void hideBubble() {
        if (bubbleView != null) bubbleView.setVisibility(View.GONE);
    }

    private WindowManager.LayoutParams bubbleLayout() {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                dp(120), dp(56), overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = Math.max(0, screenW - dp(120) - dp(16));
        p.y = Math.max(0, screenH - dp(56) - dp(220));
        return p;
    }

    private void attachDrag(View bubble) {
        final int slop = ViewConfiguration.get(service).getScaledTouchSlop();
        bubble.setOnTouchListener(new View.OnTouchListener() {
            int sx, sy; float dx, dy; boolean dragging;
            @Override public boolean onTouch(View v, MotionEvent e) {
                if (bubbleParams == null) return false;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        sx = bubbleParams.x; sy = bubbleParams.y;
                        dx = e.getRawX(); dy = e.getRawY(); dragging = false;
                        v.setAlpha(0.85f); return true;
                    case MotionEvent.ACTION_MOVE:
                        float mx = e.getRawX() - dx, my = e.getRawY() - dy;
                        if (!dragging && (Math.abs(mx) > slop || Math.abs(my) > slop)) dragging = true;
                        if (dragging) {
                            bubbleParams.x = clamp(sx + (int) mx, 0, screenW - dp(120));
                            bubbleParams.y = clamp(sy + (int) my, 0, screenH - dp(56));
                            try { wm.updateViewLayout(bubbleView, bubbleParams); } catch (Throwable ignored) {}
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        v.setAlpha(1f);
                        if (!dragging) { v.performClick(); startFlow(); }
                        return true;
                }
                return false;
            }
        });
    }

    // ── Flujo: leer → backend → cuadro ───────────────────────────────────
    private void startFlow() {
        if (!AtikoBackend.hasToken(service)) {
            showLoginPopup(); return;
        }
        if (service.currentAdapter() == null) {
            toast("Abre un chat de WhatsApp para crear el pedido."); return;
        }
        hideBubble();
        toast("Leyendo la conversación…");
        new Thread(() -> {
            try {
                String convo = service.leerConversacionActual();
                if (convo == null || convo.trim().isEmpty()) {
                    ui.post(() -> { toast("No pude leer la conversación."); showBubble(); });
                    return;
                }
                String contacto = service.leerContactoActual();
                String canal = service.canalActual();
                JSONObject res = AtikoBackend.suggest(service, canal, contacto, null, convo);
                String text = res.optString("text", "");
                String pedidoId = res.getJSONObject("pedido").optString("id", "");
                ui.post(() -> showPopup(text, pedidoId));
            } catch (Exception ex) {
                ui.post(() -> { toast("NEXO: " + ex.getMessage()); showBubble(); });
            }
        }).start();
    }

    // ── Login del portal (nativo, autocontenido) ─────────────────────────
    private void showLoginPopup() {
        removePopup();
        hideBubble();
        LinearLayout root = new LinearLayout(service);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable card = new GradientDrawable();
        card.setColor(0xFF111111);
        card.setCornerRadius(dp(18));
        card.setStroke(dp(2), 0xFFB8860B);
        root.setBackground(card);
        root.setElevation(dp(10));

        TextView title = new TextView(service);
        title.setText("Entrar a Atiko");
        title.setTextColor(0xFFB8860B);
        title.setTextSize(16f);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        root.addView(title);

        final EditText email = new EditText(service);
        email.setHint("Usuario");
        email.setHintTextColor(0x88FFFFFF);
        email.setTextColor(0xFFFFFFFF);
        email.setInputType(InputType.TYPE_CLASS_TEXT);
        email.setBackgroundColor(0x22FFFFFF);
        email.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams em = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        em.topMargin = dp(10);
        root.addView(email, em);

        final EditText pass = new EditText(service);
        pass.setHint("Clave");
        pass.setHintTextColor(0x88FFFFFF);
        pass.setTextColor(0xFFFFFFFF);
        pass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pass.setBackgroundColor(0x22FFFFFF);
        pass.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams pm = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pm.topMargin = dp(8); pm.bottomMargin = dp(12);
        root.addView(pass, pm);

        LinearLayout row = new LinearLayout(service);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView cancel = pill("Cancelar", 0xFF444444);
        TextView enter = pill("Entrar", 0xFFB8860B);
        cancel.setOnClickListener(v -> { removePopup(); showBubble(); });
        enter.setOnClickListener(v -> doLogin(email.getText().toString().trim(), pass.getText().toString()));
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        l.rightMargin = dp(6);
        LinearLayout.LayoutParams r = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        r.leftMargin = dp(6);
        row.addView(cancel, l);
        row.addView(enter, r);
        root.addView(row);

        popupView = root;
        try { wm.addView(popupView, popupLayout()); } catch (Throwable ignored) {}
    }

    private void doLogin(String email, String password) {
        if (email.isEmpty() || password.isEmpty()) { toast("Completa correo y clave."); return; }
        removePopup();
        toast("Entrando…");
        new Thread(() -> {
            try {
                boolean ok = AtikoBackend.login(service, email, password);
                ui.post(() -> {
                    if (ok) { toast("Sesión iniciada. Toca de nuevo para crear el pedido."); showBubble(); }
                    else { toast("No se pudo iniciar sesión."); showBubble(); }
                });
            } catch (Exception e) {
                ui.post(() -> { toast("Login: " + e.getMessage()); showBubble(); });
            }
        }).start();
    }

    // ── Cuadro emergente editable ────────────────────────────────────────
    private void showPopup(String text, String pedidoId) {
        removePopup();
        LinearLayout root = new LinearLayout(service);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable card = new GradientDrawable();
        card.setColor(0xFF111111);
        card.setCornerRadius(dp(18));
        card.setStroke(dp(2), 0xFFB8860B);
        root.setBackground(card);
        root.setElevation(dp(10));

        TextView title = new TextView(service);
        title.setText("🧾 Pedido (revisa y envía)");
        title.setTextColor(0xFFB8860B);
        title.setTextSize(16f);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        root.addView(title);

        final EditText edit = new EditText(service);
        edit.setText(text);
        edit.setTextColor(0xFFFFFFFF);
        edit.setTextSize(14f);
        edit.setBackgroundColor(0x22FFFFFF);
        edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        edit.setPadding(dp(10), dp(10), dp(10), dp(10));
        ScrollView sv = new ScrollView(service);
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(150));
        svLp.topMargin = dp(10); svLp.bottomMargin = dp(12);
        sv.addView(edit);
        root.addView(sv, svLp);

        LinearLayout row = new LinearLayout(service);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView cancel = pill("Cancelar", 0xFF444444);
        TextView send = pill("Enviar por WhatsApp", 0xFF16A34A);
        cancel.setOnClickListener(v -> { removePopup(); showBubble(); });
        send.setOnClickListener(v -> doSendWhatsApp(edit.getText().toString(), pedidoId));
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        l.rightMargin = dp(6);
        LinearLayout.LayoutParams r = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        r.leftMargin = dp(6);
        row.addView(cancel, l);
        row.addView(send, r);
        root.addView(row);

        popupView = root;
        try { wm.addView(popupView, popupLayout()); } catch (Throwable ignored) {}
    }

    /** Params del cuadro emergente: focusable (el EditText recibe teclado), centrado. */
    private WindowManager.LayoutParams popupLayout() {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                Math.min(screenW - dp(24), dp(360)),
                WindowManager.LayoutParams.WRAP_CONTENT,
                overlayType(),
                // SIN FLAG_LAYOUT_IN_SCREEN: así el cuadro NO tapa la barra de navegación
                // del sistema (los 3 botones) ni deja al usuario atrapado.
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP; // anclado arriba → el teclado (abajo) no tapa el botón Enviar
        p.y = dp(36);
        p.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        return p;
    }

    /**
     * Abre WhatsApp (oficial) con el pedido ya escrito en el cuadro de texto.
     * El usuario elige el chat y aprieta enviar él mismo: es un envío manual normal,
     * sin accesibilidad y sin riesgo de baneo. Fallback a wa.me si no está la app.
     */
    private void doSendWhatsApp(String texto, String pedidoId) {
        removePopup();
        boolean abierto = false;
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, texto);
            i.setPackage("com.whatsapp");
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            service.startActivity(i);
            abierto = true;
        } catch (Throwable t) {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, texto);
                i.setPackage("com.whatsapp.w4b"); // WhatsApp Business
                i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                service.startActivity(i);
                abierto = true;
            } catch (Throwable t2) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/?text=" + Uri.encode(texto)));
                    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    service.startActivity(i);
                    abierto = true;
                } catch (Throwable t3) { toast("No pude abrir WhatsApp."); }
            }
        }
        if (abierto && pedidoId != null && !pedidoId.isEmpty()) {
            new Thread(() -> { try { AtikoBackend.markSent(service, pedidoId); } catch (Exception ignored) {} }).start();
        }
        ui.post(this::showBubble);
    }

    private void removePopup() {
        if (popupView != null) {
            try { wm.removeView(popupView); } catch (Throwable ignored) {}
            popupView = null;
        }
    }

    public void destroy() {
        removePopup();
        if (bubbleView != null) {
            try { wm.removeView(bubbleView); } catch (Throwable ignored) {}
            bubbleView = null;
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────
    private TextView pill(String text, int color) {
        TextView t = new TextView(service);
        t.setText(text);
        t.setTextColor(0xFFFFFFFF);
        t.setTextSize(14f);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(t.getTypeface(), Typeface.BOLD);
        t.setPadding(dp(14), dp(12), dp(14), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(24));
        t.setBackground(bg);
        return t;
    }

    private void toast(String msg) {
        ui.post(() -> Toast.makeText(service, msg, Toast.LENGTH_SHORT).show());
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private int dp(int v) {
        return Math.round(v * service.getResources().getDisplayMetrics().density);
    }

    private int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
