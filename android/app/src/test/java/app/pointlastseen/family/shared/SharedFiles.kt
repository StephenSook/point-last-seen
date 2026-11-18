package app.pointlastseen.family.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import java.io.File

/** The repo's shared contracts, read from disk. A missing file fails the test; it never skips. */
object SharedFiles {
    private val root: File by lazy {
        val p = System.getProperty("pls.repoRoot") ?: error("pls.repoRoot is not set by Gradle")
        File(p).also { require(File(it, "shared").isDirectory) { "no shared/ under $p" } }
    }

    fun text(path: String): String = File(root, path).readText()

    fun json(path: String): JsonObject = Json.parseToJsonElement(text(path)).jsonObject
}
