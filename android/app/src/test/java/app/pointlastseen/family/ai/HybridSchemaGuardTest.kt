package app.pointlastseen.family.ai

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Firebase AI Logic on Android: for ONLY_ON_DEVICE, PREFER_ON_DEVICE and PREFER_IN_CLOUD,
 * structured output needs a @Generable data class through generateObject; manual schemas
 * are supported only for ONLY_IN_CLOUD. So any model built with a manual responseSchema
 * must be cloud-only (OnDeviceConfig.IN_CLOUD).
 */
class HybridSchemaGuardTest {
    private val main = File(System.getProperty("pls.repoRoot") ?: error("pls.repoRoot is not set by Gradle"), "android/app/src/main/java")

    /** Each generativeModel( ... ) call with balanced parentheses. */
    private fun modelCalls(src: String): List<String> {
        val out = mutableListOf<String>()
        var i = src.indexOf("generativeModel(")
        while (i >= 0) {
            var depth = 0
            var j = i + "generativeModel".length
            do {
                when (src[j]) { '(' -> depth++; ')' -> depth-- }
                j++
            } while (depth > 0)
            out += src.substring(i, j)
            i = src.indexOf("generativeModel(", j)
        }
        return out
    }

    @Test fun everyManualSchemaIsOnACloudOnlyModel() {
        val files = main.walkTopDown().filter { it.extension == "kt" }.toList()
        assertTrue("walked no sources", files.size > 20)
        val calls = files.flatMap { modelCalls(it.readText()) }
        assertTrue("found no model builders", calls.isNotEmpty())
        val bad = calls.filter { "responseSchema" in it && "OnDeviceConfig.IN_CLOUD" !in it }
        assertTrue("manual responseSchema on a hybrid model:\n${bad.joinToString("\n---\n")}", bad.isEmpty())
    }

    @Test fun theGuardCatchesAHybridModelWithAManualSchema() {
        val planted = "ai().generativeModel(modelName = m, generationConfig = generationConfig { responseSchema = s }, onDeviceConfig = OnDeviceConfig(mode = mode))"
        val bad = modelCalls(planted).filter { "responseSchema" in it && "OnDeviceConfig.IN_CLOUD" !in it }
        assertTrue(bad.size == 1)
    }
}
