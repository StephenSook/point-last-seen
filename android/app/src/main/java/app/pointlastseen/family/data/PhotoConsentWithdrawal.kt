package app.pointlastseen.family.data

/**
 * The photos this phone wrote a cloud-read consent record for, per incident, so the family can
 * withdraw them: only the record's creator may delete it.
 */
class ConsentedPhotos(private val store: KeyValueStore) {
    private fun key(incidentId: String) = "consented:$incidentId"

    fun add(incidentId: String, sha256: String) {
        val now = list(incidentId)
        if (sha256 !in now) store.put(key(incidentId), (now + sha256).joinToString(","))
    }

    fun list(incidentId: String): List<String> = store.get(key(incidentId))?.split(",")?.filter { it.isNotEmpty() } ?: emptyList()

    fun remove(incidentId: String, sha256: String) {
        val rest = list(incidentId) - sha256
        if (rest.isEmpty()) store.remove(key(incidentId)) else store.put(key(incidentId), rest.joinToString(","))
    }
}

/**
 * Withdraws command's cloud read of this phone's photos: deletes each consent record this phone made.
 * A record is forgotten only once its delete succeeded, so a failed one can be withdrawn again.
 */
class PhotoConsentWithdrawal(private val consented: ConsentedPhotos, private val delete: suspend (String, String) -> Unit) {
    data class Result(val withdrawn: Int, val failed: Int)

    suspend fun withdrawAll(incidentId: String): Result {
        var withdrawn = 0
        var failed = 0
        for (sha in consented.list(incidentId)) {
            try {
                delete(incidentId, sha)
                consented.remove(incidentId, sha)
                withdrawn++
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                failed++
            }
        }
        return Result(withdrawn, failed)
    }
}
