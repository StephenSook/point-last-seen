import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    // @Generable types: the Firebase AI KSP processor writes their schemas at compile time.
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

// google-services.json is never committed. Builds that have it (this Mac, the
// release build) process it; CI builds and tests without it.
if (file("google-services.json").exists()) {
    pluginManager.apply("com.google.gms.google-services")
    // Crashlytics needs its build id injected; without Firebase config the app has no Firebase at all.
    pluginManager.apply("com.google.firebase.crashlytics")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Debug builds may carry an App Check debug token from the untracked
// local.properties. Each device has its own token: the default key
// pls.appcheck.debugToken is the emulator's; -Ppls.device=a16 reads
// pls.appcheck.debugToken.a16 instead. Release builds never carry one.
val debugDevice: String? = providers.gradleProperty("pls.device").orNull

// The full 911 script screen (promotion P-14) ships only when Stephen says yes:
// off unless a build passes -Ppls.script911=true.
val script911: Boolean = providers.gradleProperty("pls.script911").orNull == "true"
val debugToken: String = localProps.getProperty(
    if (debugDevice == null) "pls.appcheck.debugToken" else "pls.appcheck.debugToken.$debugDevice",
    "",
)

// Release signing: a keystore outside the repo (path in local.properties). Its
// password lives in the macOS Keychain; android/release.sh reads it into
// PLS_RELEASE_PASSWORD for one build that runs without the configuration cache,
// so the password is never written to a cache entry.
val releaseStore: String? = localProps.getProperty("pls.release.storeFile")
val releaseAlias: String = localProps.getProperty("pls.release.keyAlias", "pls-family")
val releasePassword: String? = System.getenv("PLS_RELEASE_PASSWORD")?.takeIf { it.isNotEmpty() }
if (releasePassword != null) {
    check(!gradle.startParameter.isConfigurationCacheRequested) {
        "Release signing must run with --no-configuration-cache (use android/release.sh)."
    }
}

// The shared possible-evidence terms ship inside the app. The build fails when the
// file is missing; at run time the screen also fails closed without it.
abstract class CopySharedAssets : DefaultTask() {
    @get:InputFile
    abstract val evidenceTerms: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile
        out.mkdirs()
        evidenceTerms.get().asFile.copyTo(File(out, "evidence-terms.json"), overwrite = true)
    }
}

val copySharedAssets = tasks.register<CopySharedAssets>("copySharedAssets") {
    evidenceTerms.set(rootProject.layout.projectDirectory.file("../shared/constants/evidence-terms.json"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copySharedAssets, CopySharedAssets::outputDir)
    }
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
        buildConfigField("boolean", "SCRIPT_911", script911.toString())
        // Tests that write to the deployed drill incident run only when asked for.
        testInstrumentationRunnerArguments["notAnnotation"] = "app.pointlastseen.family.live.DrillE2E"
    }

    signingConfigs {
        if (releaseStore != null && releasePassword != null) {
            create("release") {
                storeFile = file(releaseStore)
                keyAlias = releaseAlias
                storePassword = releasePassword
                keyPassword = releasePassword
            }
        }
    }

    buildTypes {
        debug {
            resValue("string", "firebase_app_check_debug_token", debugToken)
        }
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
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
    ksp(libs.firebase.ai.ksp.processor)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.functions)
    implementation(libs.firebase.storage)
    implementation(libs.firebase.config)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.perf)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.analytics)
    debugImplementation(libs.firebase.appcheck.debug)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.fragment)
    implementation(libs.coroutines.play.services)
    implementation(libs.serialization.json)
    implementation(libs.exifinterface)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.compose.ui.test.junit4.accessibility)
    debugImplementation(libs.compose.ui.test.manifest)
}
