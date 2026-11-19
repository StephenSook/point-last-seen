import FirebaseFirestore
import Foundation
import PLSCore

/// Reads the member-readable documents a mission is built from.
protocol MissionReader: Sendable {
    func read(incidentId: String) async throws -> MissionDocs
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
                           plan: try await plans.documents.first.map { FirestoreJSON.value($0.data()) },
                           sharedProfile: profileData.map(FirestoreJSON.value))
    }
}
