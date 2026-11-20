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

    // Chinese numeral digits: the iPhone counts them as digits (whole numbers); Java calls them letters.
    private const val CHINESE_DIGITS = "\u3007\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d"

    // Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and em dash, minus.
    private const val DASHES = "\u2010\u2011\u2012\u2013\u2014\u2212"

    private fun isDigit(cp: Int) = Character.isDigit(cp) || (cp <= 0xFFFF && cp.toChar() in CHINESE_DIGITS)

    private val MONTHS = setOf(
        "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july",
        "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
    )

    // Endings glued to a number that make it a quantity or an ordinal (67th, 5km, 3pm), never part of a phone number.
    private val UNITS = setOf(
        "st", "nd", "rd", "th", "am", "pm", "h", "hr", "hrs", "min", "mins", "km", "m", "mi", "ft", "yd", "yds", "mph",
        "kg", "lb", "lbs", "cm", "mm",
    )

    private val COORDINATE_GAP = Regex("""\s{0,2},?\s{0,2}-?""")
    private val MONTH_DAY_GAP = Regex("""\.?\s{1,2}""")
    private val YEAR_GAP = Regex(""",?\s{1,2}""")

    /**
     * A run of digits (counting its digits), a word (one if it is a spoken digit, else none). An [alone] run
     * counts by itself and never joins its neighbours.
     */
    private class Part(val start: Int, val end: Int, var digits: Int, val written: Boolean, var alone: Boolean = false)

    fun remove(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val parts = parts(folded)
        protect(folded, parts)
        // A date's three groups count no digits, so they neither make a number nor join one. A date carved out of
        // a longer run is not one: the digits joined to it on each side must be none, or a number of their own.
        var d = 0
        while (d + 2 < parts.size) {
            if (parts[d].written && parts[d + 1].written && parts[d + 2].written && isDate(folded, parts[d], parts[d + 1], parts[d + 2]) &&
                joinedDigits(folded, parts, d, -1) !in 1..6 && joinedDigits(folded, parts, d + 2, +1) !in 1..6
            ) {
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
            while (start > 0 && joins(folded, parts[start - 1], parts[start])) {
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

    /** The digits joined by separators to parts[edge] on one side ([step] -1 before it, +1 after it). */
    private fun joinedDigits(s: String, parts: List<Part>, edge: Int, step: Int): Int {
        var total = 0
        var cur = edge
        var next = edge + step
        while (next in parts.indices) {
            if (!(if (step < 0) joins(s, parts[next], parts[cur]) else joins(s, parts[cur], parts[next]))) break
            total += parts[next].digits
            cur = next
            next += step
        }
        return total
    }

    /** Whether part [a] joins the part [b] right after it into one number. */
    private fun joins(s: String, a: Part, b: Part): Boolean =
        a.digits > 0 && b.digits > 0 && !a.alone && !b.alone && onlySeparators(s.substring(a.end, b.start))

    /**
     * Search information made of digits counts no digits, so it neither makes a number nor joins one: a time
     * (14:03), a coordinate pair (33.7490, -84.3880), a grouped count (1,234,567), a ZIP+4 code (30301-1234) and a
     * month-name date (Nov 19 2026, 19 November 2026). A number glued to a unit or an ordinal ending (67th, 5km)
     * counts alone.
     */
    private fun protect(s: String, parts: List<Part>) {
        fun gap(a: Part, b: Part) = s.substring(a.end, b.start)
        fun len(p: Part) = p.end - p.start
        fun value(p: Part): Int? = s.substring(p.start, p.end).takeIf { t -> t.all { it in '0'..'9' } }?.toIntOrNull()
        fun written(i: Int) = i in parts.indices && parts[i].written
        fun word(i: Int) = s.substring(parts[i].start, parts[i].end).lowercase()
        fun zero(vararg idx: Int) = idx.forEach { parts[it].digits = 0 }
        fun isDay(i: Int) = written(i) && len(parts[i]) <= 2 && (value(parts[i]) ?: 0) in 1..31
        fun isYear(i: Int) = written(i) && len(parts[i]) == 4 && (value(parts[i]) ?: 0) in 1900..2100
        for (i in parts.indices) {
            val p = parts[i]
            if (!p.written) {
                if (word(i) !in MONTHS) continue
                if (isDay(i + 1) && MONTH_DAY_GAP.matches(gap(p, parts[i + 1]))) {
                    zero(i + 1)
                    if (isYear(i + 2) && YEAR_GAP.matches(gap(parts[i + 1], parts[i + 2]))) zero(i + 2)
                } else if (isDay(i - 1) && Regex("""\s{1,2}""").matches(gap(parts[i - 1], p))) {
                    zero(i - 1)
                    if (isYear(i + 1) && YEAR_GAP.matches(gap(p, parts[i + 1]))) zero(i + 1)
                }
                continue
            }
            if (i + 1 < parts.size && !parts[i + 1].written && parts[i + 1].start == p.end && word(i + 1) in UNITS) p.alone = true
            if (written(i + 1) && gap(p, parts[i + 1]) == ":" && len(p) <= 2 && len(parts[i + 1]) == 2 &&
                (value(p) ?: 99) <= 23 && (value(parts[i + 1]) ?: 99) <= 59
            ) {
                zero(i, i + 1)
            }
            if (written(i + 1) && written(i + 2) && written(i + 3) && gap(p, parts[i + 1]) == "." && gap(parts[i + 2], parts[i + 3]) == "." &&
                len(p) <= 3 && len(parts[i + 2]) <= 3 && len(parts[i + 1]) >= 4 && len(parts[i + 3]) >= 4 &&
                COORDINATE_GAP.matches(gap(parts[i + 1], parts[i + 2]))
            ) {
                zero(i, i + 1, i + 2, i + 3)
            }
            if (len(p) <= 3 && (i == 0 || gap(parts[i - 1], p) != ",")) {
                var j = i + 1
                while (written(j) && gap(parts[j - 1], parts[j]) == "," && len(parts[j]) == 3) j++
                if (j - i - 1 >= 2) zero(*(i until j).toList().toIntArray())
            }
            if (len(p) == 5 && written(i + 1) && gap(p, parts[i + 1]) == "-" && len(parts[i + 1]) == 4 &&
                (i == 0 || !joins(s, parts[i - 1], p)) && (i + 2 >= parts.size || !joins(s, parts[i + 1], parts[i + 2]))
            ) {
                zero(i, i + 1)
            }
        }
    }

    private fun parts(s: String): List<Part> {
        val parts = mutableListOf<Part>()
        var i = 0
        while (i < s.length) {
            val cp = s.codePointAt(i)
            when {
                isDigit(cp) -> {
                    var j = i
                    var n = 0
                    while (j < s.length && isDigit(s.codePointAt(j))) {
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

    /**
     * What may sit between the parts of one number: at most three spaces or - . , ( ) / or dashes; a pasted
     * line break (CRLF) counts as one, as on the iPhone.
     */
    private fun onlySeparators(s: String): Boolean {
        val gap = s.replace("\r\n", "\n")
        return gap.length <= 3 && gap.all { it.isWhitespace() || it in "-.,()/" || it in DASHES }
    }
}
