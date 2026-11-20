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
        #expect(ReportPrompt.onDeviceGuidedText == PromptText.onDeviceGuided)
    }

    /// Apple's model reads the report alone: no description tool and no instruction to compare with one,
    /// so it cannot copy the subject's description into a reading. The cloud keeps its three tools.
    @Test func applesModelGetsNoDescriptionTool() {
        let tools: [any Tool] = [SegmentAtTool(positionSegmentId: "AC"), TeamAssignmentTool(assignedSegmentIds: ["AC"]),
                                 SubjectProfileTool(profile: ModelProfile(shared: .null))]
        #expect(FoundationModelRunner.onDeviceTools(tools).map(\.name) == [ToolText.segmentHereName, ToolText.teamAssignmentName])
        #expect(!PromptText.onDeviceGuided.contains("subjectDescription"))
        #expect(PromptText.guided.contains("subjectDescription"))
    }

    /// Apple's model reads with greedy sampling, so the same report gets the same answer every time.
    @Test func applesModelReadsWithGreedySampling() {
        #expect(FoundationModelRunner.onDeviceOptions == GenerationOptions(samplingMode: .greedy))
    }

    /// Apple's model is told the quote may not be empty; the cloud prompt (and its allow-list) is unchanged.
    @Test func applesModelIsToldTheQuoteMayNotBeEmpty() {
        #expect(PromptText.onDeviceGuided.contains("never leave it empty"))
        #expect(!PromptText.guided.contains("never leave it empty"))
    }
}
