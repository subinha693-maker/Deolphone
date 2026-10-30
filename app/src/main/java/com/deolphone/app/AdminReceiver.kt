package com.deolphone.app

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * 삭제 방지. 기기 관리자 앱은 관리자 권한을 먼저 꺼야 지울 수 있는데,
 * 그 설정 화면은 엄격모드 중 보호 기능이 막는다.
 */
class AdminReceiver : DeviceAdminReceiver() {

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence =
        if (Strict.active(context)) "엄격모드 중이에요. 정한 기간까지는 끌 수 없어요."
        else "삭제 방지를 끄면 덜폰을 지울 수 있게 돼요."

    companion object {
        fun component(ctx: Context) = ComponentName(ctx, AdminReceiver::class.java)
    }
}
