import Foundation

/// What happened on the cloud route during one read, so the phone's `networkOnline` can learn
/// from a failed request (spec: a satisfied network path is not enough).
public enum CloudTransport: Sendable, Equatable { case notUsed, succeeded, failed }

/// The result of reading one report: never thrown, always one of these.
public struct ReadOutcome: Sendable, Equatable {
    public var reading: ReportReading
    public var route: RouteRecord
    public var validation: ValidationResult
    public var cloudTransport: CloudTransport
    /// Why each model stage was not used, in order ("guided on_device: invalid quote_not_in_text",
    /// "guided on_device: timed out after 20 s", "permissive on_device: unparsed"); empty when the first
    /// stage answered. Kept with the read for the route check; never stored in the event.
    public var stageNotes: [String]
    /// Set when a model's "found" was read as a clue (the found-kind rule): the reason the receipt shows.
    public var foundKindReason: String?

    public init(reading: ReportReading, route: RouteRecord, validation: ValidationResult, cloudTransport: CloudTransport = .notUsed,
                stageNotes: [String] = [], foundKindReason: String? = nil) {
        self.reading = reading
        self.route = route
        self.validation = validation
        self.cloudTransport = cloudTransport
        self.stageNotes = stageNotes
        self.foundKindReason = foundKindReason
    }
}

/// Who is writing, and what the engine needs, for one report.
public struct OutcomeContext: Sendable, Equatable {
    public var incidentId: String
    public var teamId: String?
    public var deviceId: String
    public var authorUid: String
    public var priorVersion: Int
    public var clientTimeMs: Double
    public var inputMethod: InputMethod
    public var isTrainingInject: Bool
    public var grid: [GridSegment]
    /// Segments, assignment and detection range; the builder fills in the position.
    public var effect: EffectContext
    public var params: EngineParams
    /// When the thing was seen, from the app's time picker; nil when the person gave none.
    public var observedAtMs: Double?

    public init(incidentId: String, teamId: String?, deviceId: String, authorUid: String, priorVersion: Int, clientTimeMs: Double,
                inputMethod: InputMethod, isTrainingInject: Bool, grid: [GridSegment], effect: EffectContext, params: EngineParams,
                observedAtMs: Double? = nil) {
        self.incidentId = incidentId
        self.teamId = teamId
        self.deviceId = deviceId
        self.authorUid = authorUid
        self.priorVersion = priorVersion
        self.clientTimeMs = clientTimeMs
        self.inputMethod = inputMethod
        self.isTrainingInject = isTrainingInject
        self.grid = grid
        self.effect = effect
        self.params = params
        self.observedAtMs = observedAtMs
    }
}

/// Turns a read into the one append-only event the phone writes. Code normalizes coverage,
/// validates the reading and derives the effect; an invalid reading changes nothing.
public enum ReadOutcomeBuilder {
    public static func event(from outcome: ReadOutcome, rawText: String, position: Position?, context: OutcomeContext, seq: Int) -> EventDoc {
        var ctx = context.effect
        ctx.position = position
        ctx.positionSegmentId = position.flatMap { Geo.segment(containing: $0, in: context.grid) }

        var reading = outcome.reading
        // Segment ids come from code, never the model (`SegmentChoice`): the ids the report
        // names, else the segment under this fix; with neither, the effect falls back to the
        // team's assignment. An unknown id the report names is kept so the validator rejects it.
        if outcome.route.stage != .picklist {
            reading.segmentIds = SegmentChoice.ids(rawText: rawText, known: Array(context.effect.segments.keys),
                                                   positionSegmentId: ctx.positionSegmentId)
        }
        let effect: Effect
        var storedReading: ReportReading? = reading
        if outcome.route.stage == .evidenceProtocol {
            effect = .none(why: .needsCommand)                      // plain text for command, no model
            storedReading = nil
        } else {
            switch SearchMath.normalizeCoverage(reading.coverage) {
            case .invalid:
                effect = .none(why: .invalid)
            case let .ratio(c):
                reading.coverage = c
                storedReading = reading
                effect = derive(reading, rawText: rawText, ctx: ctx, params: context.params)
            case .none:
                effect = derive(reading, rawText: rawText, ctx: ctx, params: context.params)
            }
        }

        let type: EventType
        switch outcome.reading.kind {
        case .cleared: type = .cleared
        case .clue, .unclear: type = .clue
        case .sighting: type = .sighting
        case .found: type = .found
        }
        let source: PositionSource = position != nil ? .gps : (ctx.assignedSegmentIds.isEmpty ? .none : .assignedSegment)

        return EventDoc(
            eventId: EventID.make(incidentId: context.incidentId, deviceId: context.deviceId, seq: seq),
            schemaVersion: 1, incidentId: context.incidentId, teamId: context.teamId, deviceId: context.deviceId, seq: seq,
            authorUid: context.authorUid, role: .searcher, type: type, reporter: .searcher, clientTimeMs: context.clientTimeMs,
            serverTime: nil, observedAtMs: type == .sighting ? observedAt(rawText, context) : nil, position: position, positionSource: source,
            rawText: capped(PhoneNumbers.scrub(rawText)), inputMethod: context.inputMethod, isTrainingInject: context.isTrainingInject,
            reading: storedReading.flatMap { try? JSONValue(encoding: $0) }.map { PhoneNumbers.scrub(json: $0) }, effect: effect, route: outcome.route,
            targetEventId: nil, decision: nil, planVersion: nil, priorVersion: context.priorVersion)
    }

