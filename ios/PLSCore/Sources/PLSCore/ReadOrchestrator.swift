import Foundation

/// What the phone's model layer can do. The app implements it with Apple's on-device model
/// and Gemini through Firebase AI Logic, and maps every thrown error to a `ReadFailure`.
public protocol ReadModelRunner: Sendable {
    /// Guided generation into a reading on the given path (on-device or cloud).
    func guided(_ text: String, path: RoutePath) async -> Result<ReportReading, ReadFailure>
    /// The permissive string stage on the same on-device model.
    func permissive(_ text: String) async -> Result<String, ReadFailure>
}

public protocol ReadClock: Sendable {
    func nowMs() -> Double
}

public struct SystemClock: ReadClock {
    public init() {}
    public func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }
}

/// The on-device model's state when the report is read (read by the app's model session factory).
public struct OnDeviceStatus: Sendable, Equatable {
    public var available: Bool
    public var localeSupported: Bool
    public var contextSize: Int
    public var variant: String

    public init(available: Bool, localeSupported: Bool, contextSize: Int, variant: String) {
        self.available = available
        self.localeSupported = localeSupported
        self.contextSize = contextSize
        self.variant = variant
    }
}

/// What may change while a model call runs: read again at the moment of any cloud dispatch.
public struct LiveGate: Sendable, Equatable {
    public var networkOnline: Bool
    public var cloudConsent: Bool
    public var killCloud: Bool
    public var incidentMode: String?

    public init(networkOnline: Bool, cloudConsent: Bool, killCloud: Bool, incidentMode: String?) {
        self.networkOnline = networkOnline
        self.cloudConsent = cloudConsent
        self.killCloud = killCloud
        self.incidentMode = incidentMode
    }
}

public struct ReadContext: Sendable {
    public var incidentMode: String?
    public var knownSegmentIds: [String]
    public var networkOnline: Bool
    public var onDevice: OnDeviceStatus
    public var estimatedTokens: Int
    public var tokenBudgetFraction: Double
    public var cloudConsent: Bool
    public var killCloud: Bool
    public var cloudModel: String
    public var screen: EvidenceScreen
    /// Live connectivity, consent, kill switch and incident mode. When nil, the snapshot above is used.
    public var liveGate: (@Sendable () -> LiveGate)?
    /// The longest one model stage may take before the read moves on to the next stage.
    public var stageTimeoutSeconds: Double = 20
    /// The segment under the searcher's GPS fix, if any: the segment a report that names none is about.
    public var positionSegmentId: String?
    /// The language screen run before any cloud read. Without one no note goes to the cloud (fails closed).
    public var language: LanguageScreen?
    /// The grounding rule run on every read's reading. Without it the fields it checks are blanked (fails closed).
    public var grounding: Grounding?
    /// The found-kind rule run on a model's reading after grounding. Without it the model's kind stays.
    public var foundKind: FoundKind?
    /// The subject's names, for the found-kind rule only (a word of a name keeps the model's "found"). Never sent to a model.
    public var subjectNames: [String] = []
    /// The subject's description, for deciding in code whether a reading by Apple's model matches it.
    public var profile: ModelProfile?
    /// Whether the mission the report was made for is still the one loaded (same incident, team and mode). Checked
    /// right before every model call; when it is not, no model runs and rules read the rest. Nil: not checked.
    public var stillCurrent: (@Sendable () -> Bool)?

    public init(incidentMode: String?, knownSegmentIds: [String], networkOnline: Bool, onDevice: OnDeviceStatus,
                estimatedTokens: Int, tokenBudgetFraction: Double, cloudConsent: Bool, killCloud: Bool,
                cloudModel: String, screen: EvidenceScreen, liveGate: (@Sendable () -> LiveGate)? = nil) {
        self.incidentMode = incidentMode
        self.knownSegmentIds = knownSegmentIds
        self.networkOnline = networkOnline
        self.onDevice = onDevice
        self.estimatedTokens = estimatedTokens
        self.tokenBudgetFraction = tokenBudgetFraction
        self.cloudConsent = cloudConsent
        self.killCloud = killCloud
        self.cloudModel = cloudModel
        self.screen = screen
        self.liveGate = liveGate
    }
}

extension ReadOutcome {
    /// The parser could not read it either: show the pick-list.
    public var needsPickList: Bool { reading.kind == .unclear && route.stage != .evidenceProtocol }
}

