package com.deolphone.app

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.drawable.toBitmap
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

fun formatDuration(ms: Long): String {
    val totalMin = ms.coerceAtLeast(0L) / 60_000L
    val h = totalMin / 60
    val m = totalMin % 60
    return when {
        h > 0 && m > 0 -> "${h}시간 ${m}분"
        h > 0 -> "${h}시간"
        m > 0 -> "${m}분"
        else -> "1분 미만"
    }
}

fun formatMinutes(min: Int): String = formatDuration(min * 60_000L)

/** 긴 기간: "6일 3시간", "3시간 12분", "12분" */
fun formatSpan(ms: Long): String {
    val totalMin = ms.coerceAtLeast(0L) / 60_000L
    val d = totalMin / (60 * 24)
    val h = (totalMin / 60) % 24
    val m = totalMin % 60
    return when {
        d > 0 && h > 0 -> "${d}일 ${h}시간"
        d > 0 -> "${d}일"
        h > 0 && m > 0 -> "${h}시간 ${m}분"
        h > 0 -> "${h}시간"
        else -> "${m}분"
    }
}

fun hm(min: Int): String = String.format(Locale.US, "%02d:%02d", min / 60, min % 60)

private val DAY_NAMES = listOf("월", "화", "수", "목", "금", "토", "일")

fun dayName(value: Int): String = DAY_NAMES[(value - 1).coerceIn(0, 6)]

fun daysText(days: Set<Int>): String = when {
    days.size == 7 -> "매일"
    days == setOf(1, 2, 3, 4, 5) -> "평일"
    days == setOf(6, 7) -> "주말"
    else -> days.sorted().joinToString(" ") { dayName(it) }
}

fun lockRangeText(r: Rule): String = when {
    r.startMin == r.endMin -> "하루 종일"
    r.startMin > r.endMin -> "${hm(r.startMin)} ~ 다음날 ${hm(r.endMin)}"
    else -> "${hm(r.startMin)} ~ ${hm(r.endMin)}"
}

fun appsText(r: Rule, labelOf: (String) -> String): String = when {
    r.allApps -> "모든 앱"
    r.apps.size == 1 -> labelOf(r.apps.first())
    else -> "${labelOf(r.apps.first())} 외 ${r.apps.size - 1}개"
}

private val zone: ZoneId get() = ZoneId.systemDefault()

fun fmtDateTime(ms: Long): String =
    DateTimeFormatter.ofPattern("M월 d일 (E) HH:mm", Locale.KOREAN)
        .format(Instant.ofEpochMilli(ms).atZone(zone))

fun fmtDate(date: LocalDate): String =
    DateTimeFormatter.ofPattern("M월 d일 (E)", Locale.KOREAN).format(date)

fun pickDate(ctx: Context, initial: LocalDate, min: LocalDate?, onPicked: (LocalDate) -> Unit) {
    val dlg = DatePickerDialog(
        ctx,
        { _, y, m, d -> onPicked(LocalDate.of(y, m + 1, d)) },
        initial.year, initial.monthValue - 1, initial.dayOfMonth,
    )
    if (min != null) {
        dlg.datePicker.minDate = min.atStartOfDay(zone).toInstant().toEpochMilli()
    }
    dlg.show()
}

fun pickTime(ctx: Context, initialMin: Int, onPicked: (Int) -> Unit) {
    TimePickerDialog(
        ctx,
        { _, h, m -> onPicked(h * 60 + m) },
        initialMin / 60, initialMin % 60, true,
    ).show()
}

/** 앱 이름·아이콘을 한 번만 읽어서 재사용 */
class AppInfoCache(private val pm: PackageManager) {
    private val labels = HashMap<String, String>()
    private val icons = HashMap<String, ImageBitmap?>()

    @Synchronized
    fun label(pkg: String): String = labels.getOrPut(pkg) {
        try {
            pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            pkg
        }
    }

    @Synchronized
    fun icon(pkg: String): ImageBitmap? = icons.getOrPut(pkg) {
        try {
            pm.getApplicationIcon(pkg).toBitmap(96, 96).asImageBitmap()
        } catch (e: Exception) {
            null
        }
    }
}
