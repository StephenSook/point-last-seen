package app.pointlastseen.family.data

import android.content.Context
import java.util.UUID

/** A tiny key-value store; the app uses private SharedPreferences. */
interface KeyValueStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
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
}

/**
 * This install's identity for events: a device id made once, a sequence number
 * that never repeats (spec section 8 ids hash both), and the joined incident.
 */
class Session(private val store: KeyValueStore) {
    @Synchronized
    fun deviceId(): String = store.get(DEVICE_ID) ?: UUID.randomUUID().toString().also { store.put(DEVICE_ID, it) }

    @Synchronized
    fun nextSeq(): Long {
        val next = (store.get(SEQ)?.toLongOrNull() ?: 0L) + 1
        store.put(SEQ, next.toString())
        return next
    }

    fun incidentId(): String? = store.get(INCIDENT)

    fun joined(incidentId: String) = store.put(INCIDENT, incidentId)

    fun leave() = store.remove(INCIDENT)

    companion object {
        private const val DEVICE_ID = "deviceId"
        private const val SEQ = "seq"
        private const val INCIDENT = "incidentId"
    }
}
