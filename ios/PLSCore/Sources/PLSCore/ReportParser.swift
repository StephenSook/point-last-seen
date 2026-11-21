import Foundation

public struct ParseContext: Sendable, Equatable {
    public var knownSegmentIds: [String]

    public init(knownSegmentIds: [String]) {
        self.knownSegmentIds = knownSegmentIds
    }
}

/// The deterministic parser: the last stage before the pick-list, used when no model may or
/// can read the report. It never invents a segment: only known ids are kept. Coverage is
/// returned as stated (80 stays 80); code normalizes it later.
public enum ReportParser {
    public static let maxLength = 1000
    static let quoteLength = 200

    public static func parse(_ text: String, context: ParseContext) -> ReportReading {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let quote = String(trimmed.prefix(quoteLength))
        guard !trimmed.isEmpty, trimmed.count <= maxLength else { return .unclear(quote: quote) }

        let t = Tokens(trimmed)
        var r = ReportReading.unclear(quote: quote)
        r.kind = kind(t)
        r.segmentIds = segments(t, known: Set(context.knownSegmentIds))
        r.coverage = coverage(t)
        r.minutes = minutes(t)
        r.searchers = searchers(t)
        r.searchType = searchType(t)
        r.method = method(t)
        r.feature = feature(t)
        r.direction = direction(t)
        (r.topColor, r.bottomColor) = colors(t)
        r.footwear = footwear(t)
        r.item = String((r.kind == .clue ? item(t) ?? r.footwear : "").prefix(ReadingValidator.maxItemLength))
        return r
    }

    // MARK: kind

    static let subjectWords: Set<String> = ["him", "her", "them", "subject", "person", "patient"]

    static func kind(_ t: Tokens) -> ReportKind {
        let w = t.lower
        for i in w.indices {
            let next = i + 1 < w.count ? w[i + 1] : "", after = i + 2 < w.count ? w[i + 2] : ""
            if ["found", "located"].contains(w[i]) && (subjectWords.contains(next) || (next == "the" && subjectWords.contains(after))) { return .found }
            if w[i] == "subject" && ["found", "located"].contains(next) { return .found }
        }
        if t.hasAny(["cleared", "clear", "searched", "swept", "completed"]) { return .cleared }
        for i in w.indices where w[i] == "found" && i + 1 < w.count && ["a", "an", "some", "the"].contains(w[i + 1]) { return .clue }
        if t.hasAny(["clue", "item", "track", "tracks", "footprint", "footprints", "prints", "dropped"]) { return .clue }
        if t.hasAny(["saw", "seen", "sighting", "spotted", "sighted", "witness"]) { return .sighting }
        return .unclear
    }

    // MARK: segments

    static let segmentKeywords: Set<String> = ["segment", "sector", "cell", "area", "grid", "seg"]
    /// Two-letter English words that can follow "segment" without naming one ("the segment by the creek").
    static let commonTwoLetterWords: Set<String> = ["am", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is", "it",
                                                    "me", "my", "no", "of", "oh", "ok", "on", "or", "so", "to", "up", "us", "we"]

    /// Segment ids the report names, in text order. A known id counts when written in capitals or
    /// after "segment". An unknown id counts only when it follows "segment" (and is not a common
    /// word): it is kept on purpose so validation rejects the reading instead of the clear falling
    /// back to the team's assignment.
    static func segments(_ t: Tokens, known: Set<String>) -> [String] {
        var out: [String] = []
        func add(_ id: String) { if !out.contains(id) { out.append(id) } }
        for i in t.original.indices {
            let o = t.original[i]
            if o.count == 2, o.allSatisfy({ $0.isUppercase && $0.isLetter }), known.contains(o) { add(o); continue }
            guard segmentKeywords.contains(t.lower[i]), i + 1 < t.lower.count else { continue }
            let next = t.lower[i + 1]
            var id: String?
            if next.count == 2, next.allSatisfy(\.isLetter) {
                id = next.uppercased()
            } else if next.count == 1, i + 2 < t.lower.count, t.lower[i + 2].count == 1, (next + t.lower[i + 2]).allSatisfy(\.isLetter) {
                id = (next + t.lower[i + 2]).uppercased()
            }
            guard let id else { continue }
            if known.contains(id) || !commonTwoLetterWords.contains(id.lowercased()) { add(id) }
        }
        return out
    }

