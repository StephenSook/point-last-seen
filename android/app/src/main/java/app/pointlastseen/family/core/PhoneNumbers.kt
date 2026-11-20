package app.pointlastseen.family.core

import java.text.Normalizer

/**
 * Removes anything shaped like a phone number before a note is stored or read (the iPhone app's rule, and a little
 * stricter). Seven or more digits in a row are a number: written digits (any script, full-width folded, Chinese
 * numerals, circled and other number characters) and spoken digit words count alike, joined only by short
 * separators (at most three spaces or - . , ( ) / or a dash; a line break with its indent counts as one, and accents
 * or joiners in a gap count as nothing) and with an optional leading + or (. Report numbers (times, minutes,
 * segments, searchers, percents) are far shorter, so they stay.
 *
 * Search information made of digits can sit inside such a run: a written date, a time, a coordinate pair, a
 * grouped count, a ZIP+4 code after a state, a month-name date, a number with a unit. It stays only when the rest of
 * the run is nothing or whole numbers of seven or more digits (which are removed); when any other piece of 1 to 6
 * digits is left beside it, the whole run is removed, since that piece could be part of a number. A number with an
 * ordinal ending (67th) never joins others. A removed run keeps its line breaks.
 * Code cannot detect a name inside a note, so the form tells people not to type one.
 */
object PhoneNumbers {
    const val REPLACEMENT = "[number removed]"

    private val DIGIT_WORDS = setOf("zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")

    // Chinese numeral digits, and the spoken "幺" (one): the iPhone counts them as digits (whole numbers); Java calls
    // them letters.
    private const val CHINESE_DIGITS = "〇零一二三四五六七八九幺"

    // Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and em dash, minus.
    private const val DASHES = "‐‑‒–—−"

    // A digit: a decimal digit in any script, a Chinese numeral digit, or a number character with a value that NFKC
    // leaves alone (circled dingbat digits such as ❶ and ➀, double circled ⓵, Hangzhou 〡, Ethiopic ፩), as the
    // iPhone reads them.
    private fun isDigit(cp: Int): Boolean {
        if (Character.isDigit(cp) || (cp <= 0xFFFF && cp.toChar() in CHINESE_DIGITS)) return true
        val type = Character.getType(cp)
        return (type == Character.OTHER_NUMBER.toInt() || type == Character.LETTER_NUMBER.toInt()) && Character.getNumericValue(cp) >= 0
    }

    private val MONTHS = setOf(
        "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july",
        "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
    )

    // A number with one of these endings is an ordinal (67th Ave) and never joins other digits.
    private val ORDINALS = setOf("st", "nd", "rd", "th")

    // Endings glued to a number that make it a quantity (5km, 3pm).
    private val UNITS = setOf(
        "am", "pm", "h", "hr", "hrs", "min", "mins", "km", "m", "mi", "ft", "yd", "yds", "mph", "kg", "lb", "lbs", "cm", "mm",
    )

    // US state and territory codes, written in capitals (GA 30301-1234); lower case would match common words.
    private val STATES = setOf(
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
        "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
        "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI",
    )

    // Matched against a gap after [flat], so a space is " " and a line break "\n" on every platform.
    private val COORDINATE_GAP = Regex("""[ \n]{0,2}(,[ \n]{0,2}-?|-)""")
    private val MONTH_DAY_GAP = Regex("""\.?[ \n]{1,2}""")
    private val DAY_MONTH_GAP = Regex("""[ \n]{1,2}""")
    private val YEAR_GAP = Regex(""",?[ \n]{1,2}""")

    /**
     * A run of digits (counting its digits), a word (one if it is a spoken digit, else none). An [alone] run
     * counts by itself and never joins its neighbours.
     */
    private class Part(val start: Int, val end: Int, var digits: Int, val written: Boolean, var alone: Boolean = false)

    // A spoken repeat before a digit counts the extra digits it stands for: "triple five" is three digits.
    private val REPEATS = mapOf("double" to 1, "triple" to 2)

