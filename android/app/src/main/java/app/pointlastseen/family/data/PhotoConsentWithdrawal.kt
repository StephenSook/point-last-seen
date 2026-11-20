package app.pointlastseen.family.data

/**
 * The photos this phone wrote a cloud-read consent record for, per incident, so the family can
 * withdraw them: only the record's creator may delete it.
 */
/** This phone's list of the photo consent records it made, so it can withdraw them later. */
interface ConsentLedger {
    fun add(incidentId: String, sha256: String)
    fun remove(incidentId: String, sha256: String)
}

class ConsentedPhotos(private val store: KeyValueStore) : ConsentLedger {
    private fun key(incidentId: String) = "consented:$incidentId"

    override fun add(incidentId: String, sha256: String) {
        val now = list(incidentId)
        if (sha256 !in now) store.put(key(incidentId), (now + sha256).joinToString(","))
    }

    fun list(incidentId: String): List<String> = store.get(key(incidentId))?.split(",")?.filter { it.isNotEmpty() } ?: emptyList()

    override fun remove(incidentId: String, sha256: String) {
        val rest = list(incidentId) - sha256
        if (rest.isEmpty()) store.remove(key(incidentId)) else store.put(key(incidentId), rest.joinToString(","))
    }
}

/**
 * Withdraws command's cloud read of this phone's photos: deletes each consent record this phone made.
 * A record is forgotten only once its delete succeeded, or once [isOnServer] says it never reached the server
 * (the phone lists a consent before its write starts, so a write cut short can leave one that never landed);
 * a failed one can be withdrawn again.
 */
class PhotoConsentWithdrawal(
    private val consented: ConsentedPhotos,
    private val isOnServer: suspend (String, String) -> Boolean = { _, _ -> true },
    private val delete: suspend (String, String) -> Unit,
) {
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
                if (neverLanded(incidentId, sha)) {
                    consented.remove(incidentId, sha)
                    withdrawn++
                } else {
                    failed++
                }
            }
        }
        return Result(withdrawn, failed)
    }

    /** True only when the server answers that no record exists; a check that cannot run proves nothing. */
    private suspend fun neverLanded(incidentId: String, sha: String): Boolean = try {
        !isOnServer(incidentId, sha)
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        false
    }
}
