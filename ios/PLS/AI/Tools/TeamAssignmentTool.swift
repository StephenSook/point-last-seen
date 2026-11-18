import FoundationModels

/// Read-only: the segments command assigned to this team, from the pack.
struct TeamAssignmentTool: Tool {
    let name = "teamAssignment"
    let description = "Lists the segments command assigned to this team."
    let assignedSegmentIds: [String]

    @Generable struct Arguments {
        @Guide(description: "Leave empty") var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        assignedSegmentIds.isEmpty ? "No assignment yet." : "Assigned segments: \(assignedSegmentIds.joined(separator: ", "))."
    }
}
