package app.pointlastseen.family.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.Source
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/** incidents/{id}/familyQuestions/{questionId}: the search lead's question and, once given, the family's answer. */
data class FamilyQuestion(val text: String, val answer: String?)

/** A question as listed from the server: its Firestore id, the text, the answer once given, and when command asked it. */
data class ListedQuestion(val id: String, val text: String, val answer: String?, val askedAtMs: Long?)

/** What the incident's question list says the family should see next. */
sealed interface QuestionCheck {
    data class Waiting(val id: String, val text: String) : QuestionCheck
    data object NoneWaiting : QuestionCheck
    data object Failed : QuestionCheck
}

interface FamilyQuestionStore {
    /** The incident's questions read from the server, newest first. */
    suspend fun list(incidentId: String): List<ListedQuestion>
    suspend fun read(incidentId: String, questionId: String): FamilyQuestion?
    suspend fun answer(incidentId: String, questionId: String, text: String, uid: String)
}

/**
 * Which question to open. The id always comes from the incident's list on the server, never from a
 * push: any installation can subscribe to a topic, so a push only says that a question exists.
 */
object FamilyQuestions {
    fun newestUnanswered(listed: List<ListedQuestion>): ListedQuestion? =
        listed.filter { it.answer == null && it.text.isNotBlank() }.maxByOrNull { it.askedAtMs ?: Long.MIN_VALUE }

    suspend fun check(store: FamilyQuestionStore, incidentId: String): QuestionCheck = try {
        newestUnanswered(store.list(incidentId))?.let { QuestionCheck.Waiting(it.id, it.text) } ?: QuestionCheck.NoneWaiting
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        QuestionCheck.Failed
    }
}

class FirestoreFamilyQuestions : FamilyQuestionStore {
    /** The question document fields this app reads, named once. */
    private companion object {
        const val TEXT = "text"
        const val ANSWER = "answer"
        const val CREATED_AT = "createdAt"
    }

    private fun questions(incidentId: String) =
        FirebaseFirestore.getInstance().collection("incidents").document(incidentId).collection("familyQuestions")

    private fun doc(incidentId: String, questionId: String) = questions(incidentId).document(questionId)

    override suspend fun list(incidentId: String): List<ListedQuestion> =
        questions(incidentId).orderBy(CREATED_AT, Query.Direction.DESCENDING).get(Source.SERVER).await().documents.mapNotNull { d ->
            val text = d.getString(TEXT) ?: return@mapNotNull null
            ListedQuestion(d.id, text, d.getString(ANSWER), d.getTimestamp(CREATED_AT)?.toDate()?.time)
        }

    override suspend fun read(incidentId: String, questionId: String): FamilyQuestion? {
        val d = doc(incidentId, questionId).get(Source.SERVER).await()
        val text = d.getString(TEXT) ?: return null
        return FamilyQuestion(text, d.getString(ANSWER))
    }

    /** The one update a family member makes; the server refuses a second answer by anyone. */
    override suspend fun answer(incidentId: String, questionId: String, text: String, uid: String) {
        val update = requireNotNull(FamilyAnswer.update(text, uid, FieldValue.serverTimestamp())) { "empty or too long" }
        doc(incidentId, questionId).update(update).await()
    }
}
