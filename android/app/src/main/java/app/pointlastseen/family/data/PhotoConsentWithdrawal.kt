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

/** Each add or remove reads and writes the list as one step: an upload adds on a worker while a withdrawal removes on Main. */
class ConsentedPhotos(private val store: KeyValueStore) : ConsentLedger {
    private fun key(incidentId: String) = "consented:$incidentId"

    @Synchronized
    override fun add(incidentId: String, sha256: String) {
        val now = list(incidentId)
        if (sha256 !in now) store.put(key(incidentId), (now + sha256).joinToString(","))
    }

    fun list(incidentId: String): List<String> = store.get(key(incidentId))?.split(",")?.filter { it.isNotEmpty() } ?: emptyList()

    @Synchronized
    override fun remove(incidentId: String, sha256: String) {
        val rest = list(incidentId) - sha256
        if (rest.isEmpty()) store.remove(key(incidentId)) else store.put(key(incidentId), rest.joinToString(","))
    }
}

/** Whose consent record a photo has on the server. */
enum class RecordOwner { NONE, ME, ANOTHER }

/**
 * Withdraws command's cloud read of this phone's photos: deletes each consent record this phone made.
 * When a delete fails, [recordOwner] says why: no record (the phone lists a consent before its write starts,
 * so a write cut short can leave one that never landed) clears it as withdrawn; another member's record clears
 * it from this phone's list and is reported in [Result.byAnother], since only that member can withdraw it; this
 * user's own record (or a read that fails) stays listed, to be withdrawn again.
 */
class PhotoConsentWithdrawal(
    private val consented: ConsentedPhotos,
    private val recordOwner: suspend (String, String) -> RecordOwner = { _, _ -> RecordOwner.ME },
    private val delete: suspend (String, String) -> Unit,
) {
    data class Result(val withdrawn: Int, val failed: Int, val byAnother: Int = 0)

    suspend fun withdrawAll(incidentId: String): Result {
        var withdrawn = 0
        var failed = 0
        var byAnother = 0
        for (sha in consented.list(incidentId)) {
            try {
                delete(incidentId, sha)
                consented.remove(incidentId, sha)
                withdrawn++
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                when (ownerOrNull(incidentId, sha)) {
                    RecordOwner.NONE -> { consented.remove(incidentId, sha); withdrawn++ }
                    RecordOwner.ANOTHER -> { consented.remove(incidentId, sha); byAnother++ }
                    RecordOwner.ME, null -> failed++
                }
            }
        }
        return Result(withdrawn, failed, byAnother)
    }

    /** Null when the check cannot run: that proves nothing. */
    private suspend fun ownerOrNull(incidentId: String, sha: String): RecordOwner? = try {
        recordOwner(incidentId, sha)
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        null
    }
}