/// Reads one report: evidence screen, route decision, then the stages, never throwing.
/// The route record is our own; on iOS it is never SDK-reported.
public enum ReadOrchestrator {
    public static func read(text spoken: String, context: ReadContext, runner: ReadModelRunner, clock: ReadClock) async -> ReadOutcome {
        // A phone number never reaches a model, on the phone or in the cloud (spec section 12.2):
        // it is removed here, before the first call, as well as before the report is stored.
        let text = PhoneNumbers.scrub(spoken)
        let start = clock.nowMs()
        var input = RouterInput(taskClass: .fieldReport, networkOnline: context.networkOnline,
                                onDeviceAvailable: context.onDevice.available, localeSupported: context.onDevice.localeSupported,
                                estimatedTokens: context.estimatedTokens, contextSize: context.onDevice.contextSize,
                                tokenBudgetFraction: context.tokenBudgetFraction, cloudConsent: context.cloudConsent,
                                killCloud: context.killCloud)
        let plan = ReadPlan.make(text: text, decision: RouterPolicy.decide(input), screen: context.screen, incidentMode: context.incidentMode)
        var decision = plan.decision
        var blocked: BlockKind?
        var transport = CloudTransport.notUsed
        var notes: [String] = []
        // Apple's model sometimes leaves the quote empty: a read rejected only for its quote is asked once
        // more, with the report and a reminder (greedy sampling gives the same answer to the same input).
        var quoteRetried = false
        var retryingQuote = false
        let limit = context.stageTimeoutSeconds
        let limitWords = limit == limit.rounded() ? "\(Int(limit)) s" : "\(limit) s"

        /// A colour, direction, footwear or carried item the note does not support is blanked after every read.
        func grounded(_ r: ReportReading) -> ReportReading {
            context.grounding.map { $0.ground(r, note: text) } ?? Grounding.blanked(r)
        }

        /// After grounding, a model's "found" for an object is read as a clue (the found-kind rule).
        var foundKindReason: String?
        /// Set by the stage that answers when a number in its reading came from the rules parser.
        var numbersFromRules = false
        func checked(_ r: ReportReading) -> ReportReading {
            let g = grounded(r)
            guard let rule = context.foundKind else { return g }
            let out = rule.correct(g, note: text, names: context.subjectNames)
            if out.corrected { foundKindReason = out.reason }
            return out.reading
        }

        func finish(_ unGrounded: ReportReading, path: RoutePath, stage: ReadStage) -> ReadOutcome {
            // Only a model's reading is checked for found; the rules parser's reading is as the parser gave it.
            let reading = stage == .guided || stage == .permissiveText ? checked(unGrounded) : grounded(unGrounded)
            let model: String
            switch (path, stage) {
            case (_, .evidenceProtocol): model = "none"
            case (.onDevice, _): model = context.onDevice.variant
            case (.cloud, _): model = context.cloudModel
            case (.rules, _): model = "rules"
            }
            let route = RouteRecord(platform: .ios, path: path, stage: stage, model: model, reason: decision.reason,
                                    latencyMs: clock.nowMs() - start, sdkReported: false, blocked: blocked, decidedAtMs: start)
            return ReadOutcome(reading: reading, route: route, validation: validate(reading, context, text), cloudTransport: transport,
                               stageNotes: notes, foundKindReason: foundKindReason, numbersFromRules: numbersFromRules)
        }

        if plan.stages == [.evidenceProtocol] {
            return finish(.unclear(), path: .rules, stage: .evidenceProtocol)
        }

        /// Segment ids come from code, never the model: see `SegmentChoice`.
        func withCodeSegments(_ r: ReportReading) -> ReportReading {
            var r = r
            r.segmentIds = SegmentChoice.ids(rawText: text, known: context.knownSegmentIds, positionSegmentId: context.positionSegmentId)
            return r
        }

        var path = decision.path
        var stage = plan.stages[0]
        var lastFailure: ReadFailure?

        /// Reads the live gate into the router input; false when the incident left drill mode.
        func refreshGate() -> Bool {
            guard let live = context.liveGate?() else { return true }
            input.networkOnline = live.networkOnline
            input.cloudConsent = live.cloudConsent
            input.killCloud = live.killCloud
            return live.incidentMode.map(ReadPlan.modelModes.contains) ?? false
        }

        while true {
            // The cloud gate is checked again at the moment of every cloud dispatch.
            if stage == .guided && path == .cloud {
                let modeOK = refreshGate()
                if !modeOK || !input.networkOnline || !input.cloudConsent || input.killCloud {
                    // Like the router, rules keep the reason step 1 failed, except when the
                    // incident has left drill or judge mode, which is said as such.
                    if !modeOK { decision = RouteDecision(path: .rules, reason: .notDrillMode) }
                    path = .rules
                    stage = .deterministicParser
                } else if !(context.language.map { $0.looksEnglish(spoken) && $0.looksEnglish(text) } ?? false) {
                    // The cloud read would run now, but the note does not look English, as written or with
                    // its phone number removed (which adds English words): it is not sent, it is read by
                    // rules, and the route says why.
                    decision = RouteDecision(path: .rules, reason: .notEnglish)
                    path = .rules
                    stage = .deterministicParser
                }
            }
            // The mission is checked again right before every model call: on another incident or team, or in a mode
            // where no model may read, the rest is read by rules (and the journal does not keep the report).
            if stage == .guided || stage == .permissiveText, let current = context.stillCurrent, !current() {
                decision = RouteDecision(path: .rules, reason: .notDrillMode)
                path = .rules
                stage = .deterministicParser
            }
            let next: NextStep
            switch stage {
            case .guided:
                let guidedPath = path
                let retrying = retryingQuote
                retryingQuote = false
                let prompt = retrying ? PromptText.quoteRetry(text) : text
                let callStart = retrying ? clock.nowMs() : 0
                let raw = await timed(context.stageTimeoutSeconds) { await runner.guided(prompt, path: guidedPath) }
                if retrying { notes.append("guided \(guidedPath.rawValue): retry with a quote reminder took \(Int(max(0, clock.nowMs() - callStart))) ms") }
                if raw == nil { notes.append("guided \(guidedPath.rawValue): timed out after \(limitWords)") }
                let result = raw ?? .failure(path == .cloud ? .network : .other)
                if guidedPath == .cloud {
                    if case .failure(.network) = result { transport = .failed } else if transport != .failed { transport = .succeeded }
                }
                switch result {
                case let .success(modelReading):
                    var r = withCodeSegments(modelReading)
                    // Apple's model reads the report alone (it never sees the description), so code
                    // decides whether the report matches the subject.
                    if guidedPath == .onDevice {
                        // Grounded (and found checked) first, so a colour copied from the profile is no match.
                        r = checked(r)
                        r.matchesProfile = context.profile.map { ProfileMatch.decide(r, profile: $0) } ?? .unknown
                        r = Self.zerosNotStated(r)
                        r.evidenceQuote = Self.withoutAddedMark(r.evidenceQuote, text)
                    }
                    let v = validate(r, context, text)
                    if v.isOK {
                        // Numbers the model left empty come from the rules, checked once the model's reading is valid.
                        switch Self.statedNumbers(r, from: parse(text, context), isValid: { validate($0, context, text).isOK }) {
                        case let .kept(reading, fromRules):
                            numbersFromRules = fromRules
                            return finish(reading, path: path, stage: .guided)
                        case .coverageRefused:
                            // A coverage the report states that the app refuses is never silently dropped (the model's
                            // effort numbers could then clear the area): the read goes on as the rules alone end it.
                            notes.append("guided \(guidedPath.rawValue): stated coverage refused")
                            next = RouterPolicy.afterFailure(.parseFailed, path: path, stage: .guided)
                        }
                    } else {
                        notes.append("guided \(guidedPath.rawValue): invalid \(Self.reasons(v))\(Self.quoteNote(v, r.evidenceQuote))")
                        if guidedPath == .onDevice, !quoteRetried, v == .invalid(reasons: ["quote_not_in_text"]) {
                            quoteRetried = true
                            retryingQuote = true
                            continue
                        }
                        next = RouterPolicy.afterFailure(.parseFailed, path: path, stage: .guided)
                    }
                case let .failure(f):
                    if raw != nil { notes.append("guided \(guidedPath.rawValue): \(f.rawValue)") }
                    note(f, &blocked)
                    lastFailure = f
                    next = RouterPolicy.afterFailure(f, path: path, stage: .guided)
                }
            case .permissiveText:
                let raw = await timed(context.stageTimeoutSeconds) { await runner.permissive(text) }
                if raw == nil { notes.append("permissive \(path.rawValue): timed out after \(limitWords)") }
                let result = raw ?? .failure(.other)
                switch result {
                case let .success(line):
                    if let line = PermissiveLine.parse(line, known: context.knownSegmentIds) {
                        let parsed = parse(text, context)
                        let merged = withCodeSegments(line.merged(into: parsed))
                        let v = validate(merged, context, text)
                        if v.isOK {
                            // The line carries only kind, ids and coverage: every other number is the parser's.
                            numbersFromRules = (line.coverage == nil && parsed.coverage != nil) || parsed.minutes != nil || parsed.searchers != nil
                            return finish(merged, path: path, stage: .permissiveText)
                        }
                        notes.append("permissive \(path.rawValue): invalid \(Self.reasons(v))")
                    } else {
                        notes.append("permissive \(path.rawValue): unparsed")
                    }
                    next = RouterPolicy.afterFailure(.parseFailed, path: path, stage: .permissiveText)
                case let .failure(f):
                    if raw != nil { notes.append("permissive \(path.rawValue): \(f.rawValue)") }
                    note(f, &blocked)
                    next = RouterPolicy.afterFailure(f, path: path, stage: .permissiveText)
                }
            case .deterministicParser, .evidenceProtocol, .sdk, .picklist:
                return finish(withCodeSegments(parse(text, context)), path: .rules, stage: .deterministicParser)
            }
            switch next {
            case let .stage(s):
                stage = s
            case .rerouteWithoutOnDevice:
                // Keep the real cause: a context limit is over budget, anything else is unavailable.
                if lastFailure == .contextExceeded {
                    input.estimatedTokens = Int.max
                } else {
                    input.onDeviceAvailable = false
                }
                let modeOK = refreshGate()
                decision = modeOK ? RouterPolicy.decide(input) : RouteDecision(path: .rules, reason: .notDrillMode)
                path = decision.path
                stage = path == .rules ? .deterministicParser : .guided
            case .pickList:
                return finish(.unclear(quote: String(text.prefix(200))), path: .rules, stage: .deterministicParser)
            }
        }
    }

