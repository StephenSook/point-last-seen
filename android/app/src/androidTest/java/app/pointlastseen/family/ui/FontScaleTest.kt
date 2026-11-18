package app.pointlastseen.family.ui

import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.DeviceConfigurationOverride
import androidx.compose.ui.test.FontScale
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollTo
import androidx.compose.material3.Text
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.pointlastseen.family.ai.NoteOutcome
import app.pointlastseen.family.ui.theme.PaperTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** The key screens at font scale 2.0: no clipped text, nothing wider than the screen, every action reachable. */
@RunWith(AndroidJUnit4::class)
class FontScaleTest {
    @get:Rule val rule = createComposeRule()
    @Before fun accessibilityChecks() = rule.enableAccessibilityChecks()
    private var seenScale = 0f

    private fun atDoubleFont(actions: List<String>, content: @Composable () -> Unit) {
        rule.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.FontScale(2f)) {
                seenScale = LocalDensity.current.fontScale
                PaperTheme { content() }
            }
        }
        assertEquals(2f, seenScale)
        assertEquals(emptyList<String>(), clippedTexts())
        for (a in actions) rule.onNodeWithText(a).performScrollTo().assertIsDisplayed()
    }

    /**
     * Texts that lose words: cut at the bottom, ellipsized, a line wider than the space it
     * was given, or a node running past the screen's right edge. (hasVisualOverflow is not
     * used: it is true for any one-line text narrower than its column, at every font scale.)
     */
    private fun clippedTexts(): List<String> {
        val rootWidth = rule.onRoot().fetchSemanticsNode().boundsInRoot.width
        val texts = rule.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.GetTextLayoutResult), useUnmergedTree = true).fetchSemanticsNodes()
        assertTrue("no text nodes found", texts.isNotEmpty())
        return texts.mapNotNull { n ->
            val layouts = mutableListOf<TextLayoutResult>()
            n.config[SemanticsActions.GetTextLayoutResult].action?.invoke(layouts)
            val l = layouts.single()
            val maxW = l.layoutInput.constraints.maxWidth
            val tooWide = (0 until l.lineCount).any { l.getLineRight(it) - l.getLineLeft(it) > maxW + 1f }
            val ellipsized = (0 until l.lineCount).any { l.isLineEllipsized(it) }
            val clipped = l.didOverflowHeight || ellipsized || tooWide || n.boundsInRoot.right > rootWidth + 1f
            if (clipped) "\"${l.layoutInput.text}\"" else null
        }
    }

    @Test fun theCheckCatchesATextCutToOneLine() {
        rule.setContent {
            DeviceConfigurationOverride(DeviceConfigurationOverride.FontScale(2f)) {
                PaperTheme { FamilyScaffold(null, false) { Text("Someone saw them by the east gate going north.", maxLines = 1, overflow = TextOverflow.Ellipsis) } }
            }
        }
        assertEquals(listOf("\"Someone saw them by the east gate going north.\""), clippedTexts())
    }

    @Test fun callFirst() = atDoubleFont(listOf("Call 911", "I called")) { CallFirstScreen(null, false, onDial = {}, onDone = {}) }

    @Test fun status() = atDoubleFont(listOf("Share a camera clip", "Someone saw them", "Try again", "About this phone")) {
        StatusScreen(status = "open", mode = "drill", killCloud = false, pending = 1, rejected = 1, onOpen = {}, onRetry = {}, onLeave = {})
    }

    @Test fun noteConsent() = atDoubleFont(listOf("Send to the cloud", "Clothing", "Back")) {
        NoteScreen(null, false, NoteUi.Done(NoteOutcome.NeedsConsent, "old mill"), onSort = { _, _ -> }, onAdd = {}, onBack = {})
    }

    @Test fun sighting() = atDoubleFont(listOf("2 hours ago", "Not sure", "Send to command", "Back")) {
        SightingScreen(null, false, busy = false, error = null, nowMs = { 1_700_000_000_000 }, onSend = {}, onBack = {})
    }
}
