package app.pointlastseen.family.data

import android.content.Context

/** A tiny key-value store; the app uses private SharedPreferences. */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)

    /** Removes every key in one write where the store can (PrefsStore does), so none survives without the others. */
    fun removeAll(keys: Collection<String>) {
        keys.forEach { remove(it) }
    }
}

class PrefsStore(context: Context, name: String) : KeyValueStore {
    private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
    override fun get(key: String): String? = prefs.getString(key, null)

    // commit(), not apply(): a sequence number must be on disk before an event id uses it.
    override fun put(key: String, value: String) {
        prefs.edit().putString(key, value).commit()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).commit()
    }

    override fun removeAll(keys: Collection<String>) {
        val edit = prefs.edit()
        keys.forEach { edit.remove(it) }
        edit.commit()
    }
}

/**
 * This install's identity for events. The device id of every event is the writer's
 * Firebase Auth uid (the security rules require it). The sequence number starts at
 * the clock on a fresh install, so a reinstall that keeps or changes the uid cannot
 * repeat an event id, and it is on disk before an id uses it.
 */
class Session(private val store: KeyValueStore) {
    @Synchronized
    fun nextSeq(nowMs: Long): Long {
        val last = store.get(SEQ)?.toLongOrNull()
        val next = if (last == null) nowMs else last + 1
        store.put(SEQ, next.toString())
        return next
    }

    fun context(incidentId: String, uid: String, priorVersion: Long, nowMs: Long) = EventContext(
        incidentId = incidentId,
        deviceId = uid,
        authorUid = uid,
        priorVersion = priorVersion,
        nowMs = nowMs,
        nextSeq = { nextSeq(nowMs) },
    )

    fun incidentId(): String? = store.get(INCIDENT)

    fun joined(incidentId: String) = store.put(INCIDENT, incidentId)

    /** Forgets the search, and [alsoRemove] (the gone flag of a found or closed search) in the same write. */
    fun leave(alsoRemove: Collection<String> = emptyList()) = store.removeAll(listOf(INCIDENT) + alsoRemove)

    companion object {
        private const val SEQ = "seq"
        private const val INCIDENT = "incidentId"
    }
}