    static func timed<T: Sendable>(_ seconds: Double, _ op: @escaping @Sendable () async -> T) async -> T? {
        await Timeout.run(seconds: seconds, op)
    }

    enum NumberFill {
        /// The reading to use, and whether any of its numbers came from the rules.
        case kept(ReportReading, fromRules: Bool)
        /// The report states a coverage the app refuses.
        case coverageRefused
    }

    /// Apple's model leaves every number in its reading empty, even one the report states ("coverage 0.7" came back
    /// nil on the simulator), and a schema that made it fill each number got invented ones. So a number a model left
    /// empty is taken from the rules parser, which reads only numbers the report states; a model's own number stays.
    /// Numbers matter only to a cleared report, so nothing else is filled. A stated coverage the app refuses refuses
    /// the read; a time or count the rules read out of range ("200 people at the entrance") is left out.
    static func statedNumbers(_ reading: ReportReading, from parsed: ReportReading, isValid: (ReportReading) -> Bool) -> NumberFill {
        guard reading.kind == .cleared else { return .kept(reading, fromRules: false) }
        var r = reading, fromRules = false
        if r.coverage == nil, let c = parsed.coverage {
            r.coverage = c
            guard isValid(r) else { return .coverageRefused }
            fromRules = true
        }
        if r.minutes == nil, let m = parsed.minutes {
            var t = r; t.minutes = m
            if isValid(t) { r = t; fromRules = true }
        }
        if r.searchers == nil, let n = parsed.searchers {
            var t = r; t.searchers = n
            if isValid(t) { r = t; fromRules = true }
        }
        return .kept(r, fromRules: fromRules)
    }

