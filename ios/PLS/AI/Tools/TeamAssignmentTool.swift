import FoundationModels
import PLSCore

/// Read-only: the segments command assigned to this team, from the pack.
struct TeamAssignmentTool: Tool {
    let name = ToolText.teamAssignmentName
    let description = ToolText.teamAssignmentDescription
    let assignedSegmentIds: [String]

    @Generable struct Arguments {
        @Guide(description: "Leave empty") var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        ToolText.teamAssignment(assignedSegmentIds)
    }
}
