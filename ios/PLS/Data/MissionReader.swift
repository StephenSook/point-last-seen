import FirebaseFirestore
import Foundation
import PLSCore

/// Reads the member-readable documents a mission is built from.
protocol MissionReader: Sendable {
    func read(incidentId: String) async throws -> MissionDocs
    /// Calls `onPlan` with the latest approved plan now and whenever command approves a newer one;
    /// the result stops listening.
    func watchLatestPlan(incidentId: String, onPlan: @escaping @MainActor (JSONValue) -> Void) -> @Sendable () -> Void
    /// The incident's `status` ("open" while searching); nil when it has none. Throws when it
    /// cannot be read.
    func incidentStatus(incidentId: String) async throws -> String?
}

/// From Firestore, as a member of the incident (the rules let every member read these): the
/// incident, its segments, the latest approved plan and `profile/shared`. Offline, Firestore
/// answers from its cache.
struct FirestoreMissionReader: MissionReader {
    func read(incidentId: String) async throws -> MissionDocs {
        let incident = Firestore.firestore().collection("incidents").document(incidentId)
        async let incidentDoc = incident.getDocument()
        async let segments = incident.collection("segments").getDocuments()
        async let plans = incident.collection("plans").order(by: "version", descending: true).limit(to: 1).getDocuments()
        async let profile = incident.collection("profile").document("shared").getDocument()
        let incidentData = try await incidentDoc.data()
        let profileData = try await profile.data()
        return MissionDocs(incident: incidentData.map(FirestoreJSON.value) ?? .null,
                           segments: try await segments.documents.map { FirestoreJSON.value($0.data()) },
                           plan: try await plans.documents.first.flatMap { FirestoreJSON.plan($0.data()) },
                           sharedProfile: profileData.map(FirestoreJSON.value))
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
