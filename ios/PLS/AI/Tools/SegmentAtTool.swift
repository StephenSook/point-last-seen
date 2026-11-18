import FoundationModels

/// Read-only: the segment under the team's current GPS fix, computed in code.
struct SegmentAtTool: Tool {
    let name = "segmentHere"
    let description = "Tells you which segment the team is standing in, from the phone's GPS fix."
    let positionSegmentId: String?

    @Generable struct Arguments {
        @Guide(description: "Leave empty") var note: String
    }

    func call(arguments: Arguments) async throws -> String {
        guard let id = positionSegmentId else { return "No GPS fix. Do not guess a segment." }
        return "The team is in segment \(id)."
    }
}
