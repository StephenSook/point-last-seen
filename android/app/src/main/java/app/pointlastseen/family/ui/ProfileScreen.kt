package app.pointlastseen.family.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pointlastseen.family.data.PlaceEntry
import app.pointlastseen.family.data.Profiles
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.data.Vehicle
import app.pointlastseen.family.data.WanderingEntry
import java.time.LocalDate

private val FLAG_LABELS = mapOf(
    "mayNotRespond" to "May not answer when called",
    "likelyToHide" to "May hide",
    "afraidOfUniforms" to "Afraid of uniforms",
    "sensitiveToTouch" to "Does not like to be touched",
    "sensitiveToLight" to "Bothered by bright light",
    "likelyToFight" to "May push or strike out",
    "seizures" to "Has seizures",
    "hallucinationsOrDelusions" to "Sees or believes things that are not real",
    "lookingForHome" to "Looks for home",
    "gaitUnsteady" to "Unsteady walk",
    "freezing" to "Feet may stop moving",
    "fallRisk" to "Falls easily",
    "softVoice" to "Very soft voice",
    "slowToRespond" to "Slow to answer",
    "fluctuates" to "Clear one moment, confused the next",
    "medicationSensitivity" to "Sensitive to some medicines",
    "carriesMedicalAlertCard" to "Carries a medical alert card",
    "medicationTimingMatters" to "Medicine timing matters",
)
private val DEMENTIA_LABELS = listOf(
    "alzheimers" to "Alzheimer's", "lewy_body" to "Lewy body", "vascular" to "Vascular",
    "frontotemporal" to "Frontotemporal", "mixed" to "Mixed", "other" to "Other", "unknown" to "Not sure",
)

object ProfileCopy {
    fun warning(w: String): String = when (w) {
        "photo_old" -> "The photo is more than two months old. Add a new one."
        "clock_changed" -> "The clocks changed. Please check this profile."
        else -> "Please check this profile. It is due for an update."
    }
}

@Composable
private fun Field(label: String, value: String, numeric: Boolean = false, max: Int = 200, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.take(max)) },
        label = { Text(label) },
        singleLine = numeric,
        keyboardOptions = if (numeric) KeyboardOptions(keyboardType = KeyboardType.Number) else KeyboardOptions.Default,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Heading(text: String) = Text(text, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))

private fun lines(s: String) = s.split('\n', ';').map { it.trim() }.filter { it.isNotEmpty() }

