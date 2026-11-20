package app.pointlastseen.family

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.pointlastseen.family.ai.AiClient
import app.pointlastseen.family.ai.ClipOutcome
import app.pointlastseen.family.ai.ClipReader
import app.pointlastseen.family.ai.ClipRequest
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.FamilyNote
import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.ai.FirebaseClipDeps
import app.pointlastseen.family.ai.NoteEnv
import app.pointlastseen.family.config.FirebaseRcSource
import app.pointlastseen.family.config.RcStore
import app.pointlastseen.family.core.ClipConsent
import app.pointlastseen.family.core.ClipFile
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.EvidenceTerms
import app.pointlastseen.family.core.JpegEncoder
import app.pointlastseen.family.core.MAX_CLIP_BYTES
import app.pointlastseen.family.core.SharedUris
import app.pointlastseen.family.core.SightingCheck
import app.pointlastseen.family.data.EventWriter
import app.pointlastseen.family.data.Events
import app.pointlastseen.family.data.FamilySightingInput
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.CloudRead
import app.pointlastseen.family.data.ConsentedPhotos
import app.pointlastseen.family.data.PhotoConsentWithdrawal
import app.pointlastseen.family.push.FamilyTopic
import app.pointlastseen.family.data.FamilyQuestionStore
import app.pointlastseen.family.data.Departure
import app.pointlastseen.family.data.JoinGeneration
import app.pointlastseen.family.data.JoinedStart
import app.pointlastseen.family.data.Membership
import app.pointlastseen.family.data.MembershipCheck
import app.pointlastseen.family.data.FamilyQuestions
import app.pointlastseen.family.data.FirestoreFamilyQuestions
import app.pointlastseen.family.ui.QuestionOpen
import app.pointlastseen.family.ui.QuestionUi
import app.pointlastseen.family.data.FirebasePhotoBucket
import app.pointlastseen.family.data.FirestorePhotoConsentSink
import app.pointlastseen.family.data.FirestoreEventStore
import app.pointlastseen.family.data.FirestoreProfileSink
import app.pointlastseen.family.data.Hashes
import app.pointlastseen.family.data.IncidentWatch
import app.pointlastseen.family.data.Join
import app.pointlastseen.family.data.JoinOutcome
import app.pointlastseen.family.data.PhotoOutcome
import app.pointlastseen.family.data.PhotoUpload
import app.pointlastseen.family.data.PrefsStore
import app.pointlastseen.family.data.ProfilePublisher
import app.pointlastseen.family.data.PrefsPublishedProfiles
import app.pointlastseen.family.data.ProfileStore
import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.Session
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.data.WriteState
import app.pointlastseen.family.ui.ClipCards
import app.pointlastseen.family.ui.Copy
import app.pointlastseen.family.ui.ClipForm
import app.pointlastseen.family.ui.ClipUi
import app.pointlastseen.family.ui.Nav
import app.pointlastseen.family.ui.NavState
import app.pointlastseen.family.ui.NoteUi
import app.pointlastseen.family.ui.PhotosUi
import app.pointlastseen.family.ui.Screen
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

