package app.pointlastseen.family.core

/**
 * Removes anything shaped like a phone number before a note is stored or read.
 * Code cannot detect a name inside a note, so the form tells people not to type one.
 */
object PhoneNumbers {
    const val REPLACEMENT = "[number removed]"

    private val PATTERNS = listOf(
        // +1 404 555 0142, (404) 555-0142, 404-555-0142, 404.555.0142
        Regex("""(?<![\w])(?:\+?1[\s.\-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.\-])\d{3}[\s.\-]\d{4}(?!\w)"""),
        // 4045550142 or 14045550142
        Regex("""(?<![\w])\+?1?\d{10}(?!\w)"""),
        // 555-0142
        Regex("""(?<![\w\-.])\d{3}[.\-]\d{4}(?![\w\-.])"""),
    )

    fun remove(text: String): String = PATTERNS.fold(text) { acc, re -> re.replace(acc, REPLACEMENT) }
}