    // MARK: numbers

    static let filler: Set<String> = ["of", "at", "is", "was", "about", "around", "roughly", "approximately", "maybe", "estimated", "near", "like"]
    static let percentWords: Set<String> = ["percent", "%", "pct", "per"]

    /// Coverage as stated (80 stays 80, and code normalizes it later), except a stated percent of 3 or less, which is
    /// made a ratio here: normalizing reads a bare value up to 3 as a ratio, so "coverage 1%" would become 100%.
    static func coverage(_ t: Tokens) -> Double? {
        guard let k = t.lower.firstIndex(of: "coverage") else { return nil }
        var j = k + 1
        while j < t.lower.count, filler.contains(t.lower[j]) { j += 1 }
        if let (v, n) = NumberWords.parse(t.lower, at: j) {
            return percentAfter(t.lower, at: j + n) ? Self.percent(v) : v
        }
        if k >= 1, percentWords.contains(t.lower[k - 1]), let v = NumberWords.parse(t.lower, endingBefore: k - 1) { return Self.percent(v) }
        if let v = NumberWords.parse(t.lower, endingBefore: k) { return v }
        return nil
    }

    /// A stated percent: kept as stated above 3 (normalizing divides it by 100), made a ratio at 3 or less.
    static func percent(_ v: Double) -> Double { v > 3 ? v : v / 100 }

    /// Whether a percent follows at `i`: "percent", "%", "pct" or "per cent", never "per" alone ("1 per the lead").
    static func percentAfter(_ w: [String], at i: Int) -> Bool {
        guard i < w.count else { return false }
        if ["percent", "%", "pct"].contains(w[i]) { return true }
        return w[i] == "per" && i + 1 < w.count && w[i + 1] == "cent"
    }

    static func minutes(_ t: Tokens) -> Double? {
        let w = t.lower
        var whenUnit = -2                                   // the unit word of the last time phrase that said when
        for i in w.indices {
            let found: (minutes: Double, start: Int)?
            if ["minutes", "minute", "mins", "min"].contains(w[i]) {
                found = NumberWords.span(w, endingBefore: i).map { ($0.value, $0.start) }
            } else if ["hours", "hour", "hrs", "hr"].contains(w[i]) {
                if i >= 1, ["an", "a"].contains(w[i - 1]) {
                    found = i >= 2 && w[i - 2] == "half" ? (30, i - 2) : (60, i - 1)
                } else {
                    found = NumberWords.span(w, endingBefore: i).map { ($0.value * 60, $0.start) }
                }
            } else {
                continue
            }
            guard let (m, start) = found else { continue }
            // "In 1 hour and 30 minutes": a unit joined by "and" belongs to the phrase before it.
            let joined = start >= 2 && w[start - 1] == "and" && start - 2 == whenUnit
            if joined || whenNotHowLong(w, before: start) { whenUnit = i; continue }
            return m
        }
        return nil
    }

    static let whenWords: Set<String> = ["every", "next", "until", "till"]
    /// Words that, a little before "in", say what happens next ("radio check in 30 minutes", "back in an hour").
    static let nextCues: Set<String> = ["next", "check", "back", "again", "will", "return", "returning", "report", "update", "regroup"]

