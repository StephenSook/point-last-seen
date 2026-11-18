package app.pointlastseen.family.ai

import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.data.Hashes
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClipReaderTest {
    private val mark = ConsentMark("u1", 5L)

    private val readingJson = """
        {"personVisible":true,"firstSeen":"00:03","lastSeen":"00:12","entryEdge":"right","exitEdge":"left",
         "topColor":"blue","bottomColor":"black","topType":"coat","footwear":"sneakers","headwear":"none",
         "carriedItems":["bag"],"keyFrame":{"time":"00:05","box2d":[100,200,900,500]},
         "lighting":"day","legibility":"clear","evidence":"walks out of the left edge"}
    """.trimIndent()

    private class FakeDeps(
        val cached: StoredClipReading? = null,
        val reply: ModelReply = ModelReply(null, Source.IN_CLOUD, 0),
    ) : ClipDeps {
        val log = mutableListOf<String>()
        var stored: StoredClipReading? = null
        override suspend fun findReading(sha256: String): StoredClipReading? { log += "find"; return cached }
        override suspend fun upload(sha256: String, bytes: ByteArray): String { log += "upload"; return "clips/inc-1/$sha256.mp4" }
        override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply { log += "model:$mimeType"; return reply }
        override suspend fun storeReading(doc: StoredClipReading) { log += "store"; stored = doc }
        override fun nowMs(): Long = 1_000L
    }

    private fun bytes(size: Int) = ByteArray(size) { (it % 7).toByte() }
    private fun consentFor(b: ByteArray) = ClipConsent(Hashes.sha256Hex(b), mark, mark, mark, null)
    private val consent = consentFor(bytes(1000))

    private fun request(size: Int, consent: ClipConsent? = null, killCloud: Boolean = false) = ClipRequest(
        bytes = bytes(size), mimeType = "video/mp4", durationS = 30,
        clipStartMs = 500L, clockConfirmed = true, cameraFacingDeg = 90, consent = consent ?: consentFor(bytes(size)),
        killCloud = { killCloud }, modelName = "gemini-3.5-flash-lite",
    )

    @Test fun theReadRunsOnTheGivenWorkerNotTheCallersThread() = runTest {
        val pool = java.util.concurrent.Executors.newSingleThreadExecutor { r -> Thread(r, "pls-test-worker") }
        try {
            var seen: String? = null
            val deps = object : ClipDeps by FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900)) {
                override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply {
                    seen = Thread.currentThread().name
                    return ModelReply(readingJson, Source.IN_CLOUD, 900)
                }
            }
            ClipReader(deps, worker = pool.asCoroutineDispatcher()).read(request(1000))
            assertEquals("pls-test-worker", seen)
        } finally {
            pool.shutdown()
        }
    }

    @Test fun aClipOverTheCapIsRefusedBeforeAnything() = runTest {
        val deps = FakeDeps()
        val out = ClipReader(deps).read(request(14_000_001))
        assertTrue(out is ClipOutcome.Refused && out.message.contains("14,000,000"))
        assertTrue(deps.log.isEmpty())
    }

    @Test fun aClipWithoutTheThreeConsentsIsRefused() = runTest {
        val deps = FakeDeps()
        val out = ClipReader(deps).read(request(1000, consent.copy(cloudProcessing = null)))
        assertTrue(out is ClipOutcome.Refused && out.message.contains("consent"))
        assertTrue(deps.log.isEmpty())
    }

    @Test fun consentForAnotherClipIsRefused() = runTest {
        val deps = FakeDeps()
        val out = ClipReader(deps).read(request(1000, consentFor(bytes(999))))
        assertTrue(out is ClipOutcome.Refused && out.message.contains("consent"))
        assertTrue(deps.log.isEmpty())
    }

    @Test fun bytesChangedAfterConsentAreRefusedBeforeInference() = runTest {
        val deps = object : ClipDeps by FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900)) {
            val log = mutableListOf<String>()
            override suspend fun upload(sha256: String, bytes: ByteArray): String { log += "upload"; bytes[0] = 99; return "p" }
            override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply { log += "model"; error("must not be called") }
        }
        val out = ClipReader(deps).read(request(1000))
        assertTrue(out is ClipOutcome.Refused)
        assertEquals(listOf("upload"), deps.log)
    }

    @Test fun killCloudTurningOnDuringTheUploadStopsTheModelCall() = runTest {
        var paused = false
        val inner = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val deps = object : ClipDeps by inner {
            val log = mutableListOf<String>()
            override suspend fun upload(sha256: String, bytes: ByteArray): String { log += "upload"; paused = true; return "p" }
            override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply { log += "model"; error("must not be called") }
        }
        val out = ClipReader(deps).read(request(1000).copy(killCloud = { paused }))
        assertTrue(out is ClipOutcome.Refused)
        assertEquals(listOf("upload"), deps.log)
    }

    @Test fun killCloudRefusesTheCloudOnlyRead() = runTest {
        val deps = FakeDeps()
        val out = ClipReader(deps).read(request(1000, killCloud = true))
        assertTrue(out is ClipOutcome.Refused)
        assertTrue(deps.log.isEmpty())
    }

    @Test fun aCachedReadingMakesNoModelCall() = runTest {
        val r = request(1000)
        val sha = Hashes.sha256Hex(r.bytes)
        val cached = StoredClipReading(
            sha256 = sha, storagePath = "clips/inc-1/$sha.mp4", durationS = 30, clipStartMs = 500L,
            clockConfirmed = true, cameraFacingDeg = 90, readingJson = readingJson, route = null,
            consent = consent, expiresAtMs = 9L, createdAtMs = 1L,
        )
        val deps = FakeDeps(cached = cached)
        val out = ClipReader(deps).read(r) as ClipOutcome.Read
        assertTrue(out.cached)
        assertEquals(listOf("find", "store"), deps.log)
        assertNotNull(out.check)
    }

    @Test fun aRereadUsesTheFacingAndClockJustGivenAndUpdatesTheStoredReading() = runTest {
        val r = request(1000).copy(cameraFacingDeg = 0, clipStartMs = 7_000L)
        val sha = Hashes.sha256Hex(r.bytes)
        val cached = StoredClipReading(
            sha256 = sha, storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = false,
            cameraFacingDeg = null, readingJson = readingJson, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L,
        )
        val deps = FakeDeps(cached = cached)
        val out = ClipReader(deps).read(r) as ClipOutcome.Read
        assertEquals(270, out.bearingDeg) // facing north, exit left
        assertEquals(listOf("find", "store"), deps.log)
        assertEquals(0, deps.stored!!.cameraFacingDeg)
        assertEquals(7_000L, deps.stored!!.clipStartMs)
        assertEquals(true, deps.stored!!.clockConfirmed)
    }

    @Test fun aCachedReadingThatFailsItsChecksIsCouldNotRead() = runTest {
        val r = request(1000)
        val sha = Hashes.sha256Hex(r.bytes)
        val bad = readingJson.replace("\"lastSeen\":\"00:12\"", "\"lastSeen\":\"09:99\"")
        val cached = StoredClipReading(
            sha256 = sha, storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = bad, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L,
        )
        val deps = FakeDeps(cached = cached)
        assertEquals(ClipOutcome.CouldNotRead, ClipReader(deps).read(r))
        assertEquals(listOf("find"), deps.log)
    }

    @Test fun anUnknownClipLengthIsRefusedBeforeAnyUpload() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000).copy(durationS = 0))
        assertTrue(out is ClipOutcome.Refused)
        assertTrue(deps.log.isEmpty())
    }

    @Test fun aMissUploadsThenReadsInTheCloudThenStores() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000)) as ClipOutcome.Read
        assertEquals(listOf("find", "upload", "model:video/mp4", "store"), deps.log)
        assertFalse(out.cached)
        assertTrue(out.check!!.ok)
        assertEquals(0, out.bearingDeg) // facing 90, exit left: 90 - 90
        assertEquals("cloud", out.route!!.path)
        assertEquals("sdk_only_in_cloud", out.route.reason)
        assertTrue(out.route.sdkReported)
        val stored = deps.stored!!
        assertEquals(Hashes.sha256Hex(request(1000).bytes), stored.sha256)
        assertEquals(1_000L + 30L * 24 * 3600 * 1000, stored.expiresAtMs)
        assertEquals(90, stored.cameraFacingDeg)
    }

    @Test fun anUnreadableReplyShowsCouldNotReadAndStoresNothing() = runTest {
        val deps = FakeDeps(reply = ModelReply("{not json", Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000))
        assertEquals(ClipOutcome.CouldNotRead, out)
        assertNull(deps.stored)
    }

    @Test fun aReadingThatFailsItsChecksIsShownAsCouldNotRead() = runTest {
        val bad = readingJson.replace("\"lastSeen\":\"00:12\"", "\"lastSeen\":\"01:12\"")
        val deps = FakeDeps(reply = ModelReply(bad, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000))
        assertEquals(ClipOutcome.CouldNotRead, out)
    }

    @Test fun noFacingGivesNoBearing() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000).copy(cameraFacingDeg = null)) as ClipOutcome.Read
        assertNull(out.bearingDeg)
    }
}