    fun remove(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val parts = parts(folded)
        for (i in 0 until parts.size - 1) {
            val repeat = REPEATS[word(folded, parts[i])] ?: continue
            if (!parts[i].written && parts[i + 1].digits > 0 && onlySeparators(folded.substring(parts[i].end, parts[i + 1].start))) parts[i].digits = repeat
        }
        for (i in parts.indices) {
            if (parts[i].written && i + 1 < parts.size && !parts[i + 1].written && parts[i + 1].start == parts[i].end &&
                word(folded, parts[i + 1]) in ORDINALS
            ) {
                parts[i].alone = true
            }
        }
        val kept = searchSpans(folded, parts)
        // Walk back from the end, so replacing one number never moves the ones before it.
        val out = StringBuilder(folded)
        var k = parts.size - 1
        while (k >= 0) {
            if (parts[k].digits <= 0) {
                k--
                continue
            }
            var start = k
            while (start > 0 && joins(folded, parts[start - 1], parts[start])) start--
            if ((start..k).sumOf { parts[it].digits } >= 7) {
                val pieces = pieces(start, k, kept)
                if (pieces.any { p -> p.sumOf { parts[it].digits } in 1..6 }) {
                    replace(out, folded, parts, start, k)
                } else {
                    for (p in pieces.reversed()) replace(out, folded, parts, p.first(), p.last())
                }
            }
            k = start - 1
        }
        return out.toString()
    }

    /** The parts of the run [start]..[end] outside the search spans, as consecutive pieces. */
    private fun pieces(start: Int, end: Int, kept: Set<Int>): List<List<Int>> {
        val pieces = mutableListOf<MutableList<Int>>()
        var open = false
        for (i in start..end) {
            if (i in kept) {
                open = false
            } else {
                if (!open) pieces += mutableListOf<Int>()
                pieces.last() += i
                open = true
            }
        }
        return pieces
    }

    /** Replaces parts[first..last] (with a leading + or ( when the run starts there), keeping any line breaks. */
    private fun replace(out: StringBuilder, s: String, parts: List<Part>, first: Int, last: Int) {
        var lower = parts[first].start
        while (lower > 0 && s[lower - 1] in "+(") lower--
        val upper = parts[last].end
        val breaks = LINE_BREAK.findAll(s.substring(lower, upper)).count()
        out.replace(lower, upper, List(breaks + 1) { REPLACEMENT }.joinToString("\n"))
    }

    /** Whether part [a] joins the part [b] right after it into one number. */
    private fun joins(s: String, a: Part, b: Part): Boolean =
        a.digits > 0 && b.digits > 0 && !a.alone && !b.alone && onlySeparators(s.substring(a.end, b.start))

    private fun word(s: String, p: Part) = s.substring(p.start, p.end).lowercase()

    /**
     * The parts that are search information, found on the text as it is: a written date (three groups joined by one
     * / - . or dash that read as a date, with no digits joined to it by its own separator), a time (14:03), a
     * coordinate pair in range (33.7490, -84.3880), a grouped count (1,234,567), a ZIP+4 code after a state
     * (GA 30301-1234), a month-name date (Nov 19 2026, 19 November 2026) and a number with a unit (5km).
     */
    private fun searchSpans(s: String, parts: List<Part>): Set<Int> {
        fun gap(a: Int, b: Int) = s.substring(parts[a].end, parts[b].start)
        // Length in characters as read (code points), so digits outside the BMP count once each.
        fun len(i: Int) = s.codePointCount(parts[i].start, parts[i].end)
        fun text(i: Int) = s.substring(parts[i].start, parts[i].end)
        fun value(i: Int): Int? = text(i).takeIf { t -> t.all { it in '0'..'9' } }?.toIntOrNull()
        fun written(i: Int) = i in parts.indices && parts[i].written
        fun isDay(i: Int) = written(i) && len(i) <= 2 && (value(i) ?: 0) in 1..31
        fun isYear(i: Int) = written(i) && len(i) == 4 && (value(i) ?: 0) in 1900..2100
        fun degrees(whole: Int, frac: Int, max: Int): Boolean {
            if (!written(whole) || !written(frac) || gap(whole, frac) != "." || len(whole) > 3 || len(frac) !in 4..8) return false
            val v = "${text(whole)}.${text(frac)}".toDoubleOrNull() ?: return false
            return v <= max
        }
        val kept = mutableSetOf<Int>()
        // Written dates found below, each as its three parts; two that share a part cancel each other.
        val dates = mutableListOf<IntRange>()
        for (i in parts.indices) {
            if (!parts[i].written) {
                if (word(s, parts[i]) !in MONTHS) continue
                if (isDay(i + 1) && MONTH_DAY_GAP.matches(flat(gap(i, i + 1)))) {
                    kept += i + 1
                    if (isYear(i + 2) && YEAR_GAP.matches(flat(gap(i + 1, i + 2)))) kept += i + 2
                } else if (isDay(i - 1) && DAY_MONTH_GAP.matches(flat(gap(i - 1, i)))) {
                    kept += i - 1
                    if (isYear(i + 1) && YEAR_GAP.matches(flat(gap(i, i + 1)))) kept += i + 1
                }
                continue
            }
            if (i + 2 < parts.size && written(i + 1) && written(i + 2) && isDate(s, parts[i], parts[i + 1], parts[i + 2]) &&
                !sameSeparatorNeighbour(s, parts, i, i + 2)
            ) {
                dates += i..(i + 2)
            }
            // A quantity has fewer than seven digits; seven or more with a unit glued on is still a number.
            if (i + 1 < parts.size && !parts[i + 1].written && parts[i + 1].start == parts[i].end && word(s, parts[i + 1]) in UNITS &&
                parts[i].digits < 7
            ) {
                kept += i
            }
            if (written(i + 1) && gap(i, i + 1) == ":" && len(i) <= 2 && len(i + 1) == 2 && (value(i) ?: 99) <= 23 && (value(i + 1) ?: 99) <= 59) {
                kept += i..(i + 1)
            }
            if (degrees(i, i + 1, 90) && degrees(i + 2, i + 3, 180) && COORDINATE_GAP.matches(flat(gap(i + 1, i + 2)))) {
                kept += i..(i + 3)
            }
            if (len(i) <= 3 && !(i > 0 && gap(i - 1, i) == ",")) {
                var j = i + 1
                while (written(j) && gap(j - 1, j) == "," && len(j) == 3) j++
                if (j - i - 1 >= 2) kept += i until j
            }
            if (len(i) == 5 && written(i + 1) && gap(i, i + 1) == "-" && len(i + 1) == 4 && i > 0 && !parts[i - 1].written &&
                text(i - 1) in STATES && gap(i - 1, i) == " "
            ) {
                kept += i..(i + 1)
                // "OH" in capitals before the code is Ohio, not a spoken zero.
                if (parts[i - 1].digits > 0) kept += i - 1
            }
        }
        for (d in dates) {
            if (dates.none { other -> other != d && other.first <= d.last && d.first <= other.last }) kept += d
        }
        return kept
    }

