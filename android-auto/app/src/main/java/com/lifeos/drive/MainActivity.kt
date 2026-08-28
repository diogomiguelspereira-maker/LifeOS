package com.lifeos.drive

import android.Manifest
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = TextView(this).apply {
            setPadding(48, 96, 48, 48)
            textSize = 16f
            text = "LifeOS Drive (teste)\n\n" +
                "1. Dá acesso à localização (necessário para os alertas).\n" +
                "2. Instala a app no Android Auto (side-load via AAAD ou modo dev).\n" +
                "3. No carro, abre \"LifeOS Drive\" e vês os alertas perto de ti.\n" +
                "4. Toca num alerta para abrir a navegação no Waze.\n\n" +
                "Chave API: preenche Config.kt (Definições → Automações na LifeOS)."
        }
        setContentView(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                1
            )
        }
    }
}
