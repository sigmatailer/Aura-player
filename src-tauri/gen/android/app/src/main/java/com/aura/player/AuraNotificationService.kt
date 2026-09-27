package com.aura.player

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class AuraNotificationService : Service() {

    companion object {
        const val CHANNEL_ID = "aura_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_UPDATE = "com.aura.player.ACTION_UPDATE"
        const val ACTION_STOP = "com.aura.player.ACTION_STOP"
        const val ACTION_PLAY_PAUSE = "com.aura.player.ACTION_PLAY_PAUSE"
        const val ACTION_NEXT = "com.aura.player.ACTION_NEXT"
        const val ACTION_PREV = "com.aura.player.ACTION_PREV"
        const val ACTION_REPEAT = "com.aura.player.ACTION_REPEAT"

        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_ARTIST = "extra_artist"
        const val EXTRA_COVER = "extra_cover"
        const val EXTRA_IS_PLAYING = "extra_is_playing"
        const val EXTRA_DURATION = "extra_duration"
        const val EXTRA_PROGRESS = "extra_progress"
        const val EXTRA_REPEAT_MODE = "extra_repeat_mode"

        var isServiceRunning = false
    }

    private var mediaSession: MediaSession? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var currentCoverUrl: String = ""
    private var cachedBitmap: Bitmap? = null

    override fun onCreate() {
        super.onCreate()
        isServiceRunning = true
        createNotificationChannel()
        initMediaSession()

        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Aura::PlaybackWakeLock")
            wakeLock?.setReferenceCounted(false)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Aura Player",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Музыкальный плеер Aura"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun initMediaSession() {
        mediaSession = MediaSession(this, "AuraMediaSession").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    MainActivity.dispatchMediaAction("play_pause")
                }
                override fun onPause() {
                    MainActivity.dispatchMediaAction("play_pause")
                }
                override fun onSkipToNext() {
                    MainActivity.dispatchMediaAction("next")
                }
                override fun onSkipToPrevious() {
                    MainActivity.dispatchMediaAction("prev")
                }
                override fun onSeekTo(pos: Long) {
                    MainActivity.dispatchMediaAction("seek", pos / 1000.0)
                }
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        when (intent.action) {
            ACTION_STOP -> {
                stopForegroundPlayback()
                return START_NOT_STICKY
            }
            ACTION_PLAY_PAUSE -> {
                MainActivity.dispatchMediaAction("play_pause")
                return START_NOT_STICKY
            }
            ACTION_NEXT -> {
                MainActivity.dispatchMediaAction("next")
                return START_NOT_STICKY
            }
            ACTION_PREV -> {
                MainActivity.dispatchMediaAction("prev")
                return START_NOT_STICKY
            }
            ACTION_REPEAT -> {
                MainActivity.dispatchMediaAction("repeat")
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> {
                val title = intent.getStringExtra(EXTRA_TITLE) ?: "Aura"
                val artist = intent.getStringExtra(EXTRA_ARTIST) ?: ""
                val coverUrl = intent.getStringExtra(EXTRA_COVER) ?: ""
                val isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false)
                val duration = intent.getDoubleExtra(EXTRA_DURATION, 0.0)
                val progress = intent.getDoubleExtra(EXTRA_PROGRESS, 0.0)
                val repeatMode = intent.getStringExtra(EXTRA_REPEAT_MODE) ?: "off"

                if (isPlaying) {
                    try {
                        if (wakeLock?.isHeld != true) {
                            wakeLock?.acquire(12 * 60 * 60 * 1000L) // 12 hours max
                        }
                    } catch (e: Exception) {}
                } else {
                    try {
                        if (wakeLock?.isHeld == true) {
                            wakeLock?.release()
                        }
                    } catch (e: Exception) {}
                }

                updateNotificationAndSession(title, artist, coverUrl, isPlaying, duration, progress, repeatMode)
            }
        }

        return START_NOT_STICKY
    }

    private fun updateNotificationAndSession(
        title: String,
        artist: String,
        coverUrl: String,
        isPlaying: Boolean,
        duration: Double,
        progress: Double,
        repeatMode: String
    ) {
        val stateBuilder = PlaybackState.Builder()
            .setActions(
                PlaybackState.ACTION_PLAY or
                PlaybackState.ACTION_PAUSE or
                PlaybackState.ACTION_PLAY_PAUSE or
                PlaybackState.ACTION_SKIP_TO_NEXT or
                PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                PlaybackState.ACTION_SEEK_TO
            )
            .setState(
                if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                (progress * 1000).toLong(),
                1.0f
            )
        mediaSession?.setPlaybackState(stateBuilder.build())

        // Load image if changed
        if (coverUrl != currentCoverUrl && coverUrl.isNotBlank()) {
            currentCoverUrl = coverUrl
            thread {
                val bmp = fetchBitmap(coverUrl)
                cachedBitmap = bmp
                buildAndPostNotification(title, artist, bmp, isPlaying, duration, progress, repeatMode)
            }
        } else {
            buildAndPostNotification(title, artist, cachedBitmap, isPlaying, duration, progress, repeatMode)
        }
    }

    private fun buildAndPostNotification(
        title: String,
        artist: String,
        coverBitmap: Bitmap?,
        isPlaying: Boolean,
        duration: Double,
        progress: Double,
        repeatMode: String
    ) {
        // Update MediaSession metadata
        val metaBuilder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, (duration * 1000).toLong())
        if (coverBitmap != null) {
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, coverBitmap)
            metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, coverBitmap)
        }
        mediaSession?.setMetadata(metaBuilder.build())

        val contentIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentPendingIntent = PendingIntent.getActivity(
            this, 0, contentIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Actions
        val prevIntent = Intent(this, AuraNotificationService::class.java).apply { action = ACTION_PREV }
        val prevPending = PendingIntent.getService(this, 1, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val playPauseIntent = Intent(this, AuraNotificationService::class.java).apply { action = ACTION_PLAY_PAUSE }
        val playPausePending = PendingIntent.getService(this, 2, playPauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val nextIntent = Intent(this, AuraNotificationService::class.java).apply { action = ACTION_NEXT }
        val nextPending = PendingIntent.getService(this, 3, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val repeatIntent = Intent(this, AuraNotificationService::class.java).apply { action = ACTION_REPEAT }
        val repeatPending = PendingIntent.getService(this, 4, repeatIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val prevAction = Notification.Action.Builder(
            R.drawable.ic_skip_previous, "Previous", prevPending
        ).build()

        val playPauseIcon = if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play_arrow
        val playPauseAction = Notification.Action.Builder(
            playPauseIcon, if (isPlaying) "Pause" else "Play", playPausePending
        ).build()

        val nextAction = Notification.Action.Builder(
            R.drawable.ic_skip_next, "Next", nextPending
        ).build()

        val repeatIcon = if (repeatMode == "one") R.drawable.ic_repeat_one else R.drawable.ic_repeat
        val repeatAction = Notification.Action.Builder(
            repeatIcon, "Repeat", repeatPending
        ).build()

        val style = Notification.MediaStyle()
            .setShowActionsInCompactView(0, 1, 2)
        mediaSession?.sessionToken?.let {
            style.setMediaSession(it)
        }

        val notifBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        notifBuilder
            .setSmallIcon(R.drawable.ic_music_note)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentPendingIntent)
            .setStyle(style)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .addAction(prevAction)
            .addAction(playPauseAction)
            .addAction(nextAction)
            .addAction(repeatAction)

        if (coverBitmap != null) {
            notifBuilder.setLargeIcon(coverBitmap)
        }

        val notification = notifBuilder.build()

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun fetchBitmap(urlStr: String): Bitmap? {
        return try {
            if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
                val url = URL(urlStr)
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                conn.doInput = true
                conn.connect()
                val input: InputStream = conn.inputStream
                BitmapFactory.decodeStream(input)
            } else if (urlStr.startsWith("/")) {
                BitmapFactory.decodeFile(urlStr)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun stopForegroundPlayback() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {}

        mediaSession?.isActive = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        isServiceRunning = false
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (e: Exception) {}
        mediaSession?.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
