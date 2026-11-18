import Foundation

/// The team's task as the Live Activity shows it (P-07): the assigned segments and how many
/// reports are still on this phone. Never report text or anything about the subject, because a
/// lock screen can be seen by anyone nearby.
public struct TaskStatus: Sendable, Equatable, Codable, Hashable {
    public var segments: String
    public var waiting: Int
    public var needsAction: Int

    public static func make(assignedSegmentIds: [String], states: [OutboxState]) -> TaskStatus {
        var waiting = 0, refused = 0
        for state in states {
            switch state {
            case .pending, .checking: waiting += 1
            case .rejected: refused += 1
            case .acked: break
            }
        }
        let segments = assignedSegmentIds.isEmpty ? "None yet" : assignedSegmentIds.sorted().joined(separator: ", ")
        return TaskStatus(segments: segments, waiting: waiting, needsAction: refused)
    }

    public var line: String {
        var parts: [String] = []
        if waiting > 0 { parts.append("\(waiting) \(waiting == 1 ? "report" : "reports") waiting for signal.") }
        if needsAction > 0 { parts.append("\(needsAction) \(needsAction == 1 ? "needs" : "need") a look.") }
        return parts.isEmpty ? "All reports delivered." : parts.joined(separator: " ")
    }
}
