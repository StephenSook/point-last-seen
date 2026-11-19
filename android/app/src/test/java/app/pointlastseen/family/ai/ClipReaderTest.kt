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
        val alreadyUploaded: Boolean = false,
        val signInFails: Boolean = false,
    ) : ClipDeps {
        val log = mutableListOf<String>()
        override suspend fun ensureSignedIn(): String { if (signInFails) throw IllegalStateException("no network"); return "u1" }
        val consents = mutableListOf<StoredClipReading>()
        val completed = mutableListOf<Pair<String, String>>()
        override suspend fun findReading(sha256: String): StoredClipReading? { log += "find"; return cached }
        override fun storagePath(sha256: String) = "clips/inc-1/$sha256.mp4"
        override suspend fun clipExists(sha256: String): Boolean { log += "exists"; return alreadyUploaded }
        override suspend fun upload(sha256: String, bytes: ByteArray): String { log += "upload"; return storagePath(sha256) }
        override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply { log += "model:$mimeType"; return reply }
        override suspend fun createConsentRecord(doc: StoredClipReading) { log += "consent"; consents += doc }
        override suspend fun completeReading(sha256: String, readingJson: String, route: app.pointlastseen.family.data.RouteRecord) { log += "complete"; completed += sha256 to readingJson }
        override fun nowMs(): Long = 1_000L
    }

    private fun bytes(size: Int) = ByteArray(size) { (it % 7).toByte() }
    private fun consentFor(b: ByteArray) = ClipConsent(Hashes.sha256Hex(b), mark, mark, mark, null)
    private val consent = consentFor(bytes(1000))

    private fun request(size: Int, consent: ClipConsent? = null, killCloud: Boolean = false) = ClipRequest(
        bytes = bytes(size), mimeType = "video/mp4", durationS = 30,
        clipStartMs = 500L, clockConfirmed = true, cameraFacingDeg = 90, consent = consent ?: consentFor(bytes(size)),
        killCloud = { killCloud }, templateId = "pls-clip-sighting-v1", uploaderUid = "u1",
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
            consent = consent, expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
        )
        val deps = FakeDeps(cached = cached)
        val out = ClipReader(deps).read(r) as ClipOutcome.Read
        assertTrue(out.cached)
        assertEquals(listOf("find"), deps.log)
        assertNotNull(out.check)
    }

    @Test fun aRereadUsesTheFacingJustGivenAndWritesNothing() = runTest {
        val r = request(1000).copy(cameraFacingDeg = 0, clipStartMs = 7_000L)
        val sha = Hashes.sha256Hex(r.bytes)
        val cached = StoredClipReading(
            sha256 = sha, storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = false,
            cameraFacingDeg = null, readingJson = readingJson, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
        )
        val deps = FakeDeps(cached = cached)
        val out = ClipReader(deps).read(r) as ClipOutcome.Read
        assertEquals(270, out.bearingDeg) // facing north, exit left
        // The stored reading is read-only once complete; the event carries the new facing.
        assertEquals(listOf("find"), deps.log)
    }

    @Test fun aCachedReadingThatFailsItsChecksIsCouldNotRead() = runTest {
        val r = request(1000)
        val sha = Hashes.sha256Hex(r.bytes)
        val bad = readingJson.replace("\"lastSeen\":\"00:12\"", "\"lastSeen\":\"09:99\"")
        val cached = StoredClipReading(
            sha256 = sha, storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = bad, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
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

    @Test fun aMissRecordsConsentThenUploadsThenReadsThenCompletes() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000)) as ClipOutcome.Read
        assertEquals(listOf("find", "consent", "upload", "model:video/mp4", "complete"), deps.log)
        val record = deps.consents.single()
        assertNull(record.readingJson)
        assertNull(record.route)
        assertEquals("u1", record.createdByUid)
        assertEquals("clips/inc-1/${Hashes.sha256Hex(request(1000).bytes)}.mp4", record.storagePath)
        assertEquals(request(1000).consent, record.consent)
        assertEquals(Hashes.sha256Hex(request(1000).bytes), deps.completed.single().first)
        assertFalse(out.cached)
        assertTrue(out.check!!.ok)
        assertEquals(0, out.bearingDeg) // facing 90, exit left: 90 - 90
        assertEquals("cloud", out.route!!.path)
        assertEquals("sdk_only_in_cloud", out.route.reason)
        assertTrue(out.route.sdkReported)
        // The server template picks the model, so the route names the template that ran.
        assertEquals("server template pls-clip-sighting-v1", out.route.model)
        assertEquals(Hashes.sha256Hex(request(1000).bytes), record.sha256)
        // The rules accept expiresAt only between server time + 31 days and + 33 days.
        val day = 24L * 3600 * 1000
        assertEquals(1_000L + 32L * day, record.expiresAtMs)
        assertTrue(record.expiresAtMs - record.createdAtMs in (31L * day + 1)..(33L * day - 1))
        assertEquals(90, record.cameraFacingDeg)
    }

    /** The completed reading as a no-sighting, or null when it is not one. */
    private fun noSighting(json: String): List<String>? = ClipNoSighting.parse(json)?.reasons

    /** A could-not-read result completes the record, so it is cached for everyone and never blocks another reader. */
    @Test fun anUnreadableReplyCompletesTheRecordAsNoSighting() = runTest {
        val deps = FakeDeps(reply = ModelReply("{not json", Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000))
        assertEquals(ClipOutcome.CouldNotRead, out)
        assertEquals(1, deps.consents.size)
        assertEquals(listOf("unreadable_reply"), noSighting(deps.completed.single().second))
    }

    /**
     * A model error is not a reading: the record stays open (consent only), so the next reader takes
     * it over and tries again. A completed reading can never change, so caching a passing 503 as "no
     * sighting" would hide a real sighting from everyone.
     */
    @Test fun aModelErrorLeavesTheRecordOpenForTheNextReader() = runTest {
        val inner = FakeDeps()
        val deps = object : ClipDeps by inner {
            override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply = throw IllegalStateException("503")
        }
        assertEquals(ClipOutcome.Failed, ClipReader(deps).read(request(1000)))
        assertEquals(request(1000).consent, inner.consents.single().consent)
        assertTrue(inner.completed.isEmpty())
    }

    @Test fun aCachedNoSightingIsCouldNotReadWithNoModelCall() = runTest {
        val r = request(1000)
        val done = StoredClipReading(
            sha256 = Hashes.sha256Hex(r.bytes), storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = ClipNoSighting(listOf("no_person")).toJson(), route = null, consent = r.consent,
            expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "other",
        )
        val deps = FakeDeps(cached = done, reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        assertEquals(ClipOutcome.CouldNotRead, ClipReader(deps).read(r))
        assertEquals(listOf("find"), deps.log)
    }

    /** While no reading exists, anyone allowed takes a stalled record over as themselves: new owner, own consent, every other field as stored. */
    @Test fun aStalledRecordFromAnotherUserIsTakenOver() = runTest {
        val r = request(1000)
        val stalled = StoredClipReading(
            sha256 = Hashes.sha256Hex(r.bytes), storagePath = "clips/inc-1/x.mp4", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = null, route = null, consent = consentFor(bytes(1000)).copy(personInClip = ConsentMark("other", 1L)),
            expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "other",
        )
        val deps = FakeDeps(cached = stalled, reply = ModelReply(readingJson, Source.IN_CLOUD, 900), alreadyUploaded = true)
        assertTrue(ClipReader(deps).read(r) is ClipOutcome.Read)
        val day = 24L * 3600 * 1000
        assertEquals(stalled.copy(createdByUid = "u1", consent = r.consent, expiresAtMs = 1_000L + 32L * day, createdAtMs = 1_000L), deps.consents.single())
        assertEquals(listOf("find", "consent", "exists", "model:video/mp4", "complete"), deps.log)
    }

    @Test fun aConsentOnlyRecordIsNotACachedReading() = runTest {
        val r = request(1000)
        val consentOnly = StoredClipReading(
            sha256 = Hashes.sha256Hex(r.bytes), storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = null, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
        )
        val deps = FakeDeps(cached = consentOnly, reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(r) as ClipOutcome.Read
        assertFalse(out.cached)
        // The record exists from an earlier attempt: it is renewed (fresh consent and expiry)
        // before the upload, because the upload is accepted only while the expiry is 31 days out.
        assertEquals(listOf("find", "consent", "exists", "upload", "model:video/mp4", "complete"), deps.log)
    }

    @Test fun aRetryWhoseClipIsAlreadyStoredSkipsTheUpload() = runTest {
        val r = request(1000)
        val consentOnly = StoredClipReading(
            sha256 = Hashes.sha256Hex(r.bytes), storagePath = "p", durationS = 30, clipStartMs = 500L, clockConfirmed = true,
            cameraFacingDeg = 90, readingJson = null, route = null, consent = r.consent, expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
        )
        val deps = FakeDeps(cached = consentOnly, reply = ModelReply(readingJson, Source.IN_CLOUD, 900), alreadyUploaded = true)
        assertTrue(ClipReader(deps).read(r) is ClipOutcome.Read)
        // Clips are create-only in Storage, so a second upload of the same hash would be refused.
        assertEquals(listOf("find", "consent", "exists", "model:video/mp4", "complete"), deps.log)
    }

    /** A retry renews the stored record: only consent, expiresAt and createdAt change; every other field is the stored one. */
    @Test fun aRetryRenewsTheStoredRecordWithFreshConsent() = runTest {
        val r = request(1000)
        val stored = StoredClipReading(
            sha256 = Hashes.sha256Hex(r.bytes), storagePath = "clips/inc-1/old.mp4", durationS = 29, clipStartMs = 400L,
            clockConfirmed = false, cameraFacingDeg = 180, readingJson = null, route = null,
            consent = r.consent.copy(publicUse = mark), expiresAtMs = 9L, createdAtMs = 1L, createdByUid = "u1",
        )
        val deps = FakeDeps(cached = stored, reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        ClipReader(deps).read(r)
        val day = 24L * 3600 * 1000
        assertEquals(stored.copy(consent = r.consent, expiresAtMs = 1_000L + 32L * day, createdAtMs = 1_000L), deps.consents.single())
    }

    /** Cloud AI Logic requests need a Firebase Auth ID token: a clip read signs in before anything leaves the phone. */
    @Test fun aClipReadSignsInBeforeAnythingLeavesThePhone() = runTest {
        val order = mutableListOf<String>()
        val inner = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val deps = object : ClipDeps by inner {
            override suspend fun ensureSignedIn(): String { order += "signin"; return "u1" }
            override suspend fun findReading(sha256: String): StoredClipReading? { order += "find"; return null }
            override suspend fun createConsentRecord(doc: StoredClipReading) { order += "consent" }
            override suspend fun upload(sha256: String, bytes: ByteArray): String { order += "upload"; return "p" }
            override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply { order += "model"; return inner.reply }
        }
        ClipReader(deps).read(request(1000))
        assertEquals(listOf("signin", "find", "consent", "upload", "model"), order)
    }

    @Test fun aFailedSignInSendsNothing() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900), signInFails = true)
        assertEquals(ClipOutcome.Failed, ClipReader(deps).read(request(1000)))
        assertTrue(deps.log.isEmpty())
        assertTrue(deps.consents.isEmpty())
    }

    @Test fun aReadingThatFailsItsChecksCompletesAsNoSightingWithTheCheckReasons() = runTest {
        val bad = readingJson.replace("\"lastSeen\":\"00:12\"", "\"lastSeen\":\"01:12\"")
        val deps = FakeDeps(reply = ModelReply(bad, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000))
        assertEquals(ClipOutcome.CouldNotRead, out)
        assertEquals(listOf("last_after_clip_end"), noSighting(deps.completed.single().second))
    }

    @Test fun noFacingGivesNoBearing() = runTest {
        val deps = FakeDeps(reply = ModelReply(readingJson, Source.IN_CLOUD, 900))
        val out = ClipReader(deps).read(request(1000).copy(cameraFacingDeg = null)) as ClipOutcome.Read
        assertNull(out.bearingDeg)
    }

    /** The route record's model field holds 80 characters at most, so a long template id is cut, never refused. */
    @Test fun aLongTemplateIdStillFitsTheRouteRecord() {
        assertEquals(80, ClipReader.templateModel("t".repeat(200)).length)
        assertEquals("server template pls-clip-sighting-v1", ClipReader.templateModel("pls-clip-sighting-v1"))
    }
}
