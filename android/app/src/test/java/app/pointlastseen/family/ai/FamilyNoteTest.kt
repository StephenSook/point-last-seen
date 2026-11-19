package app.pointlastseen.family.ai

import app.pointlastseen.family.core.EvidenceScreen
import app.pointlastseen.family.data.SignIn
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyNoteTest {
    private val screen = EvidenceScreen(listOf("blood", "knife"))

    private class FakeModel(private val reply: ModelReply) : NoteModel {
        val calls = mutableListOf<Pair<NoteMode, String>>()
        override suspend fun structure(mode: NoteMode, prompt: String): ModelReply {
            calls += mode to prompt
            return reply
        }
    }

    /** Records each sign-in in [order]; throws when [fails]. */
    private class FakeSignIn(private val order: MutableList<String>, private val fails: Boolean = false) : SignIn {
        override suspend fun ensureSignedIn(): String {
            order += "signin"
            if (fails) throw IllegalStateException("no network")
            return "u1"
        }
    }

    private val signedIn = FakeSignIn(mutableListOf())

    private val goodJson = """{"kind":"place","label":"the old mill","summary":"She talks about walking to the old mill.","evidenceQuote":"walk to the old mill"}"""
    private val note = "She used to walk to the old mill every Sunday, call me at 404-555-0142"

    private fun env(status: DeviceModelStatus, consent: Boolean, killCloud: Boolean = false) =
        NoteEnv(status = status, cloudConsent = consent, killCloud = killCloud, nowMs = { 10L }, modelName = "gemini-3.5-flash-lite")

    /** Cloud AI Logic requests need a Firebase Auth ID token, so a note that can reach the cloud signs in first, even before joining. */
    @Test fun aCloudRouteNoteSignsInBeforeTheModelCall() = runTest {
        val order = mutableListOf<String>()
        val model = object : NoteModel {
            override suspend fun structure(mode: NoteMode, prompt: String): ModelReply {
                order += "model:$mode"
                return ModelReply(goodJson, Source.IN_CLOUD, 5)
            }
        }
        val out = FamilyNote(model, screen, FakeSignIn(order)).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertTrue(out is NoteOutcome.Read)
        assertEquals(listOf("signin", "model:PREFER_ON_DEVICE"), order)
    }

    /** A server error (for example the AI Logic guard refusing a model: HTTP 500 INTERNAL) is a plain "could not be sorted", never raw text. */
    @Test fun aServerErrorFromTheModelIsAPlainFailure() = runTest {
        val model = object : NoteModel {
            override suspend fun structure(mode: NoteMode, prompt: String): ModelReply = throw RuntimeException("HTTP 500 INTERNAL")
        }
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertEquals(NoteOutcome.Failed, out)
    }

    @Test fun aFailedSignInWithNoLocalModelSendsNothing() = runTest {
        val order = mutableListOf<String>()
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, FakeSignIn(order, fails = true)).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertEquals(NoteOutcome.Failed, out)
        assertEquals(listOf("signin"), order)
        assertTrue(model.calls.isEmpty())
    }

    @Test fun aFailedSignInWithALocalModelKeepsTheNoteOnThePhone() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.ON_DEVICE, 5))
        val out = FamilyNote(model, screen, FakeSignIn(mutableListOf(), fails = true)).read(note, env(DeviceModelStatus.AVAILABLE, consent = true))
        assertTrue(out is NoteOutcome.Read)
        assertEquals(NoteMode.ONLY_ON_DEVICE, model.calls.single().first)
    }

    @Test fun theDeviceOnlyRouteNeverSignsIn() = runTest {
        val order = mutableListOf<String>()
        val model = FakeModel(ModelReply(goodJson, Source.ON_DEVICE, 5))
        FamilyNote(model, screen, FakeSignIn(order)).read(note, env(DeviceModelStatus.AVAILABLE, consent = false))
        FamilyNote(model, screen, FakeSignIn(order)).read(note, env(DeviceModelStatus.AVAILABLE, consent = true, killCloud = true))
        assertTrue(order.isEmpty())
        assertEquals(listOf(NoteMode.ONLY_ON_DEVICE, NoteMode.ONLY_ON_DEVICE), model.calls.map { it.first })
    }

    @Test fun familyNoteNeedsConsentBeforeFirstCloudCall() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = false))
        assertEquals(NoteOutcome.NeedsConsent, out)
        assertTrue(model.calls.isEmpty())
        val after = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertTrue(after is NoteOutcome.Read)
        assertEquals(NoteMode.PREFER_ON_DEVICE, model.calls.single().first)
    }

    @Test fun withoutConsentALocalModelIsTheOnlyRoute() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.ON_DEVICE, 5))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.AVAILABLE, consent = false))
        assertTrue(out is NoteOutcome.Read)
        assertEquals(NoteMode.ONLY_ON_DEVICE, model.calls.single().first)
    }

    @Test fun killCloudWithNoLocalModelMakesNoCall() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true, killCloud = true))
        assertEquals(NoteOutcome.FillByHand, out)
        assertTrue(model.calls.isEmpty())
    }

    @Test fun killCloudKeepsALocalModelOnDevice() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.ON_DEVICE, 5))
        FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.AVAILABLE, consent = true, killCloud = true))
        assertEquals(NoteMode.ONLY_ON_DEVICE, model.calls.single().first)
    }

    @Test fun possibleEvidenceGoesToNoModel() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, signedIn).read("there was blood on her coat", env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertEquals(NoteOutcome.PossibleEvidence, out)
        assertTrue(model.calls.isEmpty())
    }

    @Test fun theModelNeverSeesAPhoneNumber() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        val prompt = model.calls.single().second
        assertFalse(prompt.contains("404-555-0142"))
        assertTrue(prompt.contains("[number removed]"))
    }

    @Test fun theModelNeverSeesAParenthesizedNumber() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        FamilyNote(model, screen, signedIn).read("She used to walk to the old mill, call +1 (404) 5550142", env(DeviceModelStatus.UNAVAILABLE, consent = true))
        val prompt = model.calls.single().second
        assertFalse(prompt.contains("5550142"))
        assertTrue(prompt.contains("[number removed]"))
    }

    @Test fun theRouteRecordsTheSdkReportedSource() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 42))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true)) as NoteOutcome.Read
        assertEquals("android", out.route.platform)
        assertEquals("cloud", out.route.path)
        assertEquals("sdk", out.route.stage)
        assertTrue(out.route.sdkReported)
        assertEquals(42L, out.route.latencyMs)
        assertEquals("on_device_unavailable", out.route.reason)
        assertEquals("place", out.reading.kind)
        assertEquals("the old mill", out.reading.label)
    }

    @Test fun aCloudAnswerWithALocalModelIsTheSdkFallback() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.AVAILABLE, consent = true)) as NoteOutcome.Read
        assertEquals("cloud", out.route.path)
        assertEquals("sdk_fallback", out.route.reason)
    }

    @Test fun anOnDeviceAnswerIsTheDefault() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.ON_DEVICE, 5))
        val out = FamilyNote(model, screen, signedIn).read(note, env(DeviceModelStatus.AVAILABLE, consent = false)) as NoteOutcome.Read
        assertEquals("on_device", out.route.path)
        assertEquals("on_device_default", out.route.reason)
    }

    @Test fun aReadingWhoseQuoteIsNotInTheNoteIsDropped() = runTest {
        val bad = """{"kind":"place","label":"x","summary":"y","evidenceQuote":"walked to the river"}"""
        val out = FamilyNote(FakeModel(ModelReply(bad, Source.IN_CLOUD, 5)), screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, consent = true))
        assertEquals(NoteOutcome.Invalid, out)
    }

    @Test fun anUnknownKindOrBrokenJsonIsDropped() = runTest {
        val badKind = """{"kind":"diagnosis","label":"x","summary":"y","evidenceQuote":"old mill"}"""
        assertEquals(NoteOutcome.Invalid, FamilyNote(FakeModel(ModelReply(badKind, Source.IN_CLOUD, 5)), screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, true)))
        assertEquals(NoteOutcome.Invalid, FamilyNote(FakeModel(ModelReply("not json", Source.IN_CLOUD, 5)), screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, true)))
        assertEquals(NoteOutcome.Invalid, FamilyNote(FakeModel(ModelReply(null, Source.IN_CLOUD, 5)), screen, signedIn).read(note, env(DeviceModelStatus.UNAVAILABLE, true)))
    }

    @Test fun anEmptyOrOverlongNoteMakesNoCall() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        assertEquals(NoteOutcome.Invalid, FamilyNote(model, screen, signedIn).read("   ", env(DeviceModelStatus.UNAVAILABLE, true)))
        assertEquals(NoteOutcome.Invalid, FamilyNote(model, screen, signedIn).read("x".repeat(2001), env(DeviceModelStatus.UNAVAILABLE, true)))
        assertTrue(model.calls.isEmpty())
    }

    /**
     * Without consent, or with the cloud paused, the only route is this phone. A reply the SDK reports from the
     * cloud is refused: nothing is kept and no route record claims a cloud read. The invariant never rests on the SDK.
     */
    @Test fun aDeviceOnlyReadRefusesAReplyFromTheCloud() = runTest {
        for (e in listOf(env(DeviceModelStatus.AVAILABLE, consent = false), env(DeviceModelStatus.AVAILABLE, consent = true, killCloud = true))) {
            val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
            assertEquals(NoteOutcome.Failed, FamilyNote(model, screen, signedIn).read(note, e))
            assertEquals(listOf(NoteMode.ONLY_ON_DEVICE), model.calls.map { it.first })
        }
    }

    /** A failed sign-in that falls back to the device-only route is held to the same rule. */
    @Test fun aSignInFallbackToDeviceOnlyAlsoRefusesACloudReply() = runTest {
        val model = FakeModel(ModelReply(goodJson, Source.IN_CLOUD, 5))
        val out = FamilyNote(model, screen, FakeSignIn(mutableListOf(), fails = true)).read(note, env(DeviceModelStatus.AVAILABLE, consent = true))
        assertEquals(NoteOutcome.Failed, out)
        assertEquals(listOf(NoteMode.ONLY_ON_DEVICE), model.calls.map { it.first })
    }
}
