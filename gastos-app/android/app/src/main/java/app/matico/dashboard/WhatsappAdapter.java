package app.matico.dashboard;

import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;

import java.util.ArrayList;
import java.util.List;

/**
 * Adaptador WhatsApp. Los IDs de vista (com.whatsapp:id/...) pueden cambiar por versión;
 * si dejan de funcionar, re-dumpear el árbol en el dispositivo y actualizarlos aquí.
 */
public class WhatsappAdapter implements ChannelAdapter {

    // IDs típicos de WhatsApp (verificar en el dispositivo en la 1ra prueba).
    private static final String ID_MESSAGE = "com.whatsapp:id/message_text";
    private static final String ID_ENTRY = "com.whatsapp:id/entry";
    private static final String ID_SEND = "com.whatsapp:id/send";
    private static final String ID_TITLE = "com.whatsapp:id/conversation_contact_name";

    @Override
    public String channelName() { return "whatsapp"; }

    @Override
    public String leerConversacion(AccessibilityNodeInfo root) {
        if (root == null) return "";
        List<CharSequence> msgs = new ArrayList<>();
        // 1) Camino preferido: nodos con el id de texto de mensaje.
        collectTextByViewId(root, ID_MESSAGE, msgs);
        // 2) Fallback: si el id cambió, juntar textos largos visibles (heurística).
        if (msgs.isEmpty()) collectLikelyMessageTexts(root, msgs);
        StringBuilder sb = new StringBuilder();
        for (CharSequence m : msgs) {
            String s = m == null ? "" : m.toString().trim();
            if (!s.isEmpty()) sb.append(s).append("\n");
        }
        return sb.toString().trim();
    }

    @Override
    public String readContactName(AccessibilityNodeInfo root) {
        if (root == null) return null;
        List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByViewId(ID_TITLE);
        if (found != null && !found.isEmpty()) {
            CharSequence t = found.get(0).getText();
            return t == null ? null : t.toString().trim();
        }
        return null;
    }

    @Override
    public boolean escribirYEnviar(AccessibilityNodeInfo root, String text) {
        if (root == null || text == null) return false;
        AccessibilityNodeInfo input = firstByViewId(root, ID_ENTRY);
        if (input == null) return false;
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean set = input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
        if (!set) return false;
        AccessibilityNodeInfo send = firstByViewId(root, ID_SEND);
        if (send == null) return false;
        // El botón "enviar" aparece recién cuando hay texto; pequeño respiro implícito.
        return send.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }

    // ── helpers ───────────────────────────────────────────────────────────
    private AccessibilityNodeInfo firstByViewId(AccessibilityNodeInfo root, String id) {
        List<AccessibilityNodeInfo> l = root.findAccessibilityNodeInfosByViewId(id);
        return (l != null && !l.isEmpty()) ? l.get(0) : null;
    }

    private void collectTextByViewId(AccessibilityNodeInfo root, String id, List<CharSequence> out) {
        List<AccessibilityNodeInfo> l = root.findAccessibilityNodeInfosByViewId(id);
        if (l == null) return;
        for (AccessibilityNodeInfo n : l) {
            if (n != null && n.getText() != null) out.add(n.getText());
        }
    }

    /** Heurística de respaldo: recorre el árbol y junta textos de TextViews visibles. */
    private void collectLikelyMessageTexts(AccessibilityNodeInfo node, List<CharSequence> out) {
        if (node == null || out.size() > 80) return;
        CharSequence cls = node.getClassName();
        CharSequence txt = node.getText();
        if (txt != null && txt.toString().trim().length() > 1
                && cls != null && cls.toString().contains("TextView")) {
            out.add(txt);
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            collectLikelyMessageTexts(node.getChild(i), out);
        }
    }
}
