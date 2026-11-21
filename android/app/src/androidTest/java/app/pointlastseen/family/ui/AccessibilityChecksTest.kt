package app.pointlastseen.family.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.DeviceModelStatus
import app.pointlastseen.family.ai.ModelState
import app.pointlastseen.family.ai.FamilyNoteReading
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.data.RouteRecord
import app.pointlastseen.family.data.SubjectProfile
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Every screen state through the Accessibility Test Framework (contrast, touch target,
 * speakable text, duplicate descriptions), plus our own check that every tappable node
 * has something for TalkBack to say.
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityChecksTest {
    @get:Rule val rule = createComposeRule()
    private val route = RouteRecord("android", "cloud", "sdk", "m", "on_device_unavailable", 900, true, null, 1)

    private fun audit(content: @Composable () -> Unit) {
        rule.enableAccessibilityChecks()
        rule.setContent { PaperTheme { content() } }
        // ATF and the touch-size check see only what is on screen, so bring each tappable node
        // into view in turn, then check it there.
        rule.onRoot().tryPerformAccessibilityChecks()
        val scrolls = rule.onAllNodes(hasScrollAction()).fetchSemanticsNodes().isNotEmpty()
        val density = rule.density.density
        val small = mutableListOf<String>()
        val ids = rule.onAllNodes(hasClickAction() or isToggleable()).fetchSemanticsNodes().map { it.id }
        assertTrue("found no tappable nodes", ids.isNotEmpty())
        for (id in ids) {
            val node = rule.onNode(SemanticsMatcher("node $id") { it.id == id })
            if (scrolls) node.performScrollTo()
            rule.onRoot().tryPerformAccessibilityChecks()
            val n = node.fetchSemanticsNode()
            val t = n.touchBoundsInRoot
            if (t.height / density < 47.5f || t.width / density < 47.5f) {
                val label = n.config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }
                    ?: n.config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString("") ?: "?"
                small += "\"$label\" ${(t.height / density).toInt()}dp"
            }
        }
        assertTrue("touch targets under 48 dp: $small", small.isEmpty())
        val silent = rule.onAllNodes(hasClickAction()).fetchSemanticsNodes().filter { n ->
            val c = n.config
            val text = c.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }.orEmpty()
            val desc = c.getOrNull(SemanticsProperties.ContentDescription)?.joinToString("").orEmpty()
            val edit = c.getOrNull(SemanticsProperties.EditableText)?.text.orEmpty()
            text.isBlank() && desc.isBlank() && edit.isBlank()
        }
        assertTrue("tappable nodes with nothing to say: ${silent.map { it.boundsInRoot }}", silent.isEmpty())
    }

    @Test fun profile() = audit { ProfileScreen(SubjectProfile(), emptyList(), false, null, {}, {}, {}, gone = false, onBack = {}) }
    @Test fun profileJoinedDrill() = audit { ProfileScreen(SubjectProfile(), listOf("Add a recent photo."), true, "drill", {}, {}, {}, gone = true, onBack = {}) }
    @Test fun callFirst() = audit { CallFirstScreen(null, false, onDial = {}, onDone = {}) }
    @Test fun callFirstDrillWithScript() = audit { CallFirstScreen("drill", false, onDial = {}, onDone = {}, onScript = {}) }
    @Test fun join() = audit { JoinScreen(busy = false, error = "That code did not work. Check it with command.", onJoin = {}, onBack = {}) }
    @Test fun status() = audit { StatusScreen(status = "open", mode = "drill", killCloud = true, pending = 2, rejected = 1, onOpen = {}, onRetry = {}, onLeave = {}) }
    @Test fun clip() = audit { ClipScreen(null, false, clipLabel = "door.mp4", ui = ClipUi.Idle, onPick = {}, onRead = {}, onConfirm = {}, onBack = {}) }
    @Test fun clipRead() = audit {
        ClipScreen(null, false, "door.mp4", ClipUi.Read(ClipCard("14:03", "west", "blue top", "Read in the cloud", cached = false, frameTime = "00:05")), {}, {}, {}, {})
    }
    @Test fun photos() = audit { PhotosScreen(null, false, PhotosUi(uploaded = 2, busy = false, error = "The photo did not upload. Check the connection and try again."), onPick = {}, onBack = {}) }
    @Test fun noteInput() = audit { NoteScreen(null, false, NoteUi.Idle, onSort = { _, _ -> }, onAdd = {}, onBack = {}) }
    @Test fun noteConsent() = audit { NoteScreen(null, false, NoteUi.Done(NoteOutcome.NeedsConsent, "old mill"), onSort = { _, _ -> }, onAdd = {}, onBack = {}) }
    @Test fun noteSuggested() = audit {
        NoteScreen(null, false, NoteUi.Done(NoteOutcome.Read(FamilyNoteReading("place", "The old mill", "s", "old mill"), route, "old mill"), "old mill"), onSort = { _, _ -> }, onAdd = {}, onBack = {})
    }
    @Test fun sighting() = audit { SightingScreen(null, false, busy = false, error = "That did not send. Try again.", nowMs = { 1_700_000_000_000 }, onSend = {}, onBack = {}) }
    @Test fun about() = audit { AboutPhoneScreen(ModelState(DeviceModelStatus.UNAVAILABLE), "drill", false, "gemini-3.5-flash-lite", "debug", "0.1.0", onGetModel = {}, onBack = {}) }
    @Test fun update() = audit { UpdateScreen("drill", onOpenDownloads = {}) }
    @Test fun script() = audit { Script911Screen(SubjectProfile(answersTo = "Mae", ageYears = 82), "drill", false, onBack = {}) }
}
