package com.deolphone.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.TextStyle
import java.util.Locale

data class AppRow(
    val pkg: String,
    val label: String,
    val icon: ImageBitmap?,
    val millis: Long,
)

data class UiData(
    val today: DayUsage,
    val rows: List<AppRow>,
    val week: List<DayUsage>,
    val loadedAt: LocalDateTime,
)

private fun loadData(repo: UsageRepo, apps: AppInfoCache): UiData {
    val todayDate = LocalDate.now()
    val week = (6 downTo 0).map { repo.day(todayDate.minusDays(it.toLong())) }
    val today = week.last()
    val usage = today.apps.associate { it.packageName to it.millis }
    val pkgs = (today.apps.map { it.packageName } + repo.launchablePackages()).distinct()
    val rows = pkgs.map { pkg -> AppRow(pkg, apps.label(pkg), apps.icon(pkg), usage[pkg] ?: 0L) }
    return UiData(today, rows, week, LocalDateTime.now())
}

// ---------------------------------------------------------------- 진입점

@Composable
fun DeolApp(resumeTick: Int) {
    val ctx = LocalContext.current
    var hasUsage by remember { mutableStateOf(Permissions.hasUsageAccess(ctx)) }
    LaunchedEffect(resumeTick) { hasUsage = Permissions.hasUsageAccess(ctx) }
    if (hasUsage) MainScreen(resumeTick) else PermissionScreen()
}

