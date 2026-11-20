package app.pointlastseen.family.ai

import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.data.StillJoined

/**
 * Clip work for one join. Each cloud step (the consent record, the upload, the model read, the reading)
 * first checks [stillJoined] and stops with [app.pointlastseen.family.data.LeftSearchException] once the phone
 * has left that join, so a read still running when the family leaves writes nothing more for that search.
 * Reading what is already stored is not a write and is not checked.
 */
class JoinedClipDeps(private val inner: ClipDeps, private val stillJoined: StillJoined) : ClipDeps by inner {
    override suspend fun createConsentRecord(doc: StoredClipReading) {
        stillJoined.require()
        inner.createConsentRecord(doc)
    }

    override suspend fun upload(sha256: String, bytes: ByteArray): String {
        stillJoined.require()
        return inner.upload(sha256, bytes)
    }

    override suspend fun callModel(bytes: ByteArray, mimeType: String): ModelReply {
        stillJoined.require()
        return inner.callModel(bytes, mimeType)
    }

    override suspend fun completeReading(sha256: String, readingJson: String, route: RouteRecord) {
        stillJoined.require()
        inner.completeReading(sha256, readingJson, route)
    }
}