    /// The create rule allows `rawText` of at most 2,000; 2,000 UTF-8 bytes is at or under 2,000
    /// in any unit the rule may count, so the server never refuses a report for its length.
    public static let maxRawTextBytes = 2_000

    /// Cuts at a character boundary so the stored text stays valid.
    public static func capped(_ text: String) -> String {
        guard text.utf8.count > maxRawTextBytes else { return text }
        var out = "", bytes = 0
        for ch in text {
            let n = String(ch).utf8.count
            if bytes + n > maxRawTextBytes { break }
            out.append(ch); bytes += n
        }
        return out
    }

    public enum RetractionError: Error, Equatable { case notTheAuthor }

    /// The undo window on the echo card.
    public static let undoWindowMs: Double = 5_000

    public static func canUndo(sentAtMs: Double, nowMs: Double) -> Bool {
        nowMs - sentAtMs <= undoWindowMs
    }

    /// Undo is a new `retraction` event that targets the report (events are never edited).
    /// A searcher may retract only its own events.
    public static func retraction(of target: EventDoc, authorUid: String, deviceId: String, seq: Int, clientTimeMs: Double) throws -> EventDoc {
        guard target.authorUid == authorUid else { throw RetractionError.notTheAuthor }
        return EventDoc(
            eventId: EventID.make(incidentId: target.incidentId, deviceId: deviceId, seq: seq), schemaVersion: 1,
            incidentId: target.incidentId, teamId: target.teamId, deviceId: deviceId, seq: seq, authorUid: authorUid,
            role: .searcher, type: .retraction, reporter: .searcher, clientTimeMs: clientTimeMs, serverTime: nil,
            observedAtMs: nil, position: nil, positionSource: .none, rawText: nil, inputMethod: .system,
            isTrainingInject: target.isTrainingInject, reading: nil, effect: .none(why: .informational), route: nil,
            targetEventId: target.eventId, decision: nil, planVersion: nil, priorVersion: target.priorVersion)
    }

    /// When a sighting was seen: the time picked in the app, else "N minutes ago" or "an hour
    /// ago" in the report, else nil so the app asks. Never the time the report was sent.
    static func observedAt(_ rawText: String, _ context: OutcomeContext) -> Double? {
        if let picked = context.observedAtMs { return picked }
        return ReportParser.minutesAgo(rawText).map { context.clientTimeMs - $0 * 60_000 }
    }

    static func derive(_ reading: ReportReading, rawText: String, ctx: EffectContext, params: EngineParams) -> Effect {
        guard ReadingValidator.validate(reading, knownSegmentIds: Array(ctx.segments.keys), rawText: rawText).isOK else { return .none(why: .invalid) }
        switch reading.kind {
        case .cleared: return EffectDeriver.cleared(reading: reading, context: ctx, params: params)
        case .clue, .sighting: return EffectDeriver.clue(reading: reading, context: ctx)
        case .found: return .none(why: .informational)
        case .unclear: return .none(why: .needsCommand)
        }
    }
}

