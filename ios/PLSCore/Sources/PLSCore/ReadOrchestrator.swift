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

        func finish(_ reading: ReportReading, path: RoutePath, stage: ReadStage) -> ReadOutcome {
            let model: String
            switch (path, stage) {
            case (_, .evidenceProtocol): model = "none"
            case (.onDevice, _): model = context.onDevice.variant
            case (.cloud, _): model = context.cloudModel
            case (.rules, _): model = "rules"
            }
            let route = RouteRecord(platform: .ios, path: path, stage: stage, model: model, reason: decision.reason,
                                    latencyMs: clock.nowMs() - start, sdkReported: false, blocked: blocked, decidedAtMs: start)
            return ReadOutcome(reading: reading, route: route, validation: validate(reading, context, text), cloudTransport: transport)
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
            let next: NextStep
            switch stage {
            case .guided:
                let guidedPath = path
                let result = await timed(context.stageTimeoutSeconds) { await runner.guided(text, path: guidedPath) }
                    ?? .failure(path == .cloud ? .network : .other)
                if guidedPath == .cloud {
                    if case .failure(.network) = result { transport = .failed } else if transport != .failed { transport = .succeeded }
                }
                switch result {
                case let .success(modelReading):
                    let r = withCodeSegments(modelReading)
                    if validate(r, context, text).isOK { return finish(r, path: path, stage: .guided) }
                    next = RouterPolicy.afterFailure(.parseFailed, path: path, stage: .guided)
                case let .failure(f):
                    note(f, &blocked)
                    lastFailure = f
                    next = RouterPolicy.afterFailure(f, path: path, stage: .guided)
                }
            case .permissiveText:
                let result = await timed(context.stageTimeoutSeconds) { await runner.permissive(text) } ?? .failure(.other)
                switch result {
                case let .success(line):
                    if let line = PermissiveLine.parse(line, known: context.knownSegmentIds) {
                        let merged = withCodeSegments(line.merged(into: parse(text, context)))
                        if validate(merged, context, text).isOK { return finish(merged, path: path, stage: .permissiveText) }
                    }
                    next = RouterPolicy.afterFailure(.parseFailed, path: path, stage: .permissiveText)
                case let .failure(f):
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
        let coverage = NumberWords.parse(covTokens, at: 0)?.0
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
