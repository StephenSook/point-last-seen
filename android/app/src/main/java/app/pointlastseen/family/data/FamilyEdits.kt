package app.pointlastseen.family.data

/**
 * The published fields the family changed on this phone, per document ("shared", "command"), kept across
 * restarts. A phone's first publish of a document sends these fields even where the document already has a
 * value, as any later edit is sent; fields the family never touched are added only where the document lacks
 * them, so command's values are not replaced by this phone's defaults ([FirstPublish]).
 */
class FamilyEdits(private val store: KeyValueStore) {
    private fun key(doc: String) = "edited:$doc"

    /** Marks every published field that differs between [before] and [after]. */
    @Synchronized
    fun record(before: SubjectProfile, after: SubjectProfile) {
        mark("shared", changed(Profiles.forSearchers(before).toMap(), Profiles.forSearchers(after).toMap()))
        mark("command", changed(Profiles.forCommand(before).toMap(), Profiles.forCommand(after).toMap()))
    }

    fun keys(doc: String): Set<String> = store.get(key(doc))?.split(",")?.filter { it.isNotEmpty() }?.toSet() ?: emptySet()

    private fun changed(a: Map<String, Any?>, b: Map<String, Any?>): Set<String> = (a.keys + b.keys).filter { a[it] != b[it] }.toSet()

    private fun mark(doc: String, fields: Set<String>) {
        if (fields.isEmpty()) return
        val all = keys(doc) + fields
        store.put(key(doc), all.sorted().joinToString(","))
    }
}
