package app.pointlastseen.family.data

import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import kotlinx.coroutines.tasks.await

/**
 * A Firebase Auth user for this phone: the current one, or a new anonymous one. Cloud AI Logic
 * requests need a Firebase Auth ID token, so every call that can reach the cloud awaits this
 * first, before the family has joined too.
 */
fun interface SignIn {
    /** The signed-in uid; throws when sign-in fails. */
    suspend fun ensureSignedIn(): String
}

object FirebaseSignIn : SignIn {
    override suspend fun ensureSignedIn(): String {
        val auth = Firebase.auth
        val user = auth.currentUser ?: auth.signInAnonymously().await().user
        return requireNotNull(user?.uid) { "anonymous sign-in returned no user" }
    }
}
