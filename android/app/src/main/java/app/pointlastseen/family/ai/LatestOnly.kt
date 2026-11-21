package app.pointlastseen.family.ai

/** Hands out a number per start; only the newest start's answer may land, and [drop] ends the running one. */
class LatestOnly {
    private var latest = 0L

    fun begin(): Long = ++latest

    fun isLatest(start: Long): Boolean = start == latest

    fun drop() {
        latest++
    }
}
