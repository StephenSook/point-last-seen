package app.pointlastseen.family.core

import java.text.Normalizer

/**
 * Removes anything shaped like a phone number before a note is stored or read (the same rule as the iPhone
 * app). Seven or more digits in a row are a number: written digits (any script, full-width folded) and spoken
 * digit words count alike, joined only by short separators (at most three spaces or - . , ( ) /) and with an
 * optional leading + or (. Report numbers (times, minutes, segments, searchers, percents) are far shorter, so
 * they stay, and so does a written date (when someone was last seen), which is search information: three
 * groups joined by one / - or . that read as month and day with a year.
 * Code cannot detect a name inside a note, so the form tells people not to type one.
 */
object PhoneNumbers {
    const val REPLACEMENT = "[number removed]"

    private val DIGIT_WORDS = setOf("zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")

    /** A run of digits (counting its digits), a word (one if it is a spoken digit, else none). */
    private class Part(val start: Int, val end: Int, var digits: Int, val written: Boolean)

    fun remove(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val parts = parts(folded)
        // A date's three groups count no digits, so they neither make a number nor join one.
        var d = 0
        while (d + 2 < parts.size) {
            if (parts[d].written && parts[d + 1].written && parts[d + 2].written && isDate(folded, parts[d], parts[d + 1], parts[d + 2])) {
                for (g in d..d + 2) parts[g].digits = 0
                d += 3
            } else {
                d += 1
            }
        }
        // Walk back from the end, so replacing one number never moves the ones before it.
        val out = StringBuilder(folded)
        var k = parts.size - 1
        while (k >= 0) {
            if (parts[k].digits <= 0) {
                k--
                continue
            }
            var start = k
            var total = parts[k].digits
            while (start > 0 && parts[start - 1].digits > 0 && onlySeparators(folded.substring(parts[start - 1].end, parts[start].start))) {
                start--
                total += parts[start].digits
            }
            if (total >= 7) {
                var lower = parts[start].start
                while (lower > 0 && folded[lower - 1] in "+(") lower--
                out.replace(lower, parts[k].end, REPLACEMENT)
            }
            k = start - 1
        }
        return out.toString()
    }

    private fun parts(s: String): List<Part> {
        val parts = mutableListOf<Part>()
        var i = 0
        while (i < s.length) {
            val cp = s.codePointAt(i)
            when {
                Character.isDigit(cp) -> {
                    var j = i
                    var n = 0
                    while (j < s.length && Character.isDigit(s.codePointAt(j))) {
                        j += Character.charCount(s.codePointAt(j))
                        n++
                    }
                    parts += Part(i, j, n, written = true)
                    i = j
                }
                Character.isLetter(cp) -> {
                    var j = i
                    while (j < s.length && Character.isLetter(s.codePointAt(j))) j += Character.charCount(s.codePointAt(j))
                    parts += Part(i, j, if (s.substring(i, j).lowercase() in DIGIT_WORDS) 1 else 0, written = false)
                    i = j
                }
                else -> i += Character.charCount(cp)
            }
        }
        return parts
    }

    /**
     * Three written digit groups joined by the same one of / - . that read as a date: year-month-day (a 4-digit
     * year from 1900 to 2100), or month and day in either order then a 2-digit year or such a 4-digit year. Each
     * day is 1 to 31 and a month 1 to 12.
     */
    private fun isDate(s: String, a: Part, b: Part, c: Part): Boolean {
        val gap1 = s.substring(a.end, b.start)
        val gap2 = s.substring(b.end, c.start)
        if (gap1.length != 1 || gap1 != gap2 || gap1[0] !in "/-.") return false
        fun number(p: Part): Int? = s.substring(p.start, p.end).takeIf { t -> t.all { it in '0'..'9' } }?.toIntOrNull()
        val x = number(a) ?: return false
        val y = number(b) ?: return false
        val z = number(c) ?: return false
        val (lx, ly, lz) = Triple(a.end - a.start, b.end - b.start, c.end - c.start)
        val year = 1900..2100
        val day = 1..31
        val month = 1..12
        if (lx == 4) return x in year && ly <= 2 && lz <= 2 && y in month && z in day
        if (lx > 2 || ly > 2 || !(lz == 2 || (lz == 4 && z in year))) return false
        return x in day && y in day && (x in month || y in month)
    }

    /** What may sit between the parts of one number: at most three spaces or - . , ( ) /. */
    private fun onlySeparators(s: String): Boolean = s.length <= 3 && s.all { it.isWhitespace() || it in "-.,()/" }
}
