package com.lifeos.drive

import android.Manifest
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.car.app.CarContext
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object WazeApi {

    data class Alert(
        val lat: Double,
        val lon: Double,
        val type: String,
        val label: String,
        val emoji: String,
        val distM: Int,
        val street: String?,
        val city: String?
    ) {
        val distanceText: String
            get() = if (distM < 1000) "${distM} m" else String.format("%.1f km", distM / 1000.0)
    }

    fun lastLocation(carContext: CarContext): Location? {
        val fine = ContextCompat.checkSelfPermission(carContext, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(carContext, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val lm = carContext.getSystemService(LocationManager::class.java) ?: return null
        return listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .asSequence()
            .mapNotNull { provider -> runCatching { lm.getLastKnownLocation(provider) }.getOrNull() }
            .maxByOrNull { it.time }
    }

    /** GET /api/waze?mode=around around the car's last known position. */
    fun fetch(carContext: CarContext): List<Alert> {
        val location = lastLocation(carContext) ?: return emptyList()
        val url = "${Config.BASE_URL}/api/waze?mode=around" +
            "&lat=${location.latitude}&lon=${location.longitude}&radius=2000"
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "GET"
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("Authorization", "Bearer ${Config.API_KEY}")
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return emptyList()
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val arr = json.getJSONArray("alerts")
            val out = ArrayList<Alert>(arr.length())
            for (i in 0 until arr.length()) {
                val a = arr.getJSONObject(i)
                val type = a.optString("type", "other")
                out.add(
                    Alert(
                        lat = a.getDouble("lat"),
                        lon = a.getDouble("lon"),
                        type = type,
                        label = labelFor(type),
                        emoji = emojiFor(type),
                        distM = a.optDouble("dist", 0.0).toInt(),
                        street = a.optString("street").takeIf { it.isNotBlank() },
                        city = a.optString("city").takeIf { it.isNotBlank() }
                    )
                )
            }
            return out.sortedBy { it.distM }
        } finally {
            conn.disconnect()
        }
    }

    fun labelFor(type: String): String = when (type) {
        "police" -> "Polícia"
        "camera" -> "Radar"
        "redlight" -> "Radar de semáforo"
        "hazard" -> "Perigo"
        "accident" -> "Acidente"
        "jam" -> "Trânsito"
        else -> "Outro"
    }

    fun emojiFor(type: String): String = when (type) {
        "police" -> "🚔"
        "camera" -> "📸"
        "redlight" -> "🚦"
        "hazard" -> "⚠️"
        "accident" -> "💥"
        "jam" -> "🚗"
        else -> "⚠️"
    }
}