/** Holds the family app's state and connects the screens to Firebase. */
class FamilyViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = PrefsStore(app, "pls")
    private val session = Session(prefs)
    private val profileStore = ProfileStore(PrefsStore(app, "pls-profile"))
    private val familyTopic = FamilyTopic.firebase()
    private val zone: ZoneId get() = ZoneId.systemDefault()

    val rc = RcStore(FirebaseRcSource(Firebase.remoteConfig))
    private val ai = AiClient { rc.current() }
    private val writer = EventWriter(FirestoreEventStore())
    // A refused read of the incident asks whether this phone is still part of the search.
    private val watch = IncidentWatch(onDenied = { checkMembership() })
    private val evidence = EvidenceTerms.screen(app)
    private val publisher = ProfilePublisher(FirestoreProfileSink(), PrefsPublishedProfiles(PrefsStore(app, "pls-published")))
    private val telemetry = Telemetry(FirebaseTelemetrySink())
    val incident = watch.incident
    val writes = writer.states

    var nav by mutableStateOf(Nav.start(joined = session.incidentId() != null, gone = prefs.get(GONE) == "1"))
        private set
    var profile by mutableStateOf(profileStore.load())
        private set
    var deviceStatus by mutableStateOf(DeviceModelStatus.UNKNOWN)
        private set
    var joinBusy by mutableStateOf(false)
        private set
    var joinError by mutableStateOf<String?>(null)
        private set
    var noteUi by mutableStateOf<NoteUi>(NoteUi.Idle)
        private set
    var clipUi by mutableStateOf<ClipUi>(ClipUi.Idle)
        private set
    var clipLabel by mutableStateOf<String?>(null)
        private set
    var photosUi by mutableStateOf(PhotosUi(0, false, null))
        private set
    var sightingError by mutableStateOf<String?>(null)
        private set
    var profileShareFailed by mutableStateOf(false)
        private set
    private var clipUri: Uri? = null
    private var lastClip: Pair<ClipOutcome.Read, ClipForm>? = null
    private var lastClipStartMs: Long = 0L

    // The search lead's question: listed from the server, opened by the id from that list, answered once.
    // Declared before init, which runs the first check.
    var questionUi by mutableStateOf(QuestionUi())
        private set
    private var openQuestion: Pair<String, String>? = null
    private val questions: FamilyQuestionStore = FirestoreFamilyQuestions()
    private var questionCheck: Job? = null
    private val membership = Membership.firebase()
    private var membershipCheck: Job? = null
    // Which join a membership answer belongs to: bumped on every join, leave and drop.
    private val joins = JoinGeneration { Firebase.auth.currentUser?.uid }

    init {
        rc.start()
        viewModelScope.launch { writer.run() }
        session.incidentId()?.let { watch.watch(it); familyTopic.joined(it); checkQuestions(it, fromPush = false); startJoined(it) }
        viewModelScope.launch { deviceStatus = ai.deviceModelStatus() }
    }

    /**
     * A start while joined: the membership answer comes first; only when it keeps this same join is the profile
     * written again (after a restart in the gone-and-joined state, idempotent). A drop writes nothing.
     */
    private fun startJoined(incidentId: String) {
        val ticket = joins.ticket()
        membershipCheck?.cancel()
        membershipCheck = viewModelScope.launch {
            JoinedStart.run(
                check = { membership.check(incidentId) },
                isCurrent = { joins.isCurrent(ticket) && session.incidentId() == incidentId },
                onKeep = { publishIfGone() },
                onDrop = { dropSearch() },
            )
        }
    }

    fun warnings(): List<String> = Profiles.warnings(profile, System.currentTimeMillis(), zone)

    fun open(target: Screen) {
        nav = Nav.open(nav, target)
        // The photos this phone allowed earlier (also before a restart) can be withdrawn from the photos screen.
        if (nav.screen == Screen.PHOTOS) session.incidentId()?.let { photosUi = photosUi.copy(consented = consentedPhotos.list(it).size, withdrawNote = null) }
    }

    fun systemBack() {
        Nav.systemBack(nav)?.let { next ->
            if (next.screen != nav.screen) back()
        }
    }

    fun back() {
        nav = Nav.back(nav)
        noteUi = NoteUi.Idle
        if (clipUi !is ClipUi.Busy) clipUi = ClipUi.Idle
    }

    fun saveProfile(p: SubjectProfile) {
        profile = p.copy(profileUpdatedOn = LocalDate.now(zone))
        profileStore.save(profile)
        publishIfGone()
    }

    fun shesGone(p: SubjectProfile) {
        saveProfile(p)
        prefs.put(GONE, "1")
        apply(Nav.shesGone(nav))
    }

    fun calledFirst() = apply(Nav.calledFirst(nav))

    /** After "Found. Safe." or a closed search: forget the incident and the gone flag; keep the profile. */
    fun leaveSearch() = leave(keepGone = false)

    /** The family left a search still open: forget it, keep the profile and its "gone" state, so it can join again. */
    fun leaveOpenSearch() = leave(keepGone = true)

    /**
     * Forget the search at once, so no new write starts (every writer reads the session); give writes already
     * sent up to [LEAVE_SETTLE_MS] to reach the server; then drop the family topic and report it done.
     */
    private fun leave(keepGone: Boolean) {
        val incidentId = session.incidentId() ?: return
        joins.next()
        membershipCheck?.cancel()
        questionCheck?.cancel()
        openQuestion = null
        viewModelScope.launch {
            Departure.leave(
                forget = { watch.stop(); session.leave() },
                settle = { Firebase.firestore.waitForPendingWrites().await() },
                timeoutMs = LEAVE_SETTLE_MS,
                finish = {
                    familyTopic.left(incidentId)
                    if (!keepGone) prefs.remove(GONE)
                    nav = if (keepGone) Nav.leftOpen(nav) else Nav.leave(nav)
                },
            )
        }
    }

    /**
     * Forgets the search only when a forced token refresh succeeds and its claims no longer name it as this
     * family's ([Membership]); a refused read alone, a failed refresh or no network keeps it.
     */
    private fun checkMembership() {
        val incidentId = session.incidentId() ?: return
        if (membershipCheck?.isActive == true) return
        val ticket = joins.ticket()
        membershipCheck = viewModelScope.launch {
            val answer = membership.check(incidentId)
            if (!joins.isCurrent(ticket) || session.incidentId() != incidentId) return@launch
            if (answer == MembershipCheck.DROP) dropSearch()
        }
    }

    /** This phone is no longer part of the search: forget it, keep the profile, and say so on the join screen. */
    private fun dropSearch() {
        joins.next()
        membershipCheck = null
        questionCheck?.cancel()
        openQuestion = null
        watch.stop()
        session.incidentId()?.let { familyTopic.left(it) }
        session.leave()
        nav = Nav.dropped(nav)
        joinError = Copy.NO_LONGER_MEMBER
    }

    /** Keeps what the family typed before leaving the profile for the join screen. */
    fun toJoin(p: SubjectProfile) {
        saveProfile(p)
        apply(Nav.toJoin(nav))
    }

    fun join(code: String) {
        joinBusy = true
        joinError = null
        viewModelScope.launch {
            when (val out = Join(FirebaseJoinBackend()).join(code)) {
                is JoinOutcome.Joined -> {
                    session.joined(out.incidentId)
                    joins.next()
                    membershipCheck?.cancel()
                    watch.watch(out.incidentId)
                    familyTopic.joined(out.incidentId)
                    apply(Nav.joined(nav))
                    // A question asked before this phone joined had its push before the topic was subscribed.
                    checkQuestions(out.incidentId, fromPush = false)
                }
                is JoinOutcome.Failed -> joinError = out.message
            }
            joinBusy = false
        }
    }

    private fun apply(step: app.pointlastseen.family.ui.NavStep) {
        nav = step.state
        if (step.publishProfile) publishIfGone()
    }

    private fun publishIfGone() {
        val inc = session.incidentId() ?: return
        if (nav.gone && nav.joined) publisher.publish(inc, profile) { ok -> profileShareFailed = !ok }
    }

    /** Throws IllegalStateException when the family has not joined or is not signed in. */
    private fun context() = session.context(
        incidentId = checkNotNull(session.incidentId()) { "not joined" },
        uid = checkNotNull(Firebase.auth.currentUser?.uid) { "not signed in" },
        priorVersion = incident.value?.priorVersion ?: 1L,
        nowMs = System.currentTimeMillis(),
    )

    fun pendingCount(states: Map<String, WriteState>) = states.values.count { it == WriteState.PENDING }

    fun rejectedCount(states: Map<String, WriteState>) = states.values.count { it == WriteState.REJECTED }

    /** Sends every refused event again with its same id (a landed copy reads back as acknowledged). */
    fun retryRejected() {
        writes.value.filterValues { it == WriteState.REJECTED }.keys.forEach { writer.retry(it) }
    }

    // Someone saw them
    fun sendSighting(input: FamilySightingInput) {
        sightingError = null
        val doc = try {
            Events.familySighting(input, context())
        } catch (e: IllegalArgumentException) {
            sightingError = e.message ?: "This sighting could not be sent."
            return
        } catch (e: IllegalStateException) {
            sightingError = "Join the search first."
            return
        }
        writer.submit(doc)
        back()
    }

    // I remembered something
    fun sortNote(text: String, consent: Boolean) {
        noteUi = NoteUi.Busy
        viewModelScope.launch {
            val env = NoteEnv(deviceStatus, consent, rc.current().killCloud, System::currentTimeMillis, rc.current().cloudModelAndroid)
            val outcome = FamilyNote(ai.familyNote, evidence, app.pointlastseen.family.data.FirebaseSignIn).read(text, env)
            if (outcome is app.pointlastseen.family.ai.NoteOutcome.Read) telemetry.record(outcome.route)
            noteUi = NoteUi.Done(outcome, text)
        }
    }

    fun addNote(r: FamilyNoteReading) {
        saveProfile(Profiles.applyNote(profile, r))
        back()
    }

    // Camera clip
    /** Takes a picked or shared clip; returns false (and shows why) for a URI the app must not read. */
    fun pickedClip(uri: Uri): Boolean {
        val app = getApplication<Application>()
        val resolvedType = runCatching { app.contentResolver.getType(uri) }.getOrNull()
        if (!SharedUris.acceptableClip(uri.scheme, uri.authority, resolvedType, app.packageName)) {
            clipUri = null
            clipLabel = null
            clipUi = ClipUi.Done(ClipOutcome.Refused("This file cannot be read here. Choose a video from your camera or gallery."))
            return false
        }
        clipUri = uri
        clipLabel = displayName(uri) ?: "Shared clip"
        clipUi = ClipUi.Idle
        return true
    }

    fun readClip(form: ClipForm) {
        val uri = clipUri ?: return
        val incidentId = session.incidentId() ?: return
        val uid = Firebase.auth.currentUser?.uid ?: return
        clipUi = ClipUi.Busy
        viewModelScope.launch {
            clipUi = try {
                readClipOrFail(uri, incidentId, uid, form)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                ClipUi.Done(ClipOutcome.Failed)
            }
        }
    }

    private suspend fun readClipOrFail(uri: Uri, incidentId: String, uid: String, form: ClipForm): ClipUi {
        val app = getApplication<Application>()
        val bytes = withContext(Dispatchers.IO) { ClipFile.readUpTo(app.contentResolver, uri, MAX_CLIP_BYTES + 1) }
            ?: return ClipUi.Done(ClipOutcome.Refused("This clip could not be opened. Choose it again."))
        val durationS = withContext(Dispatchers.IO) { ClipFile.durationSeconds(app, uri) }
        val sha = withContext(Dispatchers.Default) { Hashes.sha256Hex(bytes) }
        val now = System.currentTimeMillis()
        fun mark(on: Boolean) = if (on) ConsentMark(uid, now) else null
        val consent = ClipConsent(sha, mark(form.personInClip), mark(form.footageOwner), mark(form.cloudProcessing), mark(form.publicUse))
        val startMs = ClipCards.startMs(form.startMinuteOfDay, now, zone)
        val request = ClipRequest(
            bytes = bytes, mimeType = runCatching { app.contentResolver.getType(uri) }.getOrNull() ?: "video/mp4",
            durationS = durationS, clipStartMs = startMs, clockConfirmed = form.clockConfirmed, cameraFacingDeg = form.facingDeg,
            consent = consent, killCloud = { rc.current().killCloud }, templateId = rc.current().clipTemplateId,
            uploaderUid = uid,
        )
        return when (val out = ClipReader(FirebaseClipDeps(incidentId, ai)).read(request)) {
            is ClipOutcome.Read -> {
                if (!out.cached) out.route?.let { telemetry.record(it) }
                lastClip = out to form
                lastClipStartMs = startMs
                val keySeconds = SightingCheck.seconds(out.reading.keyFrame.time) ?: 0
                val frame = withContext(Dispatchers.IO) { ClipFile.frameAt(app, uri, keySeconds) }
                ClipUi.Read(ClipCards.card(out, startMs, zone).copy(frame = frame?.asImageBitmap()))
            }
            else -> ClipUi.Done(out)
        }
    }

    fun confirmClip() {
        val (read, form) = lastClip ?: return
        val events = try {
            Events.confirmClip(
                read.reading, lastClipStartMs, cameraPosition = null, route = read.route, ctx = context(),
                clipSha256 = read.sha256, cameraFacingDeg = form.facingDeg, clockConfirmed = form.clockConfirmed,
            )
        } catch (e: Exception) {
            clipUi = ClipUi.Done(ClipOutcome.Refused("The clip could not be sent to command. Join the search, then read it again."))
            return
        }
        writer.submit(events.cameraSighting)
        writer.submit(events.confirmation)
        lastClip = null
        clipUri = null
        clipLabel = null
        clipUi = ClipUi.Idle
        back()
    }

    // Photos
    fun pickedPhotos(uris: List<Uri>) {
        val incidentId = session.incidentId() ?: return
        if (uris.isEmpty()) return
        photosUi = photosUi.copy(busy = true, error = null)
        // The tick, as it stands when the photos are chosen, is the consent for each of them.
        val consent = if (photosUi.cloudRead) Firebase.auth.currentUser?.uid?.let { ConsentMark(it, System.currentTimeMillis()) } else null
        viewModelScope.launch {
            val resolver = getApplication<Application>().contentResolver
            for (uri in uris) {
                val jpeg = withContext(Dispatchers.Default) { runCatching { JpegEncoder.encode(resolver, uri) }.getOrNull() }
                if (jpeg == null) {
                    photosUi = photosUi.copy(error = "One photo could not be read.")
                    continue
                }
                when (val out = PhotoUpload(FirebasePhotoBucket(), FirestorePhotoConsentSink()).upload(incidentId, jpeg, consent)) {
                    is PhotoOutcome.Uploaded -> {
                        if (out.cloudRead == CloudRead.ALLOWED) consentedPhotos.add(incidentId, out.path.substringAfterLast('/').removeSuffix(".jpg"))
                        photosUi = photosUi.copy(
                            uploaded = photosUi.uploaded + 1,
                            notSaved = photosUi.notSaved + if (out.cloudRead == CloudRead.NOT_SAVED) 1 else 0,
                            consented = consentedPhotos.list(incidentId).size,
                        )
                    }
                    is PhotoOutcome.Refused -> photosUi = photosUi.copy(error = out.message)
                    is PhotoOutcome.Failed -> photosUi = photosUi.copy(error = out.message)
                }
            }
            photosUi = photosUi.copy(busy = false)
        }
    }

    /** A tapped "The search lead has a question" opens the newest unanswered question listed on the server. */
    fun questionPushOpened(incidentId: String) {
        if (session.incidentId() != incidentId) return
        openQuestion = null
        questionUi = QuestionUi(loading = true)
        open(Screen.QUESTION)
        checkQuestions(incidentId, fromPush = true)
    }

    /**
     * Lists the incident's questions from the server and opens the newest unanswered one. A push check
     * replaces a check in progress; a start or join check is skipped while one runs.
     */
    private fun checkQuestions(incidentId: String, fromPush: Boolean) {
        if (!fromPush && questionCheck?.isActive == true) return
        questionCheck?.cancel()
        val shownAt = nav.screen
        questionCheck = viewModelScope.launch {
            val check = FamilyQuestions.check(questions, incidentId)
            if (session.incidentId() != incidentId) return@launch
            val shown = QuestionOpen.decide(check, fromPush, screenUnchanged = nav.screen == shownAt) ?: return@launch
            openQuestion = shown.questionId?.let { incidentId to it }
            questionUi = shown.ui
            if (shown.navigate) open(Screen.QUESTION)
        }
    }

    private suspend fun loadQuestion(incidentId: String, questionId: String, error: String? = null) {
        questionUi = try {
            val q = questions.read(incidentId, questionId)
            if (q == null) QuestionUi(error = "The question could not be found.") else QuestionUi(text = q.text, answer = q.answer, error = error)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            QuestionUi(error = QuestionOpen.READ_FAILED)
        }
    }

    fun sendAnswer(text: String) {
        val (incidentId, questionId) = openQuestion ?: return
        val uid = Firebase.auth.currentUser?.uid ?: return
        questionUi = questionUi.copy(sending = true, error = null)
        viewModelScope.launch {
            val sent = runCatching { questions.answer(incidentId, questionId, text, uid) }
            // Read it back either way: a refused answer usually means it was already answered.
            loadQuestion(incidentId, questionId, error = if (sent.isFailure) "The answer was not sent. Check the connection and try again." else null)
        }
    }

    private val consentedPhotos by lazy { ConsentedPhotos(PrefsStore(getApplication(), "pls-consented")) }

    /** Deletes the consent records this phone made, so command can no longer read those photos in the cloud. */
    fun withdrawCloudRead() {
        val incidentId = session.incidentId() ?: return
        photosUi = photosUi.copy(busy = true, withdrawNote = null)
        viewModelScope.launch {
            val r = PhotoConsentWithdrawal(consentedPhotos) { inc, sha -> FirestorePhotoConsentSink().delete(inc, sha) }.withdrawAll(incidentId)
            fun photos(n: Int) = if (n == 1) "1 photo" else "$n photos"
            photosUi = photosUi.copy(
                busy = false,
                consented = consentedPhotos.list(incidentId).size,
                withdrawNote = when {
                    r.failed > 0 -> "The cloud read could not be turned off for ${photos(r.failed)}. Check the connection and try again."
                    else -> "The cloud read is off for ${photos(r.withdrawn)}."
                },
            )
        }
    }

    fun cloudRead(on: Boolean) {
        photosUi = photosUi.copy(cloudRead = on)
    }

    private fun displayName(uri: Uri): String? = runCatching {
        getApplication<Application>().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull()

    companion object {
        private const val GONE = "gone"
        /** How long leaving waits for writes already sent to reach the server. */
        private const val LEAVE_SETTLE_MS = 5_000L
    }
}
