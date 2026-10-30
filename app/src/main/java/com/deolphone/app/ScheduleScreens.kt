@file:OptIn(ExperimentalMaterial3Api::class)

package com.deolphone.app

import android.Manifest
import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

private const val CONFIRM_TEXT = "엄격모드를 시작합니다"

@Composable
fun ScheduleTab(
    d: UiData,
    rules: List<Rule>,
    onRulesChanged: () -> Unit,
    goalMin: Int,
    onGoal: (Int) -> Unit,
) {
    val ctx = LocalContext.current // 액티비티 (날짜/시간 선택 창에 사용)
    val prefs = remember { Prefs(ctx) }

    // 엄격모드 상태는 1초마다 갱신
    var now by remember { mutableLongStateOf(TrustedClock.now(ctx)) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000L)
            now = TrustedClock.now(ctx)
        }
    }
    val sStart = Strict.start(ctx)
    val sEnd = Strict.end(ctx)
    val strictActive = sEnd > 0L && now >= sStart && now < sEnd
    val strictPending = sEnd > 0L && now < sStart

    var guardOn by remember { mutableStateOf(Permissions.guardEnabled(ctx)) }
    var adminOn by remember { mutableStateOf(Permissions.adminActive(ctx)) }
    var notifOn by remember { mutableStateOf(Permissions.hasNotifications(ctx)) }
    LaunchedEffect(d) {
        guardOn = Permissions.guardEnabled(ctx)
        adminOn = Permissions.adminActive(ctx)
        notifOn = Permissions.hasNotifications(ctx)
    }
    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> notifOn = granted }

    var allow by remember { mutableStateOf(prefs.allowList()) }
    var editing by remember { mutableStateOf<Rule?>(null) }
    var editingIsNew by remember { mutableStateOf(false) }
    var showStrictStart by remember { mutableStateOf(false) }
    var showExtend by remember { mutableStateOf(false) }
    var pickAllow by remember { mutableStateOf(false) }
    var editGoal by remember { mutableStateOf(false) }

    val labelMap = remember(d) { d.rows.associate { it.pkg to it.label } }
    val labelOf: (String) -> String = { p -> labelMap[p] ?: p }
    val pickable = remember(d) {
        d.rows.filter { it.pkg != ctx.packageName }
            .sortedWith(compareByDescending<AppRow> { it.millis }.thenBy { it.label })
    }
    val lockRules = rules.filter { it.type == RuleType.LOCK }
    val limitRules = rules.filter { it.type == RuleType.LIMIT }

    fun openRule(r: Rule) {
        if (strictActive) {
            Toast.makeText(ctx, "엄격모드 중에는 수정·삭제할 수 없어요 (새 규칙 추가는 가능)", Toast.LENGTH_SHORT).show()
        } else {
            editingIsNew = false
            editing = r
        }
    }

    fun newRule(type: RuleType) {
        editingIsNew = true
        editing = if (type == RuleType.LOCK) {
            Rule(type = type, name = "밤 잠금", days = (1..7).toSet(), startMin = 22 * 60, endMin = 7 * 60)
        } else {
            Rule(type = type, name = "사용량 제한", days = (1..7).toSet(), limitMin = 60)
        }
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("일정", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }

        // ---- 엄격모드
        item {
            StrictCard(
                active = strictActive,
                pending = strictPending,
                start = sStart,
                end = sEnd,
                now = now,
                onStart = { showStrictStart = true },
                onExtend = { showExtend = true },
            )
        }

        // ---- 보호 기능 상태
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("보호 기능", style = MaterialTheme.typography.titleMedium)
                    PermissionRow(
                        title = "앱 잠금·설정 차단",
                        desc = "접근성에서 '덜폰 보호 기능'을 켜야 잠금이 작동해요",
                        granted = guardOn,
                        onFix = {
                            Guard.allowSettingsBriefly(ctx)
                            ctx.startActivity(Permissions.accessibilityIntent())
                        },
                    )
                    PermissionRow(
                        title = "삭제 방지",
                        desc = "엄격모드 중 덜폰을 지울 수 없게 해요",
                        granted = adminOn,
                        onFix = {
                            Guard.allowSettingsBriefly(ctx)
                            ctx.startActivity(Permissions.adminIntent(ctx))
                        },
                    )
                    PermissionRow(
                        title = "알림",
                        desc = "하루 목표를 넘으면 알려드려요",
                        granted = notifOn,
                        onFix = if (Build.VERSION.SDK_INT >= 33 && !strictActive) {
                            {
                                Guard.allowSettingsBriefly(ctx)
                                notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                        } else {
                            null
                        },
                    )
                    if (!guardOn) {
                        Text(
                            "스위치가 회색으로 막혀 있으면: 설정 → 애플리케이션 → 덜폰 → 오른쪽 위 ⋮ → '제한된 설정 허용'을 먼저 눌러주세요.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // ---- 잠금 시간대
        item { SectionLabel("잠금 시간대", Modifier.padding(top = 8.dp)) }
        if (lockRules.isEmpty()) {
            item { EmptyHint("예: 평일 22:00 ~ 다음날 07:00 모든 앱 잠금") }
        }
        items(lockRules, key = { it.id }) { r ->
            RuleCard(r, labelOf, strictActive) { openRule(r) }
        }
        item {
            OutlinedButton(onClick = { newRule(RuleType.LOCK) }, modifier = Modifier.fillMaxWidth()) {
                Text("+ 잠금 시간대 추가")
            }
        }

        // ---- 사용량 제한
        item { SectionLabel("허용 사용량", Modifier.padding(top = 8.dp)) }
        if (limitRules.isEmpty()) {
            item { EmptyHint("예: 주말엔 유튜브·인스타 합쳐서 하루 1시간") }
        }
        items(limitRules, key = { it.id }) { r ->
            RuleCard(r, labelOf, strictActive) { openRule(r) }
        }
        item {
            OutlinedButton(onClick = { newRule(RuleType.LIMIT) }, modifier = Modifier.fillMaxWidth()) {
                Text("+ 허용 사용량 추가")
            }
        }

        // ---- 항상 허용 앱
        item {
            Column(Modifier.padding(top = 8.dp)) {
                SectionLabel("항상 허용 앱")
                Text(
                    "전화·문자·설정·키보드는 원래 잠기지 않아요. 여기 넣은 앱도 어떤 규칙에도 잠기지 않아요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(allow.toList().sortedBy { labelOf(it) }, key = { "allow_$it" }) { pkg ->
            val row = d.rows.firstOrNull { it.pkg == pkg }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                AppIcon(row?.icon, size = 32.dp)
                Spacer(Modifier.width(12.dp))
                Text(labelOf(pkg), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                TextButton(onClick = {
                    prefs.removeAllowed(pkg)
                    allow = prefs.allowList()
                }) { Text("빼기") }
            }
        }
        item {
            OutlinedButton(
                onClick = { pickAllow = true },
                enabled = !strictActive,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (strictActive) "엄격모드 중에는 추가할 수 없어요" else "+ 항상 허용 앱 추가") }
        }

        // ---- 하루 목표 알림
        item {
            Card(Modifier.fillMaxWidth()) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { editGoal = true }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("하루 목표 알림", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "총 사용 시간이 넘으면 알림만 보내요 (잠그지 않음)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        formatMinutes(goalMin),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }

    // ---------------------------------------------------------- 대화상자들

    editing?.let { r ->
        RuleEditor(
            initial = r,
            isNew = editingIsNew,
            apps = pickable,
            activity = ctx,
            onSave = { saved ->
                if (editingIsNew) {
                    RuleStore.add(ctx, saved)
                } else if (!RuleStore.update(ctx, saved)) {
                    Toast.makeText(ctx, "엄격모드 중에는 수정할 수 없어요", Toast.LENGTH_SHORT).show()
                }
                editing = null
                onRulesChanged()
            },
            onDelete = {
                if (!RuleStore.delete(ctx, r.id)) {
                    Toast.makeText(ctx, "엄격모드 중에는 삭제할 수 없어요", Toast.LENGTH_SHORT).show()
                }
                editing = null
                onRulesChanged()
            },
            onDismiss = { editing = null },
        )
    }

    if (pickAllow) {
        AppPickerDialog(
            title = "항상 허용할 앱",
            apps = pickable.filter { it.pkg !in allow },
            onPick = { pkg ->
                if (!prefs.addAllowed(pkg)) {
                    Toast.makeText(ctx, "엄격모드 중에는 추가할 수 없어요", Toast.LENGTH_SHORT).show()
                }
                allow = prefs.allowList()
                pickAllow = false
            },
            onDismiss = { pickAllow = false },
        )
    }

    if (editGoal) {
        ChoiceDialog(
            title = "하루 목표 시간",
            options = listOf(60, 90, 120, 180, 240, 300),
            selected = goalMin,
            label = { formatMinutes(it) },
            onPick = {
                onGoal(it)
                editGoal = false
            },
            onDismiss = { editGoal = false },
        )
    }

    if (showStrictStart) {
        val missing = buildList {
            if (!guardOn) add("앱 잠금·설정 차단")
            if (!adminOn) add("삭제 방지")
        }
        StrictStartDialog(
            activity = ctx,
            missing = missing,
            ruleCount = rules.size,
            onStarted = {
                showStrictStart = false
                now = TrustedClock.now(ctx)
                Toast.makeText(ctx, "엄격모드가 설정됐어요", Toast.LENGTH_SHORT).show()
            },
            onDismiss = { showStrictStart = false },
        )
    }

    if (showExtend) {
        StrictExtendDialog(
            activity = ctx,
            currentEnd = sEnd,
            onDone = {
                showExtend = false
                now = TrustedClock.now(ctx)
            },
            onDismiss = { showExtend = false },
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun RuleCard(r: Rule, labelOf: (String) -> String, locked: Boolean, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(if (r.type == RuleType.LOCK) "🌙" else "⏳", fontSize = 24.sp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(r.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (r.type == RuleType.LOCK) "${daysText(r.days)} · ${lockRangeText(r)}"
                    else "${daysText(r.days)} · 하루 ${formatMinutes(r.limitMin)}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    appsText(r, labelOf),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (locked) Text("🔒", fontSize = 18.sp)
        }
    }
}

// ------------------------------------------------------------ 엄격모드 카드

@Composable
private fun StrictCard(
    active: Boolean,
    pending: Boolean,
    start: Long,
    end: Long,
    now: Long,
    onStart: () -> Unit,
    onExtend: () -> Unit,
) {
    val colors = if (active) {
        CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
    } else {
        CardDefaults.cardColors()
    }
    Card(Modifier.fillMaxWidth(), colors = colors) {
        Column(Modifier.padding(16.dp)) {
            when {
                active -> {
                    Text("🔒 엄격모드 진행 중", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("${fmtDateTime(end)}까지 · ${formatSpan(end - now)} 남음")
                    Text(
                        "일정·잠금 수정, 삭제, 해제는 할 수 없어요. 새 규칙 추가와 기간 연장만 돼요.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = onExtend) { Text("기간 연장") }
                }

                pending -> {
                    Text("⏳ 엄격모드 예약됨", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text("${fmtDateTime(start)} ~ ${fmtDateTime(end)}")
                    Text(
                        "${formatSpan(start - now)} 뒤 시작해요. 예약은 취소할 수 없어요.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = onExtend) { Text("기간 연장") }
                }

                else -> {
                    Text("엄격모드", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "정한 기간 동안 일정과 잠금을 절대 바꾸거나 풀 수 없게 해요.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = onStart) { Text("엄격모드 설정하기") }
                }
            }
        }
    }
}

// ------------------------------------------------------------ 엄격모드 시작

@Composable
private fun StrictStartDialog(
    activity: Context,
    missing: List<String>,
    ruleCount: Int,
    onStarted: () -> Unit,
    onDismiss: () -> Unit,
) {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now()
    var startNow by remember { mutableStateOf(true) }
    var startDate by remember { mutableStateOf(today.plusDays(1)) }
    var endDate by remember { mutableStateOf(today.plusDays(7)) }
    var endTime by remember { mutableIntStateOf(23 * 60 + 59) }
    var confirm by remember { mutableStateOf("") }

    val startMs = if (startNow) System.currentTimeMillis()
    else startDate.atStartOfDay(zone).toInstant().toEpochMilli()
    val endMs = endDate.atTime(endTime / 60, endTime % 60).atZone(zone).toInstant().toEpochMilli()
    val span = endMs - startMs
    val spanOk = span >= 10 * 60_000L && span <= 366L * 24 * 60 * 60_000L
    val ready = missing.isEmpty()
    val canStart = ready && spanOk && confirm.trim() == CONFIRM_TEXT

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onDismiss) { Text("닫기") }
                }
                Text("🔒 엄격모드", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Card(
                    Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("시작하면 끝날 때까지 절대 끌 수 없어요.", fontWeight = FontWeight.Bold)
                        Text("• 일정·잠금 수정과 삭제 불가 (새 규칙 추가, 기간 연장만 가능)")
                        Text("• 항상 허용 앱 추가 불가, '5분 더 쓰기' 불가")
                        Text("• 덜폰이 보이는 설정 화면(권한, 앱 정보, 접근성, 삭제)과 날짜·시간 설정을 열면 바로 홈으로 튕겨요")
                        Text("• 예약한 엄격모드도 취소할 수 없어요")
                    }
                }
                if (ruleCount == 0) {
                    Text(
                        "⚠️ 아직 규칙이 하나도 없어요. 규칙을 먼저 만들어 두는 게 좋아요 (엄격모드 중에도 추가는 돼요).",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                SectionLabel("시작")
                RadioRow("지금 바로", startNow) { startNow = true }
                RadioRow("날짜 지정: ${fmtDate(startDate)} 00:00", !startNow) {
                    startNow = false
                    pickDate(activity, startDate, today.plusDays(1)) {
                        startDate = it
                        if (endDate < it) endDate = it
                    }
                }

                SectionLabel("끝")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        pickDate(activity, endDate, if (startNow) today else startDate) { endDate = it }
                    }) { Text(fmtDate(endDate)) }
                    OutlinedButton(onClick = {
                        pickTime(activity, endTime) { endTime = it }
                    }) { Text(hm(endTime)) }
                }
                Text(
                    if (spanOk) "기간: ${formatSpan(span)}"
                    else if (span < 10 * 60_000L) "끝이 시작보다 10분 이상 뒤여야 해요"
                    else "최대 1년까지 정할 수 있어요",
                    color = if (spanOk) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error,
                )

                if (!ready) {
                    Text(
                        "먼저 켜야 해요: ${missing.joinToString(", ")}\n(일정 탭 '보호 기능'에서 켤 수 있어요)",
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                HorizontalDivider()
                Text("정말 시작하려면 아래에 '$CONFIRM_TEXT'라고 똑같이 입력하세요.")
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    singleLine = true,
                    placeholder = { Text(CONFIRM_TEXT) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(
                    onClick = {
                        val s = if (startNow) TrustedClock.now(activity) else startMs
                        if (Strict.begin(activity, s, endMs)) {
                            onStarted()
                        } else {
                            Toast.makeText(activity, "이미 엄격모드가 있거나 기간이 올바르지 않아요", Toast.LENGTH_SHORT).show()
                        }
                    },
                    enabled = canStart,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("엄격모드 시작 (되돌릴 수 없음)") }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

// ------------------------------------------------------------ 엄격모드 연장

@Composable
private fun StrictExtendDialog(
    activity: Context,
    currentEnd: Long,
    onDone: () -> Unit,
    onDismiss: () -> Unit,
) {
    val zone = ZoneId.systemDefault()
    val cur = remember(currentEnd) { Instant.ofEpochMilli(currentEnd).atZone(zone).toLocalDateTime() }
    var date by remember { mutableStateOf(cur.toLocalDate().plusDays(1)) }
    var time by remember { mutableIntStateOf(cur.hour * 60 + cur.minute) }
    val newEnd = date.atTime(time / 60, time % 60).atZone(zone).toInstant().toEpochMilli()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("엄격모드 연장") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("지금: ${fmtDateTime(currentEnd)}까지")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        pickDate(activity, date, cur.toLocalDate()) { date = it }
                    }) { Text(fmtDate(date)) }
                    OutlinedButton(onClick = {
                        pickTime(activity, time) { time = it }
                    }) { Text(hm(time)) }
                }
                Text(
                    if (newEnd > currentEnd) "${formatSpan(newEnd - currentEnd)} 늘어나요"
                    else "지금 끝나는 시각보다 뒤로만 정할 수 있어요",
                    color = if (newEnd > currentEnd) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.error,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = newEnd > currentEnd,
                onClick = {
                    if (Strict.extend(activity, newEnd)) onDone()
                    else Toast.makeText(activity, "연장할 수 없어요", Toast.LENGTH_SHORT).show()
                },
            ) { Text("연장") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

// ------------------------------------------------------------ 규칙 편집

@Composable
private fun RuleEditor(
    initial: Rule,
    isNew: Boolean,
    apps: List<AppRow>,
    activity: Context,
    onSave: (Rule) -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val isLock = initial.type == RuleType.LOCK
    var name by remember { mutableStateOf(initial.name) }
    var days by remember { mutableStateOf(initial.days) }
    var start by remember { mutableIntStateOf(initial.startMin) }
    var end by remember { mutableIntStateOf(initial.endMin) }
    var limit by remember { mutableFloatStateOf(initial.limitMin.toFloat()) }
    var allApps by remember { mutableStateOf(if (isNew) isLock else initial.apps.isEmpty()) }
    var picked by remember { mutableStateOf(initial.apps) }
    var confirmDelete by remember { mutableStateOf(false) }

    val valid = days.isNotEmpty() && (allApps || picked.isNotEmpty())

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            LazyColumn(
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onDismiss) { Text("취소") }
                        Text(
                            if (isLock) "잠금 시간대" else "허용 사용량",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            enabled = valid,
                            onClick = {
                                onSave(
                                    initial.copy(
                                        name = name.trim().ifBlank { if (isLock) "잠금 시간대" else "허용 사용량" },
                                        days = days,
                                        startMin = start,
                                        endMin = end,
                                        limitMin = limit.roundToInt(),
                                        apps = if (allApps) emptySet() else picked,
                                    )
                                )
                            },
                        ) { Text("저장") }
                    }
                }

                item {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(20) },
                        label = { Text("이름") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SectionLabel("요일")
                        DayPicker(days) { days = it }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { days = (1..7).toSet() }) { Text("매일") }
                            TextButton(onClick = { days = setOf(1, 2, 3, 4, 5) }) { Text("평일") }
                            TextButton(onClick = { days = setOf(6, 7) }) { Text("주말") }
                        }
                        if (days.isEmpty()) {
                            Text("요일을 하나 이상 골라주세요", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }

                if (isLock) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            SectionLabel("잠금 시간")
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                OutlinedButton(onClick = { pickTime(activity, start) { start = it } }) {
                                    Text("시작 ${hm(start)}")
                                }
                                Text("~")
                                OutlinedButton(onClick = { pickTime(activity, end) { end = it } }) {
                                    Text("끝 ${hm(end)}")
                                }
                            }
                            Text(
                                when {
                                    start == end -> "고른 요일엔 하루 종일 잠겨요"
                                    start > end -> "고른 요일 ${hm(start)}부터 다음날 ${hm(end)}까지 잠겨요"
                                    else -> "고른 요일 ${hm(start)}부터 ${hm(end)}까지 잠겨요"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    item {
                        Column {
                            SectionLabel("하루 허용 사용량")
                            Text(
                                formatMinutes(limit.roundToInt()),
                                style = MaterialTheme.typography.headlineSmall,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Slider(
                                value = limit,
                                onValueChange = { limit = ((it / 5f).roundToInt() * 5).toFloat() },
                                valueRange = 5f..360f,
                            )
                            Text(
                                "고른 앱들의 사용 시간을 합쳐서 계산하고, 다 쓰면 그날 자정까지 잠겨요.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                item {
                    Column {
                        SectionLabel("대상 앱")
                        RadioRow("모든 앱 (전화·문자·설정·항상 허용 앱 제외)", allApps) { allApps = true }
                        RadioRow("고른 앱만", !allApps) { allApps = false }
                        if (!allApps && picked.isEmpty()) {
                            Text("앱을 하나 이상 골라주세요", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }

                if (!allApps) {
                    items(apps, key = { it.pkg }) { row ->
                        val checked = row.pkg in picked
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { picked = if (checked) picked - row.pkg else picked + row.pkg }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(checked = checked, onCheckedChange = null)
                            Spacer(Modifier.width(8.dp))
                            AppIcon(row.icon, size = 32.dp)
                            Spacer(Modifier.width(12.dp))
                            Text(row.label, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (row.millis > 0) {
                                Text(
                                    "오늘 ${formatDuration(row.millis)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                if (!isNew) {
                    item {
                        OutlinedButton(
                            onClick = { confirmDelete = true },
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("이 규칙 삭제") }
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("'${initial.name}' 삭제") },
            text = { Text("이 규칙을 지울까요?") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    onDelete()
                }) { Text("삭제", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun DayPicker(days: Set<Int>, onChange: (Set<Int>) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        (1..7).forEach { v ->
            val on = v in days
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onChange(if (on) days - v else days + v) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    dayName(v),
                    color = if (on) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun AppPickerDialog(
    title: String,
    apps: List<AppRow>,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onDismiss) { Text("취소") }
                        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                }
                items(apps, key = { it.pkg }) { row ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onPick(row.pkg) }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AppIcon(row.icon, size = 36.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(row.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
