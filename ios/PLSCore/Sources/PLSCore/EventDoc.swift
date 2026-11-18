import Foundation

public enum Role: String, Codable, Sendable, CaseIterable { case searcher, command, family }

public enum EventType: String, Codable, Sendable, CaseIterable {
    case cleared, clue, sighting
    case cameraSighting = "camera_sighting"
    case destination, confirmation, retraction, found
    case planAck = "plan_ack"
}

public enum Reporter: String, Codable, Sendable, CaseIterable {
    case searcher
    case publicCaller = "public_caller"
    case family, camera, system
}

public enum PositionSource: String, Codable, Sendable, CaseIterable {
    case gps
    case assignedSegment = "assigned_segment"
    case manual
    case mapClick = "map_click"
    case cameraPin = "camera_pin"
    case none
}

public enum InputMethod: String, Codable, Sendable, CaseIterable {
    case keyboardDictation = "keyboard_dictation"
    case typed, picklist, clip, photo, system
}

public enum Decision: String, Codable, Sendable, CaseIterable { case confirmed, rejected }

/// One append-only event (spec section 8). Created once, never changed; a correction is a
/// new event. `reading` stays a plain JSON tree because a camera sighting has its own shape.
public struct EventDoc: Codable, Sendable, Equatable {
    public var eventId: String
    public var schemaVersion: Int
    public var incidentId: String
    public var teamId: String?
    public var deviceId: String
    public var seq: Int
    public var authorUid: String
    public var role: Role
    public var type: EventType
    public var reporter: Reporter
    public var clientTimeMs: Double
    /// Server time in ms once read back; written as a server timestamp by the event store.
    public var serverTime: Double?
    public var observedAtMs: Double?
    public var position: Position?
    public var positionSource: PositionSource
    public var rawText: String?
    public var inputMethod: InputMethod
    public var isTrainingInject: Bool
    public var reading: JSONValue?
    public var effect: Effect
    public var route: RouteRecord?
    public var targetEventId: String?
    public var decision: Decision?
    public var planVersion: Int?
    public var priorVersion: Int

    public init(eventId: String, schemaVersion: Int, incidentId: String, teamId: String?, deviceId: String, seq: Int,
                authorUid: String, role: Role, type: EventType, reporter: Reporter, clientTimeMs: Double, serverTime: Double?,
                observedAtMs: Double?, position: Position?, positionSource: PositionSource, rawText: String?,
                inputMethod: InputMethod, isTrainingInject: Bool, reading: JSONValue?, effect: Effect, route: RouteRecord?,
                targetEventId: String?, decision: Decision?, planVersion: Int?, priorVersion: Int) {
        self.eventId = eventId
        self.schemaVersion = schemaVersion
        self.incidentId = incidentId
        self.teamId = teamId
        self.deviceId = deviceId
        self.seq = seq
        self.authorUid = authorUid
        self.role = role
        self.type = type
        self.reporter = reporter
        self.clientTimeMs = clientTimeMs
        self.serverTime = serverTime
        self.observedAtMs = observedAtMs
        self.position = position
        self.positionSource = positionSource
        self.rawText = rawText
        self.inputMethod = inputMethod
        self.isTrainingInject = isTrainingInject
        self.reading = reading
        self.effect = effect
        self.route = route
        self.targetEventId = targetEventId
        self.decision = decision
        self.planVersion = planVersion
        self.priorVersion = priorVersion
    }

    enum CodingKeys: String, CodingKey {
        case eventId, schemaVersion, incidentId, teamId, deviceId, seq, authorUid, role, type, reporter, clientTimeMs,
             serverTime, observedAtMs, position, positionSource, rawText, inputMethod, isTrainingInject, reading, effect,
             route, targetEventId, decision, planVersion, priorVersion
    }

    /// Every one of the 25 keys is written, a nil as an explicit null: the shared schema and the
    /// security rules require the full key set. The event store swaps `serverTime` for the
    /// server timestamp on write.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(eventId, forKey: .eventId)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(incidentId, forKey: .incidentId)
        try c.encode(teamId, forKey: .teamId)
        try c.encode(deviceId, forKey: .deviceId)
        try c.encode(seq, forKey: .seq)
        try c.encode(authorUid, forKey: .authorUid)
        try c.encode(role, forKey: .role)
        try c.encode(type, forKey: .type)
        try c.encode(reporter, forKey: .reporter)
        try c.encode(clientTimeMs, forKey: .clientTimeMs)
        try c.encode(serverTime, forKey: .serverTime)
        try c.encode(observedAtMs, forKey: .observedAtMs)
        try c.encode(position, forKey: .position)
        try c.encode(positionSource, forKey: .positionSource)
        try c.encode(rawText, forKey: .rawText)
        try c.encode(inputMethod, forKey: .inputMethod)
        try c.encode(isTrainingInject, forKey: .isTrainingInject)
        try c.encode(reading ?? .null, forKey: .reading)
        try c.encode(effect, forKey: .effect)
        try c.encode(route, forKey: .route)
        try c.encode(targetEventId, forKey: .targetEventId)
        try c.encode(decision, forKey: .decision)
        try c.encode(planVersion, forKey: .planVersion)
        try c.encode(priorVersion, forKey: .priorVersion)
    }

    /// The fields that identify who made the write. The outbox compares them with the
    /// server copy before it calls a denied write delivered.
    public var identity: EventIdentity {
        EventIdentity(deviceId: deviceId, seq: seq, authorUid: authorUid, clientTimeMs: clientTimeMs)
    }
}

public struct EventIdentity: Codable, Sendable, Equatable {
    public var deviceId: String
    public var seq: Int
    public var authorUid: String
    public var clientTimeMs: Double

    public init(deviceId: String, seq: Int, authorUid: String, clientTimeMs: Double) {
        self.deviceId = deviceId
        self.seq = seq
        self.authorUid = authorUid
        self.clientTimeMs = clientTimeMs
    }
}