@Composable
private fun PermissionScreen() {
    val ctx = LocalContext.current
    Column(
        Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("📵", fontSize = 56.sp)
        Spacer(Modifier.height(16.dp))
        Text("덜폰", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Text(
            "스크린타임을 자동으로 읽으려면 '사용 기록 접근' 권한이 필요해요.\n\n" +
                "설정에서 덜폰을 찾아 허용을 켜고 돌아오세요. 기록은 이 폰 밖으로 나가지 않아요.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = { ctx.startActivity(Permissions.usageAccessIntent()) },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("권한 설정 열기") }
        Spacer(Modifier.height(20.dp))
        Text(
            "허용 스위치가 회색으로 막혀 있다면: 설정 → 애플리케이션 → 덜폰 → 오른쪽 위 ⋮ → " +
                "'제한된 설정 허용'을 먼저 눌러주세요.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MainScreen(resumeTick: Int) {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    val repo = remember { UsageRepo(ctx) }
    val apps = remember { AppInfoCache(ctx.packageManager) }

    var tab by rememberSaveable { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<UiData?>(null) }
    var rules by remember { mutableStateOf(RuleStore.all(ctx)) }
    var goalMin by remember { mutableIntStateOf(prefs.dailyGoalMin) }

    LaunchedEffect(resumeTick) {
        data = withContext(Dispatchers.IO) { loadData(repo, apps) }
        rules = RuleStore.all(ctx)
    }

    val tabs = listOf("⏱" to "오늘", "📅" to "주간", "🗓" to "일정")
    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { i, (emoji, name) ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = { Text(emoji, fontSize = 20.sp) },
                        label = { Text(name) },
                    )
                }
            }
        },
    ) { pad ->
        Box(
            Modifier
                .padding(pad)
                .fillMaxSize()
        ) {
            val d = data
            if (d == null) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                when (tab) {
                    0 -> TodayTab(d, rules, goalMin)
                    1 -> WeekTab(d, goalMin)
                    else -> ScheduleTab(
                        d = d,
                        rules = rules,
                        onRulesChanged = { rules = RuleStore.all(ctx) },
                        goalMin = goalMin,
                        onGoal = {
                            goalMin = it
                            prefs.dailyGoalMin = it
                        },
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------- 오늘

@Composable
private fun TodayTab(d: UiData, rules: List<Rule>, goalMin: Int) {
    val goalMs = goalMin * 60_000L
    val total = d.today.totalMillis
    val over = total > goalMs
    val progress = (total.toFloat() / goalMs).coerceIn(0f, 1f)
    val used = remember(d) { d.rows.filter { it.millis > 0 }.sortedByDescending { it.millis } }
    val labelMap = remember(d) { d.rows.associate { it.pkg to it.label } }
    val labelOf: (String) -> String = { p -> labelMap[p] ?: p }
    val now = d.loadedAt
    val todays = remember(d, rules) {
        rules.filter { r ->
            when (r.type) {
                RuleType.LOCK -> r.lockActive(now) || now.dayOfWeek.value in r.days
                RuleType.LIMIT -> r.limitToday(now)
            }
        }
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("오늘", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.size(200.dp),
                            strokeWidth = 16.dp,
                            color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            trackColor = MaterialTheme.colorScheme.surfaceVariant,
                        )
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                formatDuration(total),
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                "목표 ${formatDuration(goalMs)}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (over) "목표보다 ${formatDuration(total - goalMs)} 더 썼어요"
                        else "목표까지 ${formatDuration(goalMs - total)} 남았어요",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
        if (todays.isNotEmpty()) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("오늘의 규칙", style = MaterialTheme.typography.titleMedium)
                        todays.forEach { r -> RuleStatusLine(r, now, d.today, labelOf) }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("잠금 해제", "${d.today.unlocks}번", Modifier.weight(1f))
                StatCard("가장 많이 쓴 앱", used.firstOrNull()?.label ?: "-", Modifier.weight(1f))
            }
        }
        item {
            Text(
                "앱별 사용 시간",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        if (used.isEmpty()) {
            item {
                Text("아직 오늘 기록이 없어요", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(used, key = { it.pkg }) { row ->
            AppUsageRow(row, maxMillis = used.first().millis)
        }
    }
}

@Composable
private fun RuleStatusLine(r: Rule, now: LocalDateTime, today: DayUsage, labelOf: (String) -> String) {
    val err = MaterialTheme.colorScheme.error
    val sub = MaterialTheme.colorScheme.onSurfaceVariant
    when (r.type) {
        RuleType.LOCK -> {
            val active = r.lockActive(now)
            val t = now.hour * 60 + now.minute
            val status = when {
                active -> "지금 잠금 중 · ${hm(r.endMin)}에 풀려요"
                now.dayOfWeek.value in r.days && t < r.startMin -> "${hm(r.startMin)}부터 잠겨요"
                else -> "오늘 잠금은 끝났어요"
            }
            Column {
                Text("🌙 ${r.name} (${appsText(r, labelOf)})", style = MaterialTheme.typography.bodyLarge)
                Text(status, style = MaterialTheme.typography.bodySmall, color = if (active) err else sub)
            }
        }

        RuleType.LIMIT -> {
            val used = if (r.allApps) today.totalMillis
            else today.apps.filter { it.packageName in r.apps }.sumOf { it.millis }
            val limitMs = r.limitMin * 60_000L
            val done = used >= limitMs
            Column {
                Text("⏳ ${r.name} (${appsText(r, labelOf)})", style = MaterialTheme.typography.bodyLarge)
                Spacer(Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { (used.toFloat() / limitMs.coerceAtLeast(1L)).coerceIn(0f, 1f) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp),
                    color = if (done) err else MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                )
                Text(
                    if (done) "${formatMinutes(r.limitMin)} 다 썼어요 · 잠김"
                    else "${formatDuration(used)} / ${formatMinutes(r.limitMin)} · ${formatDuration(limitMs - used)} 남음",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (done) err else sub,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun AppUsageRow(row: AppRow, maxMillis: Long) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AppIcon(row.icon)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.label,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(formatDuration(row.millis), style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { (row.millis.toFloat() / maxMillis.coerceAtLeast(1L)).coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
        }
    }
}

// ---------------------------------------------------------------- 주간

@Composable
private fun WeekTab(d: UiData, goalMin: Int) {
    val goalMs = goalMin * 60_000L
    val maxMs = maxOf(d.week.maxOf { it.totalMillis }, goalMs).coerceAtLeast(1L)
    val avg = d.week.map { it.totalMillis }.average().toLong()
    val goalFrac = goalMs.toFloat() / maxMs
    val chartH = 180.dp
    val today = LocalDate.now()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("최근 7일", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp)) {
                Text(
                    "하루 평균",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    formatDuration(avg),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(20.dp))

                Box(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth()) {
                        d.week.forEach { day ->
                            val frac = (day.totalMillis.toFloat() / maxMs).coerceIn(0.01f, 1f)
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .height(chartH),
                                    contentAlignment = Alignment.BottomCenter,
                                ) {
                                    Box(
                                        Modifier
                                            .width(22.dp)
                                            .fillMaxHeight(frac)
                                            .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                            .background(
                                                if (day.totalMillis > goalMs) MaterialTheme.colorScheme.error
                                                else MaterialTheme.colorScheme.primary
                                            )
                                    )
                                }
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    dayLabel(day.date, today),
                                    style = MaterialTheme.typography.labelMedium,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                    // 목표선
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .offset(y = chartH * (1f - goalFrac))
                            .height(2.dp)
                            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "회색 선은 하루 목표(${formatMinutes(goalMin)})예요. 넘은 날은 빨간 막대로 보여요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(vertical = 8.dp)) {
                d.week.reversed().forEachIndexed { i, day ->
                    if (i > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "${day.date.monthValue}/${day.date.dayOfMonth} (${dayLabel(day.date, today)})",
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            "잠금해제 ${day.unlocks}번",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            formatDuration(day.totalMillis),
                            fontWeight = FontWeight.Bold,
                            color = if (day.totalMillis > goalMs) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

private fun dayLabel(date: LocalDate, today: LocalDate): String =
    if (date == today) "오늘" else date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.KOREAN)

// ---------------------------------------------------------------- 공용 컴포넌트

@Composable
fun AppIcon(icon: ImageBitmap?, size: Dp = 40.dp) {
    if (icon != null) {
        Image(bitmap = icon, contentDescription = null, modifier = Modifier.size(size))
    } else {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
        )
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = modifier,
    )
}

@Composable
fun RadioRow(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
fun PermissionRow(
    title: String,
    desc: String,
    granted: Boolean,
    onFix: (() -> Unit)?,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                desc,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(8.dp))
        if (granted) {
            Text("켜짐 ✓", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        } else if (onFix != null) {
            FilledTonalButton(onClick = onFix) { Text("켜기") }
        } else {
            Text("꺼짐", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun ChoiceDialog(
    title: String,
    options: List<Int>,
    selected: Int,
    label: (Int) -> String,
    onPick: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = onDismiss) { Text("닫기") } },
        title = { Text(title) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                options.forEach { opt ->
                    RadioRow(label(opt), opt == selected) { onPick(opt) }
                }
            }
        },
    )
}
