import Foundation

public enum TaskClass: String, Codable, Sendable { case fieldReport = "field_report" }

public enum RoutePath: String, Codable, Sendable, CaseIterable {
    case onDevice = "on_device"
    case cloud
    case rules
}

public enum RouteReason: String, Codable, Sendable, CaseIterable {
    case onDeviceDefault = "on_device_default"
    case noNetwork = "no_network"
    case onDeviceUnavailable = "on_device_unavailable"
    case localeUnsupported = "locale_unsupported"
    case overTokenBudget = "over_token_budget"
    case possibleEvidence = "possible_evidence"
    /// The incident is not a drill or a judge sandbox, so no model is called.
    case notDrillMode = "not_drill_mode"
    /// Decode only: a reason this build does not know. The rules bound the reason by length,
    /// so a newer client's value can reach this phone; the event still counts. Never produced here.
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = RouteReason(rawValue: raw) ?? .unknown
    }
}

public enum ReadStage: String, Codable, Sendable, CaseIterable {
    case guided
    case permissiveText = "permissive_text"
    case deterministicParser = "deterministic_parser"
    case evidenceProtocol = "evidence_protocol"
    case sdk
}

public enum Platform: String, Codable, Sendable { case ios, web, android }

public enum BlockKind: String, Codable, Sendable { case guardrail, refusal }

/// Why a read stage failed. The app maps thrown model errors to these cases.
public enum ReadFailure: String, Codable, Sendable, CaseIterable, Error {
    case guardrailBlock = "guardrail_block"
    case refusal
    case parseFailed = "parse_failed"
    case unavailable
    case contextExceeded = "context_exceeded"
    case network
    case appCheckRefused = "app_check_refused"
    case cancelled
    case other
}

public struct RouterInput: Codable, Sendable, Equatable {
    public var taskClass: TaskClass
    public var networkOnline: Bool
    public var onDeviceAvailable: Bool
    public var localeSupported: Bool
    public var estimatedTokens: Int
    public var contextSize: Int
    public var tokenBudgetFraction: Double
    public var cloudConsent: Bool
    public var killCloud: Bool

    public init(taskClass: TaskClass, networkOnline: Bool, onDeviceAvailable: Bool, localeSupported: Bool, estimatedTokens: Int,
                contextSize: Int, tokenBudgetFraction: Double, cloudConsent: Bool, killCloud: Bool) {
        self.taskClass = taskClass
        self.networkOnline = networkOnline
        self.onDeviceAvailable = onDeviceAvailable
        self.localeSupported = localeSupported
        self.estimatedTokens = estimatedTokens
        self.contextSize = contextSize
        self.tokenBudgetFraction = tokenBudgetFraction
        self.cloudConsent = cloudConsent
        self.killCloud = killCloud
    }
}

public struct RouteDecision: Codable, Sendable, Equatable {
    public var path: RoutePath
    public var reason: RouteReason

    public init(path: RoutePath, reason: RouteReason) {
        self.path = path
        self.reason = reason
    }
}

public enum NextStep: Equatable, Sendable {
    /// Try this stage on the same path.
    case stage(ReadStage)
    /// The on-device model was not ready at call time (not a block): decide again with
    /// on-device marked unavailable, which may choose the cloud.
    case rerouteWithoutOnDevice
    /// Show the pick-list.
    case pickList

    /// True when the next step can reach the cloud.
    public var isCloud: Bool { self == .rerouteWithoutOnDevice }
}

extension NextStep: Codable {
    enum CodingKeys: String, CodingKey { case next, stage }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .next) {
        case "stage": self = .stage(try c.decode(ReadStage.self, forKey: .stage))
        case "reroute_without_on_device": self = .rerouteWithoutOnDevice
        case "pick_list": self = .pickList
        case let other: throw DecodingError.dataCorruptedError(forKey: .next, in: c, debugDescription: "unknown next step \(other)")
        }
    }

    /// `{next: "stage", stage}`, `{next: "reroute_without_on_device"}` or `{next: "pick_list"}`.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .stage(stage):
            try c.encode("stage", forKey: .next)
            try c.encode(stage, forKey: .stage)
        case .rerouteWithoutOnDevice:
            try c.encode("reroute_without_on_device", forKey: .next)
        case .pickList:
            try c.encode("pick_list", forKey: .next)
        }
    }
}

/// The route record we write on every read. On iOS it is our own record, never SDK-reported.
public struct RouteRecord: Codable, Sendable, Equatable {
    public var platform: Platform
    public var path: RoutePath
    public var stage: ReadStage
    public var model: String
    public var reason: RouteReason
    public var latencyMs: Double
    public var sdkReported: Bool
    public var blocked: BlockKind?
    public var decidedAtMs: Double

    public init(platform: Platform, path: RoutePath, stage: ReadStage, model: String, reason: RouteReason, latencyMs: Double,
                sdkReported: Bool, blocked: BlockKind?, decidedAtMs: Double) {
        self.platform = platform
        self.path = path
        self.stage = stage
        self.model = model
        self.reason = reason
        self.latencyMs = latencyMs
        self.sdkReported = sdkReported
        self.blocked = blocked
        self.decidedAtMs = decidedAtMs
    }

    enum CodingKeys: String, CodingKey { case platform, path, stage, model, reason, latencyMs, sdkReported, blocked, decidedAtMs }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(platform, forKey: .platform)
        try c.encode(path, forKey: .path)
        try c.encode(stage, forKey: .stage)
        try c.encode(model, forKey: .model)
        try c.encode(reason, forKey: .reason)
        try c.encode(latencyMs, forKey: .latencyMs)
        try c.encode(sdkReported, forKey: .sdkReported)
        try c.encode(blocked, forKey: .blocked)          // explicit null
        try c.encode(decidedAtMs, forKey: .decidedAtMs)
    }
}

/// Our app is the router on iOS (spec section 9).
public enum RouterPolicy {
    public static func decide(_ input: RouterInput) -> RouteDecision {
        let budget = Double(input.contextSize) * input.tokenBudgetFraction
        let failed: RouteReason
        if !input.onDeviceAvailable {
            failed = .onDeviceUnavailable
        } else if !input.localeSupported {
            failed = .localeUnsupported
        } else if input.contextSize <= 0 || Double(input.estimatedTokens) > budget {
            failed = .overTokenBudget
        } else {
            return RouteDecision(path: .onDevice, reason: input.networkOnline ? .onDeviceDefault : .noNetwork)
        }
        if input.networkOnline && input.cloudConsent && !input.killCloud {
            return RouteDecision(path: .cloud, reason: failed)
        }
        return RouteDecision(path: .rules, reason: failed)
    }

    /// Stages run guided, then permissive text on the same on-device model, then the
    /// deterministic parser, then the pick-list. A guardrail block or refusal never leads to
    /// the cloud: sending blocked text elsewhere would circumvent the guardrail.
    public static func afterFailure(_ failure: ReadFailure, path: RoutePath, stage: ReadStage) -> NextStep {
        switch stage {
        case .deterministicParser, .evidenceProtocol:
            return .pickList
        case .guided, .permissiveText, .sdk:
            break
        }
        switch failure {
        case .guardrailBlock, .refusal:
            return path == .onDevice && stage == .guided ? .stage(.permissiveText) : .stage(.deterministicParser)
        case .unavailable, .contextExceeded:
            return path == .onDevice && stage == .guided ? .rerouteWithoutOnDevice : .stage(.deterministicParser)
        case .parseFailed, .network, .appCheckRefused, .cancelled, .other:
            return .stage(.deterministicParser)
        }
    }
}
