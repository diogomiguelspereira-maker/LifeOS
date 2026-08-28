package com.lifeos.drive

import android.content.Intent
import android.net.Uri
import androidx.car.app.Session
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AlertsSession : Session() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCarAppScreenReady() {
        scope.launch {
            while (isActive) {
                val alerts = WazeApi.fetch(carContext)
                val template = buildTemplate(alerts)
                carContext.mainExecutor.execute { setScreen(template) }
                delay(30_000)
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun buildTemplate(alerts: List<WazeApi.Alert>): Template {
        val list = ItemList.Builder()
        if (alerts.isEmpty()) {
            list.addItem(Row.Builder().setTitle("Sem alertas perto ✨").build())
        } else {
            for (a in alerts) {
                val wazeUri = "https://waze.com/ul?ll=${a.lon},${a.lat}&navigate=yes"
                val subtitle = buildList {
                    add(a.distanceText)
                    a.street?.let { add(it) }
                    a.city?.let { add(it) }
                }.joinToString(" · ")
                list.addItem(
                    Row.Builder()
                        .setTitle("${a.emoji} ${a.label}")
                        .addText(subtitle)
                        .setOnClickListener {
                            carContext.startCarApp(Intent(Intent.ACTION_VIEW, Uri.parse(wazeUri)))
                        }
                        .build()
                )
            }
        }
        return ListTemplate.Builder()
            .setTitle("Conduzir · alertas")
            .setSingleList(list.build())
            .build()
    }
}
