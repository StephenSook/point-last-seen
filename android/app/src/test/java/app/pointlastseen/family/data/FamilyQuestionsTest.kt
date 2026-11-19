package app.pointlastseen.family.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class FamilyQuestionsTest {
    private class FakeStore(private val listed: () -> List<ListedQuestion>) : FamilyQuestionStore {
        val listedFor = mutableListOf<String>()
        override suspend fun list(incidentId: String): List<ListedQuestion> {
            listedFor += incidentId
            return listed()
        }
        override suspend fun read(incidentId: String, questionId: String): FamilyQuestion? = error("not used")
        override suspend fun answer(incidentId: String, questionId: String, text: String, uid: String) = error("not used")
    }

    private fun q(id: String, atMs: Long?, answer: String? = null, text: String = "Where did she walk?") = ListedQuestion(id, text, answer, atMs)

    @Test fun theNewestUnansweredQuestionIsTheOneToOpen() {
        val listed = listOf(q("new", 3_000), q("mid", 2_000), q("old", 1_000))
        assertEquals("new", FamilyQuestions.newestUnanswered(listed)?.id)
        assertEquals("new", FamilyQuestions.newestUnanswered(listed.reversed())?.id)
    }

    @Test fun anAnsweredQuestionIsSkippedEvenWhenItIsTheNewest() {
        val listed = listOf(q("new", 3_000, answer = "By the river."), q("mid", 2_000), q("old", 1_000))
        assertEquals("mid", FamilyQuestions.newestUnanswered(listed)?.id)
    }

    @Test fun nothingIsWaitingWhenEveryQuestionIsAnsweredOrThereAreNone() {
        assertNull(FamilyQuestions.newestUnanswered(emptyList()))
        assertNull(FamilyQuestions.newestUnanswered(listOf(q("a", 1_000, answer = "Yes."), q("b", 2_000, answer = "No."))))
    }

    /** A question with no server time yet sorts as the oldest; one with blank text is never opened. */
    @Test fun aQuestionWithNoTimeSortsLastAndBlankTextIsNeverOpened() {
        assertEquals("timed", FamilyQuestions.newestUnanswered(listOf(q("untimed", null), q("timed", 1_000)))?.id)
        assertEquals("untimed", FamilyQuestions.newestUnanswered(listOf(q("untimed", null)))?.id)
        assertNull(FamilyQuestions.newestUnanswered(listOf(q("blank", 5_000, text = "  "))))
    }

    @Test fun theCheckReadsTheIncidentsListAndNamesTheWaitingQuestion(): Unit = runBlocking {
        val store = FakeStore { listOf(q("new", 3_000, answer = "Yes."), q("mid", 2_000, text = "Did she take a bag?")) }
        assertEquals(QuestionCheck.Waiting("mid", "Did she take a bag?"), FamilyQuestions.check(store, "drill-dev-1"))
        assertEquals(listOf("drill-dev-1"), store.listedFor)
    }

    @Test fun theCheckSaysNoneWaitingOrFailed(): Unit = runBlocking {
        assertEquals(QuestionCheck.NoneWaiting, FamilyQuestions.check(FakeStore { listOf(q("a", 1_000, answer = "Yes.")) }, "i"))
        assertEquals(QuestionCheck.Failed, FamilyQuestions.check(FakeStore { throw IllegalStateException("offline") }, "i"))
    }

    @Test fun aCancelledCheckIsNotReportedAsAFailure() {
        assertThrows(CancellationException::class.java) {
            runBlocking { FamilyQuestions.check(FakeStore { throw CancellationException("left the screen") }, "i") }
        }
    }
}
