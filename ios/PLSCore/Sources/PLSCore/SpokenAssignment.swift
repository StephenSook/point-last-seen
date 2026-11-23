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

    /// The cloud voice only when Remote Config names a model, the phone is online and signed in
    /// (the voice is an AI Logic call), the kill switch is off, and the phone can rebuild the whole
    /// assignment from its segment ids (`rebuiltFromSegments`); otherwise the phone's own speech
    /// synthesizer. No consent input: what the cloud voice may get holds only grid segment ids.
    public static func path(cloudModel: String, online: Bool, killCloud: Bool, signedIn: Bool,
                            assignment: Assignment, gridIds: Set<String>) -> Path {
        let named = !cloudModel.trimmingCharacters(in: .whitespaces).isEmpty
        return named && online && signedIn && !killCloud && rebuiltFromSegments(assignment, gridIds: gridIds)
            ? .cloud : .onDevice
    }

    /// The task line the command post writes, built in code from the segment ids alone (the same
    /// words as its `taskTextFor`).
    public static func codeTaskLine(_ segmentIds: [String]) -> String {
        segmentIds.isEmpty ? "No segment left to assign." : "Search segment \(segmentIds.joined(separator: ", "))."
    }

    /// True when every segment id is one of this incident's grid segments, written in plain letters,
    /// digits or underscores, and the task line is exactly the code-built line for those ids, byte for
    /// byte. The rules let a command writer store any 200 characters as the task line, so only this
    /// check keeps a name, a phone number or other words in it away from the cloud voice.
    public static func rebuiltFromSegments(_ assignment: Assignment, gridIds: Set<String>) -> Bool {
        assignment.segmentIds.allSatisfy { isPlainId($0) && gridIds.contains($0) }
            && Array(assignment.taskText.utf8) == Array(codeTaskLine(assignment.segmentIds).utf8)
    }

    /// Letters, digits and underscores only, 1 to 16 bytes, as the rules write a segment id. Checked by
    /// byte, because Swift compares strings by canonical equivalence ("\u{212A}" KELVIN SIGN equals "K").
    static func isPlainId(_ id: String) -> Bool {
        (1...16).contains(id.utf8.count)
            && id.utf8.allSatisfy { (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 95 }
    }

    /// "AC" is read as letters: "A C".
    static func spelled(_ id: String) -> String { id.map(String.init).joined(separator: " ") }
}
