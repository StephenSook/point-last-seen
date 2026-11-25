package app.pointlastseen.family.live

import android.app.Instrumentation
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.MainActivity
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.NoteEnv
import app.pointlastseen.family.ai.NoteModel
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.config.RcValues
import app.pointlastseen.family.core.EvidenceTerms
import app.pointlastseen.family.core.LanguageWords
import app.pointlastseen.family.data.FirebaseSignIn
import com.google.firebase.ai.type.PublicPreviewAPI
import java.util.Locale
import kotlin.math.sqrt
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The family-note eval on a phone with a ready on-device model (skipped elsewhere). Every note in the frozen key
 * (assets eval/pls-family-notes-v1.json, pinned by FamilyNoteEvalKeyTest) goes once, in key order, through the app's
 * own FamilyNote.read with a ready model and no cloud consent, so the only route is this phone's model
 * (ONLY_ON_DEVICE). The model is the app's, wrapped only to record an exception's class and ML Kit error code.
 * Each row and a summary are written as "PLS-EVAL {json}" lines; a wrong or unread row is a miss, not a test failure.
 * The test fails only when it did not run every row.
 */
@OptIn(PublicPreviewAPI::class)
@RunWith(AndroidJUnit4::class)
class NoteEvalLiveTest {
    private val inst: Instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun out(line: String) {
        Log.i("PLS-EVAL", line)
        inst.sendStatus(0, Bundle().apply { putString(Instrumentation.REPORT_KEY_STREAMRESULT, "PLS-EVAL $line\n") })
    }

    /** The ML Kit error code in [t]'s cause chain, read by name: ML Kit is runtime-only for this module. */
    private fun genAiCode(t: Throwable?): Int? = generateSequence(t) { it.cause }.take(8)
        .firstOrNull { it.javaClass.name == "com.google.mlkit.genai.common.GenAiException" }
        ?.let { runCatching { it.javaClass.getMethod("getErrorCode").invoke(it) as Int }.getOrNull() }

    /** The 95% Wilson interval for [k] of [n]. */
    private fun wilson(k: Int, n: Int): Pair<Double, Double> {
        if (n == 0) return 0.0 to 0.0
        val z = 1.959964
        val p = k.toDouble() / n
        val d = 1 + z * z / n
        val c = (p + z * z / (2 * n)) / d
        val h = z * sqrt(p * (1 - p) / n + z * z / (4.0 * n * n)) / d
        return (c - h).coerceAtLeast(0.0) to (c + h).coerceAtMost(1.0)
    }

    @Test fun theFamilyNoteKeyIsReadOnThisPhone(): Unit = runBlocking {
        val client = AiClient { RcValues.DEFAULTS }
        val status = client.deviceModelStatus()
        assumeTrue("no ready on-device model here (status $status)", status == DeviceModelStatus.AVAILABLE)
        val app = inst.targetContext.applicationContext
        inst.startActivitySync(Intent(inst.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        inst.waitForIdleSync()

        val keyText = inst.context.assets.open(KEY).bufferedReader().use { it.readText() }
        val rows = Json.parseToJsonElement(keyText).jsonObject.getValue("rows").jsonArray.map { it.jsonObject }
        var lastError: Throwable? = null
        val model = NoteModel { mode, prompt ->
            try {
                client.familyNote.structure(mode, prompt)
            } catch (e: Exception) {
                lastError = e
                throw e
            }
        }
        val reader = FamilyNote(model, EvidenceTerms.screen(app), FirebaseSignIn, LanguageWords.screen(app))
        val env = NoteEnv(DeviceModelStatus.AVAILABLE, cloudConsent = false, killCloud = false, System::currentTimeMillis, RcValues.DEFAULTS.cloudModelAndroid)

        var right = 0
        var read = 0
        val readMs = mutableListOf<Long>()
        val outcomes = mutableMapOf<String, Int>()
        for (row in rows) {
            val id = row.getValue("id").jsonPrimitive.content
            val want = row.getValue("kind").jsonPrimitive.content
            lastError = null
            val t0 = System.nanoTime()
            val o = reader.read(row.getValue("note").jsonPrimitive.content, env)
            val wallMs = (System.nanoTime() - t0) / 1_000_000
            val name = o::class.simpleName ?: "Unknown"
            outcomes[name] = (outcomes[name] ?: 0) + 1
            val r = o as? NoteOutcome.Read
            if (r != null) {
                read++
                readMs += r.route.latencyMs
                if (r.reading.kind == want) right++
            }
            out(
                buildJsonObject {
                    put("id", id)
                    put("want", want)
                    put("outcome", name)
                    put("kind", r?.reading?.kind?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as String?))
                    put("label", r?.reading?.label?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as String?))
                    put("right", r?.reading?.kind == want)
                    put("path", r?.route?.path?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as String?))
                    put("modelMs", r?.route?.latencyMs?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as Long?))
                    put("wallMs", wallMs)
                    put("error", lastError?.javaClass?.simpleName?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as String?))
                    put("genAiCode", genAiCode(lastError)?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as Int?))
                }.toString(),
            )
        }
        val (lo, hi) = wilson(right, rows.size)
        val sorted = readMs.sorted()
        out(
            buildJsonObject {
                put("summary", true)
                put("key", "pls-family-notes-v1")
                put("rows", rows.size)
                put("right", right)
                put("read", read)
                put("wilson95Low", String.format(Locale.US, "%.2f", lo))
                put("wilson95High", String.format(Locale.US, "%.2f", hi))
                put("medianModelMs", sorted.getOrNull(sorted.size / 2)?.let { JsonPrimitive(it) } ?: JsonPrimitive(null as Long?))
                put("outcomes", outcomes.entries.sortedBy { it.key }.joinToString(",") { "${it.key}=${it.value}" })
            }.toString(),
        )
        assertEquals("every row in the key was run", rows.size, outcomes.values.sum())
    }

    private companion object {
        const val KEY = "eval/pls-family-notes-v1.json"
    }
}
