plugins {
    id("com.android.application")
}

// 서명 키는 저장소에 올리지 않는다 (공개 저장소라 키가 새면 누구나 이 앱인 척 덮어 설치할 수 있다).
// GitHub Actions 비밀 값 WS_KEYSTORE_B64 · WS_KEY_PASSWORD 가 있으면 그 키로 서명한다 → 새 APK 를 기존 앱 위에 덮어 설치 가능.
// 비밀 값이 없으면 빌드할 때마다 바뀌는 임시 키로 서명한다 (게임 업데이트는 앱이 스스로 받으므로 APK 를 다시 깔 일은 드물다).
val wsKeystore = file("signing/ws30.jks")
val wsPassword: String = System.getenv("WS_KEY_PASSWORD") ?: ""

android {
    namespace = "com.whitespace.thirty"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.whitespace.thirty"
        minSdk = 24
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    signingConfigs {
        if (wsKeystore.exists() && wsPassword.isNotEmpty()) {
            create("ws") {
                storeFile = wsKeystore
                storePassword = wsPassword
                keyAlias = "whitespace30"
                keyPassword = wsPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("ws") ?: signingConfigs.getByName("debug")
        }
    }

    // 게임 파일(site/web)을 APK 의 assets/web 으로 넣는다 → 인터넷 없이도 실행
    sourceSets["main"].assets.srcDirs("../site")
    androidResources {
        noCompress += listOf("mp3", "png", "jpg")
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
