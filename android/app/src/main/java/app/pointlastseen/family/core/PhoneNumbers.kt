package app.pointlastseen.family.core

import java.text.Normalizer

/**
 * Removes anything shaped like a phone number before a note is stored or read (the iPhone app's rule, and a little
 * stricter). Seven or more digits in a row are a number: written digits (any script, full-width folded, Chinese
 * numerals, circled and other number characters) and spoken digit words count alike, joined only by separators
 * (spaces, - . , ( ) / or a dash, any number of them; a line break with its indent counts as one, and accents or
 * joiners in a gap count as nothing) and with an optional leading + or (. Report numbers (times, minutes,
 * segments, searchers, percents) are far shorter, so they stay.
 *
 * Search information made of digits can sit inside such a run: a written date, a time, a coordinate pair, a
 * ZIP+4 code after a state, a month-name date. It stays only when the rest of
 * the run is nothing or whole numbers of seven or more digits (which are removed); when any other piece of 1 to 6
 * digits is left beside it, the whole run is removed, since that piece could be part of a number. A street name
 * (67th Ave: one to three digits, an ordinal ending, a street word) never joins others. A removed run keeps its line
 * breaks.
 * Code cannot detect a name inside a note, so the form tells people not to type one.
 */
object PhoneNumbers {
    const val REPLACEMENT = "[number removed]"

