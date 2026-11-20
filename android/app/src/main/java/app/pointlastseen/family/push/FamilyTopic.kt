package app.pointlastseen.family.push

import app.pointlastseen.family.data.KeyValueStore
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/**
 * The family's push topic for the incident they joined (pls-{incidentId}-family): subscribed on
 * joining and again at each start while joined (FCM keeps one subscription), dropped on leaving.
 * A drop is recorded in [pending] first and stays there until FCM confirms it, so one that failed
 * (offline) is tried again at the next start; joining that search again cancels it. Every join or drop of a
 * topic is a new request: a confirmation clears the record only when no newer request for that topic came
 * after it. Call it from one thread (the app's main thread).
 */
class FamilyTopic(
    private val subscribe: (String) -> Unit,
    private val unsubscribe: suspend (String) -> Unit,
    private val pending: KeyValueStore,
) {
    // Requests per topic in this process: a join or a drop moves it on.
    private val requests = mutableMapOf<String, Int>()

    private fun request(topic: String) {
        requests[topic] = (requests[topic] ?: 0) + 1
    }

    fun joined(incidentId: String) {
        val topic = PlanPush.familyTopic(incidentId) ?: return
        request(topic)
        setPending(pendingTopics() - topic)
        subscribe(topic)
    }

    /**
     * Records the drop at once, with no network: leaving calls this before it forgets the search, so a process
     * death while the leave waits still has the drop on disk for the next start.
     */
    fun leaving(incidentId: String) {
        val topic = PlanPush.familyTopic(incidentId) ?: return
        request(topic)
        setPending(pendingTopics() + topic)
    }

    /** Drops the topic; true once FCM confirmed this drop, false when it stays pending for a later try. */
    suspend fun left(incidentId: String): Boolean {
        val topic = PlanPush.familyTopic(incidentId) ?: return true
        request(topic)
        setPending(pendingTopics() + topic)
        return drop(topic)
    }

    /** Tries every drop FCM has not confirmed yet, each only if it is still pending when its turn comes. */
    suspend fun retryPending() {
        for (topic in pendingTopics()) if (topic in pendingTopics()) drop(topic)
    }

    fun pendingTopics(): List<String> = pending.get(KEY)?.split(",")?.filter { it.isNotEmpty() }?.distinct() ?: emptyList()

    private suspend fun drop(topic: String): Boolean {
        val mine = requests[topic] ?: 0
        try {
            unsubscribe(topic)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return false
        }
        // A join or drop after this one owns the record now.
        if ((requests[topic] ?: 0) != mine) return false
        setPending(pendingTopics() - topic)
        return true
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
