package com.flaviocecca.slideshower;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SlideshowerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