    // English and Spanish digit words, as the shared rule names them (shared/test-vectors/README.md). Spanish "un" and
    // "una" are articles, so they are not digits.
    private val DIGIT_WORDS = setOf(
        "zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    )

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

    // A number with one of these endings, before a street word, is a street name (67th Ave) and never joins other digits.
    private val ORDINALS = setOf("st", "nd", "rd", "th")
    private val STREETS = setOf(
        "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "ln", "lane", "pl", "place", "way",
        "ct", "court", "pkwy", "parkway", "hwy", "highway", "ter", "terrace", "cir", "circle", "sq", "square", "trl", "trail",
    )

    // US state and territory codes, written in capitals (GA 30301-1234); lower case would match common words.
    private val STATES = setOf(
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
        "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
        "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI",
    )

    // Matched against a gap after [flat], so a space is " " and a line break "\n" on every platform.
    // A comma, semicolon, bullet, middle dot, bar or slash (with up to two spaces around it) then a minus, or a minus
    // with a space before it. The minus is the western longitude every drill site has: two decimals with no minus
    // between them can be two phone numbers (33.12345678, 33.87654321 is two Mexican numbers), and a bare minus between
    // two decimals (44.2071-23.4567) is a dotted number, not a pair.
    private val COORDINATE_GAP = Regex("""[ \n]{0,2}[,;\u2022\u00B7|/][ \n]{0,2}-|[ \n]{1,2}-""")

    // A word that says the next digits are a phone number; one of these just before a decimal pair makes it two numbers.
    private val PHONE_CUES = setOf(
        "call", "tel", "phone", "cell", "mobile", "number", "llame", "llamar", "tel\u00e9fono", "telefono", "celular",
        "n\u00famero", "numero",
    )
    // A word that may sit between a cue and its number (Llame al 33.1234, -84.5678; Call at ...).
    private val CUE_CONNECTORS = setOf("al", "a", "at", "on", "to")
    // What may sit between a cue word and what follows it, read after [flat]: spaces, line breaks or a colon.
    private val CUE_GAP = Regex("""[ \n:]*""")
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

    // A run made only of clock times: two or more h:mm in ASCII digits (hour 0 to 23, minutes 00 to 59) separated by
    // commas or spaces, with no number after it through anything but letters. The same check before it is
    // [noNumberBefore]: Java takes no unbounded lookbehind.
    private val TIMES_RUN = Regex("""(?:[01]?\d|2[0-3]):[0-5]\d(?:[ ,]+(?:[01]?\d|2[0-3]):[0-5]\d)+(?![^\p{L}\p{N}]*\p{N})""")
    private val CLOCK_TIME = Regex("""(\d+):(\d+)""")
    // Before a run of times, two more words cue a number (Text 21:25 5:50 1:42; Reach me at 4:04 5:55 6:42).
    private val TIME_CUES = PHONE_CUES + setOf("text", "reach")
    // How many words before a run of times are read for a cue.
    private const val CUE_WINDOW = 3

    /** Whether no number sits before [at] through anything but letters (the web app's lookbehind on its run of times). */
    private fun noNumberBefore(s: String, at: Int): Boolean {
        var i = at
        while (i > 0) {
            val cp = s.codePointBefore(i)
            if (Character.isLetter(cp)) return true
            val type = Character.getType(cp)
            if (type == Character.DECIMAL_DIGIT_NUMBER.toInt() || type == Character.LETTER_NUMBER.toInt() || type == Character.OTHER_NUMBER.toInt()) return false
            i -= Character.charCount(cp)
        }
        return true
    }

    /** The runs of times in [s], as the web app's TIMES_RUN finds them: after a refused start, the next character is tried. */
    private fun timesRuns(s: String): List<MatchResult> {
        val runs = mutableListOf<MatchResult>()
        var from = 0
        while (from < s.length) {
            val m = TIMES_RUN.find(s, from) ?: break
            if (noNumberBefore(s, m.range.first)) {
                runs += m
                from = m.range.last + 1
            } else {
                from = m.range.first + 1
            }
        }
        return runs
    }

    /** Whether a phone cue sits before the run starting at parts[first]: a cue word among the three words before it, or a "#". */
    private fun cuedRun(s: String, parts: List<Part>, first: Int): Boolean {
        // A part carrying digits (written, spoken, or a counted double or triple) is read past and is not one of the
        // three words: "Call one: 4:04 5:55 6:42" and "Call 5 at 4:04 5:55 6:42" are cued.
        var j = first - 1
        var words = 0
        while (j >= 0 && words < CUE_WINDOW) {
            if (parts[j].digits > 0) {
                j--
                continue
            }
            if (word(s, parts[j]) in TIME_CUES) return true
            words++
            j--
        }
        return s.substring(if (j >= 0) parts[j].end else 0, parts[first].start).contains('#')
    }

    /**
     * A run of times the rule reads as its own group (no digit, written or spoken, joined to it on either side) is
     * decided whole. In clock order (each time no earlier than the one before) with no phone cue before it, it is search
     * information and stays (The possible times are 14:03, 14:10, 14:17.). Out of order or after a cue it could be a
     * number written as times (Call 21:25 5:50 1:42, 12:12 5:55 01:42), and the whole run goes: when in doubt, remove.
     * The text between such runs follows the rule unchanged, and so does every note that NFKC changes, since folding can
     * turn other characters into the ASCII digits a run is made of.
     */
    fun remove(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        if (folded != text) return removeByRule(folded)
        val parts = ruleParts(folded)
        val startsAt = parts.withIndex().associate { (i, p) -> p.start to i }
        val endsAt = parts.withIndex().associate { (i, p) -> p.end to i }
        val out = StringBuilder()
        var from = 0
        for (m in timesRuns(folded)) {
            val first = startsAt[m.range.first] ?: continue
            val last = endsAt[m.range.last + 1] ?: continue
            val joined = (first > 0 && joins(folded, parts[first - 1], parts[first])) ||
                (last + 1 < parts.size && joins(folded, parts[last], parts[last + 1]))
            // A month name beside the run reads its hour or minutes as a day (14 May 6:00 7:00, 7:14 May 2026), which
            // changes how the rule groups the digits around it, so such a run stays with the text around it.
            fun month(i: Int) = i in parts.indices && !parts[i].written && word(folded, parts[i]) in MONTHS
            if (joined || month(first - 1) || month(last + 1)) continue
            val minutes = CLOCK_TIME.findAll(m.value).map { it.groupValues[1].toInt() * 60 + it.groupValues[2].toInt() }.toList()
            val inOrder = minutes.zipWithNext().all { (a, b) -> b >= a }
            out.append(removeByRule(folded.substring(from, m.range.first)))
            out.append(if (inOrder && !cuedRun(folded, parts, first)) m.value else REPLACEMENT)
            from = m.range.last + 1
        }
        return out.append(removeByRule(folded.substring(from))).toString()
    }

    /** The parts of [folded] as the rule reads them: a spoken repeat counted, and a street name's number set apart. */
    private fun ruleParts(folded: String): List<Part> {
        val parts = parts(folded)
        for (i in 0 until parts.size - 1) {
            val repeat = REPEATS[word(folded, parts[i])] ?: continue
            if (!parts[i].written && parts[i + 1].digits > 0 && onlySeparators(folded.substring(parts[i].end, parts[i + 1].start))) parts[i].digits = repeat
        }
        for (i in parts.indices) {
            // An ordinal stays apart only as a street name: one to three digits, its ending, then a street word (67th Ave,
            // 125th St). A longer group, or one with no street word after it, is still part of a number.
            if (parts[i].written && parts[i].digits <= 3 && i + 2 < parts.size && !parts[i + 1].written && parts[i + 1].start == parts[i].end &&
                word(folded, parts[i + 1]) in ORDINALS && !parts[i + 2].written && word(folded, parts[i + 2]) in STREETS &&
                folded.substring(parts[i + 1].end, parts[i + 2].start).isNotEmpty() && folded.substring(parts[i + 1].end, parts[i + 2].start).isBlank()
            ) {
                parts[i].alone = true
            }
        }
        return parts
    }

    private fun removeByRule(text: String): String {
        val folded = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val parts = ruleParts(folded)
        val (found, kept, glued) = searchSpans(folded, parts)
        // Walk back from the end, so replacing one number never moves the ones before it.
        val out = StringBuilder(folded)
        var k = parts.size - 1
        while (k >= 0) {
            if (parts[k].digits <= 0) {
                k--
                continue
            }
            var start = k
            // A dropped time's hour and minutes join each other across the colon, so its minutes go with the run too.
            while (start > 0 && (joins(folded, parts[start - 1], parts[start]) || (start - 1) in glued)) start--
            if ((start..k).sumOf { parts[it].digits } >= 7) {
                val pieces = pieces(start, k, kept)
                // A short piece seen with every span found, or with the spans kept after dropping dates and times,
                // takes the whole run: dropping a date must never make the rest of the run look like a whole number.
                fun short(ps: List<List<Int>>) = ps.any { p -> p.sumOf { parts[it].digits } in 1..6 }
                // The pieces again with each dropped time's colon still a break: joining the minutes to the run must
                // not hide the short piece the hour leaves (GA 40455-5014 2:30 555-0142).
                val split = pieces.flatMap { p ->
                    val out = mutableListOf(mutableListOf<Int>())
                    for (i in p) {
                        if (out.last().isNotEmpty() && (i - 1) in glued) out += mutableListOf<Int>()
                        out.last() += i
                    }
                    out
                }
                if (short(pieces) || short(pieces(start, k, found)) || short(split)) {
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
     * The parts that are search information, found on the text as it is, as three sets: every span found, the spans
     * kept once a time joined to other digits is dropped, and the hour of each dropped time (which joins its minutes). Spans: a written date (three groups joined by one
     * / - . or dash that read as a date, with no digits joined to it by its own separator), a time (14:03), a
     * coordinate pair in range (33.7490, -84.3880), a ZIP+4 code after a state (GA 30301-1234) and a month-name date
     * (Nov 19 2026, 19 November 2026). A number with a unit (5km) is not one: glued to the last group of a phone number
     * it would shield those digits. Nor is a grouped count of seven or more digits (1,234,567), which can be a phone
     * number written with thousands commas; a shorter count (12,345) never reaches seven digits, so it stays.
     */
    private fun searchSpans(s: String, parts: List<Part>): Triple<Set<Int>, Set<Int>, Set<Int>> {
        fun gap(a: Int, b: Int) = s.substring(parts[a].end, parts[b].start)
        // Length in UTF-16 units: a digit outside the BMP counts twice, so such digits never read as a day, a year or a
        // ZIP code, and stay in the run (removing more is the safe side).
        fun len(i: Int) = parts[i].end - parts[i].start
        fun text(i: Int) = s.substring(parts[i].start, parts[i].end)
        fun value(i: Int): Int? = text(i).takeIf { t -> t.all { it in '0'..'9' } }?.toIntOrNull()
        fun ascii(i: Int) = text(i).all { it in '0'..'9' }
        fun written(i: Int) = i in parts.indices && parts[i].written
        fun isDay(i: Int) = written(i) && len(i) <= 2 && (value(i) ?: 0) in 1..31
        fun isYear(i: Int) = written(i) && len(i) == 4 && (value(i) ?: 0) in 1900..2100
        fun degrees(whole: Int, frac: Int, max: Int): Boolean {
            // 4 to 7 decimals: 8 after a 2-digit area code is a Mexican number (33.12345678).
            if (!written(whole) || !written(frac) || gap(whole, frac) != "." || len(whole) > 3 || len(frac) !in 4..7) return false
            // Whole degrees never start with a zero (0.1276 is fine, 020.79460958 is a London number).
            if (text(whole).length > 1 && text(whole).startsWith("0")) return false
            val v = "${text(whole)}.${text(frac)}".toDoubleOrNull() ?: return false
            return v <= max
        }
        // A phone cue just before part i: a "#" in the gap before it, or a cue word right before it (only spaces or a colon
        // between), or with one connector word between (Call: 33.1234, -84.5678; Llame al 33.1234, -84.5678). A cue further
        // back names a thing, not a number to dial: "Phone found at 33.7866, -84.3733" is a clue's place and stays.
        fun cueBefore(i: Int): Boolean {
            if (s.substring(if (i > 0) parts[i - 1].end else 0, parts[i].start).contains('#')) return true
            fun near(a: Int, b: Int) = CUE_GAP.matches(flat(s.substring(parts[a].end, parts[b].start)))
            fun isWord(j: Int) = j >= 0 && parts[j].digits == 0 && !parts[j].written
            if (isWord(i - 1) && near(i - 1, i) && word(s, parts[i - 1]) in PHONE_CUES) return true
            return isWord(i - 2) && isWord(i - 1) && word(s, parts[i - 1]) in CUE_CONNECTORS && near(i - 2, i - 1) &&
                near(i - 1, i) && word(s, parts[i - 2]) in PHONE_CUES
        }
        val kept = mutableSetOf<Int>()
        // Written dates found below, each as its three parts; two that share a part cancel each other.
        val dates = mutableListOf<IntRange>()
        // Month-name dates (from the first digit part to the last, the month inside) and times (hour, minutes).
        val monthDates = mutableListOf<IntRange>()
        val times = mutableListOf<IntRange>()
        // The whole part of each radio frequency candidate (its fraction is the next part).
        val frequencies = mutableSetOf<Int>()
        for (i in parts.indices) {
            if (!parts[i].written) {
                if (word(s, parts[i]) !in MONTHS) continue
                if (isDay(i + 1) && MONTH_DAY_GAP.matches(flat(gap(i, i + 1)))) {
                    monthDates += (i + 1)..(if (isYear(i + 2) && YEAR_GAP.matches(flat(gap(i + 1, i + 2)))) i + 2 else i + 1)
                } else if (isDay(i - 1) && DAY_MONTH_GAP.matches(flat(gap(i - 1, i)))) {
                    monthDates += (i - 1)..(if (isYear(i + 1) && YEAR_GAP.matches(flat(gap(i, i + 1)))) i + 1 else i - 1)
                }
                continue
            }
            if (i + 2 < parts.size && written(i + 1) && written(i + 2) && isDate(s, parts[i], parts[i + 1], parts[i + 2]) &&
                !sameSeparatorNeighbour(s, parts, i, i + 2)
            ) {
                dates += i..(i + 2)
            }
            // A month and day with a slash (11/19 or 19/11), with no other slash group on either side.
            if (written(i + 1) && gap(i, i + 1) == "/" && len(i) <= 2 && len(i + 1) <= 2 &&
                !(written(i + 2) && gap(i + 1, i + 2) == "/") && !(i > 0 && parts[i - 1].digits > 0 && gap(i - 1, i) == "/")
            ) {
                val (x, y) = (value(i) ?: 0) to (value(i + 1) ?: 0)
                if ((x in 1..12 && y in 1..31) || (x in 1..31 && y in 1..12)) dates += i..(i + 1)
            }
            if (written(i + 1) && gap(i, i + 1) == ":" && len(i) <= 2 && len(i + 1) == 2 && (value(i) ?: 99) <= 23 && (value(i + 1) ?: 99) <= 59) {
                times += i..(i + 1)
            }
            // A "+" right before the first number makes the pair a phone number (+44.2071, -23.4567), not coordinates.
            if (degrees(i, i + 1, 90) && degrees(i + 2, i + 3, 180) && COORDINATE_GAP.matches(flat(gap(i + 1, i + 2), keepIndent = true)) &&
                !(parts[i].start > 0 && s[parts[i].start - 1] == '+') && !cueBefore(i)
            ) {
                kept += i..(i + 3)
            }
            // A radio frequency candidate (146.520, 155.160): 25 to 999 MHz with no leading zero, a full stop, exactly 3
            // digits, not part of a dotted chain (404.555.0142) and not after a "+". Kept below only in a run of frequencies.
            if (written(i + 1) && gap(i, i + 1) == "." && len(i) <= 3 && len(i + 1) == 3 && ascii(i) && ascii(i + 1) &&
                !text(i).startsWith("0") && (value(i) ?: -1) in 25..999 &&
                !(i > 0 && parts[i - 1].digits > 0 && gap(i - 1, i) == ".") && !(written(i + 2) && gap(i + 1, i + 2) == ".") &&
                !(parts[i].start > 0 && s[parts[i].start - 1] == '+')
            ) {
                frequencies += i
            }
            if (len(i) == 5 && written(i + 1) && gap(i, i + 1) == "-" && len(i + 1) == 4 && i > 0 && !parts[i - 1].written &&
                text(i - 1) in STATES && gap(i - 1, i) == " "
            ) {
                kept += i..(i + 1)
            }
        }
        // A frequency is search information only in a run made of nothing but frequencies: joined anywhere in its run to
        // other digits (404.555-0142 #123, 404.555 100.142 1234567) it could be part of a phone number, so it goes with the
        // run. Candidates with a joined neighbour outside the set drop out until none does.
        var live: Set<Int> = frequencies
        while (true) {
            val inFrequency = live.flatMap { listOf(it, it + 1) }.toSet()
            val alone = { inside: Int, outside: Int ->
                outside !in parts.indices || outside in inFrequency ||
                    !joins(s, parts[minOf(inside, outside)], parts[maxOf(inside, outside)])
            }
            val next = live.filter { alone(it, it - 1) && alone(it + 1, it + 2) }.toSet()
            if (next.size == live.size) break
            live = next
        }
        for (w in live) kept += w..(w + 1)
        // Dates are found in order, so a date can overlap only the one before or after it in the list.
        val written = dates.filterIndexed { k, d ->
            !(k > 0 && dates[k - 1].last >= d.first) && !(k + 1 < dates.size && dates[k + 1].first <= d.last)
        }
        // Each span with whether it is a time.
        val spans = (written.map { it to false } + monthDates.map { it to false } + times.map { it to true }).toMutableList()
        fun digitsOf(r: IntRange) = r.filter { parts[it].written }
        // Every span found, before any date or time is dropped below.
        val found = kept + spans.flatMap { digitsOf(it.first) }
        // A time joined before its hour to digits that are not search information could be a phone number's last four
        // digits (1 404 555 01:42), so it is dropped and goes with them; a date then a time (11/19/2026 14:03) keep each
        // other. Only the hour's side is checked: the minutes are two digits, and a note says "at 14:03, 404-555-0142".
        // A valid date always stays: when someone was seen is search information, and it leaks nothing once the number
        // beside it is gone.
        // The hour of each time dropped below: it joins its minutes across the colon.
        val glued = mutableSetOf<Int>()
        do {
            // A time keeps its place only after a date's digits: after any other digits (a ZIP+4 code too) it could be a
            // number's last four.
            val inDates = spans.filter { !it.second }.flatMap { digitsOf(it.first) }.toSet()
            // Whether the part [outside] (next to [inside]) joins it and is not part of a date.
            fun joinedOutside(inside: Int, outside: Int) = outside in parts.indices &&
                joins(s, parts[minOf(inside, outside)], parts[maxOf(inside, outside)]) && outside !in inDates
            val drop = spans.filter { (r, isTime) -> isTime && joinedOutside(r.first, r.first - 1) }
            spans.removeAll(drop)
            glued += drop.map { it.first.first }
        } while (drop.isNotEmpty())
        return Triple(found, kept + spans.flatMap { digitsOf(it.first) }, glued)
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
     * What may sit between the parts of one number, read after [flat] (so a line break with its indent counts as one,
     * and an accent or joiner adds nothing). A gap never holds a letter or a digit, since those are parts, so every
     * space, punctuation mark or symbol joins (a middle dot, a bullet, an underscore, a star, a bar or brackets as much
     * as a dash), except ":", "%" and "°", which mark a time, a percent and a degree and keep their numbers apart. A
     * wider gap still joins: a cap would let "404-555 -  0142" split into two short runs.
     */
    private fun onlySeparators(s: String): Boolean = flat(s).none { it in ":%°" }

    /**
     * A gap as read: combining marks (spacing ones too) and format characters dropped (NFKC turns a spacing accent such as ´ into a
     * space and a combining mark; a joiner or a keycap mark is invisible), each line break (CRLF, LF, CR, NEL, or the
     * Unicode line or paragraph separator) with any indent after it made one "\n", and every other space " ". With
     * [keepIndent] the indent stays as spaces (a coordinate pair allows only two spaces around its comma, so a number
     * pasted across indented lines is never read as one).
     */
    private fun flat(gap: String, keepIndent: Boolean = false): String {
        // By code point, so a mark or format character outside the BMP (a tag character) is dropped too.
        val visible = buildString {
            gap.codePoints().forEach { cp ->
                val type = Character.getType(cp).toByte()
                if (type != Character.NON_SPACING_MARK && type != Character.ENCLOSING_MARK && type != Character.COMBINING_SPACING_MARK &&
                    type != Character.FORMAT
                ) {
                    appendCodePoint(cp)
                }
            }
        }
        return (if (keepIndent) BREAK else LINE_BREAK).replace(visible, "\n").map { if (it != '\n' && it.isWhitespace()) ' ' else it }.joinToString("")
    }

    private val BREAK = Regex("""\r\n|\n|\r|\u0085|\u2028|\u2029""")

    private val LINE_BREAK = Regex("""(\r\n|\n|\r|\u0085|\u2028|\u2029)[ \t]*""")
}
