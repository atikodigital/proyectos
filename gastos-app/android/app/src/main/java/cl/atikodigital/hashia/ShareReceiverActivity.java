package cl.atikodigital.hashia;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Recibe texto "Compartido" desde cualquier chat (WhatsApp, etc.) y lo manda a la
 * bandeja "Chat" (/chat/ingest). Cero permisos: el usuario comparte el mensaje a mano.
 * Es invisible (translúcida): procesa y se cierra.
 */
public class ShareReceiverActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String text = "";
        Intent it = getIntent();
        if (it != null && Intent.ACTION_SEND.equals(it.getAction())
                && it.getType() != null && it.getType().startsWith("text/")) {
            CharSequence cs = it.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (cs != null) text = cs.toString().trim();
        }
        final String t = text;
        if (t.isEmpty()) { Toast.makeText(this, "No había texto para agregar.", Toast.LENGTH_SHORT).show(); finish(); return; }
        if (!AtikoBackend.hasToken(this)) {
            Toast.makeText(this, "Entra a Hash IA primero (abre la app e inicia sesión).", Toast.LENGTH_LONG).show();
            finish(); return;
        }
        Toast.makeText(this, "Agregado a la bandeja de Hash IA ✓", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try { AtikoBackend.ingest(this, "compartido", null, t, "share"); } catch (Exception ignored) {}
        }).start();
        finish();
    }
}
