import FoundationModels
import PLSCore

/// Read-only: the segment under the team's current GPS fix, computed in code.
struct SegmentAtTool: Tool {
    let name = ToolText.segmentHereName
    let description = ToolText.segmentHereDescription
    let positionSegmentId: String?

    @Generable struct Arguments {
        @Guide(description: "Leave empty") var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        ToolText.segmentHere(positionSegmentId)
    }
}