/// A caller's or searcher's phone number never reaches a model and is never stored (spec section
/// 12.2). The same rule as the Android app, checked by the shared vectors. Seven or more digits in a
/// row are a number: written digits (any script, full-width folded, Chinese numerals) and spoken digit
/// words count alike ("double" and "triple" count their repeats), joined only by short separators (at
/// most three spaces or - . , ( ) / or a dash; a line break with any indentation counts as one) and
/// with an optional leading + or (. Report numbers (times, minutes, segments, searchers, percents) are
/// far shorter, so they stay.
///
/// Search information made of digits can sit inside such a run: a written date (a month and day with
/// no year included), a time, a coordinate pair in range (not after a "+"), a ZIP+4 code after a state, a month-name date, a number with a
/// unit. It stays only when the rest of the run is nothing or whole numbers of seven or more digits
/// (which are removed); when any other piece of 1 to 6 digits is left beside it, the whole run is
/// removed, since that piece could be part of a number. A time keeps its place only at the start of a
/// run or after a date: joined after other digits it could be a number's last four (1 404 555 01:42), so it
/// goes with the run. A street name (67th Ave: one to three digits, an ordinal ending, a street word)
/// never joins others. A removed run keeps its line breaks.
public enum PhoneNumbers {
    public static let replacement = "[number removed]"
    /// Spoken digits in English and Spanish (matched lower-cased). Not "un" or "una": those are articles.
    static let digitWords: Set<String> = [
        "zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    ]
    /// A spoken repeat before a digit counts the extra digits it stands for: "triple five" is three digits.
    static let repeats: [String: Int] = ["double": 1, "triple": 2]
    /// Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and
    /// em dash, minus.
    static let dashes: Set<Character> = ["\u{2010}", "\u{2011}", "\u{2012}", "\u{2013}", "\u{2014}", "\u{2212}"]
    static let months: Set<String> = [
        "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july",
        "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
    ]
    /// A number with one of these endings, before a street word, is a street name (67th Ave) and never
    /// joins other digits.
    static let ordinals: Set<String> = ["st", "nd", "rd", "th"]
    static let streets: Set<String> = [
        "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard", "dr", "drive", "ln", "lane", "pl", "place", "way",
        "ct", "court", "pkwy", "parkway", "hwy", "highway", "ter", "terrace", "cir", "circle", "sq", "square", "trl", "trail",
    ]
    /// Endings glued to a number that make it a quantity (5km, 3pm).
    static let units: Set<String> = [
        "am", "pm", "h", "hr", "hrs", "min", "mins", "km", "m", "mi", "ft", "yd", "yds", "mph", "kg", "lb", "lbs", "cm", "mm",
    ]
    /// US state and territory codes, in capitals (GA 30301-1234); lower case would match common words.
    static let states: Set<String> = [
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
        "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
        "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "GU", "VI",
    ]

    /// A run of digits (counting its digits) or a word (one if it is a spoken digit, else none). A part
    /// that is `alone` counts by itself and never joins its neighbours.
    struct Part {
        var range: Range<String.Index>
        var digits: Int
        let written: Bool
        var alone = false
    }

    public static func scrub(_ text: String) -> String {
        let s = text.precomposedStringWithCompatibilityMapping          // full-width digits become ASCII
        var parts = parts(s)
        for i in parts.indices.dropLast() {
            guard let extra = repeats[word(s, parts[i])], !parts[i].written, parts[i + 1].digits > 0,
                  onlySeparators(s[parts[i].range.upperBound..<parts[i + 1].range.lowerBound]) else { continue }
            parts[i].digits = extra
        }
        // An ordinal stays apart only as a street name: one to three digits, its ending, then a street word
        // (67th Ave). A longer group, or one with no street word after it, is still part of a number.
        for i in parts.indices where parts[i].written && parts[i].digits <= 3 && i + 2 < parts.count && !parts[i + 1].written
            && parts[i + 1].range.lowerBound == parts[i].range.upperBound && ordinals.contains(word(s, parts[i + 1]))
            && !parts[i + 2].written && streets.contains(word(s, parts[i + 2])) {
            let gap = s[parts[i + 1].range.upperBound..<parts[i + 2].range.lowerBound]
            if !gap.isEmpty, gap.allSatisfy(\.isWhitespace) { parts[i].alone = true }
        }
        let spans = searchSpans(s, parts)
        // Walk back from the end, so replacing one number never moves the ones before it.
        var out = s
        var k = parts.count - 1
        while k >= 0 {
            guard parts[k].digits > 0 else { k -= 1; continue }
            var start = k
            // A dropped time's hour joins its minutes across the colon, so its minutes go with the run too.
            while start > 0, joins(s, parts[start - 1], parts[start]) || spans.glued.contains(start - 1) { start -= 1 }
            if (start...k).reduce(0, { $0 + parts[$1].digits }) >= 7 {
                let outside = pieces(start, k, spans.kept)
                // A short piece seen with every span found, with the spans kept after dropping times, or with
                // each dropped time's colon still a break, takes the whole run: dropping a time must never
                // make the rest of the run look like a whole number (GA 40455-5014 2:30 555-0142).
                func short(_ ps: [[Int]]) -> Bool { ps.contains { (1...6).contains($0.reduce(0) { $0 + parts[$1].digits }) } }
                let split = outside.flatMap { p -> [[Int]] in
                    var groups: [[Int]] = [[]]
                    for i in p {
                        if !groups[groups.count - 1].isEmpty, spans.glued.contains(i - 1) { groups.append([]) }
                        groups[groups.count - 1].append(i)
                    }
                    return groups
                }
                if short(outside) || short(pieces(start, k, spans.found)) || short(split) {
                    replace(&out, s, parts, start, k)
                } else {
                    for piece in outside.reversed() { replace(&out, s, parts, piece.first!, piece.last!) }
                }
            }
            k = start - 1
        }
        return out
    }

    /// The parts of the run start...end outside the search spans, as consecutive pieces.
    static func pieces(_ start: Int, _ end: Int, _ kept: Set<Int>) -> [[Int]] {
        var pieces: [[Int]] = []
        var open = false
        for i in start...end {
            if kept.contains(i) {
                open = false
            } else {
                if !open { pieces.append([]) }
                pieces[pieces.count - 1].append(i)
                open = true
            }
        }
        return pieces
    }

    /// Replaces parts[first...last] (with a leading + or ( when the run starts there), keeping any line breaks.
    static func replace(_ out: inout String, _ s: String, _ parts: [Part], _ first: Int, _ last: Int) {
        var lower = parts[first].range.lowerBound
        while lower > s.startIndex, "+(".contains(s[s.index(before: lower)]) { lower = s.index(before: lower) }
        let upper = parts[last].range.upperBound
        let breaks = s[lower..<upper].filter { $0 == "\n" || $0 == "\r" || $0 == "\r\n" }.count
        out.replaceSubrange(lower..<upper, with: Array(repeating: replacement, count: breaks + 1).joined(separator: "\n"))
    }

    /// Whether part `a` joins the part `b` right after it into one number.
    static func joins(_ s: String, _ a: Part, _ b: Part) -> Bool {
        a.digits > 0 && b.digits > 0 && !a.alone && !b.alone && onlySeparators(s[a.range.upperBound..<b.range.lowerBound])
    }

    static func word(_ s: String, _ p: Part) -> String { s[p.range].lowercased() }

    /// The parts that are search information, found on the text as it is: a written date (three groups
    /// joined by one / - . or dash that read as a date, with no digits joined to it by its own
    /// separator), a time (14:03), a coordinate pair in range (33.7490, -84.3880), a ZIP+4 code after a
    /// state (GA 30301-1234), a month-name date (Nov 19 2026, 19 November 2026) and a number with a unit
    /// (5km). A grouped count is not one of them: with three groups it has seven or more digits, and is
    /// read as a phone number (privacy wins ties). Returned as three sets: every span found, the spans kept
    /// once a time joined before its hour to digits that are not a date is dropped, and the hour of each
    /// dropped time (which joins its minutes).
    static func searchSpans(_ s: String, _ parts: [Part]) -> (found: Set<Int>, kept: Set<Int>, glued: Set<Int>) {
        func gap(_ a: Int, _ b: Int) -> Substring { s[parts[a].range.upperBound..<parts[b].range.lowerBound] }
        func len(_ i: Int) -> Int { s[parts[i].range].count }
        func text(_ i: Int) -> Substring { s[parts[i].range] }
        func value(_ i: Int) -> Int? { Int(text(i)) }                       // ASCII digits only
        func written(_ i: Int) -> Bool { parts.indices.contains(i) && parts[i].written }
        func isDay(_ i: Int) -> Bool { written(i) && len(i) <= 2 && (1...31).contains(value(i) ?? 0) }
        func isYear(_ i: Int) -> Bool { written(i) && len(i) == 4 && (1900...2100).contains(value(i) ?? 0) }
        func degrees(_ whole: Int, _ frac: Int, _ max: Double) -> Bool {
            guard written(whole), written(frac), gap(whole, frac) == ".", len(whole) <= 3, (4...8).contains(len(frac)),
                  Int(text(whole)) != nil, Int(text(frac)) != nil, let v = Double("\(text(whole)).\(text(frac))") else { return false }
            // Whole degrees never start with a zero (0.1276 is fine; 020.79460958 is a London number).
            if len(whole) > 1, text(whole).hasPrefix("0") { return false }
            return v <= max
        }
        var kept = Set<Int>()
        // Radio frequency candidates (146.520), each as its whole part's index; kept below only in a run of frequencies.
        var frequencies: [Int] = []
        // Written dates found below, each as its three parts; two that share a part cancel each other.
        var dates: [ClosedRange<Int>] = []
        // Month-name dates' digits, and times (hour, minutes).
        var monthDates = Set<Int>()
        var times: [ClosedRange<Int>] = []
        for i in parts.indices {
            if !parts[i].written {
                guard months.contains(word(s, parts[i])) else { continue }
                if isDay(i + 1), gapMatches(gap(i, i + 1), [(isDot, 0, 1), (isSpace, 1, 2)]) {
                    monthDates.insert(i + 1)
                    if isYear(i + 2), gapMatches(gap(i + 1, i + 2), [(isComma, 0, 1), (isSpace, 1, 2)]) { monthDates.insert(i + 2) }
                } else if isDay(i - 1), gapMatches(gap(i - 1, i), [(isSpace, 1, 2)]) {
                    monthDates.insert(i - 1)
                    if isYear(i + 1), gapMatches(gap(i, i + 1), [(isComma, 0, 1), (isSpace, 1, 2)]) { monthDates.insert(i + 1) }
                }
                continue
            }
            if i + 2 < parts.count, written(i + 1), written(i + 2), isDate(s, parts[i].range, parts[i + 1].range, parts[i + 2].range),
               !sameSeparatorNeighbour(s, parts, i, i + 2) {
                dates.append(i...(i + 2))
            }
            // A month and day with no year (11/19, or 19/11), joined by a slash.
            if written(i + 1), gap(i, i + 1) == "/", len(i) <= 2, len(i + 1) <= 2, let x = value(i), let y = value(i + 1),
               (1...31).contains(x), (1...31).contains(y), (1...12).contains(x) || (1...12).contains(y),
               !sameSeparatorNeighbour(s, parts, i, i + 1) {
                dates.append(i...(i + 1))
            }
            // A quantity has fewer than seven digits; seven or more with a unit glued on is still a number.
            if i + 1 < parts.count, !parts[i + 1].written, parts[i + 1].range.lowerBound == parts[i].range.upperBound,
               units.contains(word(s, parts[i + 1])), parts[i].digits < 7 {
                kept.insert(i)
            }
            if written(i + 1), gap(i, i + 1) == ":", len(i) <= 2, len(i + 1) == 2, (value(i) ?? 99) <= 23, (value(i + 1) ?? 99) <= 59 {
                times.append(i...(i + 1))
            }
            // A decimal pair after a "+" is an international number, not a coordinate.
            let plus = parts[i].range.lowerBound > s.startIndex && s[s.index(before: parts[i].range.lowerBound)] == "+"
            if !plus, degrees(i, i + 1, 90), degrees(i + 2, i + 3, 180), coordinateGap(gap(i + 1, i + 2)) {
                kept.formUnion(i...(i + 3))
            }
            // A radio frequency candidate (146.520, 155.160): 25 to 999 MHz with no leading zero, a full stop, exactly 3
            // digits, not part of a dotted chain (404.555.0142) and not after a "+".
            if !plus, written(i + 1), gap(i, i + 1) == ".", len(i) <= 3, len(i + 1) == 3, let mhz = value(i), value(i + 1) != nil,
               !text(i).hasPrefix("0"), (25...999).contains(mhz),
               !(i > 0 && parts[i - 1].digits > 0 && gap(i - 1, i) == "."), !(written(i + 2) && gap(i + 1, i + 2) == ".") {
                frequencies.append(i)
            }
            if len(i) == 5, written(i + 1), gap(i, i + 1) == "-", len(i + 1) == 4, i > 0, !parts[i - 1].written,
               states.contains(String(text(i - 1))), gap(i - 1, i) == " " {
                kept.formUnion([i, i + 1])
            }
        }
        // A frequency is search information only in a run made of nothing but frequencies: joined anywhere in its run to
        // other digits (404.555-0142 #123) it could be part of a phone number, so it goes with the run. Candidates with a
        // joined neighbour outside the set drop out until none does.
        var liveFrequencies = frequencies
        while true {
            let inFrequency = Set(liveFrequencies.flatMap { [$0, $0 + 1] })
            func alone(_ inside: Int, _ outside: Int) -> Bool {
                outside < 0 || outside >= parts.count || inFrequency.contains(outside)
                    || !joins(s, parts[min(inside, outside)], parts[max(inside, outside)])
            }
            let next = liveFrequencies.filter { alone($0, $0 - 1) && alone($0 + 1, $0 + 2) }
            if next.count == liveFrequencies.count { break }
            liveFrequencies = next
        }
        for i in liveFrequencies { kept.formUnion([i, i + 1]) }
        var inDates = monthDates
        for d in dates where !dates.contains(where: { $0 != d && $0.overlaps(d) }) { inDates.formUnion(d) }
        let found = kept.union(inDates).union(times.flatMap { Array($0) })
        // A time keeps its place only after a date's digits (or at the start of a run): joined before its hour
        // to any other digits (a ZIP+4 code too) it could be a number's last four, so it is dropped and its
        // hour joins its minutes. Only the hour's side is checked: "at 14:03, 404-555-0142" keeps its time.
        let dropped = times.filter { r in
            let outside = r.lowerBound - 1
            return outside >= 0 && joins(s, parts[outside], parts[r.lowerBound]) && !inDates.contains(outside)
        }
        let live = times.filter { !dropped.contains($0) }
        return (found, kept.union(inDates).union(live.flatMap { Array($0) }), Set(dropped.map(\.lowerBound)))
    }

    /// Whether digits join the date at parts[first...last] by the date's own separator, on either side.
    static func sameSeparatorNeighbour(_ s: String, _ parts: [Part], _ first: Int, _ last: Int) -> Bool {
        let sep = s[parts[first].range.upperBound..<parts[first + 1].range.lowerBound]
        let before = first > 0 && parts[first - 1].digits > 0 && s[parts[first - 1].range.upperBound..<parts[first].range.lowerBound] == sep
        let after = last + 1 < parts.count && parts[last + 1].digits > 0
            && s[parts[last].range.upperBound..<parts[last + 1].range.lowerBound] == sep
        return before || after
    }

    static func parts(_ s: String) -> [Part] {
        var parts: [Part] = []
        var i = s.startIndex
        while i < s.endIndex {
            if s[i].isWholeNumber {
                var j = i
                while j < s.endIndex, s[j].isWholeNumber { j = s.index(after: j) }
                parts.append(Part(range: i..<j, digits: s.distance(from: i, to: j), written: true))
                i = j
            } else if s[i].isLetter {
                // A word stops at a numeral (a Chinese numeral is a letter too), which is a digit here.
                var j = i
                while j < s.endIndex, s[j].isLetter, !s[j].isWholeNumber { j = s.index(after: j) }
                parts.append(Part(range: i..<j, digits: digitWords.contains(s[i..<j].lowercased()) ? 1 : 0, written: false))
                i = j
            } else {
                i = s.index(after: i)
            }
        }
        return parts
    }

    /// Scrubs every string in a JSON tree, so new reading fields are covered without edits.
    public static func scrub(json: JSONValue) -> JSONValue {
        switch json {
        case let .string(s): return .string(scrub(s))
        case let .array(a): return .array(a.map { scrub(json: $0) })
        case let .object(o): return .object(o.mapValues { scrub(json: $0) })
        case .null, .bool, .number: return json
        }
    }

    /// Three written digit groups joined by the same one of / - . or a dash that read as a date:
    /// year-month-day (a 4-digit year from 1900 to 2100), or month and day in either order then a 2-digit
    /// year or such a 4-digit year. Each day is 1 to 31 and a month 1 to 12.
    static func isDate(_ s: String, _ a: Range<String.Index>, _ b: Range<String.Index>, _ c: Range<String.Index>) -> Bool {
        let gap1 = s[a.upperBound..<b.lowerBound], gap2 = s[b.upperBound..<c.lowerBound]
        guard gap1.count == 1, gap1 == gap2, let sep = gap1.first, "/-.".contains(sep) || dashes.contains(sep),
              let x = Int(s[a]), let y = Int(s[b]), let z = Int(s[c]) else { return false }
        let (lx, ly, lz) = (s[a].count, s[b].count, s[c].count)
        let year = 1900...2100, day = 1...31, month = 1...12
        if lx == 4 { return year.contains(x) && ly <= 2 && lz <= 2 && month.contains(y) && day.contains(z) }
        guard lx <= 2, ly <= 2, lz == 2 || (lz == 4 && year.contains(z)) else { return false }
        return day.contains(x) && day.contains(y) && (month.contains(x) || month.contains(y))
    }

    static func isSpace(_ c: Character) -> Bool { c.isWhitespace }
    static func isDot(_ c: Character) -> Bool { c == "." }
    static func isComma(_ c: Character) -> Bool { c == "," }

    /// A coordinate pair's middle: at most two spaces, then a comma (at most two spaces and an optional
    /// minus after it); or a semicolon, bullet, middle dot, bar or slash with at most two spaces around it and a
    /// minus after it (two decimals across one of those with no minus can be two phone numbers: 020.79460958 /
    /// 020.79460959); or one or two spaces then a minus. A bare minus between two decimals (44.2071-23.4567) is a
    /// dotted number, not a pair.
    static func coordinateGap(_ gap: Substring) -> Bool {
        var rest = gap[...]
        var n = 0
        while n < 2, let c = rest.first, c.isWhitespace { rest = rest.dropFirst(); n += 1 }
        if rest.first == "," {
            rest = rest.dropFirst()
            n = 0
            while n < 2, let c = rest.first, c.isWhitespace { rest = rest.dropFirst(); n += 1 }
            if rest.first == "-" { rest = rest.dropFirst() }
        } else if let c = rest.first, coordinateMarks.contains(c) {
            rest = rest.dropFirst()
            n = 0
            while n < 2, let c = rest.first, c.isWhitespace { rest = rest.dropFirst(); n += 1 }
            guard rest.first == "-" else { return false }
            rest = rest.dropFirst()
        } else if rest.first == "-", n >= 1 {
            rest = rest.dropFirst()
        } else {
            return false
        }
        return rest.isEmpty
    }

    /// Whether a gap is exactly a sequence of character classes, each repeated `min` to `max` times. The
    /// classes next to each other never overlap, so taking each greedily decides it.
    static func gapMatches(_ gap: Substring, _ pattern: [(test: (Character) -> Bool, min: Int, max: Int)]) -> Bool {
        var rest = gap[...]
        for (test, min, max) in pattern {
            var n = 0
            while n < max, let c = rest.first, test(c) { rest = rest.dropFirst(); n += 1 }
            if n < min { return false }
        }
        return rest.isEmpty
    }

    static let coordinateMarks: Set<Character> = [";", "\u{2022}", "\u{00B7}", "|", "/"]

    /// The marks that never join a number: a time (14:03), a percent (45%) and a degree (33.7490°) are search
    /// information. Every other mark joins, so 404|555|0142 and 404;555;0142 are removed; a coordinate pair or a radio
    /// frequency between such marks stays through its own span (searchSpans).
    static let notASeparator: Set<Unicode.Scalar> = [":", "%", "\u{00B0}"]

    /// What may sit between the parts of one number: at most three characters of anything but a mark in
    /// `notASeparator` (a gap holds no letter or digit, since those are parts, so every space, punctuation mark and
    /// symbol joins); a line break (CRLF, LF or CR) with any indentation after it counts as one, as a pasted number
    /// split across lines.
    static func onlySeparators(_ s: Substring) -> Bool {
        var gap: [Character] = []
        var i = s.startIndex
        while i < s.endIndex {
            let c = s[i]
            i = s.index(after: i)
            if c == "\n" || c == "\r" || c == "\r\n" {
                gap.append("\n")
                while i < s.endIndex, s[i] == " " || s[i] == "\t" { i = s.index(after: i) }
            } else {
                gap.append(c)
            }
        }
        return gap.count <= 4 && !gap.contains { $0.unicodeScalars.contains(where: notASeparator.contains) }
    }
}

