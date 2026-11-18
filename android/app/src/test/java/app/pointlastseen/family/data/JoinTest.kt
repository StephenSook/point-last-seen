package app.pointlastseen.family.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class JoinTest {
    private class FakeBackend(
        val reply: Any? = mapOf("ok" to true, "incidentId" to "inc-9"),
        val claims: Map<String, Any?> = mapOf("inc" to "inc-9", "role" to "family", "team" to null),
    ) : JoinBackend {
        val log = mutableListOf<String>()
        var sent: Map<String, Any?>? = null
        override suspend fun ensureSignedIn(): String { log += "signin"; return "uid-1" }
        override suspend fun callJoin(payload: Map<String, Any?>): Any? { log += "join"; sent = payload; return reply }
        override suspend fun refreshClaims(): Map<String, Any?> { log += "refresh"; return claims }
    }

    @Test fun joiningSendsTheCodeAsFamilyAndRefreshesTheClaims() = runTest {
        val be = FakeBackend()
        val out = Join(be).join("  AB12CD ")
        assertEquals(JoinOutcome.Joined("inc-9", "uid-1"), out)
        assertEquals(mapOf("joinCode" to "AB12CD", "role" to "family"), be.sent)
        assertEquals(listOf("signin", "join", "refresh"), be.log)
    }

    @Test fun anEmptyCodeMakesNoCall() = runTest {
        val be = FakeBackend()
        assertTrue(Join(be).join("   ") is JoinOutcome.Failed)
        assertTrue(be.log.isEmpty())
    }

    @Test fun aRefusedCodeIsAPlainFailure() = runTest {
        val out = Join(FakeBackend(reply = mapOf("ok" to false))).join("ZZZ")
        assertEquals(JoinOutcome.Failed("That code did not work. Check it with command."), out)
    }

    @Test fun theServerRefusingTheCodeSaysTheCodeDidNotWork() = runTest {
        // joinIncident throws HttpsError("permission-denied") for a wrong code; it never returns ok: false.
        val be = object : JoinBackend {
            override suspend fun ensureSignedIn() = "uid-1"
            override suspend fun callJoin(payload: Map<String, Any?>): Any? = throw JoinRefused()
            override suspend fun refreshClaims(): Map<String, Any?> = emptyMap()
        }
        assertEquals(JoinOutcome.Failed(Join.REFUSED), Join(be).join("ZZZ"))
    }

    @Test fun refusalCodesFromTheCallableAreTheCodeProblems() {
        for (n in listOf("PERMISSION_DENIED", "INVALID_ARGUMENT", "NOT_FOUND", "FAILED_PRECONDITION")) assertTrue(n, JoinRefused.isRefusal(n))
        for (n in listOf("UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL", "UNAUTHENTICATED")) assertTrue(n, !JoinRefused.isRefusal(n))
    }

    @Test fun claimsForAnotherIncidentOrRoleAreRefused() = runTest {
        assertTrue(Join(FakeBackend(claims = mapOf("inc" to "other", "role" to "family"))).join("AB") is JoinOutcome.Failed)
        assertTrue(Join(FakeBackend(claims = mapOf("inc" to "inc-9", "role" to "command"))).join("AB") is JoinOutcome.Failed)
    }

    @Test fun aBackendErrorNeverShowsItsRawText() = runTest {
        val be = object : JoinBackend {
            override suspend fun ensureSignedIn() = "uid-1"
            override suspend fun callJoin(payload: Map<String, Any?>): Any? = throw IllegalStateException("INTERNAL: stack trace here")
            override suspend fun refreshClaims(): Map<String, Any?> = emptyMap()
        }
        val out = Join(be).join("AB") as JoinOutcome.Failed
        assertTrue(!out.message.contains("INTERNAL"))
    }
}
