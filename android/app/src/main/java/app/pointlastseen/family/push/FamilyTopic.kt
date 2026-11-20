package app.pointlastseen.family.push

import app.pointlastseen.family.data.KeyValueStore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/**
 * The family's push topic for the incident they joined (pls-{incidentId}-family): subscribed on
 * joining and again at each start while joined (FCM keeps one subscription), dropped on leaving.
 * A drop is recorded in [pending] first and stays there until FCM confirms it, so one that failed
 * (offline) is tried again at the next start; joining that search again cancels it.
 */
class FamilyTopic(
    private val subscribe: (String) -> Unit,
    private val unsubscribe: suspend (String) -> Unit,
    private val pending: KeyValueStore,
) {
    fun joined(incidentId: String) {
        val topic = PlanPush.familyTopic(incidentId) ?: return
        setPending(pendingTopics() - topic)
        subscribe(topic)
    }

    /**
     * Records the drop at once, with no network: leaving calls this before it forgets the search, so a process
     * death while the leave waits still has the drop on disk for the next start.
     */
    fun leaving(incidentId: String) {
        val topic = PlanPush.familyTopic(incidentId) ?: return
        setPending(pendingTopics() + topic)
    }

    /** Drops the topic; true once FCM confirmed it, false when it stays pending for a later try. */
    suspend fun left(incidentId: String): Boolean {
        val topic = PlanPush.familyTopic(incidentId) ?: return true
        setPending(pendingTopics() + topic)
        return drop(topic)
    }

    /** Tries every drop FCM has not confirmed yet. */
    suspend fun retryPending() {
        for (topic in pendingTopics()) drop(topic)
    }

    fun pendingTopics(): List<String> = pending.get(KEY)?.split(",")?.filter { it.isNotEmpty() }?.distinct() ?: emptyList()

    private suspend fun drop(topic: String): Boolean = try {
        unsubscribe(topic)
        setPending(pendingTopics() - topic)
        true
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }

    private fun setPending(topics: List<String>) {
        if (topics.isEmpty()) pending.remove(KEY) else pending.put(KEY, topics.distinct().joinToString(","))
    }

    companion object {
        private const val KEY = "pendingUnsubscribe"

        fun firebase(pending: KeyValueStore) = FamilyTopic(
            subscribe = { FirebaseMessaging.getInstance().subscribeToTopic(it) },
            unsubscribe = { FirebaseMessaging.getInstance().unsubscribeFromTopic(it).await() },
            pending = pending,
        )
    }
}
