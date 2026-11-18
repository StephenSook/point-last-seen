import Foundation

/// The result of reading one report: never thrown, always one of these.
public struct ReadOutcome: Sendable, Equatable {
    public var reading: ReportReading
    public var route: RouteRecord
    public var validation: ValidationResult

    public init(reading: ReportReading, route: RouteRecord, validation: ValidationResult) {
        self.reading = reading
        self.route = route
        self.validation = validation
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

    public init(incidentId: String, teamId: String?, deviceId: String, authorUid: String, priorVersion: Int, clientTimeMs: Double,
                inputMethod: InputMethod, isTrainingInject: Bool, grid: [GridSegment], effect: EffectContext, params: EngineParams) {
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
        reading.evidenceQuote = PhoneNumbers.scrub(reading.evidenceQuote)
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
            serverTime: nil, observedAtMs: type == .sighting ? context.clientTimeMs : nil, position: position, positionSource: source,
            rawText: PhoneNumbers.scrub(rawText), inputMethod: context.inputMethod, isTrainingInject: context.isTrainingInject,
            reading: storedReading.flatMap { try? JSONValue(encoding: $0) }, effect: effect, route: outcome.route,
            targetEventId: nil, decision: nil, planVersion: nil, priorVersion: context.priorVersion)
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

/// A caller's or searcher's phone number is never stored (spec section 12.2).
public enum PhoneNumbers {
    static let pattern = try! NSRegularExpression(pattern: #"(\+?1[\s.-]?)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b|\b\d{3}[\s.-]\d{4}\b"#)

    public static func scrub(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return pattern.stringByReplacingMatches(in: text, range: range, withTemplate: "[number removed]")
    }
}
