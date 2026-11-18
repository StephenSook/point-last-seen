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
        // A model may copy known ids it saw in a tool's output. Drop a known id the report
        // never names (by the parser's rule: capital letters, or after "segment"); with none
        // left and none named, the effect falls back to the team's assignment. An unknown id
        // is kept so the validator rejects the reading.
        let gridIds = Set(context.effect.segments.keys)
        let namedInText = ReportParser.segments(Tokens(rawText), known: gridIds)
        let named = Set(namedInText)
        reading.segmentIds = reading.segmentIds.filter { context.effect.segments[$0] == nil || named.contains($0) }
        // An unknown id the report itself names ("segment ZZ") is added back, so the reading is
        // rejected rather than the clear landing on the team's assignment.
        for id in namedInText where !gridIds.contains(id) && !reading.segmentIds.contains(id) { reading.segmentIds.append(id) }
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

/// A caller's or searcher's phone number is never stored (spec section 12.2). Any run of 7
/// or more digits (any script, with short separators or an optional +country code) and any
/// run of 7 or more spoken digit words is replaced. Report numbers (coverage, minutes,
/// searchers) are far shorter, so they stay.
public enum PhoneNumbers {
    public static let replacement = "[number removed]"
    static let digitRun = try! NSRegularExpression(pattern: #"\+?\(?\d(?:[\s.\-()]{0,2}\d){6,}"#)
    static let digitWords: Set<String> = ["zero", "oh", "o", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]

    public static func scrub(_ text: String) -> String {
        let folded = text.precomposedStringWithCompatibilityMapping          // full-width digits become ASCII
        let range = NSRange(folded.startIndex..., in: folded)
        return scrubSpoken(digitRun.stringByReplacingMatches(in: folded, range: range, withTemplate: replacement))
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

    static func scrubSpoken(_ text: String) -> String {
        // Walk words with their ranges; replace any run of 7+ digit words with one marker.
        var ranges: [(Range<String.Index>, Bool)] = []
        var i = text.startIndex
        while i < text.endIndex {
            if text[i].isLetter {
                var j = i
                while j < text.endIndex, text[j].isLetter { j = text.index(after: j) }
                ranges.append((i..<j, digitWords.contains(text[i..<j].lowercased())))
                i = j
            } else {
                i = text.index(after: i)
            }
        }
        var out = text
        var k = ranges.count - 1
        while k >= 0 {
            guard ranges[k].1 else { k -= 1; continue }
            var start = k
            while start > 0, ranges[start - 1].1, onlySeparators(text[ranges[start - 1].0.upperBound..<ranges[start].0.lowerBound]) { start -= 1 }
            if k - start + 1 >= 7 { out.replaceSubrange(ranges[start].0.lowerBound..<ranges[k].0.upperBound, with: replacement) }
            k = start - 1
        }
        return out
    }

    static func onlySeparators(_ s: Substring) -> Bool {
        s.allSatisfy { $0 == " " || $0 == "-" || $0 == "," || $0 == "." }
    }
}
