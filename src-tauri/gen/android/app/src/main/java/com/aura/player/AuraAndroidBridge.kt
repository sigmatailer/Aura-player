package com.aura.player

import android.content.Context
import android.content.Intent
import android.os.Build
import android.webkit.JavascriptInterface

class AuraAndroidBridge(private val context: Context) {

    @JavascriptInterface
    fun updateMedia(
        title: String,
        artist: String,
        coverUrl: String,
        isPlaying: Boolean,
        duration: Double,
        progress: Double,
        repeatMode: String
    ) {
        val intent = Intent(context, AuraNotificationService::class.java).apply {
            action = AuraNotificationService.ACTION_UPDATE
            putExtra(AuraNotificationService.EXTRA_TITLE, title)
            putExtra(AuraNotificationService.EXTRA_ARTIST, artist)
            putExtra(AuraNotificationService.EXTRA_COVER, coverUrl)
            putExtra(AuraNotificationService.EXTRA_IS_PLAYING, isPlaying)
            putExtra(AuraNotificationService.EXTRA_DURATION, duration)
            putExtra(AuraNotificationService.EXTRA_PROGRESS, progress)
            putExtra(AuraNotificationService.EXTRA_REPEAT_MODE, repeatMode)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @JavascriptInterface
    fun stopMedia() {
        val intent = Intent(context, AuraNotificationService::class.java).apply {
            action = AuraNotificationService.ACTION_STOP
        }
        try {
            context.startService(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