    /// Apple's model fills a number the report never stated with 0. For minutes, searchers and detection
    /// range 0 is never a valid value, so it is read as not stated. Coverage keeps its 0, which can be stated.
    static func zerosNotStated(_ reading: ReportReading) -> ReportReading {
        var r = reading
        if r.minutes == 0 { r.minutes = nil }
        if r.searchers == 0 { r.searchers = nil }
        if r.detectionRangeM == 0 { r.detectionRangeM = nil }
        return r
    }

    /// Apple's model can add a mark to the end of its quote ("...segment BP." for a report with no period).
    /// At most one trailing . , ! or ? is dropped, and only when the quote is not in the report as it is
    /// and what is left is, exactly. The quote stays the report's own words; code never writes one.
    static func withoutAddedMark(_ quote: String, _ text: String) -> String {
        guard let last = quote.last, ".,!?".contains(last), !text.contains(quote) else { return quote }
        let left = String(quote.dropLast())
        return !left.isEmpty && text.contains(left) ? left : quote
    }

    /// What a rejected quote was, for a stage note: "(quote empty)" or the quote cut to 60 characters. Kept
    /// only in the read outcome and the drill's route-check file, never in the event.
    static func quoteNote(_ v: ValidationResult, _ quote: String) -> String {
        guard case let .invalid(reasons) = v, reasons.contains("quote_not_in_text") else { return "" }
        let q = quote.trimmingCharacters(in: .whitespacesAndNewlines)
        return q.isEmpty ? " (quote empty)" : " (quote: \"\(q.prefix(60))\")"
    }

