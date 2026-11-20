package app.pointlastseen.family.core

import java.text.Normalizer

/**
 * Removes anything shaped like a phone number before a note is stored or read (the iPhone app's rule, and a little
 * stricter). Seven or more digits in a row are a number: written digits (any script, full-width folded, Chinese
 * numerals) and spoken digit words count alike, joined only by short separators (at most three spaces or
 * - . , ( ) / or a dash; a CRLF counts as one) and with an optional leading + or (. Report numbers (times, minutes,
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

    // Chinese numeral digits: the iPhone counts them as digits (whole numbers); Java calls them letters.
    private const val CHINESE_DIGITS = "〇零一二三四五六七八九"

    // Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and em dash, minus.
    private const val DASHES = "‐‑‒–—−"

    private fun isDigit(cp: Int) = Character.isDigit(cp) || (cp <= 0xFFFF && cp.toChar() in CHINESE_DIGITS)

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

    private val COORDINATE_GAP = Regex("""\s{0,2}(,\s{0,2}-?|-)""")
    private val MONTH_DAY_GAP = Regex("""\.?\s{1,2}""")
    private val YEAR_GAP = Regex(""",?\s{1,2}""")

    /**
     * A run of digits (counting its digits), a word (one if it is a spoken digit, else none). An [alone] run
     * counts by itself and never joins its neighbours.
     */
    private class Part(val start: Int, val end: Int, val digits: Int, val written: Boolean, var alone: Boolean = false)

    fun remove(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val parts = parts(folded)
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
        val breaks = s.substring(lower, upper).replace("\r\n", "\n").count { it == '\n' }
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
        fun len(i: Int) = parts[i].end - parts[i].start
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
        for (i in parts.indices) {
            if (!parts[i].written) {
                if (word(s, parts[i]) !in MONTHS) continue
                if (isDay(i + 1) && MONTH_DAY_GAP.matches(gap(i, i + 1))) {
                    kept += i + 1
                    if (isYear(i + 2) && YEAR_GAP.matches(gap(i + 1, i + 2))) kept += i + 2
                } else if (isDay(i - 1) && Regex("""\s{1,2}""").matches(gap(i - 1, i))) {
                    kept += i - 1
                    if (isYear(i + 1) && YEAR_GAP.matches(gap(i, i + 1))) kept += i + 1
                }
                continue
            }
            if (i + 2 < parts.size && written(i + 1) && written(i + 2) && isDate(s, parts[i], parts[i + 1], parts[i + 2]) &&
                !sameSeparatorNeighbour(s, parts, i, i + 2)
            ) {
                kept += i..(i + 2)
            }
            if (i + 1 < parts.size && !parts[i + 1].written && parts[i + 1].start == parts[i].end && word(s, parts[i + 1]) in UNITS) {
                kept += i
            }
            if (written(i + 1) && gap(i, i + 1) == ":" && len(i) <= 2 && len(i + 1) == 2 && (value(i) ?: 99) <= 23 && (value(i + 1) ?: 99) <= 59) {
                kept += i..(i + 1)
            }
            if (degrees(i, i + 1, 90) && degrees(i + 2, i + 3, 180) && COORDINATE_GAP.matches(gap(i + 1, i + 2))) {
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
            }
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
     * What may sit between the parts of one number: at most three spaces or - . , ( ) / or dashes; a pasted
     * line break (CRLF) counts as one, as on the iPhone.
     */
    private fun onlySeparators(s: String): Boolean {
        val gap = s.replace("\r\n", "\n")
        return gap.length <= 3 && gap.all { it.isWhitespace() || it in "-.,()/" || it in DASHES }
    }
}
