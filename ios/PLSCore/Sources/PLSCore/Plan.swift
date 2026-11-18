import Foundation

/// One team's task in an approved plan.
public struct Assignment: Codable, Sendable, Equatable {
    public var teamId: String
    public var segmentIds: [String]
    public var taskText: String
    public var reason: String

    public init(teamId: String, segmentIds: [String], taskText: String, reason: String) {
        self.teamId = teamId
        self.segmentIds = segmentIds
        self.taskText = taskText
        self.reason = reason
    }
}

/// An approved plan, `plans/{version}` (spec section 7). Only command writes it, after a person
/// presses Approve; the phone reads it from the pack or the listener and acknowledges it.
public struct PlanDoc: Codable, Sendable, Equatable {
    public var version: Int
    public var basedOnEventSetHash: String
    public var priorVersion: Int
    public var assignments: [Assignment]
    public var wordingRoute: RouteRecord?
    public var approvedByUid: String
    /// A server timestamp; read back as milliseconds.
    public var approvedAt: Double?
    public var createdClientTimeMs: Double

    public func assignment(for teamId: String) -> Assignment? {
        assignments.first { $0.teamId == teamId }
    }

    enum CodingKeys: String, CodingKey {
        case version, basedOnEventSetHash, priorVersion, assignments, wordingRoute, approvedByUid, approvedAt, createdClientTimeMs
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .version)
        try c.encode(basedOnEventSetHash, forKey: .basedOnEventSetHash)
        try c.encode(priorVersion, forKey: .priorVersion)
        try c.encode(assignments, forKey: .assignments)
        try c.encode(wordingRoute, forKey: .wordingRoute)
        try c.encode(approvedByUid, forKey: .approvedByUid)
        try c.encode(approvedAt, forKey: .approvedAt)
        try c.encode(createdClientTimeMs, forKey: .createdClientTimeMs)
    }
}