    /// The validator's reasons, joined for a stage note.
    static func reasons(_ v: ValidationResult) -> String {
        if case let .invalid(reasons) = v { return reasons.joined(separator: ",") }
        return ""
    }

    static func note(_ failure: ReadFailure, _ blocked: inout BlockKind?) {
        if failure == .guardrailBlock { blocked = .guardrail } else if failure == .refusal { blocked = .refusal }
    }

    static func parse(_ text: String, _ context: ReadContext) -> ReportReading {
        ReportParser.parse(text, context: ParseContext(knownSegmentIds: context.knownSegmentIds))
    }

    /// Validates after coverage normalization, as the outcome builder will.
    static func validate(_ reading: ReportReading, _ context: ReadContext, _ text: String) -> ValidationResult {
        var r = reading
        switch SearchMath.normalizeCoverage(r.coverage) {
        case .invalid: return .invalid(reasons: ["coverage_out_of_range"])
        case let .ratio(c): r.coverage = c
        case .none: break
        }
        return ReadingValidator.validate(r, knownSegmentIds: context.knownSegmentIds, rawText: text)
    }
}

/// The permissive stage's one line, read tolerantly: "cleared|AC|0.8" or
/// "KIND: cleared, SEGMENTS: AC, AB, COVERAGE: 0.8". Only known ids are kept.
public struct PermissiveLine: Sendable, Equatable {
    public var kind: ReportKind
    public var segmentIds: [String]
    public var coverage: Double?

    public init(kind: ReportKind, segmentIds: [String], coverage: Double?) {
        self.kind = kind
        self.segmentIds = segmentIds
        self.coverage = coverage
    }

    public static func parse(_ line: String, known: [String]) -> PermissiveLine? {
        var fields: [String: String] = [:]
        if line.contains("|") {
            let parts = line.split(separator: "|", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
            for (k, v) in zip(["kind", "segments", "coverage"], parts) { fields[k] = v }
        } else {
            var label: String?
            for part in line.split(separator: ",") {
                if let colon = part.firstIndex(of: ":") {
                    label = part[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
                    fields[label!] = part[part.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                } else if let l = label {
                    fields[l, default: ""] += "," + part
                }
            }
        }
        guard let kindText = fields["kind"]?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines),
              let kind = ReportKind(rawValue: kindText) else { return nil }
        let knownSet = Set(known)
        var ids: [String] = []
        for word in Tokens(fields["segments"] ?? fields["segment"] ?? "").lower where word.count == 2 {
            let id = word.uppercased()
            if knownSet.contains(id) && !ids.contains(id) && ids.count < 3 { ids.append(id) }
        }
        let covTokens = Tokens(fields["coverage"] ?? "").lower
        // A stated percent keeps its meaning, as the parser reads it: "1%" is 0.01.
        let coverage = NumberWords.parse(covTokens, at: 0).map { v, n in ReportParser.percentAfter(covTokens, at: n) ? ReportParser.percent(v) : v }
        return PermissiveLine(kind: kind, segmentIds: ids, coverage: coverage)
    }

    /// Overlays this line on the parser's reading of the same text (which supplies the quote).
    public func merged(into base: ReportReading) -> ReportReading {
        var r = base
        r.kind = kind
        if !segmentIds.isEmpty { r.segmentIds = segmentIds }
        if let coverage { r.coverage = coverage }
        return r
    }
}

/// A time limit for any call into a model API (a guided or permissive read, a token count).
public enum Timeout {
    /// Returns nil on timeout, without waiting for a call that ignores cancellation (a task
    /// group would wait for its children).
    public static func run<T: Sendable>(seconds: Double, _ op: @escaping @Sendable () async -> T) async -> T? {
        let once = ResumeOnce<T?>()
        return await withCheckedContinuation { continuation in
            let work = Task {
                let value = await op()
                once.resume(continuation, with: value)
            }
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                if once.resume(continuation, with: nil) { work.cancel() }
            }
        }
    }
}

/// Resumes a continuation exactly once, whichever side gets there first.
final class ResumeOnce<T: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false

    @discardableResult
    func resume(_ continuation: CheckedContinuation<T, Never>, with value: T) -> Bool {
        lock.lock()
        let first = !done
        done = true
        lock.unlock()
        if first { continuation.resume(returning: value) }
        return first
    }
}
