package com.deolphone.app

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.provider.Telephony
import android.telecom.TelecomManager
import android.view.inputmethod.InputMethodManager
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDateTime
import java.util.UUID

enum class RuleType { LOCK, LIMIT }

/**
 * 일정 규칙 하나.
 * - LOCK: 정한 요일·시간대에 대상 앱을 잠근다. 시작 > 끝이면 자정을 넘긴다 (22:00~07:00).
 * - LIMIT: 정한 요일에 대상 앱들의 사용 시간 합계가 limitMin 을 넘으면 잠근다.
 * apps 가 비어 있으면 "모든 앱" (전화·문자·설정·항상 허용 앱 제외).
 */
data class Rule(
    val id: String = UUID.randomUUID().toString(),
    val type: RuleType,
    val name: String,
    val days: Set<Int>, // DayOfWeek.value: 1=월 … 7=일
    val startMin: Int = 22 * 60,
    val endMin: Int = 7 * 60,
    val limitMin: Int = 60,
    val apps: Set<String> = emptySet(),
) {
    val allApps: Boolean get() = apps.isEmpty()

    fun appliesTo(pkg: String): Boolean = apps.isEmpty() || pkg in apps

    fun lockActive(now: LocalDateTime): Boolean {
        if (type != RuleType.LOCK) return false
        val t = now.hour * 60 + now.minute
        val today = now.dayOfWeek.value
        val yesterday = now.minusDays(1).dayOfWeek.value
        return when {
            startMin == endMin -> today in days
            startMin < endMin -> today in days && t >= startMin && t < endMin
            else -> (today in days && t >= startMin) || (yesterday in days && t < endMin)
        }
    }

    fun limitToday(now: LocalDateTime): Boolean =
        type == RuleType.LIMIT && now.dayOfWeek.value in days

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("type", type.name)
        put("name", name)
        put("days", JSONArray(days.toList()))
        put("start", startMin)
        put("end", endMin)
        put("limit", limitMin)
        put("apps", JSONArray(apps.toList()))
    }

    companion object {
        fun fromJson(o: JSONObject): Rule {
            val d = o.getJSONArray("days")
            val a = o.getJSONArray("apps")
            return Rule(
                id = o.getString("id"),
                type = RuleType.valueOf(o.getString("type")),
                name = o.optString("name"),
                days = (0 until d.length()).map { d.getInt(it) }.toSet(),
                startMin = o.getInt("start"),
                endMin = o.getInt("end"),
                limitMin = o.getInt("limit"),
                apps = (0 until a.length()).map { a.getString(it) }.toSet(),
            )
        }
    }
}

private fun store(ctx: Context) =
    ctx.applicationContext.getSharedPreferences(Prefs.NAME, Context.MODE_PRIVATE)

/** 규칙 저장소. 엄격모드 중에는 추가만 되고 수정·삭제는 거부된다. */
object RuleStore {
    private var cache: List<Rule>? = null

    @Synchronized
    fun all(ctx: Context): List<Rule> {
        cache?.let { return it }
        val list = try {
            val raw = store(ctx).getString("rules", null)
            if (raw == null) emptyList()
            else JSONArray(raw).let { arr -> (0 until arr.length()).map { Rule.fromJson(arr.getJSONObject(it)) } }
        } catch (e: Exception) {
            emptyList()
        }
        cache = list
        return list
    }

    @Synchronized
    private fun save(ctx: Context, list: List<Rule>) {
        cache = list
        store(ctx).edit().putString("rules", JSONArray(list.map { it.toJson() }).toString()).commit()
    }

    /** 새 규칙은 언제나 추가 가능 (규칙이 늘면 더 엄격해질 뿐이라서) */
    fun add(ctx: Context, rule: Rule) {
        save(ctx, all(ctx) + rule)
    }

    fun update(ctx: Context, rule: Rule): Boolean {
        if (Strict.active(ctx)) return false
        save(ctx, all(ctx).map { if (it.id == rule.id) rule else it })
        return true
    }

    fun delete(ctx: Context, id: String): Boolean {
        if (Strict.active(ctx)) return false
        save(ctx, all(ctx).filter { it.id != id })
        return true
    }
}

