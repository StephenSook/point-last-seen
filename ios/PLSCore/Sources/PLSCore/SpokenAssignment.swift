import Foundation

/// Spoken assignment changes, for searchers whose eyes are on the ground. The only input is
/// command's approved plan: the segment ids and the approved task text. Never report text, never
/// the profile, never the plan's reason line.
public enum SpokenAssignment {
    public enum Path: String, Sendable { case onDevice = "on_device", cloud }

    static let maxCharacters = 400

    public static func text(_ assignment: Assignment) -> String {
        let ids = assignment.segmentIds.sorted().map(spelled)
        var words = "New assignment."
        if !ids.isEmpty {
            let list = ids.count == 1 ? ids[0] : ids.dropLast().joined(separator: ", ") + " and " + ids[ids.count - 1]
            words += " \(ids.count == 1 ? "Segment" : "Segments") \(list)."
        }
        let task = assignment.taskText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !task.isEmpty { words += " " + task }
        return words.count <= maxCharacters ? words : String(words.prefix(maxCharacters))
    }

    /// True when what would be spoken differs from what was spoken last.
    public static func shouldSpeak(previous: Assignment?, current: Assignment?) -> Bool {
        guard let current else { return false }
        guard let previous else { return true }
        return text(previous) != text(current)
    }

    /// The cloud voice only when Remote Config names a model, the phone is online and the kill
    /// switch is off; otherwise the phone's own speech synthesizer.
    public static func path(cloudModel: String, online: Bool, killCloud: Bool) -> Path {
        let named = !cloudModel.trimmingCharacters(in: .whitespaces).isEmpty
        return named && online && !killCloud ? .cloud : .onDevice
    }

    /// "AC" is read as letters: "A C".
    static func spelled(_ id: String) -> String { id.map(String.init).joined(separator: " ") }
}
