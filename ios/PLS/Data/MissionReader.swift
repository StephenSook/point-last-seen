import FirebaseFirestore
import Foundation
import PLSCore

/// A read the security rules refused: this user may no longer read the incident.
enum MissionReadError: Error, Equatable {
    case accessDenied
}

/// Reads the member-readable documents a mission is built from.
protocol MissionReader: Sendable {
    /// `fromServer` reads only from the server (a push tap), never from the cache; it throws when
    /// the server cannot be reached, and `MissionReadError.accessDenied` when the rules refuse it.
    func read(incidentId: String, fromServer: Bool) async throws -> MissionDocs
    /// Calls `onPlan` with the latest approved plan now and whenever command approves a newer one;
    /// the result stops listening.
    func watchLatestPlan(incidentId: String, onPlan: @escaping @MainActor (JSONValue) -> Void) -> @Sendable () -> Void
    /// The incident's `status` ("open" while searching); nil when it has none. Throws when it
    /// cannot be read.
    func incidentStatus(incidentId: String) async throws -> String?
}

extension MissionReader {
    /// A read that may come from the cache (offline use).
    func read(incidentId: String) async throws -> MissionDocs { try await read(incidentId: incidentId, fromServer: false) }
}

/// From Firestore, as a member of the incident (the rules let every member read these): the
/// incident, its segments, the latest approved plan and `profile/shared`. Offline, Firestore
/// answers from its cache, except for a read that must come from the server.
struct FirestoreMissionReader: MissionReader {
    func read(incidentId: String, fromServer: Bool) async throws -> MissionDocs {
        let source: FirestoreSource = fromServer ? .server : .default
        let incident = Firestore.firestore().collection("incidents").document(incidentId)
        do {
            async let incidentDoc = incident.getDocument(source: source)
            async let segments = incident.collection("segments").getDocuments(source: source)
            async let plans = incident.collection("plans").order(by: "version", descending: true).limit(to: 1).getDocuments(source: source)
            async let profile = incident.collection("profile").document("shared").getDocument(source: source)
            let incidentData = try await incidentDoc.data()
            let profileData = try await profile.data()
            return MissionDocs(incident: incidentData.map(FirestoreJSON.value) ?? .null,
                               segments: try await segments.documents.map { FirestoreJSON.value($0.data()) },
                               plan: try await plans.documents.first.flatMap { FirestoreJSON.plan($0.data()) },
                               sharedProfile: profileData.map(FirestoreJSON.value))
        } catch let error as NSError where error.domain == FirestoreErrorDomain
                    && error.code == FirestoreErrorCode.permissionDenied.rawValue {
            throw MissionReadError.accessDenied
        }
    }

    func incidentStatus(incidentId: String) async throws -> String? {
        try await Firestore.firestore().collection("incidents").document(incidentId).getDocument().data()?["status"] as? String
    }

    func watchLatestPlan(incidentId: String, onPlan: @escaping @MainActor (JSONValue) -> Void) -> @Sendable () -> Void {
        let registration = Firestore.firestore().collection("incidents").document(incidentId).collection("plans")
            .order(by: "version", descending: true).limit(to: 1)
            .addSnapshotListener { snapshot, _ in
                guard let doc = snapshot?.documents.first, let plan = FirestoreJSON.plan(doc.data()) else { return }
                Task { @MainActor in onPlan(plan) }
            }
        let box = Registration(registration)
        return { box.remove() }
    }

    /// Firestore's registration is safe to remove from any thread; the box only carries it.
    final class Registration: @unchecked Sendable {
        private let registration: any ListenerRegistration
        init(_ registration: any ListenerRegistration) { self.registration = registration }
        func remove() { registration.remove() }
    }
}
