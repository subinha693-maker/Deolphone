package com.deolphone.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

object Notifications {
    private const val GOAL_ID = 2
    private const val CH_ALERT = "alert"

    fun ensureChannels(ctx: Context) {
        ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CH_ALERT, "사용 시간 알림", NotificationManager.IMPORTANCE_DEFAULT)
        )
    }

    fun goalExceeded(ctx: Context, totalMillis: Long) {
        if (!Permissions.hasNotifications(ctx)) return
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val n = NotificationCompat.Builder(ctx, CH_ALERT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("오늘 목표 시간을 넘었어요")
            .setContentText("지금까지 ${formatDuration(totalMillis)} 썼어요. 잠깐 내려놓아 볼까요?")
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(GOAL_ID, n)
    }
}
