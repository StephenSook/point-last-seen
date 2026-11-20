import Foundation
import FoundationModels
import PLSCore
import Testing
@testable import PLS

/// The app's tools must send exactly the Core text that `cloudPromptHoldsOnlyNamedFields` pins.
@Suite struct ToolsTests {
    @Test func segmentHereSendsTheCoreText() async throws {
        let tool = SegmentAtTool(positionSegmentId: "AC")
        #expect(tool.name == ToolText.segmentHereName && tool.description == ToolText.segmentHereDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == ToolText.segmentHere("AC"))
        #expect(try await SegmentAtTool(positionSegmentId: nil).call(arguments: .init(note: "")) == ToolText.segmentHere(nil))
    }

    @Test func teamAssignmentSendsTheCoreText() async throws {
        let tool = TeamAssignmentTool(assignedSegmentIds: ["AB", "AD"])
        #expect(tool.name == ToolText.teamAssignmentName && tool.description == ToolText.teamAssignmentDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == ToolText.teamAssignment(["AB", "AD"]))
    }

    @Test func subjectDescriptionSendsOnlyTheAppearanceText() async throws {
        let shared: JSONValue = .object(["clothingLastWorn": .string("blue robe"), "dementiaType": .string("lewy_body"), "flags": .object(["seizures": .bool(true)])])
        let tool = SubjectProfileTool(profile: ModelProfile(shared: shared))
        #expect(tool.name == ToolText.subjectDescriptionName && tool.description == ToolText.subjectDescriptionDescription)
        #expect(try await tool.call(arguments: .init(note: "")) == "Clothing last worn: blue robe.")
    }

    @Test func theInstructionsAreTheCoreText() {
        #expect(ReportPrompt.guidedText == PromptText.guided)
        #expect(ReportPrompt.permissiveText == PromptText.permissive)
    }

    /// Apple's model gets no tools (with greedy sampling it called the team-assignment tool in a loop). Its
    /// session is checked through the transcript's tool definitions; a session made with a tool shows one, so
    /// the check can fail.
    @Test func applesModelsSessionHasZeroTools() {
        let tools: [any Tool] = [SegmentAtTool(positionSegmentId: "AC"), TeamAssignmentTool(assignedSegmentIds: ["AC", "AD"]),
                                 SubjectProfileTool(profile: ModelProfile(shared: .null))]
        #expect(Self.toolDefinitions(FoundationModelRunner.onDeviceSession(tools)) == 0)
        #expect(Self.toolDefinitions(LanguageModelSession(tools: [TeamAssignmentTool(assignedSegmentIds: [])], instructions: "x")) == 1)
        #expect(FoundationModelRunner.onDeviceInstructionsText(tools) == PromptText.onDeviceGuided(positionSegmentId: "AC", assignedSegmentIds: ["AC", "AD"]))
        let noFix: [any Tool] = [SegmentAtTool(positionSegmentId: nil), TeamAssignmentTool(assignedSegmentIds: ["BO"])]
        #expect(FoundationModelRunner.onDeviceInstructionsText(noFix) == PromptText.onDeviceGuided(positionSegmentId: nil, assignedSegmentIds: ["BO"]))
        #expect(PromptText.guided.contains(ToolText.segmentHereName) && PromptText.guided.contains(ToolText.subjectDescriptionName))
    }

    static func toolDefinitions(_ session: LanguageModelSession) -> Int? {
        guard case let .instructions(i)? = session.transcript.first else { return nil }
        return i.toolDefinitions.count
    }

    /// Apple's model reads with greedy sampling, so the same report gets the same answer every time, and its
    /// answer is capped, so a read that runs away ends in seconds instead of holding the model.
    @Test func applesModelReadsWithGreedySamplingAndACap() {
        #expect(FoundationModelRunner.onDeviceOptions == GenerationOptions(samplingMode: .greedy, maximumResponseTokens: 512))
    }

    /// Apple's model is told the quote may not be empty; the cloud prompt (and its allow-list) is unchanged.
    @Test func applesModelIsToldTheQuoteMayNotBeEmpty() {
        #expect(PromptText.onDeviceGuided(positionSegmentId: nil, assignedSegmentIds: []).contains("never leave it empty"))
        #expect(!PromptText.guided.contains("never leave it empty"))
    }
}
