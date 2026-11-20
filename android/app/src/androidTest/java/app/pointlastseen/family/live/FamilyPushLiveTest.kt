package app.pointlastseen.family.live

import android.util.Log
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.pointlastseen.family.MainActivity
import app.pointlastseen.family.data.FamilyQuestions
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirestoreFamilyQuestions
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.PrefsStore
import app.pointlastseen.family.data.Session
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
 * search states, the question is the newest unanswered one listed from Firestore (the push carries
 * no question id), and the family answers once. Someone with the command role writes the question and the states during the wait.
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
        // The app shows (and hands the test) only notices for the search it is in, so the test joins it in the
        // app's own session too, without the gone flag (nothing is published), and puts both back afterwards.
        val prefs = PrefsStore(InstrumentationRegistry.getInstrumentation().targetContext, "pls")
        val session = Session(prefs)
        val incidentBefore = session.incidentId()
        val goneBefore = prefs.get(GONE_KEY)
        prefs.remove(GONE_KEY)
        session.joined(incidentId)
        try {
            launchAndWait(incidentId, uid, topic)
        } finally {
            if (incidentBefore == null) session.leave() else session.joined(incidentBefore)
            if (goneBefore == null) prefs.remove(GONE_KEY) else prefs.put(GONE_KEY, goneBefore)
            log("app session put back")
        }
    }

    private suspend fun launchAndWait(incidentId: String, uid: String, topic: String) {
        ActivityScenario.launch(MainActivity::class.java).use {
            FirebaseMessaging.getInstance().subscribeToTopic(topic).await()
            log("family subscribed topic=$topic, waiting up to $WAIT_MIN min")
            try {
                withTimeout(WAIT_MIN * 60_000L) {
                    FamilyPushInbox.received.first { it is FamilyNotice.Question && it.incidentId == incidentId }
                }
                log("question push received")

                // The push carries no question id: the question is the newest unanswered one listed on the server.
                val store = FirestoreFamilyQuestions()
                val waiting = FamilyQuestions.newestUnanswered(store.list(incidentId))
                assertTrue("an unanswered question is listed", waiting != null && waiting.text.isNotBlank())
                val questionId = waiting!!.id
                log("newest unanswered question listed from Firestore, ${waiting.text.length} characters")
                store.answer(incidentId, questionId, "Training drill answer from the family app.", uid)
                assertEquals("Training drill answer from the family app.", store.read(incidentId, questionId)?.answer)
                log("answer written once and read back")
                val second = runCatching { store.answer(incidentId, questionId, "A second answer.", uid) }
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
        // The app's own "gone" flag in the same store (FamilyViewModel).
        const val GONE_KEY = "gone"
    }
}
