package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import java.util.concurrent.atomic.AtomicInteger

sealed interface ProfileWrite {
    /** A first publish: [data] whole, and [edited], the fields the family changed on this phone ([FamilyEdits]). */
    data class Whole(val data: Map<String, Any?>, val edited: Set<String> = emptySet()) : ProfileWrite
    data class Fields(val data: Map<String, Any?>) : ProfileWrite
}

/**
 * A phone's first publish of a document. A missing document is created whole. A document already there
 * (written by command, another family phone, or this phone before a reinstall) gets the keys it lacks and
 * the fields the family edited on this phone ([FamilyEdits]), which are sent like any later edit; every
 * other value it has stays, including fields this app version does not know and fields left empty (null).
 */
sealed interface FirstPublish {
    data class Create(val data: Map<String, Any?>) : FirstPublish
    data class Merge(val data: Map<String, Any?>) : FirstPublish
    data object Nothing : FirstPublish

    companion object {
        fun of(existing: Map<String, Any?>?, mine: Map<String, Any?>, edited: Set<String> = emptySet()): FirstPublish {
            if (existing == null) return Create(mine)
            val send = mine.filterKeys { it !in existing || (it in edited && EditableFields.sendable(it, mine[it], existing[it])) }.toMutableMap()
            keepNamesInStep(existing, send)
            refreshApproachNotes(existing, mine, send)
            return if (send.isEmpty()) Nothing else Merge(send)
        }

        /**
         * profile/shared only: a note derived from a field this publish changes follows the merged document
         * (command's flags kept, the family's edits sent), so the searchers' card shows a note for every field
         * that ends up on the server; every other stored note stays as command left it. A document with no notes
         * gets the merged document's.
         */
        private fun refreshApproachNotes(existing: Map<String, Any?>, mine: Map<String, Any?>, send: MutableMap<String, Any?>) {
            if ("approachNoteIds" !in mine) return
            val raw = existing["approachNoteIds"] as? List<*>
            if (raw == null) {
                send["approachNoteIds"] = Profiles.approachNoteIds(existing + send)
                return
            }
            // Only the ids the rules accept are kept from the stored list; anything else is repaired away.
            val stored = raw.filterIsInstance<String>().filter { it in Profiles.NOTE_IDS }
            val changed = send.keys.filter { it in Profiles.NOTE_INPUT_FIELDS && (it !in existing || send[it] != existing[it]) }.toSet()
            val ids = Profiles.mergeApproachNotes(stored, existing + send, changed)
            if (ids != raw) send["approachNoteIds"] = ids else send.remove("approachNoteIds")
        }

        /**
         * The rules want the nickname to be the first other name. A list added to a document whose nickname
         * contradicts it is left out (a legacy document keeps its nickname alone); a document that has a list
         * gets the nickname that list implies.
         */
        private fun keepNamesInStep(existing: Map<String, Any?>, send: MutableMap<String, Any?>) {
            // A stored null nickname breaks the rules' shape: it is repaired from the names below.
            val nullNickname = "nickname" in existing && existing["nickname"] == null
            if ("nickname" !in send && "otherNames" !in send && !nullNickname) return
            val names = (if ("otherNames" in send) send["otherNames"] else existing["otherNames"]) as? List<*>
            if (names == null) {
                if (nullNickname) send["nickname"] = ""
                return
            }
            val first = names.firstOrNull() as? String ?: ""
            val nickname = if ("nickname" in send) send["nickname"] else existing["nickname"]
            if (nickname == first) return
            if ("otherNames" in send && "otherNames" !in existing && existing["nickname"] is String) {
                send.remove("otherNames")
                send.remove("nickname")
            } else {
                send["nickname"] = first
            }
        }

        /** [of], staged only while the phone is still on the join: checked inside the transaction, on every attempt. */
        fun staged(existing: Map<String, Any?>?, mine: Map<String, Any?>, edited: Set<String>, stillJoined: StillJoined): FirstPublish {
            stillJoined.require()
            return of(existing, mine, edited)
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
class ProfilePublisher(
    private val sink: ProfileSink,
    private val published: PublishedProfiles,
    /** The fields the family edited on this phone, per document: a first publish sends them ([FirstPublish]). */
    private val edited: (String) -> Set<String> = { emptySet() },
) {
    private val inFlight = MutableStateFlow(0)

    // One write per incident and document at a time (called on one thread, the main one): a newer publish waits
    // for the write in flight and is planned when it ends, so an older first publish retried late can never land
    // over a newer value. Only the newest waiting data is kept; every waiting caller hears its result.
    private val busy = mutableSetOf<String>()
    private val waiting = mutableMapOf<String, Waiting>()

    private class Waiting(val data: Map<String, Any?>, val stillJoined: StillJoined, val dones: MutableList<(Boolean) -> Unit>)

    fun publish(incidentId: String, p: SubjectProfile, stillJoined: StillJoined = StillJoined { true }, onDone: (Boolean) -> Unit) {
        if (!stillJoined.check()) return onDone(false)
        val docs = listOf("shared" to Profiles.forSearchers(p).toMap(), "command" to Profiles.forCommand(p).toMap())
        val left = AtomicInteger(docs.size)
        val ok = java.util.concurrent.atomic.AtomicBoolean(true)
        for ((doc, data) in docs) {
            writeDoc(incidentId, doc, data, stillJoined) { success ->
                if (!success) ok.set(false)
                if (left.decrementAndGet() == 0) onDone(ok.get())
            }
        }
    }

    private fun writeDoc(incidentId: String, doc: String, data: Map<String, Any?>, stillJoined: StillJoined, done: (Boolean) -> Unit) {
        val key = key(incidentId, doc)
        if (key in busy) {
            waiting[key] = Waiting(data, stillJoined, (waiting[key]?.dones ?: mutableListOf()).apply { add(done) })
            return
        }
        if (!stillJoined.check()) return done(false)
        val change = plan(incidentId, doc, data) ?: return done(true)
        busy += key
        inFlight.update { it + 1 }
        sink.write(incidentId, doc, change, stillJoined) { err ->
            if (err == null) published.put(key, DocJson.of(data).toString())
            busy -= key
            // The waiting write starts before this one counts as settled, so leaving's wait covers it too.
            waiting.remove(key)?.let { w -> writeDoc(incidentId, doc, w.data, w.stillJoined) { r -> w.dones.forEach { it(r) } } }
            inFlight.update { it - 1 }
            done(err == null)
        }
    }

    /** Returns once every write handed to the sink has finished or failed. */
    suspend fun settle() {
        inFlight.first { it == 0 }
    }

    private fun key(incidentId: String, doc: String) = "$incidentId/$doc"

    /** The whole document the first time, then only the changed fields; null when nothing changed. */
    private fun plan(incidentId: String, doc: String, data: Map<String, Any?>): ProfileWrite? {
        val last = published.get(key(incidentId, doc))?.let { DocJson.parse(it) } ?: return ProfileWrite.Whole(data, edited(doc))
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
                when (val w = FirstPublish.staged(if (snap.exists()) snap.data else null, change.data, change.edited, stillJoined)) {
                    is FirstPublish.Create -> tx.set(doc, w.data)
                    is FirstPublish.Merge -> tx.update(doc, w.data)
                    FirstPublish.Nothing -> Unit
                }
                null
            }.addOnCompleteListener { onResult(it.exception) }
            is ProfileWrite.Fields -> doc.update(change.data).addOnCompleteListener { onResult(it.exception) }
        }
    }
}
