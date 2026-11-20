package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import java.util.concurrent.atomic.AtomicInteger

sealed interface ProfileWrite {
    data class Whole(val data: Map<String, Any?>) : ProfileWrite
    data class Fields(val data: Map<String, Any?>) : ProfileWrite
}

/**
 * A phone's first publish of a document. A missing document is created whole. A document already there
 * (written by command, another family phone, or this phone before a reinstall) keeps every value it has,
 * including fields this app version does not know and fields left empty (null); only keys it lacks are added.
 */
sealed interface FirstPublish {
    data class Create(val data: Map<String, Any?>) : FirstPublish
    data class AddMissing(val data: Map<String, Any?>) : FirstPublish
    data object Nothing : FirstPublish

    companion object {
        fun of(existing: Map<String, Any?>?, mine: Map<String, Any?>): FirstPublish {
            if (existing == null) return Create(mine)
            val missing = mine.filterKeys { it !in existing }
            return if (missing.isEmpty()) Nothing else AddMissing(missing)
        }

        /** [of], staged only while the phone is still on the join: checked inside the transaction, on every attempt. */
        fun staged(existing: Map<String, Any?>?, mine: Map<String, Any?>, stillJoined: StillJoined): FirstPublish {
            stillJoined.require()
            return of(existing, mine)
        }
    }
}

fun interface ProfileSink {
    /** [stillJoined] is checked again where the write is staged; once the phone has left, nothing is written. */
    fun write(incidentId: String, docId: String, change: ProfileWrite, stillJoined: StillJoined, onResult: (Throwable?) -> Unit)
}

interface PublishedProfiles {
    fun get(key: String): String?
    fun put(key: String, json: String)
}

/** What was last published, per incident and document, in this phone's private storage. */
class PrefsPublishedProfiles(private val store: KeyValueStore) : PublishedProfiles {
    override fun get(key: String): String? = store.get("published:$key")
    override fun put(key: String, json: String) = store.put("published:$key", json)
}

/**
 * After "She's gone": the shared fields to profile/shared (readable by every member, carried in packs)
 * and the history to profile/command (command and family only). This phone's first publish of a document
 * creates it, or adds only the keys an existing one lacks ([FirstPublish]); after that only the fields that
 * changed on this phone are sent, so a restart sends nothing and a field command edited is not undone.
 * What was published is remembered only after the write. A publish for a join the phone has left
 * ([StillJoined]) writes nothing, and [settle] lets leaving wait for the writes already handed to the sink.
 */
class ProfilePublisher(private val sink: ProfileSink, private val published: PublishedProfiles) {
    private val inFlight = MutableStateFlow(0)

    fun publish(incidentId: String, p: SubjectProfile, stillJoined: StillJoined = StillJoined { true }, onDone: (Boolean) -> Unit) {
        if (!stillJoined.check()) return onDone(false)
        val writes = listOf("shared" to Profiles.forSearchers(p).toMap(), "command" to Profiles.forCommand(p).toMap())
            .mapNotNull { (doc, data) -> plan(incidentId, doc, data)?.let { Triple(doc, data, it) } }
        if (writes.isEmpty()) return onDone(true)
        val left = AtomicInteger(writes.size)
        var ok = true
        inFlight.update { it + writes.size }
        for ((doc, data, change) in writes) {
            sink.write(incidentId, doc, change, stillJoined) { err ->
                if (err == null) published.put(key(incidentId, doc), DocJson.of(data).toString()) else ok = false
                inFlight.update { it - 1 }
                if (left.decrementAndGet() == 0) onDone(ok)
            }
        }
    }

    /** Returns once every write handed to the sink has finished or failed. */
    suspend fun settle() {
        inFlight.first { it == 0 }
    }

    private fun key(incidentId: String, doc: String) = "$incidentId/$doc"

    /** The whole document the first time, then only the changed fields; null when nothing changed. */
    private fun plan(incidentId: String, doc: String, data: Map<String, Any?>): ProfileWrite? {
        val last = published.get(key(incidentId, doc))?.let { DocJson.parse(it) } ?: return ProfileWrite.Whole(data)
        val now = DocJson.of(data)
        val changed = data.filterKeys { now[it] != last[it] }
        return if (changed.isEmpty()) null else ProfileWrite.Fields(changed)
    }
}

/** Document values as JSON, so a value read back compares equal to the same value built again. */
private object DocJson {
    fun of(data: Map<String, Any?>): kotlinx.serialization.json.JsonObject = value(data) as kotlinx.serialization.json.JsonObject

    fun parse(text: String): kotlinx.serialization.json.JsonObject? =
        runCatching { kotlinx.serialization.json.Json.parseToJsonElement(text) as kotlinx.serialization.json.JsonObject }.getOrNull()

    private fun value(v: Any?): kotlinx.serialization.json.JsonElement = when (v) {
        null -> kotlinx.serialization.json.JsonNull
        is String -> kotlinx.serialization.json.JsonPrimitive(v)
        is Boolean -> kotlinx.serialization.json.JsonPrimitive(v)
        is Number -> kotlinx.serialization.json.JsonPrimitive(v.toDouble())
        is Map<*, *> -> kotlinx.serialization.json.JsonObject(v.entries.associate { (k, x) -> k.toString() to value(x) })
        is List<*> -> kotlinx.serialization.json.JsonArray(v.map(::value))
        is Set<*> -> kotlinx.serialization.json.JsonArray(v.map(::value))
        else -> kotlinx.serialization.json.JsonPrimitive(v.toString())
    }
}

class FirestoreProfileSink : ProfileSink {
    override fun write(incidentId: String, docId: String, change: ProfileWrite, stillJoined: StillJoined, onResult: (Throwable?) -> Unit) {
        if (!stillJoined.check()) return onResult(LeftSearchException())
        val doc = Firebase.firestore.collection("incidents").document(incidentId).collection("profile").document(docId)
        when (change) {
            // Read and write in one transaction, so a value written meanwhile is never replaced. The join is checked
            // after the read, on every attempt: a leave or drop while the read was in flight stages nothing.
            is ProfileWrite.Whole -> Firebase.firestore.runTransaction { tx ->
                val snap = tx.get(doc)
                when (val w = FirstPublish.staged(if (snap.exists()) snap.data else null, change.data, stillJoined)) {
                    is FirstPublish.Create -> tx.set(doc, w.data)
                    is FirstPublish.AddMissing -> tx.update(doc, w.data)
                    FirstPublish.Nothing -> Unit
                }
                null
            }.addOnCompleteListener { onResult(it.exception) }
            is ProfileWrite.Fields -> doc.update(change.data).addOnCompleteListener { onResult(it.exception) }
        }
    }
}
