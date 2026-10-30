package com.deolphone.app

import android.content.Context

/** 목표·허용 앱·잠깐 풀기 설정. 이 폰 안에만 저장된다. */
class Prefs(context: Context) {
    private val appCtx = context.applicationContext
    private val sp = appCtx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    var dailyGoalMin: Int
        get() = sp.getInt("daily_goal_min", 180)
        set(v) = sp.edit().putInt("daily_goal_min", v).apply()

    var goalNotifiedDate: String?
        get() = sp.getString("goal_notified_date", null)
        set(v) = sp.edit().putString("goal_notified_date", v).apply()

    /** 항상 허용 앱 (어떤 규칙으로도 잠기지 않음) */
    fun allowList(): Set<String> = sp.getStringSet("allow", emptySet())?.toSet() ?: emptySet()

    /** 엄격모드 중에는 추가 불가 (느슨해지는 변경이라서) */
    fun addAllowed(pkg: String): Boolean {
        if (Strict.active(appCtx)) return false
        sp.edit().putStringSet("allow", allowList() + pkg).apply()
        return true
    }

    /** 빼는 건 언제나 가능 (더 엄격해지는 변경이라서) */
    fun removeAllowed(pkg: String) {
        sp.edit().putStringSet("allow", allowList() - pkg).apply()
    }

    /** 멈춤 화면의 "5분 더" — 그 규칙을 잠깐 쉬게 한다. 엄격모드 중에는 불가. */
    fun snoozedUntil(ruleId: String): Long = sp.getLong("snooze_$ruleId", 0L)

    fun snooze(ruleId: String, ms: Long) {
        if (Strict.active(appCtx)) return
        val now = System.currentTimeMillis()
        val editor = sp.edit()
        sp.all.forEach { (k, v) ->
            if (k.startsWith("snooze_") && ((v as? Long) ?: 0L) < now) editor.remove(k)
        }
        editor.putLong("snooze_$ruleId", now + ms).apply()
    }

    companion object {
        const val NAME = "deolphone"
    }
}