    /// True when the words just before a time say when something happens ("every 2 hours", "check in 30 minutes"),
    /// not how long the team searched ("cleared AE in 45 minutes").
    static func whenNotHowLong(_ w: [String], before start: Int) -> Bool {
        var k = start - 1
        while k >= 0, filler.contains(w[k]) { k -= 1 }
        guard k >= 0 else { return false }
        if whenWords.contains(w[k]) { return true }
        return w[k] == "in" && w[max(0, k - 4)..<k].contains(where: nextCues.contains)
    }

    /// Minutes before now for "20 minutes ago", "an hour ago" or "two hours ago"; nil otherwise.
    public static func minutesAgo(_ text: String) -> Double? {
        let w = Tokens(text).lower
        guard let ago = w.firstIndex(of: "ago"), ago >= 2 else { return nil }
        let unit = w[ago - 1]
        // Never negative, so a sighting is never put after the report.
        if ["minutes", "minute", "mins", "min"].contains(unit) { return NumberWords.parse(w, endingBefore: ago - 1).flatMap { $0 >= 0 ? $0 : nil } }
        if ["hours", "hour", "hrs", "hr"].contains(unit) {
            if ["an", "a"].contains(w[ago - 2]) { return ago >= 3 && w[ago - 3] == "half" ? 30 : 60 }
            return NumberWords.parse(w, endingBefore: ago - 1).flatMap { $0 >= 0 ? $0 * 60 : nil }
        }
        return nil
    }

    static func searchers(_ t: Tokens) -> Double? {
        let w = t.lower
        for i in w.indices {
            if ["searchers", "searcher", "people", "persons", "members"].contains(w[i]), let v = NumberWords.parse(w, endingBefore: i) { return v }
            if w[i] == "of", i + 1 < w.count, w[i + 1] == "us", let v = NumberWords.parse(w, endingBefore: i) { return v }
            if w[i] == "team", i + 1 < w.count, w[i + 1] == "of", let (v, _) = NumberWords.parse(w, at: i + 2) { return v }
        }
        return nil
    }

    // MARK: words

    static func searchType(_ t: Tokens) -> SearchType {
        if t.hasAny(["hasty"]) { return .hasty }
        if t.hasAny(["sweep", "swept"]) || t.hasPhrase(["grid", "search"]) || t.hasPhrase(["line", "search"]) { return .sweep }
        return .unknown
    }

    static let soundWords: Set<String> = ["called", "calling", "calls", "shouted", "shouting", "yelled", "yelling", "whistle", "whistled", "voice", "listened", "listening"]
    static let visualWords: Set<String> = ["looked", "looking", "visual", "visually", "eyes", "checked", "inspected", "scanned", "flashlight"]
    static let negations: Set<String> = ["no", "not", "without", "never", "didn't", "didnt", "nobody"]

    /// How the team searched. A method word right after a negation word ("no visual search") does not
    /// count, and "only" or "just" next to a sound word ("calling only") makes it sound only, so
    /// a sound-only clear is never counted as a visual one.
    static func method(_ t: Tokens) -> SearchMethod {
        let w = t.lower
        func negated(_ i: Int) -> Bool { i > 0 && negations.contains(w[i - 1]) }
        var sound = false, visual = false, soundOnly = false
        for i in w.indices {
            if soundWords.contains(w[i]), !negated(i) {
                sound = true
                let near = [i - 1, i + 1].filter { w.indices.contains($0) }.map { w[$0] }
                if near.contains("only") || near.contains("just") { soundOnly = true }
            }
            if visualWords.contains(w[i]), !negated(i) { visual = true }
        }
        if soundOnly { return .sound }
        switch (sound, visual) {
        case (true, true): return .both
        case (true, false): return .sound
        case (false, true): return .visual
        case (false, false): return .unknown
        }
    }

