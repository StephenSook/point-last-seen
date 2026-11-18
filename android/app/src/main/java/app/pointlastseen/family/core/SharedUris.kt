package app.pointlastseen.family.core

/**
 * Which incoming clip URIs the app will read. The share target is exported, so
 * another app could hand it a file:// path or one of this app's own providers to
 * make it read (and, after consent, upload) its private files such as the profile.
 * Only content:// URIs from other apps whose resolved type is video are accepted.
 */
object SharedUris {
    fun acceptableClip(scheme: String?, authority: String?, resolvedType: String?, ownPackage: String): Boolean {
        if (scheme != "content") return false
        val a = authority ?: return false
        if (a == ownPackage || a.startsWith("$ownPackage.")) return false
        return resolvedType?.startsWith("video/") == true
    }
}
