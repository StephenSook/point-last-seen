package app.pointlastseen.family.ui

import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization

/** Join the incident with the code command gives the family. */
@Composable
fun JoinScreen(busy: Boolean, error: String?, onJoin: (String) -> Unit, onBack: () -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    FamilyScaffold(mode = null, killCloud = false) {
        Sentence("Type the code from command.")
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.take(32) },
            label = { Text("Join code") },
            singleLine = true,
            isError = error != null,
            supportingText = error?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        MainAction("Join", enabled = !busy && code.isNotBlank()) { onJoin(code.trim()) }
        OtherAction("Back", enabled = !busy, onClick = onBack)
    }
}
