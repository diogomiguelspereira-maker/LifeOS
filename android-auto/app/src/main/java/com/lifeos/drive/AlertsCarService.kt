package com.lifeos.drive

import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

class AlertsCarService : CarAppService() {
    // Test version: accept any host. For a Play Store release this must validate
    // the host (see https://developer.android.com/training/cars/apps#host-validator).
    override fun createHostValidator(): HostValidator = HostValidator.ALLOW_ALL_HOSTS_VALIDATOR

    override fun onCreateSession(): Session = AlertsSession()
}
