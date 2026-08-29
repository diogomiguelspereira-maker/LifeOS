/*
 * LifeOS — launcher that always opens the WebView shell.
 *
 * Bubblewrap's default launcher opens a Custom Tab, and Custom Tabs cannot expose
 * a JavaScript interface to the page. Because background location needs the page
 * to hand an active share to the native LocationShareService, this activity makes
 * the WebView shell (which registers LifeOSBridge) the launcher instead.
 */
package com.lifeos.app;

import android.content.Intent;
import android.os.Bundle;

public class WebViewLauncherActivity extends WebViewFallbackActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // WebViewFallbackActivity expects the launch URL in the "launchUrl" extra.
        // Lazy-init it from the build-provided res value so deep links still work.
        Intent intent = getIntent();
        if (intent.getStringExtra("launchUrl") == null) {
            intent.putExtra("launchUrl", getString(R.string.launchUrl));
            setIntent(intent);
        }
        super.onCreate(savedInstanceState);
    }
}