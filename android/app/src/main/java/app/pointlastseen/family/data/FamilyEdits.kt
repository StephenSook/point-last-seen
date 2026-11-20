package app.pointlastseen.family.data

/**
 * The published fields the family changed on this phone, per document ("shared", "command"), kept across
 * restarts until the family leaves or is dropped. A phone's first publish of a document sends these fields even
 * where the document already has a value, as any later edit is sent; fields the family never touched are added
 * only where the document lacks them, so command's values are not replaced by this phone's defaults
 * ([FirstPublish]). Every changed field is marked except a derived one, which follows its source; only single
 * values (text, numbers, dates) are sent over a value already there ([EditableFields]): a collection (the flags, a
 * list, the tracking answer, the vehicle) sent whole would replace entries command added, such as a fall-risk flag,
 * so collections stay add-only-if-missing, and their marks only decide which approach notes follow the family's edits.
 */
class FamilyEdits(private val store: KeyValueStore) {
    private fun key(doc: String) = "edited:$doc"

    /** Marks every published field that differs between [before] and [after]. */
    @Synchronized
    fun record(before: SubjectProfile, after: SubjectProfile) {
        mark("shared", changed(Profiles.forSearchers(before).toMap(), Profiles.forSearchers(after).toMap()))
        mark("command", changed(Profiles.forCommand(before).toMap(), Profiles.forCommand(after).toMap()))
    }

    /** The edits were for one search: none may reach the next search's first publish. */
    @Synchronized
    fun clear() {
        store.removeAll(STORED_KEYS)
    }

    fun keys(doc: String): Set<String> = store.get(key(doc))?.split(",")?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()

    private fun changed(a: Map<String, Any?>, b: Map<String, Any?>): Set<String> {
        val fields = (a.keys + b.keys).filter { a[it] != b[it] && !EditableFields.derived(it) }.toSet()
        // Each flag the family changed is marked as well ("flags.<name>"), so only its own approach notes follow it.
        val before = a["flags"] as? Map<*, *> ?: emptyMap<Any?, Any?>()
        val after = b["flags"] as? Map<*, *> ?: emptyMap<Any?, Any?>()
        val flags = (before.keys + after.keys).filter { (before[it] == true) != (after[it] == true) }.map { "flags.$it" }
        return fields + flags
    }

    private fun mark(doc: String, fields: Set<String>) {
        if (fields.isEmpty()) return
        val all = keys(doc) + fields
        store.put(key(doc), all.sorted().joinToString(","))
    }

    companion object {
        private val DOCS = listOf("shared", "command")

        /** The keys the marks are stored under: leaving removes them in the same write as the search (Session.leave). */
        val STORED_KEYS: List<String> = DOCS.map { "edited:$it" }
    }
}

/**
 * Which edited fields a first publish may send over a value already there: single values only (text, numbers,
 * dates), never a collection (sent whole it would replace entries command added) and never a derived field.
 * Checked where marks are made and again where a first publish is staged, so a mark stored by an older build
 * cannot replace a collection either.
 */
object EditableFields {
    // nickname is the first other name; approachNoteIds come from the flags and a few text fields.
    private val DERIVED = setOf("nickname", "approachNoteIds")

    fun sendable(key: String, vararg values: Any?): Boolean = !derived(key) && values.all { single(it) }

    /** A field computed from others (never marked, never sent on its own). */
    fun derived(key: String): Boolean = key in DERIVED

    private fun single(v: Any?) = v !is Collection<*> && v !is Map<*, *>
}
