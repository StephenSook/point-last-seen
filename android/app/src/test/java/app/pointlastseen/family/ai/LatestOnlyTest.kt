package app.pointlastseen.family.ai

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LatestOnlyTest {
    @Test fun onlyTheNewestStartIsCurrent() {
        val sorts = LatestOnly()
        val a = sorts.begin()
        val b = sorts.begin()
        assertFalse(sorts.isLatest(a))
        assertTrue(sorts.isLatest(b))
    }

    /** Leaving the note screen drops a sort still running, so its answer cannot land on a later note. */
    @Test fun droppingEndsTheRunningStart() {
        val sorts = LatestOnly()
        val a = sorts.begin()
        sorts.drop()
        assertFalse(sorts.isLatest(a))
        assertTrue(sorts.isLatest(sorts.begin()))
    }
}
