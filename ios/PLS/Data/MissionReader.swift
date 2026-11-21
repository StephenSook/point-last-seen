import FirebaseFirestore
import Foundation
import PLSCore

/// A read the security rules refused: this user may no longer read the incident.
enum MissionReadError: Error, Equatable {
    case accessDenied
}

/// An incident's state as the phone needs it: whether it is open, and why command ended it.
struct IncidentState: Sendable, Equatable {
    var status: String?
    var closedReason: String?

    init(status: String?, closedReason: String?) {
        self.status = status
        self.closedReason = closedReason
    }

    init(incident: JSONValue) {
        if case let .string(s)? = incident["status"] { status = s } else { status = nil }
        if case let .string(r)? = incident["closedReason"] { closedReason = r } else { closedReason = nil }
    }

    var isOpen: Bool { status == "open" }
    /// What the phone says once the incident is not open (the command post's own line for a search it ended).
    var endedLine: String { EchoText.endedLine(status: status, closedReason: closedReason) }
}

/// Reads the member-readable documents a mission is built from.
protocol MissionReader: Sendable {
    /// `fromServer` reads only from the server (a push tap), never from the cache; it throws when
    /// the server cannot be reached, and `MissionReadError.accessDenied` when the rules refuse it.
    func read(incidentId: String, fromServer: Bool) async throws -> MissionDocs
    /// Calls `onPlan` with the latest approved plan now and whenever command approves a newer one;
    /// the result stops listening.
    func watchLatestPlan(incidentId: String, onPlan: @escaping @MainActor (JSONValue) -> Void) -> @Sendable () -> Void
    /// The incident's status ("open" while searching) and the reason command gave for ending it. Throws when it
    /// cannot be read.
    func incidentState(incidentId: String) async throws -> IncidentState
    /// Calls `onState` with the incident's state now and whenever it changes (command ends the search); the result
    /// stops listening.
    func watchIncident(incidentId: String, onState: @escaping @MainActor (IncidentState) -> Void) -> @Sendable () -> Void
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

    func incidentState(incidentId: String) async throws -> IncidentState {
        let data = try await Firestore.firestore().collection("incidents").document(incidentId).getDocument().data()
        return IncidentState(status: data?["status"] as? String, closedReason: data?["closedReason"] as? String)
    }

    func watchIncident(incidentId: String, onState: @escaping @MainActor (IncidentState) -> Void) -> @Sendable () -> Void {
        let registration = Firestore.firestore().collection("incidents").document(incidentId).addSnapshotListener { snapshot, _ in
            guard let data = snapshot?.data() else { return }
            let state = IncidentState(status: data["status"] as? String, closedReason: data["closedReason"] as? String)
            Task { @MainActor in onState(state) }
        }
        let box = Registration(registration)
        return { box.remove() }
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
