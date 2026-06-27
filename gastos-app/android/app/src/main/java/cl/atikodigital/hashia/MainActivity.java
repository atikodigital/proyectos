package cl.atikodigital.hashia;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MaticoScreenCapturePlugin.class);
        registerPlugin(AtikoPedidoPlugin.class);
        super.onCreate(savedInstanceState);
        enableMediaAutoplay();
        requestAppPermissions();
    }

    // El WebView de Android nace con mediaPlaybackRequiresUserGesture=true, lo que
    // bloquea el autoplay de audio. Sin esto, el AudioContext de KALY (tanto el de
    // salida —su saludo/voz— como el del micrófono) queda 'suspended' hasta el primer
    // toque del usuario: KALY no saluda al abrir, no habla y no escucha. La gracia de
    // KALY es justamente saludar y enseñar apenas se abre la app, así que lo habilitamos.
    private void enableMediaAutoplay() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception e) { /* no-op: si falla, queda el comportamiento por defecto */ }
    }

    // Solicita permisos nativos base al iniciar la app.
    private void requestAppPermissions() {
        List<String> permissions = new ArrayList<>();
        String[] required = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS,
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
            permissions.add(Manifest.permission.READ_MEDIA_VIDEO);
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        } else if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        for (String perm : required) {
            permissions.add(perm);
        }

        List<String> toRequest = new ArrayList<>();
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(perm);
            }
        }

        if (!toRequest.isEmpty()) {
            ActivityCompat.requestPermissions(this, toRequest.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }
}
