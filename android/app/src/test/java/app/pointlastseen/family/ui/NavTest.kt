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

}
