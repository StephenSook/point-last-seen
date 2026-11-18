import FoundationModels
import PLSCore

/// Read-only: clothing and appearance only. On the cloud route this text leaves the phone,
/// so health and behaviour fields are never in it (ModelProfile keeps six fields).
struct SubjectProfileTool: Tool {
    let name = "subjectDescription"
    let description = "Describes what the subject was wearing and looks like."
    let profile: ModelProfile

    @Generable struct Arguments {
        @Guide(description: "Leave empty") var note: String
    }

    func call(arguments: Arguments) async throws -> String { profile.toolText }
}
