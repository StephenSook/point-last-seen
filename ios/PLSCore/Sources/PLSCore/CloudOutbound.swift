import Foundation

/// The report reader's instruction text. Neutral words only ("item", "the subject",
/// "condition"), because the on-device guardrails react to some search-and-rescue words.
public enum PromptText {
    public static let guided = """
    You read one short report from a search team during a training drill. Fill every field from the report only.
    Numbers spoken as words are numbers: "point eight" is 0.8, "forty five" is 45.
    For segmentIds list only ids the report itself names. The segmentHere and teamAssignment tools tell you where the \
    team is and what it was assigned; use them to understand the report, not to add ids.
    For matchesProfile compare the report with the subjectDescription tool.
    Copy evidenceQuote word for word from the report.
    """

    /// The same for Apple's model on the phone. It gets no tools: with greedy sampling it called the
    /// team-assignment tool in a loop (168 calls on one report, until its context overflowed). Where the team
    /// is and what it was assigned come from code, as plain sentences. It gets no description of the subject
    /// (it copied the description into readings), and code decides matchesProfile.
    public static func onDeviceGuided(positionSegmentId: String?, assignedSegmentIds: [String]) -> String {
        """
        You read one short report from a search team during a training drill. Fill every field from the report only.
        Numbers spoken as words are numbers: "point eight" is 0.8, "forty five" is 45.
        For segmentIds list only ids the report itself names. \(onDevicePosition(positionSegmentId)) \
        \(onDeviceAssignment(assignedSegmentIds)) Use this to understand the report, not to add ids.
        Set matchesProfile to unknown.
        Copy evidenceQuote word for word from the report; never leave it empty.
        """
    }

    public static func onDevicePosition(_ positionSegmentId: String?) -> String {
        positionSegmentId.map { "The phone's GPS fix puts the team in segment \($0)." }
            ?? "The phone has no GPS fix, so where the team is standing is not known."
    }

    public static func onDeviceAssignment(_ assignedSegmentIds: [String]) -> String {
        assignedSegmentIds.isEmpty ? "Command has not assigned this team yet."
            : "Command assigned this team segments \(assignedSegmentIds.joined(separator: ", "))."
    }

    public static let permissive = """
    Rewrite the report as one line in this form and nothing else: KIND|SEGMENTS|COVERAGE
    KIND is one of cleared, sighting, clue, found, unclear. SEGMENTS is the two-letter segment ids the report names, \
    separated by spaces, or none. COVERAGE is the coverage number the report states, or none.
    """
}

/// The three read-only tools' names, descriptions and outputs. The app's tools return exactly
/// these strings, so what a tool can send is fixed here and tested on every platform.
public enum ToolText {
    public static let segmentHereName = "segmentHere"
    public static let segmentHereDescription = "Tells you which segment the team is standing in, from the phone's GPS fix."
    public static let teamAssignmentName = "teamAssignment"
    public static let teamAssignmentDescription = "Lists the segments command assigned to this team."
    public static let subjectDescriptionName = "subjectDescription"
    public static let subjectDescriptionDescription = "Describes what the subject was wearing and looks like."

    public static func segmentHere(_ positionSegmentId: String?) -> String {
        guard let id = positionSegmentId else { return "No GPS fix. Do not guess a segment." }
        return "The team is in segment \(id)."
    }

    public static func teamAssignment(_ assignedSegmentIds: [String]) -> String {
        assignedSegmentIds.isEmpty ? "No assignment yet." : "Assigned segments: \(assignedSegmentIds.joined(separator: ", "))."
    }
}

/// Everything the cloud route can send for one report (design section 9): the instructions,
/// the report text, and each tool's name, description and output. The tool outputs carry only
/// the segment id, the assignment ids and the six appearance fields of `ModelProfile`.
public enum CloudOutbound {
    public static func texts(report: String, positionSegmentId: String?, assignedSegmentIds: [String],
                             profile: ModelProfile) -> [String] {
        [PromptText.guided, report,
         ToolText.segmentHereName, ToolText.segmentHereDescription, ToolText.segmentHere(positionSegmentId),
         ToolText.teamAssignmentName, ToolText.teamAssignmentDescription, ToolText.teamAssignment(assignedSegmentIds),
         ToolText.subjectDescriptionName, ToolText.subjectDescriptionDescription, profile.toolText]
    }
}
