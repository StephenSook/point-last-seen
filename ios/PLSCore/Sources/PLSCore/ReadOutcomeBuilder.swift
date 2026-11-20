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

    public init(reading: ReportReading, route: RouteRecord, validation: ValidationResult, cloudTransport: CloudTransport = .notUsed) {
        self.reading = reading
        self.route = route
        self.validation = validation
        self.cloudTransport = cloudTransport
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
/// 12.2). Seven or more digits in a row are a number: written digits (any script, full-width
/// folded) and spoken digit words count alike, joined only by short separators (at most three
/// spaces or - . , ( ) / or dashes) and with an optional leading + or (. Report numbers (times,
/// minutes, segments, searchers, percents) are far shorter, so they stay, and so does search
/// information made of digits: a written date (when someone was last seen), a time, a coordinate
/// pair, a grouped count and a ZIP+4 code. A number glued to a unit or an ordinal ending (67th,
/// 5km) counts alone. The same rule as the Android app, checked by the shared vectors.
public enum PhoneNumbers {
    public static let replacement = "[number removed]"
    static let digitWords: Set<String> = ["zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
    /// Dashes besides the plain hyphen, as NFKC leaves them: hyphen, non-breaking hyphen, figure, en and
    /// em dash, minus.
    static let dashes: Set<Character> = ["\u{2010}", "\u{2011}", "\u{2012}", "\u{2013}", "\u{2014}", "\u{2212}"]
    static let months: Set<String> = [
        "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july",
        "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
    ]
    /// Endings glued to a number that make it a quantity or an ordinal (67th, 5km, 3pm), never part of a
    /// phone number.
    static let units: Set<String> = [
        "st", "nd", "rd", "th", "am", "pm", "h", "hr", "hrs", "min", "mins", "km", "m", "mi", "ft", "yd", "yds", "mph",
        "kg", "lb", "lbs", "cm", "mm",
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
        protect(s, &parts)
        // A date's three groups count no digits, so they neither make a number nor join one. A date carved
        // out of a longer run is not one: the digits joined to it on each side must be none, or a number of
        // their own.
        var d = 0
        while d + 2 < parts.count {
            if parts[d].written, parts[d + 1].written, parts[d + 2].written,
               isDate(s, parts[d].range, parts[d + 1].range, parts[d + 2].range),
               !(1...6).contains(joinedDigits(s, parts, d, -1)), !(1...6).contains(joinedDigits(s, parts, d + 2, 1)) {
                for g in d...(d + 2) { parts[g].digits = 0 }
                d += 3
            } else {
                d += 1
            }
        }
        // Walk back from the end, so replacing one number never moves the ones before it.
        var out = s
        var k = parts.count - 1
        while k >= 0 {
            guard parts[k].digits > 0 else { k -= 1; continue }
            var start = k
            var total = parts[k].digits
            while start > 0, joins(s, parts[start - 1], parts[start]) {
                start -= 1
                total += parts[start].digits
            }
            if total >= 7 {
                var lower = parts[start].range.lowerBound
                while lower > s.startIndex, "+(".contains(s[s.index(before: lower)]) { lower = s.index(before: lower) }
                out.replaceSubrange(lower..<parts[k].range.upperBound, with: replacement)
            }
            k = start - 1
        }
        return out
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
                var j = i
                while j < s.endIndex, s[j].isLetter { j = s.index(after: j) }
                parts.append(Part(range: i..<j, digits: digitWords.contains(s[i..<j].lowercased()) ? 1 : 0, written: false))
                i = j
            } else {
                i = s.index(after: i)
            }
        }
        return parts
    }

    /// The digits joined by separators to parts[edge] on one side (`step` -1 before it, +1 after it).
    static func joinedDigits(_ s: String, _ parts: [Part], _ edge: Int, _ step: Int) -> Int {
        var total = 0, cur = edge, next = edge + step
        while parts.indices.contains(next) {
            guard step < 0 ? joins(s, parts[next], parts[cur]) : joins(s, parts[cur], parts[next]) else { break }
            total += parts[next].digits
            cur = next
            next += step
        }
        return total
    }

    /// Whether part `a` joins the part `b` right after it into one number.
    static func joins(_ s: String, _ a: Part, _ b: Part) -> Bool {
        a.digits > 0 && b.digits > 0 && !a.alone && !b.alone && onlySeparators(s[a.range.upperBound..<b.range.lowerBound])
    }

    /// Search information made of digits counts no digits, so it neither makes a number nor joins one: a
    /// time (14:03), a coordinate pair (33.7490, -84.3880), a grouped count (1,234,567), a ZIP+4 code
    /// (30301-1234) and a month-name date (Nov 19 2026, 19 November 2026). A number glued to a unit or an
    /// ordinal ending (67th, 5km) counts alone.
    static func protect(_ s: String, _ parts: inout [Part]) {
        var p = parts
        defer { parts = p }
        func gap(_ a: Int, _ b: Int) -> Substring { s[p[a].range.upperBound..<p[b].range.lowerBound] }
        func len(_ i: Int) -> Int { s[p[i].range].count }
        func value(_ i: Int) -> Int? { Int(s[p[i].range]) }                  // ASCII digits only
        func written(_ i: Int) -> Bool { p.indices.contains(i) && p[i].written }
        func word(_ i: Int) -> String { s[p[i].range].lowercased() }
        func zero(_ idx: Int...) { for i in idx { p[i].digits = 0 } }
        func isDay(_ i: Int) -> Bool { written(i) && len(i) <= 2 && (1...31).contains(value(i) ?? 0) }
        func isYear(_ i: Int) -> Bool { written(i) && len(i) == 4 && (1900...2100).contains(value(i) ?? 0) }
        for i in p.indices {
            if !p[i].written {
                guard months.contains(word(i)) else { continue }
                if isDay(i + 1), gapMatches(gap(i, i + 1), [(isDot, 0, 1), (isSpace, 1, 2)]) {
                    zero(i + 1)
                    if isYear(i + 2), gapMatches(gap(i + 1, i + 2), [(isComma, 0, 1), (isSpace, 1, 2)]) { zero(i + 2) }
                } else if isDay(i - 1), gapMatches(gap(i - 1, i), [(isSpace, 1, 2)]) {
                    zero(i - 1)
                    if isYear(i + 1), gapMatches(gap(i, i + 1), [(isComma, 0, 1), (isSpace, 1, 2)]) { zero(i + 1) }
                }
                continue
            }
            if i + 1 < p.count, !p[i + 1].written, p[i + 1].range.lowerBound == p[i].range.upperBound, units.contains(word(i + 1)) {
                p[i].alone = true
            }
            if written(i + 1), gap(i, i + 1) == ":", len(i) <= 2, len(i + 1) == 2, (value(i) ?? 99) <= 23, (value(i + 1) ?? 99) <= 59 {
                zero(i, i + 1)
            }
            if written(i + 1), written(i + 2), written(i + 3), gap(i, i + 1) == ".", gap(i + 2, i + 3) == ".",
               len(i) <= 3, len(i + 2) <= 3, len(i + 1) >= 4, len(i + 3) >= 4,
               gapMatches(gap(i + 1, i + 2), [(isSpace, 0, 2), (isComma, 0, 1), (isSpace, 0, 2), (isHyphen, 0, 1)]) {
                zero(i, i + 1, i + 2, i + 3)
            }
            if len(i) <= 3, i == 0 || gap(i - 1, i) != "," {
                var j = i + 1
                while written(j), gap(j - 1, j) == ",", len(j) == 3 { j += 1 }
                if j - i - 1 >= 2 { for g in i..<j { p[g].digits = 0 } }
            }
            if len(i) == 5, written(i + 1), gap(i, i + 1) == "-", len(i + 1) == 4,
               i == 0 || !joins(s, p[i - 1], p[i]), i + 2 >= p.count || !joins(s, p[i + 1], p[i + 2]) {
                zero(i, i + 1)
            }
        }
    }

    static func isSpace(_ c: Character) -> Bool { c.isWhitespace }
    static func isDot(_ c: Character) -> Bool { c == "." }
    static func isComma(_ c: Character) -> Bool { c == "," }
    static func isHyphen(_ c: Character) -> Bool { c == "-" }

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

    /// Scrubs every string in a JSON tree, so new reading fields are covered without edits.
    public static func scrub(json: JSONValue) -> JSONValue {
        switch json {
        case let .string(s): return .string(scrub(s))
        case let .array(a): return .array(a.map { scrub(json: $0) })
        case let .object(o): return .object(o.mapValues { scrub(json: $0) })
        case .null, .bool, .number: return json
        }
    }

    /// Three written digit groups joined by the same one of / - . that read as a date: year-month-day
    /// (a 4-digit year from 1900 to 2100), or month and day in either order then a 2-digit year or such
    /// a 4-digit year. Each day is 1 to 31 and a month 1 to 12.
    static func isDate(_ s: String, _ a: Range<String.Index>, _ b: Range<String.Index>, _ c: Range<String.Index>) -> Bool {
        let gap1 = s[a.upperBound..<b.lowerBound], gap2 = s[b.upperBound..<c.lowerBound]
        guard gap1.count == 1, gap1 == gap2, let sep = gap1.first, "/-.".contains(sep),
              let x = Int(s[a]), let y = Int(s[b]), let z = Int(s[c]) else { return false }
        let (lx, ly, lz) = (s[a].count, s[b].count, s[c].count)
        let year = 1900...2100, day = 1...31, month = 1...12
        if lx == 4 { return year.contains(x) && ly <= 2 && lz <= 2 && month.contains(y) && day.contains(z) }
        guard lx <= 2, ly <= 2, lz == 2 || (lz == 4 && year.contains(z)) else { return false }
        return day.contains(x) && day.contains(y) && (month.contains(x) || month.contains(y))
    }

    /// What may sit between the parts of one number: at most three spaces or - . , ( ) / or dashes. A
    /// pasted line break (CRLF) is one character, so it counts as one.
    static func onlySeparators(_ s: Substring) -> Bool {
        s.count <= 3 && s.allSatisfy { $0.isWhitespace || "-.,()/".contains($0) || dashes.contains($0) }
    }
}

