package com.deolphone.app

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import java.time.LocalDateTime

/**
 * 덜폰 보호 기능 (접근성 서비스).
 *
 * 1) 앱 잠금: 화면이 바뀔 때와 2초마다, 지금 떠 있는 앱이 일정 규칙에 걸리면
 *    홈으로 보내고 멈춤 화면을 띄운다.
 * 2) 설정 보호: 엄격모드 중이거나 잠금 시간대일 때, 설정·권한·설치 관리자 화면에
 *    "덜폰"이 보이면(권한 끄기, 앱 정보, 접근성 끄기, 삭제 등) 즉시 홈으로 튕긴다.
 *    엄격모드 중에는 날짜/시간 설정과 USB 디버깅 화면도 막는다.
 * 3) 하루 목표를 넘으면 알림 1회.
 */
class GuardService : AccessibilityService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val main = Handler(Looper.getMainLooper())
    private val mutex = Mutex()

    private lateinit var repo: UsageRepo
    private lateinit var prefs: Prefs
    private lateinit var tracker: ForegroundTracker

    @Volatile private var protecting = false
    @Volatile private var strictNow = false

    private var essential: Set<String> = emptySet()
    private var essentialAt = 0L
    private var usageCache: DayUsage? = null
    private var usageCacheAt = 0L
    private var lastBlockPkg: String? = null
    private var lastBlockAt = 0L
    private var lastGoalCheck = 0L
    private var lastToastAt = 0L
    private var loop: Job? = null
    private var pendingCheck: Job? = null
    private val settingsCheck = Runnable { checkSettingsScreen() }

    override fun onCreate() {
        super.onCreate()
        repo = UsageRepo(this)
        prefs = Prefs(this)
        tracker = repo.newTracker()
        Notifications.ensureChannels(this)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        if (loop == null) {
            loop = scope.launch {
                while (true) {
                    try {
                        check()
                    } catch (e: Exception) {
                        // 한 번 실패해도 계속 지킨다
                    }
                    delay(2_000L)
                }
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val e = event ?: return
        val pkg = e.packageName?.toString() ?: return

        // 화면이 바뀌면 잠깐 뒤(사용 기록이 반영된 뒤) 바로 확인
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && pkg != packageName) {
            pendingCheck?.cancel()
            pendingCheck = scope.launch {
                delay(300L)
                try {
                    check()
                } catch (ex: Exception) {
                }
            }
        }

        // 설정 화면 보호
        if (protecting && pkg in PROTECTED_PACKAGES) {
            main.removeCallbacks(settingsCheck)
            if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) checkSettingsScreen()
            main.postDelayed(settingsCheck, 200L) // 화면 내용이 다 그려진 뒤 한 번 더
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        scope.cancel()
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    // ------------------------------------------------------------ 앱 잠금

    private suspend fun check() {
        mutex.withLock { checkLocked() }
    }

    private fun checkLocked() {
        val hasUsage = Permissions.hasUsageAccess(this)
        strictNow = Strict.active(this)
        val now = LocalDateTime.now()
        val rules = RuleStore.all(this)
        protecting = hasUsage && (strictNow || rules.any { it.lockActive(now) })
        if (!hasUsage) return

        val t = SystemClock.elapsedRealtime()
        if (essential.isEmpty() || t - essentialAt > 5 * 60_000L) {
            essential = Essentials.packages(this, repo.homePackage())
            essentialAt = t
        }

        val fg = tracker.current()
        if (fg != null) {
            val rule = blockingRule(fg, now, rules)
            if (rule != null) block(fg, rule)
        }

        if (t - lastGoalCheck > 60_000L) {
            lastGoalCheck = t
            checkGoal()
        }
    }

    private fun blockingRule(pkg: String, now: LocalDateTime, rules: List<Rule>): Rule? {
        if (pkg == packageName || pkg in essential || pkg in prefs.allowList()) return null
        val nowMs = System.currentTimeMillis()
        for (r in rules) {
            if (!r.appliesTo(pkg)) continue
            if (!strictNow && prefs.snoozedUntil(r.id) > nowMs) continue
            when (r.type) {
                RuleType.LOCK -> if (r.lockActive(now)) return r
                RuleType.LIMIT -> if (r.limitToday(now) && usedFor(r) >= r.limitMin * 60_000L) return r
            }
        }
        return null
    }

    private fun usedFor(r: Rule): Long {
        val d = todayUsage()
        return if (r.allApps) d.totalMillis
        else d.apps.filter { it.packageName in r.apps }.sumOf { it.millis }
    }

    private fun todayUsage(): DayUsage {
        val t = SystemClock.elapsedRealtime()
        val c = usageCache
        if (c != null && t - usageCacheAt < 10_000L && c.date == LocalDate.now()) return c
        val d = repo.day(LocalDate.now())
        usageCache = d
        usageCacheAt = t
        return d
    }

    private fun block(pkg: String, rule: Rule) {
        val t = SystemClock.elapsedRealtime()
        if (pkg == lastBlockPkg && t - lastBlockAt < 2_500L) return
        lastBlockPkg = pkg
        lastBlockAt = t
        performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
        try {
            startActivity(
                Intent(this, BlockActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    .putExtra(BlockActivity.EXTRA_PKG, pkg)
                    .putExtra(BlockActivity.EXTRA_RULE, rule.id)
            )
        } catch (e: Exception) {
            // 멈춤 화면을 못 띄워도 홈으로는 이미 보냈다
        }
    }

    private fun checkGoal() {
        val today = LocalDate.now().toString()
        if (prefs.goalNotifiedDate == today) return
        val total = todayUsage().totalMillis
        if (total >= prefs.dailyGoalMin * 60_000L) {
            prefs.goalNotifiedDate = today
            Notifications.goalExceeded(this, total)
        }
    }

    // ------------------------------------------------------------ 설정 보호 (메인 스레드)

    private fun checkSettingsScreen() {
        if (!protecting) return
        if (!strictNow && Guard.settingsAllowed()) return
        val root = try {
            rootInActiveWindow
        } catch (e: Exception) {
            null
        } ?: return
        val rootPkg = root.packageName?.toString()
        if (rootPkg == null || rootPkg !in PROTECTED_PACKAGES) return

        val words = if (strictNow) GUARD_WORDS + STRICT_WORDS else GUARD_WORDS
        val hit = words.any { w ->
            try {
                root.findAccessibilityNodeInfosByText(w).isNotEmpty()
            } catch (e: Exception) {
                false
            }
        }
        if (!hit) return

        performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
        val t = SystemClock.elapsedRealtime()
        if (t - lastToastAt > 3_000L) {
            lastToastAt = t
            Toast.makeText(
                this,
                if (strictNow) "엄격모드 중에는 이 설정을 열 수 없어요" else "잠금 중에는 덜폰 설정을 열 수 없어요",
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

    companion object {
        /** 설정·권한·설치 관리 앱들 (제조사별 포함) */
        private val PROTECTED_PACKAGES = setOf(
            "com.android.settings",
            "com.samsung.accessibility",
            "com.samsung.android.lool",
            "com.google.android.permissioncontroller",
            "com.android.permissioncontroller",
            "com.google.android.packageinstaller",
            "com.android.packageinstaller",
            "com.samsung.android.packageinstaller",
            "com.miui.securitycenter",
            "com.coloros.safecenter",
        )

        /** 이 글자가 보이는 설정 화면은 잠금/엄격모드 중 열 수 없다 */
        private val GUARD_WORDS = listOf("덜폰", "com.deolphone.app")

        /** 엄격모드 중 추가로 막는 화면: 날짜·시간 설정, USB 디버깅 */
        private val STRICT_WORDS = listOf(
            "자동 날짜 및 시간",
            "날짜 및 시간 자동 설정",
            "자동으로 시간 설정",
            "자동으로 날짜 및 시간 설정",
            "Automatic date & time",
            "Set time automatically",
            "USB 디버깅",
            "USB debugging",
        )
    }
}
