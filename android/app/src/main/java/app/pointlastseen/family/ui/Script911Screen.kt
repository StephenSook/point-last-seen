package app.pointlastseen.family.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import app.pointlastseen.family.core.NineOneOneScript
import app.pointlastseen.family.data.SubjectProfile

/**
 * The full 911 script (promotion P-14): what to read to the call-taker, built offline
 * from the profile on this phone. In a drill the first line is "Do not dial 911".
 */
@Composable
fun Script911Screen(profile: SubjectProfile, mode: String?, killCloud: Boolean, onBack: () -> Unit) {
    FamilyScaffold(mode, killCloud) {
        for (line in NineOneOneScript.lines(profile, mode)) {
            Text(line, style = MaterialTheme.typography.titleMedium)
        }
        OtherAction("Back", onClick = onBack)
    }
}
