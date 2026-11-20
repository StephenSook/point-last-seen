package app.pointlastseen.family.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavTest {
    @Test fun theAppOpensOnTheProfileUntilSomeoneIsGone() {
        assertEquals(Screen.PROFILE, Nav.start(joined = false, gone = false).screen)
        assertEquals(Screen.PROFILE, Nav.start(joined = true, gone = false).screen)
        assertEquals(Screen.STATUS, Nav.start(joined = true, gone = true).screen)
    }

    /** The search lead's question opens only for a family that has joined the search. */
    @Test fun aQuestionOpensOnlyOnceJoined() {
        assertEquals(Screen.PROFILE, Nav.open(Nav.start(joined = false, gone = true), Screen.QUESTION).screen)
        assertEquals(Screen.QUESTION, Nav.open(Nav.start(joined = true, gone = false), Screen.QUESTION).screen)
        assertEquals(Screen.STATUS, Nav.back(Nav.open(Nav.start(joined = true, gone = true), Screen.QUESTION)).screen)
    }

    @Test fun shesGoneShowsCallFirstBeforeAnythingElse() {
        val s = Nav.shesGone(Nav.start(joined = false, gone = false))
        assertEquals(Screen.CALL_FIRST, s.state.screen)
        assertTrue(s.state.gone)
    }

    @Test fun afterCallFirstAnUnjoinedFamilyJoins() {
        val s = Nav.calledFirst(Nav.shesGone(Nav.start(false, false)).state)
        assertEquals(Screen.JOIN, s.state.screen)
        assertFalse(s.publishProfile)
    }

    @Test fun theProfileIsPublishedWhenTheLastOfGoneAndJoinedHappens() {
        val joinedLater = Nav.joined(Nav.calledFirst(Nav.shesGone(Nav.start(false, false)).state).state)
        assertEquals(Screen.STATUS, joinedLater.state.screen)
        assertTrue(joinedLater.publishProfile)

        val joinedFirst = Nav.joined(Nav.toJoin(Nav.start(false, false)).state)
        assertEquals(Screen.PROFILE, joinedFirst.state.screen)
        assertFalse(joinedFirst.publishProfile)
        val gone = Nav.calledFirst(Nav.shesGone(joinedFirst.state).state)
        assertEquals(Screen.STATUS, gone.state.screen)
        assertTrue(gone.publishProfile)
    }

    @Test fun aJoinedFamilyPublishesTheMomentTheyTapShesGone() {
        val joined = Nav.joined(Nav.toJoin(Nav.start(false, false)).state).state
        val step = Nav.shesGone(joined)
        assertEquals(Screen.CALL_FIRST, step.state.screen)
        assertTrue(step.publishProfile)
    }

    @Test fun theProfileCanBeEditedFromStatusAndReturnsThere() {
        val status = Nav.start(joined = true, gone = true)
        val editing = Nav.open(status, Screen.PROFILE)
        assertEquals(Screen.PROFILE, editing.screen)
        assertEquals(Screen.STATUS, Nav.back(editing).screen)
    }

    @Test fun leavingASearchReturnsToAFreshStart() {
        val left = Nav.leave(Nav.start(joined = true, gone = true))
        assertEquals(NavState(Screen.PROFILE, gone = false, joined = false), left)
    }

    @Test fun actionScreensReturnToStatus() {
        val status = Nav.start(joined = true, gone = true)
        for (target in listOf(Screen.CLIP, Screen.PHOTOS, Screen.NOTE, Screen.SIGHTING, Screen.ABOUT)) {
            val opened = Nav.open(status, target)
            assertEquals(target, opened.screen)
            assertEquals(Screen.STATUS, Nav.back(opened).screen)
        }
    }

    @Test fun actionsNeedAJoinedIncident() {
        val notJoined = Nav.start(joined = false, gone = false)
        assertEquals(Screen.PROFILE, Nav.open(notJoined, Screen.CLIP).screen)
        assertEquals(Screen.ABOUT, Nav.open(notJoined, Screen.ABOUT).screen)
    }

    @Test fun theSystemBackGestureReturnsToTheHomeScreenAndOnlyClosesTheAppThere() {
        val status = Nav.start(joined = true, gone = true)
        for (t in listOf(Screen.CLIP, Screen.PHOTOS, Screen.NOTE, Screen.SIGHTING, Screen.ABOUT, Screen.PROFILE)) {
            assertEquals(Screen.STATUS, Nav.systemBack(Nav.open(status, t))?.screen)
        }
        assertEquals(null, Nav.systemBack(status))
        val home = Nav.start(joined = false, gone = false)
        assertEquals(null, Nav.systemBack(home))
        assertEquals(Screen.PROFILE, Nav.systemBack(Nav.toJoin(home).state)?.screen)
        assertEquals(Screen.PROFILE, Nav.systemBack(Nav.open(home, Screen.ABOUT))?.screen)
    }

    @Test fun backFromCallFirstStaysOnCallFirstSoTheStepIsNotSkipped() {
        val callFirst = Nav.shesGone(Nav.start(false, false)).state
        assertEquals(Screen.CALL_FIRST, Nav.systemBack(callFirst)?.screen)
    }

    @Test fun theScriptOpensFromCallFirstAndBothBacksReturnThere() {
        val call = Nav.shesGone(Nav.start(joined = false, gone = false)).state
        val script = Nav.open(call, Screen.SCRIPT_911)
        assertEquals(Screen.SCRIPT_911, script.screen)
        assertEquals(Screen.CALL_FIRST, Nav.back(script).screen)
        assertEquals(Screen.CALL_FIRST, Nav.systemBack(script)?.screen)
    }

    /** A search this phone is no longer part of opens the join screen; a "gone" profile stays gone. */
    @Test fun aDroppedSearchOpensTheJoinScreenAndKeepsTheProfileState() {
        assertEquals(NavState(Screen.JOIN, gone = true, joined = false), Nav.dropped(NavState(Screen.STATUS, gone = true, joined = true)))
        assertEquals(NavState(Screen.JOIN, gone = false, joined = false), Nav.dropped(NavState(Screen.PROFILE, gone = false, joined = true)))
    }

    /** Leaving an open search returns to the profile, still "gone", so it offers to join again. */
    @Test fun leavingAnOpenSearchKeepsTheProfileGone() {
        assertEquals(NavState(Screen.PROFILE, gone = true, joined = false), Nav.leftOpen(NavState(Screen.STATUS, gone = true, joined = true)))
    }
}