    static let features: [(Feature, Set<String>)] = [
        (.creekOrDrainage, ["creek", "stream", "drainage", "ditch", "gully", "brook", "culvert", "creekbed"]),
        (.water, ["pond", "lake", "river", "water", "swamp", "marsh"]),
        (.road, ["road", "street", "highway", "driveway"]),
        (.trail, ["trail", "path", "footpath"]),
        (.structure, ["house", "shed", "barn", "building", "structure", "cabin", "garage"]),
        (.brush, ["brush", "bushes", "bush", "thicket", "briars"]),
        (.woods, ["woods", "forest", "trees", "treeline"]),
        (.field, ["field", "meadow", "pasture", "clearing"])
    ]

    static func feature(_ t: Tokens) -> Feature {
        for w in t.lower { if let f = features.first(where: { $0.1.contains(w) }) { return f.0 } }
        return .none
    }

    static func direction(_ t: Tokens) -> Direction {
        let w = t.lower
        for i in w.indices {
            switch w[i] {
            case "upstream": return .upstream
            case "downstream": return .downstream
            case "northeast": return .ne
            case "northwest": return .nw
            case "southeast": return .se
            case "southwest": return .sw
            case "north", "south":
                let next = i + 1 < w.count ? w[i + 1] : ""
                if next == "east" { return w[i] == "north" ? .ne : .se }
                if next == "west" { return w[i] == "north" ? .nw : .sw }
                return w[i] == "north" ? .n : .s
            case "east": return .e
            case "west": return .w
            default: continue
            }
        }
        return .unknown
    }

    static let colorWords: [String: ClothingColor] = [
        "black": .black, "white": .white, "gray": .gray, "grey": .gray, "brown": .brown, "tan": .tan, "beige": .tan, "khaki": .tan,
        "red": .red, "maroon": .red, "orange": .orange, "yellow": .yellow, "green": .green, "blue": .blue, "navy": .blue,
        "purple": .purple, "pink": .pink
    ]
    static let tops: Set<String> = ["jacket", "coat", "shirt", "sweater", "hoodie", "sweatshirt", "top", "blouse", "vest", "fleece", "cardigan", "robe", "nightgown"]
    static let bottoms: Set<String> = ["pants", "jeans", "trousers", "skirt", "shorts", "slacks", "leggings"]

    static func colors(_ t: Tokens) -> (ClothingColor, ClothingColor) {
        var top = ClothingColor.unknown, bottom = ClothingColor.unknown
        let w = t.lower
        for i in w.indices {
            guard let c = colorWords[w[i]] else { continue }
            for j in (i + 1)..<min(w.count, i + 3) {
                if tops.contains(w[j]), top == .unknown { top = c; break }
                if bottoms.contains(w[j]), bottom == .unknown { bottom = c; break }
            }
        }
        return (top, bottom)
    }

    static let footwearWords: Set<String> = ["slipper", "slippers", "shoe", "shoes", "boot", "boots", "sneaker", "sneakers", "sandal", "sandals"]

    static func footwear(_ t: Tokens) -> String {
        guard let w = t.lower.first(where: footwearWords.contains) else { return "" }
        return w.hasSuffix("s") ? String(w.dropLast()) : w
    }

    static let stopWords: Set<String> = ["by", "near", "in", "on", "at", "under", "next", "beside", "and", "with", "from", "to", "of", "heading", "close"]

    static func item(_ t: Tokens) -> String? {
        let w = t.lower
        for i in w.indices where w[i] == "found" && i + 1 < w.count && ["a", "an", "some", "the"].contains(w[i + 1]) {
            var words: [String] = []
            var j = i + 2
            while j < w.count, words.count < 3, !stopWords.contains(w[j]), w[j].first?.isLetter == true { words.append(w[j]); j += 1 }
            if !words.isEmpty { return words.joined(separator: " ") }
        }
        return nil
    }
}

/// Words, numbers and "%" from a report, in order, with the original spelling kept.
struct Tokens {
    let original: [String]
    let lower: [String]

