import Foundation
import PLSCore
import Testing
@testable import PLS

/// Block on this phone: a searcher hides the family's description of the person on this phone, for this search, and can
/// show it again. Nothing is sent; command still has the description.
@MainActor
@Suite struct BlockOnThisPhoneTests {
    func docs(shared: Bool = true) throws -> MissionDocs {
        let segments = try DrillDocs.segments()
        let first = segments.compactMap { if case let .string(id)? = $0["segmentId"], id != "ROW" { id } else { nil } }.first ?? ""
        return MissionDocs(incident: try DrillDocs.incident(status: "open", closedReason: nil), segments: segments,
                           plan: DrillDocs.plan(segmentIds: [first]), sharedProfile: shared ? DrillDocs.shared : nil)
    }

    func model(_ defaults: UserDefaults, docs: MissionDocs?, reports: FakeContentReports = FakeContentReports()) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                 speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }), uid: { "uid-1" },
                 joinBackend: FakeJoinBackend(), missionReader: FakeMissionReader(docs: docs), pushTopics: FakePushTopics(),
                 alerts: FakeAlerts(), defaults: defaults, contentReports: reports)
    }

    func freshDefaults() -> UserDefaults { UserDefaults(suiteName: "block-\(UUID().uuidString)")! }

    /// Blocking hides the description for this search, stays after the app starts again, and Show again undoes it.
    @Test func blockingHidesTheDescriptionUntilShownAgain() async throws {
        let defaults = freshDefaults()
        let m = model(defaults, docs: try docs())
        await m.trySignIn()
        #expect(m.canBlockFamilyDescription && !m.familyDescriptionBlocked)
        m.blockFamilyDescription()
        #expect(m.familyDescriptionBlocked)
        let restarted = model(defaults, docs: try docs())
        await restarted.trySignIn()
        #expect(restarted.familyDescriptionBlocked)
        restarted.showFamilyDescriptionAgain()
        #expect(!restarted.familyDescriptionBlocked)
        let again = model(defaults, docs: try docs())
        await again.trySignIn()
        #expect(!again.familyDescriptionBlocked)
    }

    /// A block is for the search it was made in: another search's description shows.
    @Test func aBlockInAnotherSearchHidesNothingHere() async throws {
        let defaults = freshDefaults()
        defaults.set(["another-incident"], forKey: AppModel.blockedDescriptionsKey)
        let m = model(defaults, docs: try docs())
        await m.trySignIn()
        #expect(m.mission != nil && !m.familyDescriptionBlocked)
    }

    /// With no description there is nothing to block, and asking to block changes nothing.
    @Test func noDescriptionNothingToBlock() async throws {
        let defaults = freshDefaults()
        let m = model(defaults, docs: try docs(shared: false))
        await m.trySignIn()
        #expect(m.mission != nil && !m.canBlockFamilyDescription)
        m.blockFamilyDescription()
        #expect(!m.familyDescriptionBlocked && defaults.stringArray(forKey: AppModel.blockedDescriptionsKey) == nil)
    }

    /// The practice drill's description is bundled sample data, not a member's: nothing there blocks or unblocks, so
    /// practice never touches a block kept for the real search it shares its id with.
    @Test func thePracticeDrillNeitherBlocksNorUnblocks() async throws {
        let defaults = freshDefaults()
        let m = model(defaults, docs: nil)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("block-practice-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        #expect(await m.startPractice(directory: dir) == nil)
        let practiceId = try #require(m.mission?.incidentId)
        #expect(m.mission?.isPractice == true && !m.canBlockFamilyDescription)
        m.blockFamilyDescription()
        #expect(!m.familyDescriptionBlocked && defaults.stringArray(forKey: AppModel.blockedDescriptionsKey) == nil)
        // A block kept for the real search with the same id is neither shown as practice's nor cleared by it.
        defaults.set([practiceId], forKey: AppModel.blockedDescriptionsKey)
        let again = model(defaults, docs: nil)
        #expect(await again.startPractice(directory: dir) == nil)
        #expect(!again.familyDescriptionBlocked)
        again.showFamilyDescriptionAgain()
        #expect(defaults.stringArray(forKey: AppModel.blockedDescriptionsKey) == [practiceId])
    }

    /// Blocking is on this phone only: no report or anything else is filed.
    @Test func blockingSendsNothing() async throws {
        let reports = FakeContentReports()
        let m = model(freshDefaults(), docs: try docs(), reports: reports)
        await m.trySignIn()
        m.blockFamilyDescription()
        #expect(m.familyDescriptionBlocked && reports.filed.isEmpty)
    }
}
