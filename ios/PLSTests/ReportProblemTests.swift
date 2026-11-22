import Foundation
import PLSCore
import Testing
@testable import PLS

/// Records each content report filed and answers with a set outcome.
@MainActor
final class FakeContentReports: ContentReportWriter {
    private(set) var filed: [(incidentId: String, reportId: String, report: ContentReport)] = []
    var outcome: ContentReportOutcome = .sent
    func file(_ report: ContentReport, reportId: String, incidentId: String) async -> ContentReportOutcome {
        filed.append((incidentId, reportId, report))
        return outcome
    }
}

/// Report a problem: a searcher flags the team's task or the family's description to command.
@MainActor
@Suite struct ReportProblemTests {
    func docs() throws -> MissionDocs {
        let segments = try DrillDocs.segments()
        let first = segments.compactMap { if case let .string(id)? = $0["segmentId"], id != "ROW" { id } else { nil } }.first ?? ""
        return MissionDocs(incident: try DrillDocs.incident(status: "open", closedReason: nil), segments: segments,
                           plan: DrillDocs.plan(segmentIds: [first]), sharedProfile: DrillDocs.shared)
    }

    func model(_ reports: FakeContentReports, docs: MissionDocs?) -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                 speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }), uid: { "uid-1" },
                 joinBackend: FakeJoinBackend(), missionReader: FakeMissionReader(docs: docs), pushTopics: FakePushTopics(),
                 alerts: FakeAlerts(), defaults: UserDefaults(suiteName: "report-\(UUID().uuidString)")!, contentReports: reports)
    }

    @Test func aLoadedSearchOffersTheTaskAndTheFamilysDescription() async throws {
        let m = model(FakeContentReports(), docs: try docs())
        #expect(m.reportTargets.isEmpty)
        await m.trySignIn()
        #expect(m.reportTargets == [.task, .familyDescription])
    }

    /// The report goes to the loaded search as this searcher, about the plan the task came from, with the note's
    /// phone numbers removed before it leaves the phone.
    @Test func aTaskReportGoesToTheSearchAsThisSearcher() async throws {
        let reports = FakeContentReports()
        let m = model(reports, docs: try docs())
        await m.trySignIn()
        let result = await m.reportProblem(about: .task, reason: .wrongOrMisleading, note: "Trail is closed, call 404-555-0123")
        #expect(result == .sent)
        let filed = try #require(reports.filed.first)
        #expect(reports.filed.count == 1 && filed.incidentId == m.mission?.incidentId)
        #expect(filed.reportId.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil)
        #expect(filed.report.authorUid == "uid-1" && filed.report.role == .searcher && filed.report.target == .task)
        #expect(filed.report.targetId == "0002" && filed.report.reason == .wrongOrMisleading)
        #expect(filed.report.note == "Trail is closed, call \(PhoneNumbers.replacement)")
    }

    @Test func theFamilysDescriptionIsNamedByNoId() async throws {
        let reports = FakeContentReports()
        let m = model(reports, docs: try docs())
        await m.trySignIn()
        #expect(await m.reportProblem(about: .familyDescription, reason: .personalInformation, note: "") == .sent)
        #expect(reports.filed.first?.report.targetId == nil && reports.filed.first?.report.note == nil)
    }

    /// With no search loaded there is nothing to report and nothing is written.
    @Test func noSearchSendsNothing() async throws {
        let reports = FakeContentReports()
        let m = model(reports, docs: nil)
        await m.trySignIn()
        #expect(m.mission == nil && m.reportTargets.isEmpty)
        #expect(await m.reportProblem(about: .task, reason: .other, note: "x") == .unavailable)
        #expect(reports.filed.isEmpty)
    }

    @Test func eachOutcomeSaysWhatHappened() async throws {
        let reports = FakeContentReports()
        let m = model(reports, docs: try docs())
        await m.trySignIn()
        for (outcome, result) in [(ContentReportOutcome.sent, ReportProblemResult.sent), (.waiting, .waiting), (.refused, .refused),
                                  (.failed, .failed)] {
            reports.outcome = outcome
            #expect(await m.reportProblem(about: .task, reason: .abusive, note: "") == result)
        }
        #expect(ReportProblemResult.sent.line == "Sent to command.")
        #expect(ReportProblemResult.waiting.line == "Saved on this phone. It goes to command when this phone has signal.")
        #expect(ReportProblemResult.refused.line == "Not sent: command does not take reports from this phone in this search.")
        #expect(ReportProblemResult.failed.line == "Not sent. Try again.")
    }

    /// The security rules' refusal is a refusal; any other error can be tried again.
    @Test func firestoreErrorsMapToOutcomes() {
        #expect(FirestoreContentReportWriter.outcome(nil) == .sent)
        #expect(FirestoreContentReportWriter.outcome(NSError(domain: "FIRFirestoreErrorDomain", code: 7)) == .refused)
        #expect(FirestoreContentReportWriter.outcome(NSError(domain: "FIRFirestoreErrorDomain", code: 14)) == .failed)
        #expect(FirestoreContentReportWriter.outcome(URLError(.notConnectedToInternet)) == .failed)
    }
}
