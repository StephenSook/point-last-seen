package app.pointlastseen.family.data

/**
 * The published fields the family changed on this phone, per document ("shared", "command"), kept across
 * restarts until the family leaves or is dropped. A phone's first publish of a document sends these fields even
 * where the document already has a value, as any later edit is sent; fields the family never touched are added
 * only where the document lacks them, so command's values are not replaced by this phone's defaults
 * ([FirstPublish]). Only single values are marked (text, numbers, dates): a collection (the flags, a list, the
 * tracking answer, the vehicle) sent whole would replace entries command added, such as a fall-risk flag, so
 * collections stay add-only-if-missing; a derived field follows its source and is never marked.
 */
class FamilyEdits(private val store: KeyValueStore) {
    private fun key(doc: String) = "edited:$doc"

    /** Marks every published field that differs between [before] and [after]. */
    @Synchronized
    fun record(before: SubjectProfile, after: SubjectProfile) {
        mark("shared", changed(Profiles.forSearchers(before).toMap(), Profiles.forSearchers(after).toMap()))
        mark("command", changed(Profiles.forCommand(before).toMap(), Profiles.forCommand(after).toMap()))
    }

    /** Leaving or a drop: the edits were for that search, so none reaches the next search's first publish. */
    @Synchronized
    fun clear() {
        store.removeAll(DOCS.map { key(it) })
    }

    fun keys(doc: String): Set<String> = store.get(key(doc))?.split(",")?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()

    private fun changed(a: Map<String, Any?>, b: Map<String, Any?>): Set<String> =
        (a.keys + b.keys).filter { it !in DERIVED && a[it] != b[it] && single(a[it]) && single(b[it]) }.toSet()

    private fun single(v: Any?) = v !is Collection<*> && v !is Map<*, *>

    private fun mark(doc: String, fields: Set<String>) {
        if (fields.isEmpty()) return
        val all = keys(doc) + fields
        store.put(key(doc), all.sorted().joinToString(","))
    }

    private companion object {
        val DOCS = listOf("shared", "command")
        // nickname is the first other name; approachNoteIds come from the flags.
        val DERIVED = setOf("nickname", "approachNoteIds")
    }
}
