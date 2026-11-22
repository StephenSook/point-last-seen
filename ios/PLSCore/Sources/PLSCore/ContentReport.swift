import Foundation

/// A member's report about shared content, from "Report a problem": the team's task or the family's description of the
/// person (incidents/{incidentId}/contentReports/{reportId}; shared/schemas/content-report.schema.json). Its author
/// files it once; command reads it; nobody changes it. The report id is the document id.
public struct ContentReport: Equatable, Sendable {
    public enum Role: String, CaseIterable, Sendable {
        case searcher, family
    }

    public enum Target: String, CaseIterable, Sendable {
        case task
        case familyDescription = "family_description"
        case event
    }

    public enum Reason: String, CaseIterable, Sendable {
        case abusive
        case personalInformation = "personal_information"
        case wrongOrMisleading = "wrong_or_misleading"
        case other

        /// The reason in the words the command post shows it with.
        public var words: String {
            switch self {
            case .abusive: "Abusive or offensive"
            case .personalInformation: "Personal information that should not be shared"
            case .wrongOrMisleading: "Wrong or misleading"
            case .other: "Other"
            }
        }
    }

    /// The rule's limit on the note, in code points (Unicode scalars).
    public static let noteMax = 500

    public let authorUid: String
    public let role: Role
    public let target: Target
    /// The plan document id for the task, the event id for an event, none for the family's description.
    public let targetId: String?
    public let reason: Reason
    /// The reporter's words, phone numbers removed, at most `noteMax` code points; nil when they wrote none.
    public let note: String?
    /// The server's time of the write. The rule requires the server's own time, so the writer stores the server
    /// timestamp and the phone never sets one.
    public let createdAt: Date? = nil

    /// A report the create rule accepts in its shape, or nil: the target id fits the target, and the note is cleaned
    /// (phone numbers removed, trimmed, capped).
    public init?(authorUid: String, role: Role, target: Target, targetId: String?, reason: Reason, note: String?) {
        guard (1...128).contains(authorUid.count) else { return nil }
        switch (target, targetId) {
        case (.familyDescription, nil): break
        case (.familyDescription, _), (_, nil): return nil
        case let (.event, id?) where Self.matches(id, "^[0-9a-f]{32}$"): break
        case (.event, _): return nil
        case let (.task, id?) where Self.matches(id, "^[A-Za-z0-9_-]{1,64}$"): break
        case (.task, _): return nil
        }
        self.authorUid = authorUid
        self.role = role
        self.target = target
        self.targetId = targetId
        self.reason = reason
        self.note = note.flatMap(Self.cleanNote)
    }

    /// The document's fields as the phone writes them: everything but `createdAt`, which the writer adds as the server
    /// timestamp; no `note` when there is none.
    public var fields: [String: JSONValue] {
        var fields: [String: JSONValue] = [
            "authorUid": .string(authorUid),
            "role": .string(role.rawValue),
            "target": .string(target.rawValue),
            "targetId": targetId.map(JSONValue.string) ?? .null,
            "reason": .string(reason.rawValue),
        ]
        if let note { fields["note"] = .string(note) }
        return fields
    }

    /// The note as it is stored: phone numbers removed, the ends trimmed, and at most `noteMax` code points, cut
    /// between whole characters; nil when nothing is left.
    public static func cleanNote(_ raw: String) -> String? {
        let note = capped(PhoneNumbers.scrub(raw).trimmingCharacters(in: .whitespacesAndNewlines))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return note.isEmpty ? nil : note
    }

    /// The text cut to `noteMax` code points between whole characters, nothing else changed: the note field stops
    /// there as the searcher types.
    public static func capped(_ text: String) -> String {
        guard text.unicodeScalars.count > noteMax else { return text }
        var kept = ""
        var scalars = 0
        for character in text {
            let size = character.unicodeScalars.count
            guard scalars + size <= noteMax else { break }
            kept.append(character)
            scalars += size
        }
        return kept
    }

    /// A new report id: 32 lowercase hex digits.
    public static func newReportId() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    /// The task's target id: its plan's document id, the version as four digits.
    public static func taskId(planVersion: Int) -> String {
        String(format: "%04d", planVersion)
    }

    private static func matches(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }
}