/**
 * The profile, filled before anyone is missing and kept on this phone. Each section
 * says who sees it. "She's gone" leads to "Call 911 first".
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    profile: SubjectProfile,
    warnings: List<String>,
    joined: Boolean,
    mode: String?,
    onSave: (SubjectProfile) -> Unit,
    onGone: (SubjectProfile) -> Unit,
    onJoin: () -> Unit,
    gone: Boolean,
    onBack: () -> Unit,
) {
    var p by remember(profile) { mutableStateOf(profile) }
    var age by remember(profile) { mutableStateOf(profile.ageYears?.toString() ?: "") }
    var ft by remember(profile) { mutableStateOf(profile.heightFt?.toString() ?: "") }
    var inch by remember(profile) { mutableStateOf(profile.heightIn?.toString() ?: "") }
    var lb by remember(profile) { mutableStateOf(profile.weightLb?.toString() ?: "") }
    var photo by remember(profile) { mutableStateOf(profile.photoTakenOn?.toString() ?: "") }
    var addresses by remember(profile) { mutableStateOf(profile.previousAddresses.joinToString("\n") { it.label }) }
    var places by remember(profile) { mutableStateOf(profile.placesFrequented.joinToString("\n") { it.label }) }
    var wandering by remember(profile) { mutableStateOf(profile.pastWandering.joinToString("\n") { it.foundWhere }) }

    fun edited(): SubjectProfile = p.copy(
        ageYears = age.trim().toIntOrNull(), heightFt = ft.trim().toIntOrNull(), heightIn = inch.trim().toIntOrNull(),
        weightLb = lb.trim().toIntOrNull(), photoTakenOn = runCatching { LocalDate.parse(photo.trim()) }.getOrNull(),
        previousAddresses = lines(addresses).map { l -> profile.previousAddresses.firstOrNull { it.label == l } ?: PlaceEntry(l, null) },
        placesFrequented = lines(places).map { l -> profile.placesFrequented.firstOrNull { it.label == l } ?: PlaceEntry(l, null) },
        pastWandering = lines(wandering).map { l -> profile.pastWandering.firstOrNull { it.foundWhere == l } ?: WanderingEntry(l, null) },
    )

    FamilyScaffold(mode, killCloud = false) {
        warnings.forEach { Note(ProfileCopy.warning(it)) }
        if (gone) {
            Sentence("Their profile")
            OtherAction("Back", onClick = onBack)
        } else {
            Sentence("Who might go missing?")
            MainAction("She's gone") { onGone(edited()) }
            if (!joined) OtherAction("Join with a code", onClick = onJoin)
        }

        Heading("Searchers see this")
        Field("Name they answer to", p.answersTo, max = 60) { p = p.copy(answersTo = it) }
        Field("Nickname", p.nickname, max = 60) { p = p.copy(nickname = it) }
        Field("Age", age, numeric = true, max = 3) { age = it }
        Field("Height (feet)", ft, numeric = true, max = 1) { ft = it }
        Field("Height (inches)", inch, numeric = true, max = 2) { inch = it }
        Field("Weight (pounds)", lb, numeric = true, max = 3) { lb = it }
        Field("Hair", p.hair, max = 60) { p = p.copy(hair = it) }
        Field("Eye color", p.eyeColor, max = 40) { p = p.copy(eyeColor = it) }
        Field("Gender", p.gender, max = 40) { p = p.copy(gender = it) }
        Field("Primary language", p.primaryLanguage, max = 40) { p = p.copy(primaryLanguage = it) }
        Field("How they look, in your words", p.appearance) { p = p.copy(appearance = it) }
        Field("What they wore last", p.clothingLastWorn) { p = p.copy(clothingLastWorn = it) }
        Field("Photo taken on (YYYY-MM-DD)", photo, max = 10) { photo = it }
        Note("Walking aids")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Profiles.MOBILITY_AIDS.forEach { a ->
                FilterChip(selected = a in p.mobilityAids, onClick = { p = p.copy(mobilityAids = p.mobilityAids.toggle(a)) }, label = { Text(a) })
            }
        }
        Note("Type of dementia")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DEMENTIA_LABELS.forEach { (v, label) -> FilterChip(selected = p.dementiaType == v, onClick = { p = p.copy(dementiaType = v) }, label = { Text(label) }) }
        }
        Row(
            Modifier.fillMaxWidth().toggleable(p.shareDementiaType, role = Role.Switch) { p = p.copy(shareDementiaType = it) },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Share the type with searchers", modifier = Modifier.weight(1f))
            Switch(checked = p.shareDementiaType, onCheckedChange = null)
        }
        Note("What searchers should know")
        Profiles.FLAGS.forEach { f ->
            Row(
                Modifier.fillMaxWidth().toggleable(f in p.flags, role = Role.Checkbox) { p = p.copy(flags = p.flags.toggle(f)) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = f in p.flags, onCheckedChange = null)
                Text(FLAG_LABELS.getValue(f), modifier = Modifier.padding(start = 8.dp))
            }
        }
        Field("What to avoid", p.triggersToAvoid) { p = p.copy(triggersToAvoid = it) }
        Field("What helps when you come up to them", p.bestApproach) { p = p.copy(bestApproach = it) }
        Field("What makes them stand out", p.uniqueDescription) { p = p.copy(uniqueDescription = it) }

        Heading("Stays on this phone")
        Field("Medicines", p.medications) { p = p.copy(medications = it) }
        Field("How medicine affects them", p.howMedicationAffectsActions) { p = p.copy(howMedicationAffectsActions = it) }
        Field("Anything else that worries you", p.specialConcern) { p = p.copy(specialConcern = it) }

        Heading("Only command sees this")
        Field("Places they used to live (one per line)", addresses, max = 800) { addresses = it }
        Field("Places they go", places, max = 800) { places = it }
        Field("Where they were found before", wandering, max = 800) { wandering = it }
        Field("Water nearby", p.nearbyWater) { p = p.copy(nearbyWater = it) }
        Row(
            Modifier.fillMaxWidth().toggleable(p.vehicle?.involved == true, role = Role.Switch) {
                p = p.copy(vehicle = Vehicle(it, p.vehicle?.description ?: ""))
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("They may have a car", modifier = Modifier.weight(1f))
            Switch(checked = p.vehicle?.involved == true, onCheckedChange = null)
        }
        if (p.vehicle?.involved == true) Field("The car", p.vehicle?.description ?: "", max = 120) { p = p.copy(vehicle = Vehicle(true, it)) }

        OtherAction("Save") { onSave(edited()) }
    }
}

private fun Set<String>.toggle(v: String) = if (v in this) this - v else this + v
