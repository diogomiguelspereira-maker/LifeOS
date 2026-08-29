/*
 * LifeOS — background location share service.
 *
 * Started by the WebView shell (LifeOSBridge) with the active share token, the
 * Supabase project URL and the anon key. It runs a foreground service (with a
 * persistent notification) and posts the device's location to the
 * update_location_share RPC every ~30s so the share stays live even when the
 * app/page is not in the foreground.
 *
 * Deliberately dependency-light: core LocationManager + HttpURLConnection +
 * org.json. No Play Services required.
 */
package com.lifeos.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class LocationShareService extends Service implements LocationListener {
    private static final String TAG = "LifeOSLoc";
    private static final String CHANNEL_ID = "lifeos_location";
    private static final int NOTIFICATION_ID = 1;

    public static final String ACTION_START = "com.lifeos.app.ACTION_START_LOCATION";
    public static final String ACTION_STOP = "com.lifeos.app.ACTION_STOP_LOCATION";

    private static final String PREFS = "lifeos_location";
    private static final String KEY_TOKEN = "share_token";
    private static final String KEY_URL = "supabase_url";
    private static final String KEY_ANON = "supabase_anon";

    private static final long MIN_UPLOAD_MS = 30_000;

    private String token;
    private String url;
    private String anon;
    private long lastUpload = 0;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) { stopSelf(); return START_NOT_STICKY; }

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (intent != null && intent.getStringExtra("token") != null) {
            token = intent.getStringExtra("token");
            url = intent.getStringExtra("url");
            anon = intent.getStringExtra("anon");
            prefs.edit()
                    .putString(KEY_TOKEN, token)
                    .putString(KEY_URL, url)
                    .putString(KEY_ANON, anon)
                    .apply();
        } else {
            token = prefs.getString(KEY_TOKEN, null);
            url = prefs.getString(KEY_URL, null);
            anon = prefs.getString(KEY_ANON, null);
        }

        if (token == null || url == null || anon == null) { stopSelf(); return START_NOT_STICKY; }

        startForegroundSafely();

        // No location permission at all — stop rather than run uselessly.
        boolean fine = permissionGranted(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = permissionGranted(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (!fine && !coarse) { stopSelf(); return START_NOT_STICKY; }

        LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (fine) {
            try {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15_000, 0, this);
            } catch (SecurityException ignored) { }
        }
        if (fine || coarse) {
            try {
                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000, 0, this);
            } catch (SecurityException ignored) { }
        }

        // STICKY so the OS restarts us (token is read back from prefs).
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (now - lastUpload < MIN_UPLOAD_MS) return;
        lastUpload = now;
        upload(location.getLatitude(), location.getLongitude(), location.getAccuracy());
    }

    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) { }
    @SuppressWarnings("deprecation") @Override public void onStatusChanged(String provider, int status, Bundle extras) { }

    private void upload(final double lat, final double lon, final float accuracy) {
        final String endpoint = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL u = new URL(endpoint + "/rest/v1/rpc/update_location_share");
                conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("apikey", anon);
                conn.setRequestProperty("Authorization", "Bearer " + anon);
                conn.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("p_token", token);
                body.put("p_lat", lat);
                body.put("p_lon", lon);
                body.put("p_accuracy", accuracy);

                OutputStream os = conn.getOutputStream();
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                os.close();

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    Log.w(TAG, "upload failed, HTTP " + code);
                }
            } catch (Exception e) {
                Log.w(TAG, "upload error", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private boolean permissionGranted(String permission) {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void startForegroundSafely() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(
                    new NotificationChannel(CHANNEL_ID, "Partilha de localização", NotificationManager.IMPORTANCE_LOW));
        }

        Intent open = new Intent(this, WebViewFallbackActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        Notification notification = b
                .setContentTitle("LifeOS")
                .setContentText("A partilhar a localização")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();

        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            LocationManager lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm != null) lm.removeUpdates(this);
        } catch (SecurityException ignored) { }
    }
}