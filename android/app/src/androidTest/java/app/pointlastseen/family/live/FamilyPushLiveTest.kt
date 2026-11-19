package app.pointlastseen.family.live

import android.util.Log
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.MainActivity
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirestoreFamilyQuestions
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.push.FamilyNotice
import app.pointlastseen.family.push.FamilyPushInbox
import app.pointlastseen.family.push.PlanPush
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Against the deployed drill: the family topic carries the search lead's question and the neutral
 * search states, the question text is read from Firestore (never from the push), and the family
 * answers once. Someone with the command role writes the question and the states during the wait.
 * PLS-E2E lines carry ids and outcomes only, never the code, a token or a uid.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class FamilyPushLiveTest {
    private fun log(s: String) = Log.i("PLS-E2E", s)

    @Test fun theFamilyGetsTheQuestionAndTheStatesAndAnswersOnce(): Unit = runBlocking {
        val joined = withTimeout(30_000) { Join(FirebaseJoinBackend()).join(DrillCode.read()!!) }
        assertTrue("join: $joined", joined is JoinOutcome.Joined)
        val incidentId = (joined as JoinOutcome.Joined).incidentId
        val uid = joined.uid
        val topic = PlanPush.familyTopic(incidentId)!!
        ActivityScenario.launch(MainActivity::class.java).use {
            FirebaseMessaging.getInstance().subscribeToTopic(topic).await()
            log("family subscribed topic=$topic, waiting up to $WAIT_MIN min")
            try {
                val question = withTimeout(WAIT_MIN * 60_000L) {
                    FamilyPushInbox.received.first { it is FamilyNotice.Question && it.incidentId == incidentId }
                } as FamilyNotice.Question
                log("question push received question=${question.questionId}")

                // The question text comes from Firestore, never from the push.
                val store = FirestoreFamilyQuestions()
                val q = store.read(incidentId, question.questionId)
                assertTrue("question readable with text", q != null && q.text.isNotBlank())
                log("question text read from Firestore, ${q!!.text.length} characters, answered=${q.answer != null}")
                if (q.answer == null) {
                    store.answer(incidentId, question.questionId, "Training drill answer from the family app.", uid)
                    assertEquals("Training drill answer from the family app.", store.read(incidentId, question.questionId)?.answer)
                    log("answer written once and read back")
                }
                val second = runCatching { store.answer(incidentId, question.questionId, "A second answer.", uid) }
                assertTrue("a second answer must be refused", second.isFailure)
                log("second answer refused: ${second.exceptionOrNull()?.javaClass?.simpleName}")

                withTimeout(WAIT_MIN * 60_000L) { FamilyPushInbox.received.first { it is FamilyNotice.Paused && it.incidentId == incidentId } }
                log("paused push received")
                withTimeout(WAIT_MIN * 60_000L) { FamilyPushInbox.received.first { it is FamilyNotice.Searching && it.incidentId == incidentId } }
                log("searching push received")
            } finally {
                FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).await()
                log("family unsubscribed topic=$topic")
            }
        }
    }

    private companion object {
        const val WAIT_MIN = 15
    }
}