    init(_ text: String) {
        var out: [String] = []
        var current = ""
        // A minus sign pasted as U+2212 is the same sign, so a negative number stays negative.
        let chars = Array(text).map { $0 == "\u{2212}" ? "-" : $0 }
        func flush() { if !current.isEmpty { out.append(current); current = "" } }
        for (i, ch) in chars.enumerated() {
            if ch.isLetter || ch.isNumber {
                current.append(ch)
            } else if ch == ".", current.first?.isNumber == true || current.first == "-", i + 1 < chars.count, chars[i + 1].isNumber {
                current.append(ch)                        // keep 0.8 together
            } else if ch == ".", current.isEmpty, i + 1 < chars.count, chars[i + 1].isNumber,
                      i == 0 || !(chars[i - 1].isLetter || chars[i - 1].isNumber) {
                current.append(ch)                        // ".7" is 0.7, never 7
            } else if ch == "-", current.isEmpty, i + 1 < chars.count,
                      chars[i + 1].isNumber || (chars[i + 1] == "." && i + 2 < chars.count && chars[i + 2].isNumber),
                      i == 0 || !(chars[i - 1].isLetter || chars[i - 1].isNumber) {
                current.append(ch)                        // a sign, so -0.8 and -.8 stay negative and are rejected
            } else {
                flush()
                if ch == "%" { out.append("%") }
            }
        }
        flush()
        original = out
        lower = out.map { $0.lowercased() }
    }

    func hasAny(_ words: Set<String>) -> Bool { lower.contains(where: words.contains) }

    func hasPhrase(_ phrase: [String]) -> Bool {
        guard phrase.count <= lower.count else { return false }
        return (0...(lower.count - phrase.count)).contains { Array(lower[$0..<($0 + phrase.count)]) == phrase }
    }
}

/// Numbers as digits ("0.8", "45") or as dictated words ("point eight", "forty five", "one point five").
enum NumberWords {
    static let units: [String: Double] = [
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
        "seventeen": 17, "eighteen": 18, "nineteen": 19
    ]
    static let tens: [String: Double] = ["twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90]
    static let digits: [String: Double] = ["zero": 0, "oh": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9]

    /// Parses a number that starts at `i`; returns the value and how many tokens it used.
    static func parse(_ w: [String], at i: Int) -> (Double, Int)? {
        guard i < w.count else { return nil }
        if let v = Double(w[i]), Self.isNumeral(w[i]) { return (v, 1) }
        var j = i
        var whole: Double?
        if let t = tens[w[j]] {
            whole = t; j += 1
            if j < w.count, let u = units[w[j]], u < 10 { whole! += u; j += 1 }
        } else if let u = units[w[j]] {
            whole = u; j += 1
        }
        if j < w.count, w[j] == "hundred", let h = whole { whole = h * 100; j += 1 }
        if j < w.count, w[j] == "point" {
            var frac = "", k = j + 1
            while k < w.count, let d = digits[w[k]] { frac += String(Int(d)); k += 1 }
            if !frac.isEmpty, let f = Double("0." + frac) { return ((whole ?? 0) + f, k - i) }
        }
        guard let whole else { return nil }
        return (whole, j - i)
    }

    /// Parses the longest number phrase that ends just before index `end`.
    static func parse(_ w: [String], endingBefore end: Int) -> Double? {
        span(w, endingBefore: end)?.value
    }

    /// The longest number phrase that ends just before index `end`, and the index it starts at.
    static func span(_ w: [String], endingBefore end: Int) -> (value: Double, start: Int)? {
        guard end >= 1 else { return nil }
        for start in max(0, end - 5)..<end {
            if let (v, n) = parse(w, at: start), start + n == end { return (v, start) }
        }
        return nil
    }

    /// A token written with digits: "7", "0.8", ".7", "-0.8" or "-.7".
    static func isNumeral(_ token: String) -> Bool {
        var rest = Substring(token)
        if rest.first == "-" { rest = rest.dropFirst() }
        if rest.first == "." { rest = rest.dropFirst() }
        return rest.first?.isNumber == true
    }
}
