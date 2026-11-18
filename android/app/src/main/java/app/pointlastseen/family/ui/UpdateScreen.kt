package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable

/** Shown when this build is older than Remote Config's minimum_version_android. */
@Composable
fun UpdateScreen(mode: String?, onOpenDownloads: () -> Unit) {
    FamilyScaffold(mode, killCloud = false) {
        Sentence("This app needs an update.")
        Note("Install the newest version from the download page, then open it again.")
        MainAction("Open the download page", onClick = onOpenDownloads)
    }
}
