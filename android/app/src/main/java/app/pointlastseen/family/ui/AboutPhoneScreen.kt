package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable
import app.pointlastseen.family.ai.DeviceModelStatus

/** "About this phone": the SDK's checkStatus() answer and where reads happen. */
@Composable
fun AboutPhoneScreen(
    status: DeviceModelStatus,
    mode: String?,
    killCloud: Boolean,
    modelName: String,
    appCheck: String,
    version: String,
    onBack: () -> Unit,
) {
    FamilyScaffold(mode, killCloud) {
        Sentence(Copy.aboutModel(status))
        Note(
            if (status == DeviceModelStatus.AVAILABLE) "Notes are read on this phone first, through Firebase AI Logic."
            else "Notes and clips are read in the cloud through Firebase AI Logic.",
        )
        Note("Cloud model: $modelName")
        Note("App Check: $appCheck")
        Note("Version $version")
        Note("License: Apache-2.0")
        OtherAction("Back", onClick = onBack)
    }
}
