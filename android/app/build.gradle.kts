import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// google-services.json is never committed. Builds that have it (this Mac, the
// release build) process it; CI builds and tests without it.
if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Debug builds may carry an App Check debug token from the untracked
// local.properties (key pls.appcheck.debugToken). Release builds never do.
val debugToken: String = localProps.getProperty("pls.appcheck.debugToken", "")

// Release signing: a keystore outside the repo; its password lives in the
// macOS Keychain under the service named by pls.release.keychainService.
val releaseStore: String? = localProps.getProperty("pls.release.storeFile")
val releaseAlias: String = localProps.getProperty("pls.release.keyAlias", "pls-family")
val releaseKeychainService: String =
    localProps.getProperty("pls.release.keychainService", "pls-android-release")

fun keychainPassword(service: String): String {
    val p = ProcessBuilder("security", "find-generic-password", "-w", "-s", service)
        .redirectErrorStream(false).start()
    val out = p.inputStream.bufferedReader().readText().trim()
    check(p.waitFor() == 0 && out.isNotEmpty()) { "No Keychain password for service $service" }
    return out
}

android {
    namespace = "app.pointlastseen.family"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.pointlastseen.family"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = file(releaseStore)
                keyAlias = releaseAlias
                val pw = keychainPassword(releaseKeychainService)
                storePassword = pw
                keyPassword = pw
            }
        }
    }

    buildTypes {
        debug {
            resValue("string", "firebase_app_check_debug_token", debugToken)
        }
        release {
            isMinifyEnabled = false
            if (releaseStore != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = false
        // Unit tests read the shared vectors and constants from the repo root.
        unitTests.all { it.systemProperty("pls.repoRoot", rootProject.projectDir.parentFile.absolutePath) }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.ai)
    implementation(libs.firebase.ai.ondevice)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.functions)
    implementation(libs.firebase.storage)
    implementation(libs.firebase.config)
    implementation(libs.firebase.appcheck.playintegrity)
    debugImplementation(libs.firebase.appcheck.debug)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.coroutines.play.services)
    implementation(libs.serialization.json)
    implementation(libs.exifinterface)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
