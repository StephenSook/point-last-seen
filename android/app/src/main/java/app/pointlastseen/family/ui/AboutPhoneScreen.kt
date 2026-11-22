package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.ModelState

/** "About this phone": the on-device model (and the offer to get it), and where reads happen. */
@Composable
fun AboutPhoneScreen(
    model: ModelState,
    mode: String?,
    killCloud: Boolean,
    modelName: String,
    appCheck: String,
    version: String,
    onGetModel: () -> Unit,
    onBack: () -> Unit,
) {
    FamilyScaffold(mode, killCloud) {
        Sentence(Copy.model(model))
        if (model.downloadFailed) Note(Copy.MODEL_FAILED)
        if (model.status == DeviceModelStatus.DOWNLOADABLE) MainAction(Copy.GET_MODEL, onClick = onGetModel)
        Note(
            if (model.status == DeviceModelStatus.AVAILABLE) "Notes are read on this phone first, through Firebase AI Logic."
            else "Notes and clips are read in the cloud through Firebase AI Logic.",
        )
        Note("Cloud model: $modelName")
        Note(Copy.appCheckProvider(appCheck))
        Note("Version $version")
        Note("License: Apache-2.0")
        OtherAction("Back", onClick = onBack)
    }
}
