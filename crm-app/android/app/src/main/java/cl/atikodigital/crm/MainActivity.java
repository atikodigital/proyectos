package cl.atikodigital.crm;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AtikoPedidoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
