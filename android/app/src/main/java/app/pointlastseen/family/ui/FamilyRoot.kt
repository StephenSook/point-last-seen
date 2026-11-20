package app.pointlastseen.family.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import app.pointlastseen.family.AppCheckSetup
import app.pointlastseen.family.BuildConfig
import app.pointlastseen.family.FamilyViewModel
import app.pointlastseen.family.ui.theme.Paper

/** The family app: one screen at a time, cross-faded. */
@Composable
fun FamilyRoot(vm: FamilyViewModel, onPickClip: () -> Unit, onPickPhotos: () -> Unit, onDial: () -> Unit, onOpenDownloads: () -> Unit) {
    val rc by vm.rc.values.collectAsState()
    val incident by vm.incident.collectAsState()
    val writes by vm.writes.collectAsState()
    val mode = incident?.mode
    if (rc.needsUpdate(BuildConfig.VERSION_CODE.toLong())) {
        UpdateScreen(mode, onOpenDownloads)
        return
    }
    BackHandler(enabled = Nav.systemBack(vm.nav) != null) { vm.systemBack() }
    Crossfade(targetState = vm.nav.screen, animationSpec = Paper.crossfade(), label = "screen") { screen ->
        when (screen) {
            Screen.PROFILE -> ProfileScreen(vm.profile, vm.warnings(), vm.nav.joined, mode, vm::saveProfile, vm::shesGone, vm::toJoin, gone = vm.nav.gone, onBack = vm::back)
            Screen.CALL_FIRST -> CallFirstScreen(
                mode, rc.killCloud, onDial = onDial, onDone = vm::calledFirst,
                onScript = if (BuildConfig.SCRIPT_911) ({ vm.open(Screen.SCRIPT_911) }) else null,
            )
            Screen.JOIN -> JoinScreen(vm.joinBusy, vm.joinError, onJoin = vm::join, onBack = vm::back)
            Screen.STATUS -> StatusScreen(
                status = app.pointlastseen.family.data.IncidentWatch.statusFor(incident, vm.currentIncidentId()), mode = mode, killCloud = rc.killCloud,
                pending = vm.pendingCount(writes), rejected = vm.rejectedCount(writes),
                onOpen = vm::open, onRetry = vm::retryRejected, onLeave = vm::leaveSearch, shareFailed = vm.profileShareFailed, onLeaveOpen = vm::leaveOpenSearch,
                subjectName = vm.profile.answersTo,
            )
            Screen.CLIP -> ClipScreen(mode, rc.killCloud, vm.clipLabel, vm.clipUi, onPick = onPickClip, onRead = vm::readClip, onConfirm = vm::confirmClip, onBack = vm::back)
            Screen.PHOTOS -> PhotosScreen(mode, rc.killCloud, vm.photosUi, onPick = onPickPhotos, onBack = vm::back, onCloudRead = vm::cloudRead, onWithdraw = vm::withdrawCloudRead)
            Screen.NOTE -> NoteScreen(mode, rc.killCloud, vm.noteUi, onSort = vm::sortNote, onAdd = vm::addNote, onBack = vm::back)
            Screen.SIGHTING -> SightingScreen(mode, rc.killCloud, busy = false, error = vm.sightingError, nowMs = System::currentTimeMillis, onSend = vm::sendSighting, onBack = vm::back)
            Screen.SCRIPT_911 -> Script911Screen(vm.profile, mode, rc.killCloud, onBack = vm::back)
            Screen.QUESTION -> QuestionScreen(mode, rc.killCloud, vm.questionUi, onSend = vm::sendAnswer, onBack = vm::back)
            Screen.ABOUT -> AboutPhoneScreen(vm.deviceStatus, mode, rc.killCloud, rc.cloudModelAndroid, AppCheckSetup.PROVIDER, BuildConfig.VERSION_NAME, onBack = vm::back)
        }
    }
}
