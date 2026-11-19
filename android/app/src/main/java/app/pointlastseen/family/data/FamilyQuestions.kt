package app.pointlastseen.family.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import kotlinx.coroutines.tasks.await

/** incidents/{id}/familyQuestions/{questionId}: the search lead's question and, once given, the family's answer. */
data class FamilyQuestion(val text: String, val answer: String?)

interface FamilyQuestionStore {
    suspend fun read(incidentId: String, questionId: String): FamilyQuestion?
    suspend fun answer(incidentId: String, questionId: String, text: String, uid: String)
}

class FirestoreFamilyQuestions : FamilyQuestionStore {
    private fun doc(incidentId: String, questionId: String) =
        FirebaseFirestore.getInstance().collection("incidents").document(incidentId).collection("familyQuestions").document(questionId)

    override suspend fun read(incidentId: String, questionId: String): FamilyQuestion? {
        val d = doc(incidentId, questionId).get(Source.SERVER).await()
        val text = d.getString("text") ?: return null
        return FamilyQuestion(text, d.getString("answer"))
    }

    /** The one update a family member makes; the server refuses a second answer by anyone. */
    override suspend fun answer(incidentId: String, questionId: String, text: String, uid: String) {
        val update = requireNotNull(FamilyAnswer.update(text, uid, FieldValue.serverTimestamp())) { "empty or too long" }
        doc(incidentId, questionId).update(update).await()
    }
}