/**
 * 폰 시계를 바꿔서 엄격모드를 빨리 끝내는 것을 막기 위한 시계.
 * 같은 부팅 안에서는 부팅 후 경과 시간(바꿀 수 없음)으로 흘러가고,
 * 재부팅하면 저장된 시각보다 뒤로 갈 수 없다.
 */
object TrustedClock {
    @Synchronized
    fun now(ctx: Context): Long {
        val sp = store(ctx)
        val wall = System.currentTimeMillis()
        val el = SystemClock.elapsedRealtime()
        val boot = Settings.Global.getInt(ctx.contentResolver, Settings.Global.BOOT_COUNT, -1)
        val savedBoot = sp.getInt("tc_boot", Int.MIN_VALUE)
        val savedTrusted = sp.getLong("tc_trusted", 0L)
        val savedEl = sp.getLong("tc_el", 0L)
        val trusted = if (savedBoot == boot && el >= savedEl) {
            savedTrusted + (el - savedEl)
        } else {
            maxOf(wall, savedTrusted)
        }
        sp.edit()
            .putInt("tc_boot", boot)
            .putLong("tc_trusted", trusted)
            .putLong("tc_el", el)
            .apply()
        return trusted
    }
}

/** 엄격모드: 한 번 정하면 취소·단축 불가, 연장만 가능 */
object Strict {
    fun start(ctx: Context): Long = store(ctx).getLong("strict_start", 0L)
    fun end(ctx: Context): Long = store(ctx).getLong("strict_end", 0L)

    fun active(ctx: Context): Boolean {
        val n = TrustedClock.now(ctx)
        val e = end(ctx)
        return e > 0L && n >= start(ctx) && n < e
    }

    /** 진행 중이거나 예약돼 있음 */
    fun reserved(ctx: Context): Boolean {
        val e = end(ctx)
        return e > 0L && TrustedClock.now(ctx) < e
    }

    @Synchronized
    fun begin(ctx: Context, startMs: Long, endMs: Long): Boolean {
        if (reserved(ctx) || endMs <= startMs) return false
        store(ctx).edit().putLong("strict_start", startMs).putLong("strict_end", endMs).commit()
        return true
    }

    @Synchronized
    fun extend(ctx: Context, newEnd: Long): Boolean {
        if (!reserved(ctx) || newEnd <= end(ctx)) return false
        store(ctx).edit().putLong("strict_end", newEnd).commit()
        return true
    }
}

/** 어떤 규칙으로도 잠그지 않는 앱: 전화·문자·설정·키보드·홈 화면 등 */
object Essentials {
    fun packages(ctx: Context, home: String?): Set<String> = buildSet {
        add(ctx.packageName)
        add("android")
        add("com.android.systemui")
        add("com.android.settings")
        add("com.samsung.accessibility")
        add("com.android.phone")
        add("com.android.server.telecom")
        add("com.android.emergency")
        add("com.android.dialer")
        add("com.google.android.dialer")
        add("com.samsung.android.dialer")
        add("com.samsung.android.incallui")
        add("com.google.android.permissioncontroller")
        add("com.android.permissioncontroller")
        home?.let { add(it) }
        try {
            ctx.getSystemService(TelecomManager::class.java)?.defaultDialerPackage?.let { add(it) }
        } catch (e: Exception) {
        }
        try {
            Telephony.Sms.getDefaultSmsPackage(ctx)?.let { add(it) }
        } catch (e: Exception) {
        }
        try {
            ctx.getSystemService(InputMethodManager::class.java)
                ?.enabledInputMethodList
                ?.forEach { add(it.packageName) }
        } catch (e: Exception) {
        }
    }
}

/** 잠금 중이 아닐 때, 덜폰 화면에서 권한 버튼을 누른 직후 1분간은 설정 화면을 열 수 있게 한다. */
object Guard {
    @Volatile
    private var allowUntil = 0L

    fun allowSettingsBriefly(ctx: Context) {
        if (!Strict.active(ctx)) allowUntil = SystemClock.elapsedRealtime() + 60_000L
    }

    fun settingsAllowed(): Boolean = SystemClock.elapsedRealtime() < allowUntil
}
