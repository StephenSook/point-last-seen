import FirebaseFirestore
import Foundation
import PLSCore

/// What became of a content report: the server took it, it waits on this phone for signal, the security rules
/// refused it, or it failed another way and can be tried again.
enum ContentReportOutcome: Equatable, Sendable {
    case sent, waiting, refused, failed
}

/// What the reporter is told after Send.
enum ReportProblemResult: Equatable, Sendable {
    case sent, waiting, refused, failed
    /// No search is loaded, or it has nothing of that kind to report.
    case unavailable

    init(_ outcome: ContentReportOutcome) {
        switch outcome {
        case .sent: self = .sent
        case .waiting: self = .waiting
        case .refused: self = .refused
        case .failed: self = .failed
        }
    }

    var line: String {
        switch self {
        case .sent: "Sent to command."
        case .waiting: "Saved on this phone. It goes to command when this phone has signal."
        case .refused: "Not sent: command does not take reports from this phone in this search."
        case .failed: "Not sent. Try again."
        case .unavailable: "Join a search to report a problem."
        }
    }
}

/// Files a member's content report (Report a problem) to command.
@MainActor
protocol ContentReportWriter {
    func file(_ report: ContentReport, reportId: String, incidentId: String) async -> ContentReportOutcome
}

/// Firestore: `incidents/{incidentId}/contentReports/{reportId}`, created once with the server's time in `createdAt`
/// (the create rule requires `createdAt == request.time`). Without signal Firestore keeps the write on this phone and
/// sends it later, so after a short wait the report reads as waiting rather than lost.
@MainActor
final class FirestoreContentReportWriter: ContentReportWriter {
    /// How long to wait for the server before saying the report waits for signal.
    private let wait: Duration

    init(wait: Duration = .seconds(8)) { self.wait = wait }

    func file(_ report: ContentReport, reportId: String, incidentId: String) async -> ContentReportOutcome {
        guard var data = JSONValue.object(report.fields).firestoreValue as? [String: Any] else { return .failed }
        data["createdAt"] = FieldValue.serverTimestamp()
        let ref = Firestore.firestore().collection("incidents").document(incidentId).collection("contentReports").document(reportId)
        let answer = FirstAnswer<ContentReportOutcome>()
        return await withCheckedContinuation { continuation in
            answer.continuation = continuation
            ref.setData(data) { error in
                Task { @MainActor in answer.give(Self.outcome(error)) }
            }
            Task { @MainActor [wait] in
                try? await Task.sleep(for: wait)
                answer.give(.waiting)
            }
        }
    }

    /// The security rules' refusal (permission denied) is final; any other error can be tried again.
    nonisolated static func outcome(_ error: (any Error)?) -> ContentReportOutcome {
        guard let error else { return .sent }
        let e = error as NSError
        if e.domain == FirestoreErrorDomain, e.code == FirestoreErrorCode.permissionDenied.rawValue { return .refused }
        return .failed
    }
}

/// Resumes its continuation with the first answer given; later answers change nothing.
@MainActor
private final class FirstAnswer<Value: Sendable> {
    var continuation: CheckedContinuation<Value, Never>?

    func give(_ value: Value) {
        continuation?.resume(returning: value)
        continuation = nil
    }
}
