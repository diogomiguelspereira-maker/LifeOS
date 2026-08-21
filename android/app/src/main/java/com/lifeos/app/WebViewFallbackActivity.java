/*
 * LifeOS — WebView fallback for when Trusted Web Activity is unavailable.
 *
 * The androidbrowserhelper library ships its own WebViewFallbackActivity, but it
 * does not configure the viewport at all, so on many devices the page is laid
 * out at desktop width (~980px) and shown zoomed into a corner — the app looks
 * "much bigger than the phone screen". This activity sets the standard mobile
 * WebView flags so the page respects its <meta name="viewport"> and fits the
 * screen.
 */
package com.lifeos.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.ContextCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;

public class WebViewFallbackActivity extends Activity {
    private static final String KEY_LAUNCH_URL = "launchUrl";

    private WebView mWebView;

    public static Intent createLaunchIntent(Context context, Uri url) {
        Intent intent = new Intent(context, WebViewFallbackActivity.class);
        intent.putExtra(KEY_LAUNCH_URL, url.toString());
        return intent;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String url = getIntent().getStringExtra(KEY_LAUNCH_URL);
        if (url == null) {
            finish();
            return;
        }

        mWebView = new WebView(this);
        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // ---- Mobile rendering: respect the page's viewport meta and, as a
        // safety net, zoom out to fit if any content is wider than the screen. ----
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        mWebView.setWebViewClient(new WebViewClient());
        mWebView.setWebChromeClient(new WebChromeClient());

        setContentView(mWebView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        if (savedInstanceState != null) {
            mWebView.restoreState(savedInstanceState);
        }
        mWebView.loadUrl(url);

        applySystemBarColors();
    }

    private void applySystemBarColors() {
        LauncherActivityMetadata metadata = LauncherActivityMetadata.parse(this);
        if (metadata == null) return;
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(ContextCompat.getColor(this, metadata.statusBarColorId));
            window.setNavigationBarColor(ContextCompat.getColor(this, metadata.navigationBarColorId));
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mWebView != null) {
            mWebView.saveState(outState);
        }
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (mWebView != null) {
            mWebView.destroy();
            mWebView = null;
        }
        super.onDestroy();
    }
}
