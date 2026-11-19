package app.pointlastseen.family.push

import com.google.firebase.messaging.FirebaseMessaging

/**
 * The family's push topic for the incident they joined (pls-{incidentId}-family): subscribed on
 * joining and again at each start while joined (FCM keeps one subscription), dropped on leaving.
 */
class FamilyTopic(private val subscribe: (String) -> Unit, private val unsubscribe: (String) -> Unit) {
    fun joined(incidentId: String) {
        PlanPush.familyTopic(incidentId)?.let(subscribe)
    }

    fun left(incidentId: String) {
        PlanPush.familyTopic(incidentId)?.let(unsubscribe)
    }

    companion object {
        fun firebase() = FamilyTopic(
            subscribe = { FirebaseMessaging.getInstance().subscribeToTopic(it) },
            unsubscribe = { FirebaseMessaging.getInstance().unsubscribeFromTopic(it) },
        )
    }
}
