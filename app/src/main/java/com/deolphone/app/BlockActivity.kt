package com.deolphone.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** 잠긴 앱을 열면 뜨는 멈춤 화면 */
class BlockActivity : ComponentActivity() {

    private var pkg by mutableStateOf("")
    private var ruleId by mutableStateOf("")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        readIntent(intent)
        setContent {
            DeolTheme {
                BlockScreen(pkg = pkg, ruleId = ruleId, onLeave = ::leave, onMore = ::more)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
    }

    private fun readIntent(i: Intent) {
        pkg = i.getStringExtra(EXTRA_PKG) ?: ""
        ruleId = i.getStringExtra(EXTRA_RULE) ?: ""
    }

    private fun leave() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    /** 5분 더 (엄격모드 중에는 불가) */
    private fun more() {
        if (Strict.active(this) || ruleId.isEmpty()) return
        Prefs(this).snooze(ruleId, 5 * 60_000L)
        packageManager.getLaunchIntentForPackage(pkg)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        finish()
    }

    companion object {
        const val EXTRA_PKG = "pkg"
        const val EXTRA_RULE = "rule"
    }
}

private const val WAIT_SECONDS = 15

@Composable
private fun BlockScreen(pkg: String, ruleId: String, onLeave: () -> Unit, onMore: () -> Unit) {
    val ctx = LocalContext.current
    val info = remember { AppInfoCache(ctx.packageManager) }
    val label = remember(pkg) { info.label(pkg) }
    val icon = remember(pkg) { info.icon(pkg) }
    val rule = remember(ruleId) { RuleStore.all(ctx).firstOrNull { it.id == ruleId } }
    val strict = remember(pkg, ruleId) { Strict.active(ctx) }
    val strictEnd = remember(pkg, ruleId) { Strict.end(ctx) }
    var wait by remember(pkg, ruleId) { mutableIntStateOf(WAIT_SECONDS) }

    LaunchedEffect(pkg, ruleId) {
        wait = WAIT_SECONDS
        while (wait > 0) {
            delay(1_000L)
            wait--
        }
    }
    BackHandler { onLeave() }

    val title = when (rule?.type) {
        RuleType.LOCK -> "지금은 잠금 시간이에요"
        RuleType.LIMIT -> "오늘 허용 시간을 다 썼어요"
        null -> "지금은 쓸 수 없어요"
    }
    val detail = if (rule == null) {
        ""
    } else {
        when (rule.type) {
            RuleType.LOCK -> "'${rule.name}' · ${daysText(rule.days)} ${lockRangeText(rule)}"
            RuleType.LIMIT -> "'${rule.name}' · ${daysText(rule.days)} 하루 ${formatMinutes(rule.limitMin)}"
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                .systemBarsPadding()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AppIcon(icon, size = 72.dp)
            Spacer(Modifier.height(8.dp))
            Text(label, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(24.dp))
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            if (detail.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    detail,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "숨 한번 쉬고, 다른 걸 해볼까요?",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(40.dp))
            Button(onClick = onLeave, modifier = Modifier.fillMaxWidth()) {
                Text("나가기")
            }
            Spacer(Modifier.height(8.dp))
            if (strict) {
                Text(
                    "🔒 엄격모드 중 · ${fmtDateTime(strictEnd)}까지",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            } else {
                OutlinedButton(
                    onClick = onMore,
                    enabled = wait == 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (wait > 0) "5분 더 쓰기 (${wait}초 후 가능)" else "5분 더 쓰기")
                }
            }
        }
    }
}
