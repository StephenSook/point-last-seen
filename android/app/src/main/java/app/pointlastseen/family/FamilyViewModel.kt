package app.pointlastseen.family

import android.app.Application
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
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
import app.pointlastseen.family.core.ConsentMark
import app.pointlastseen.family.core.EvidenceTerms
import app.pointlastseen.family.core.JpegEncoder
import app.pointlastseen.family.core.MAX_CLIP_BYTES
import app.pointlastseen.family.data.EventWriter
import app.pointlastseen.family.data.Events
import app.pointlastseen.family.data.FamilySightingInput
import app.pointlastseen.family.data.FirebaseJoinBackend
import app.pointlastseen.family.data.FirebasePhotoBucket
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
import app.pointlastseen.family.data.ProfileStore
import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.Session
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.data.WriteState
import app.pointlastseen.family.ui.ClipCards
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZoneId

/** Holds the family app's state and connects the screens to Firebase. */
class FamilyViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = PrefsStore(app, "pls")
    private val session = Session(prefs)
    private val profileStore = ProfileStore(PrefsStore(app, "pls-profile"))
    private val zone: ZoneId get() = ZoneId.systemDefault()

    val rc = RcStore(FirebaseRcSource(Firebase.remoteConfig))
    private val ai = AiClient { rc.current() }
    private val writer = EventWriter(FirestoreEventStore())
    private val watch = IncidentWatch()
    private val evidence = EvidenceTerms.screen(app)
    private val publisher = ProfilePublisher(FirestoreProfileSink())
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
    var sightingBusy by mutableStateOf(false)
        private set
    private var clipUri: Uri? = null
    private var lastClip: Pair<ClipOutcome.Read, Long>? = null

    init {
        rc.start()
        viewModelScope.launch { writer.run() }
        session.incidentId()?.let { watch.watch(it) }
        viewModelScope.launch { deviceStatus = ai.deviceModelStatus() }
    }

    fun warnings(): List<String> = Profiles.warnings(profile, System.currentTimeMillis(), zone)

    fun open(target: Screen) {
        nav = Nav.open(nav, target)
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

    fun toJoin() = apply(Nav.toJoin(nav))

    fun join(code: String) {
        joinBusy = true
        joinError = null
        viewModelScope.launch {
            when (val out = Join(FirebaseJoinBackend()).join(code)) {
                is JoinOutcome.Joined -> {
                    session.joined(out.incidentId)
                    watch.watch(out.incidentId)
                    apply(Nav.joined(nav))
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
        if (nav.gone && nav.joined) publisher.publish(inc, profile) {}
    }

    private fun context() = session.context(
        incidentId = requireNotNull(session.incidentId()),
        uid = requireNotNull(Firebase.auth.currentUser?.uid) { "not signed in" },
        priorVersion = incident.value?.priorVersion ?: 1L,
        nowMs = System.currentTimeMillis(),
    )

    fun pendingCount(states: Map<String, WriteState>) = states.values.count { it != WriteState.ACKNOWLEDGED }

    // Someone saw them
    fun sendSighting(input: FamilySightingInput) {
        sightingBusy = true
        runCatching { writer.submit(Events.familySighting(input, context())) }
        sightingBusy = false
        back()
    }

    // I remembered something
    fun sortNote(text: String, consent: Boolean) {
        noteUi = NoteUi.Busy
        viewModelScope.launch {
            val env = NoteEnv(deviceStatus, consent, rc.current().killCloud, System::currentTimeMillis, rc.current().cloudModelAndroid)
            noteUi = NoteUi.Done(FamilyNote(ai.familyNote, evidence).read(text, env), text)
        }
    }

    fun addNote(r: FamilyNoteReading) {
        saveProfile(Profiles.applyNote(profile, r))
        back()
    }

    // Camera clip
    fun pickedClip(uri: Uri) {
        clipUri = uri
        clipLabel = displayName(uri) ?: "Shared clip"
        clipUi = ClipUi.Idle
    }

    fun readClip(form: ClipForm) {
        val uri = clipUri ?: return
        val incidentId = session.incidentId() ?: return
        val uid = Firebase.auth.currentUser?.uid ?: return
        clipUi = ClipUi.Busy
        viewModelScope.launch {
            val app = getApplication<Application>()
            val bytes = withContext(Dispatchers.IO) { readUpTo(uri, MAX_CLIP_BYTES + 1) }
            val durationS = withContext(Dispatchers.IO) { durationSeconds(uri) }
            val sha = withContext(Dispatchers.Default) { Hashes.sha256Hex(bytes) }
            val now = System.currentTimeMillis()
            fun mark(on: Boolean) = if (on) ConsentMark(uid, now) else null
            val consent = ClipConsent(sha, mark(form.personInClip), mark(form.footageOwner), mark(form.cloudProcessing), mark(form.publicUse))
            val startMs = ClipCards.startMs(form.startMinuteOfDay, now, zone)
            val request = ClipRequest(
                bytes = bytes, mimeType = app.contentResolver.getType(uri) ?: "video/mp4", durationS = durationS,
                clipStartMs = startMs, clockConfirmed = form.clockConfirmed, cameraFacingDeg = form.facingDeg,
                consent = consent, killCloud = { rc.current().killCloud }, modelName = rc.current().clipModel,
            )
            when (val out = ClipReader(FirebaseClipDeps(incidentId, ai)).read(request)) {
                is ClipOutcome.Read -> {
                    lastClip = out to startMs
                    val frame = withContext(Dispatchers.IO) { frameAt(uri, out.reading.keyFrame.time) }
                    clipUi = ClipUi.Read(ClipCards.card(out, startMs, zone).copy(frame = frame?.asImageBitmap()))
                }
                else -> clipUi = ClipUi.Done(out)
            }
        }
    }

    fun confirmClip() {
        val (read, startMs) = lastClip ?: return
        runCatching {
            val events = Events.confirmClip(read.reading, startMs, cameraPosition = null, route = read.route, ctx = context())
            writer.submit(events.cameraSighting)
            writer.submit(events.confirmation)
        }
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
        viewModelScope.launch {
            val resolver = getApplication<Application>().contentResolver
            for (uri in uris) {
                val jpeg = withContext(Dispatchers.Default) { runCatching { JpegEncoder.encode(resolver, uri) }.getOrNull() }
                if (jpeg == null) {
                    photosUi = photosUi.copy(error = "One photo could not be read.")
                    continue
                }
                when (val out = PhotoUpload(FirebasePhotoBucket()).upload(incidentId, jpeg)) {
                    is PhotoOutcome.Uploaded -> photosUi = photosUi.copy(uploaded = photosUi.uploaded + 1)
                    is PhotoOutcome.Refused -> photosUi = photosUi.copy(error = out.message)
                    is PhotoOutcome.Failed -> photosUi = photosUi.copy(error = out.message)
                }
            }
            photosUi = photosUi.copy(busy = false)
        }
    }

    private fun displayName(uri: Uri): String? = runCatching {
        getApplication<Application>().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull()

    private fun readUpTo(uri: Uri, limit: Long): ByteArray {
        val input = getApplication<Application>().contentResolver.openInputStream(uri) ?: return ByteArray(0)
        return input.use { s ->
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(64 * 1024)
            var total = 0L
            while (total < limit) {
                val n = s.read(buf, 0, minOf(buf.size.toLong(), limit - total).toInt())
                if (n < 0) break
                out.write(buf, 0, n)
                total += n
            }
            out.toByteArray()
        }
    }

    private fun durationSeconds(uri: Uri): Int = runCatching {
        MediaMetadataRetriever().use { r ->
            r.setDataSource(getApplication(), uri)
            val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            ((ms + 999) / 1000).toInt()
        }
    }.getOrDefault(0)

    private fun frameAt(uri: Uri, mmss: String): Bitmap? = runCatching {
        val s = app.pointlastseen.family.core.SightingCheck.seconds(mmss) ?: return null
        MediaMetadataRetriever().use { r ->
            r.setDataSource(getApplication(), uri)
            r.getFrameAtTime(s * 1_000_000L, MediaMetadataRetriever.OPTION_CLOSEST)
        }
    }.getOrNull()

    companion object {
        private const val GONE = "gone"
    }
}