    /** Whether digits join the date at parts[first..last] by the date's own separator, on either side. */
    private fun sameSeparatorNeighbour(s: String, parts: List<Part>, first: Int, last: Int): Boolean {
        val sep = s.substring(parts[first].end, parts[first + 1].start)
        val before = first > 0 && parts[first - 1].digits > 0 && s.substring(parts[first - 1].end, parts[first].start) == sep
        val after = last + 1 < parts.size && parts[last + 1].digits > 0 && s.substring(parts[last].end, parts[last + 1].start) == sep
        return before || after
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
                    // A word stops at a Chinese numeral, which is a digit here.
                    while (j < s.length && Character.isLetter(s.codePointAt(j)) && !isDigit(s.codePointAt(j))) j += Character.charCount(s.codePointAt(j))
                    parts += Part(i, j, if (s.substring(i, j).lowercase() in DIGIT_WORDS) 1 else 0, written = false)
                    i = j
                }
                else -> i += Character.charCount(cp)
            }
        }
        return parts
    }

    /**
     * Three written digit groups joined by the same one of / - . or a dash that read as a date: year-month-day (a
     * 4-digit year from 1900 to 2100), or month and day in either order then a 2-digit year or such a 4-digit year.
     * Each day is 1 to 31 and a month 1 to 12.
     */
    private fun isDate(s: String, a: Part, b: Part, c: Part): Boolean {
        val gap1 = s.substring(a.end, b.start)
        val gap2 = s.substring(b.end, c.start)
        if (gap1.length != 1 || gap1 != gap2 || (gap1[0] !in "/-." && gap1[0] !in DASHES)) return false
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
     * What may sit between the parts of one number: at most three spaces or - . , ( ) / or dashes, read after [flat]
     * (so a line break with its indent counts as one, and an accent or joiner adds nothing).
     */
    private fun onlySeparators(s: String): Boolean {
        val gap = flat(s)
        return gap.length <= 3 && gap.all { it == ' ' || it == '\n' || it in "-.,()/" || it in DASHES }
    }

    /**
     * A gap as read: combining marks and format characters dropped (NFKC turns a spacing accent such as ´ into a
     * space and a combining mark; a joiner or a keycap mark is invisible), each line break (CRLF, LF, CR, NEL, or the
     * Unicode line or paragraph separator) with any indent after it made one "\n", and every other space " ".
     */
    private fun flat(gap: String): String {
        val visible = gap.filter { c ->
            val type = Character.getType(c).toByte()
            type != Character.NON_SPACING_MARK && type != Character.ENCLOSING_MARK && type != Character.FORMAT
        }
        return LINE_BREAK.replace(visible, "\n").map { if (it != '\n' && it.isWhitespace()) ' ' else it }.joinToString("")
    }

    private val LINE_BREAK = Regex("""(\r\n|\n|\r|\u0085|\u2028|\u2029)[ \t]*""")
}
