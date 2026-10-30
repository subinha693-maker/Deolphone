package com.deolphone.app

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import java.time.LocalDate
import java.time.ZoneId

data class AppUsage(val packageName: String, val millis: Long)

data class DayUsage(
    val date: LocalDate,
    val totalMillis: Long,
    val apps: List<AppUsage>,
    val unlocks: Int,
)

/**
 * 안드로이드 사용 기록(UsageEvents)을 읽어서 앱별 화면 사용 시간을 계산한다.
 * 앱이 화면에 올라온 순간(RESUMED)부터 내려간 순간(PAUSED/STOPPED, 화면 꺼짐)까지를 더한다.
 */
class UsageRepo(private val context: Context) {

    private val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    private val zone: ZoneId = ZoneId.systemDefault()

    /** 홈 화면(런처)과 시스템 UI는 사용 시간에서 뺀다. */
    private val excluded: Set<String> by lazy {
        buildSet {
            add("com.android.systemui")
            homePackage()?.let { add(it) }
        }
    }

    fun homePackage(): String? {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return context.packageManager
            .resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo?.packageName
    }

    fun day(date: LocalDate): DayUsage {
        val start = date.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(
            date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli(),
            System.currentTimeMillis(),
        )
        if (end <= start) return DayUsage(date, 0L, emptyList(), 0)

        val (perApp, unlocks) = compute(start, end)
        val apps = perApp
            .filterKeys { it !in excluded }
            .filterValues { it >= 1_000L }
            .map { AppUsage(it.key, it.value) }
            .sortedByDescending { it.millis }
        return DayUsage(date, apps.sumOf { it.millis }, apps, unlocks)
    }

    fun todayMillisFor(pkg: String): Long {
        val start = LocalDate.now().atStartOfDay(zone).toInstant().toEpochMilli()
        return compute(start, System.currentTimeMillis()).first[pkg] ?: 0L
    }

    /** 홈 화면에 아이콘이 있는 앱들 (제한 설정 목록용) */
    fun launchablePackages(): List<String> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return context.packageManager.queryIntentActivities(intent, 0)
            .map { it.activityInfo.packageName }
            .distinct()
            .filter { it != context.packageName && it !in excluded }
    }

    fun newTracker() = ForegroundTracker(usm)

    private fun compute(start: Long, end: Long): Pair<Map<String, Long>, Int> {
        val perApp = HashMap<String, Long>()
        val resumed = LinkedHashMap<String, String>() // "패키지/액티비티" -> 패키지
        var fgPkg: String? = null
        var fgStart = 0L
        var unlocks = 0
        var firstActivityEvent = true

        fun switchTo(newPkg: String?, t: Long) {
            if (newPkg == fgPkg) return
            fgPkg?.let { perApp[it] = (perApp[it] ?: 0L) + (t - fgStart).coerceAtLeast(0L) }
            fgPkg = newPkg
            fgStart = t
        }

        val events = usm.queryEvents(start, end)
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val pkg = e.packageName ?: continue
            val t = e.timeStamp
            val key = "$pkg/${e.className}"
            when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    firstActivityEvent = false
                    resumed.remove(key)
                    resumed[key] = pkg
                    switchTo(resumed.values.last(), t)
                }

                UsageEvents.Event.ACTIVITY_PAUSED,
                UsageEvents.Event.ACTIVITY_STOPPED -> {
                    // 자정 전부터 켜져 있던 앱: 자정~첫 종료까지를 더해준다
                    if (firstActivityEvent &&
                        e.eventType == UsageEvents.Event.ACTIVITY_PAUSED &&
                        key !in resumed
                    ) {
                        perApp[pkg] = (perApp[pkg] ?: 0L) + (t - start).coerceAtLeast(0L)
                    }
                    firstActivityEvent = false
                    if (resumed.remove(key) != null) switchTo(resumed.values.lastOrNull(), t)
                }

                UsageEvents.Event.SCREEN_NON_INTERACTIVE,
                UsageEvents.Event.DEVICE_SHUTDOWN -> {
                    resumed.clear()
                    switchTo(null, t)
                }

                UsageEvents.Event.KEYGUARD_HIDDEN -> unlocks++
            }
        }
        switchTo(null, end)
        return perApp to unlocks
    }
}

/** 지금 화면에 떠 있는 앱을 몇 초마다 가볍게 확인하기 위한 추적기 (새 이벤트만 읽음) */
class ForegroundTracker(private val usm: UsageStatsManager) {
    private val resumed = LinkedHashMap<String, String>()
    private var last = System.currentTimeMillis() - 6 * 60 * 60 * 1000L

    fun current(): String? {
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(last, now)
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val pkg = e.packageName ?: continue
            val key = "$pkg/${e.className}"
            when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    resumed.remove(key)
                    resumed[key] = pkg
                }

                UsageEvents.Event.ACTIVITY_PAUSED,
                UsageEvents.Event.ACTIVITY_STOPPED -> resumed.remove(key)

                UsageEvents.Event.SCREEN_NON_INTERACTIVE,
                UsageEvents.Event.DEVICE_SHUTDOWN -> resumed.clear()
            }
        }
        last = now
        return resumed.values.lastOrNull()
    }
}
