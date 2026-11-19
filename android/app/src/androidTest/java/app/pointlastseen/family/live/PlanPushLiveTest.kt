package app.pointlastseen.family.live

import android.util.Log
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.MainActivity
import app.pointlastseen.family.push.PlanPush
import app.pointlastseen.family.push.PlanPushInbox
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * End to end against the deployed project: this build subscribes to the drill's team T1 topic and
 * waits for the push the server sends when command approves a plan that changes T1. Someone with the
 * command role approves that plan during the wait. Lines carry ids only.
 */
@DrillE2E
@RunWith(AndroidJUnit4::class)
class PlanPushLiveTest {
    private fun log(s: String) = Log.i("PLS-E2E", s)

    @Test fun aPlanThatChangesTeamT1ReachesThisPhone(): Unit = runBlocking {
        val topic = PlanPush.topic(INCIDENT, TEAM)!!
        // A notification message reaches the app's own service only while the app is in front.
        ActivityScenario.launch(MainActivity::class.java).use {
            FirebaseMessaging.getInstance().subscribeToTopic(topic).await()
            log("subscribed topic=$topic, waiting up to $WAIT_MIN min for a plan push")
            try {
                val push = withTimeout(WAIT_MIN * 60_000L) { PlanPushInbox.received.first { it.incidentId == INCIDENT && it.teamId == TEAM } }
                assertEquals(TEAM, push.teamId)
                log("plan push received incident=${push.incidentId} team=${push.teamId} version=${push.planVersion}")
            } finally {
                FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).await()
                log("unsubscribed topic=$topic")
            }
        }
    }

    private companion object {
        const val INCIDENT = "drill-dev-1"
        const val TEAM = "T1"
        const val WAIT_MIN = 20
    }
}
