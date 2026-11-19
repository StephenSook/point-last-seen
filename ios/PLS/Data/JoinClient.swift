import FirebaseAuth
import FirebaseFunctions
import Foundation
import PLSCore

/// How the joinIncident callable refused, read from its error code.
enum JoinCallError: Error, Equatable {
    /// The code, team or incident did not match (the server gives one answer for all of them).
    case refused
    /// The hour's ten attempts are spent.
    case tooMany
    /// App Check did not vouch for this copy of the app.
    case appCheck
    case offline
    case other

    init(_ error: Error) {
        let e = error as NSError
        guard e.domain == FunctionsErrorDomain, let code = FunctionsErrorCode(rawValue: e.code) else { self = .other; return }
        switch code {
        case .permissionDenied, .invalidArgument, .notFound, .failedPrecondition: self = .refused
        case .resourceExhausted: self = .tooMany
        case .unauthenticated: self = .appCheck
        case .unavailable, .deadlineExceeded: self = .offline
        default: self = .other
        }
    }
}

/// What joining needs from Auth and the joinIncident callable.
protocol JoinBackend: Sendable {
    func ensureSignedIn() async -> Bool
    /// The callable's reply; throws a `JoinCallError`.
    func callJoin(_ payload: [String: String]) async throws -> JSONValue
    /// The ID token's claims after a forced refresh, so the claims the callable just set are in it.
    func refreshClaims() async throws -> [String: JSONValue]
    /// The token's claims, read fresh from the server when `forceRefresh` (so a team change since
    /// the last token counts), or the cached token's; nil with no signed-in user or when a refresh fails.
    func currentClaims(forceRefresh: Bool) async -> [String: JSONValue]?
}

enum JoinOutcome: Equatable, Sendable {
    case joined(incidentId: String, teamId: String)
    case failed(String)
}

/// Joins an incident as a searcher with the code and team command gave. The callable sets the
/// claims { inc, role, team }; the phone forces a token refresh and checks them before it counts
/// as joined, as the Android family app does.
struct Joiner: Sendable {
    static let refused = "That code did not work. Check the code and the team with command."
    static let tooMany = "Too many join attempts. Try again in an hour."
    static let appCheck = "App Check did not vouch for this copy of the app, so the join was refused."
    static let offline = "No connection. Try again when the link is back."
    static let other = "Could not join. Check the code and the team, then try again."
    static let notSignedIn = "Not signed in yet. Check the connection and try again."

    let backend: JoinBackend

    func join(_ request: SearcherJoin) async -> JoinOutcome {
        guard await backend.ensureSignedIn() else { return .failed(Self.notSignedIn) }
        do {
            let reply = try await backend.callJoin(request.payload)
            guard reply["ok"] == .bool(true), case let .string(incidentId)? = reply["incidentId"], !incidentId.isEmpty else {
                return .failed(Self.refused)
            }
            let claims = try await backend.refreshClaims()
            guard claims["inc"] == .string(incidentId), claims["role"] == .string("searcher"), claims["team"] == .string(request.teamId) else {
                return .failed(Self.refused)
            }
            return .joined(incidentId: incidentId, teamId: request.teamId)
        } catch let error as JoinCallError {
            switch error {
            case .refused: return .failed(Self.refused)
            case .tooMany: return .failed(Self.tooMany)
            case .appCheck: return .failed(Self.appCheck)
            case .offline: return .failed(Self.offline)
            case .other: return .failed(Self.other)
            }
        } catch {
            return .failed(Self.other)
        }
    }
}

/// The real callable: us-central1, with limited-use App Check tokens (the callable enforces App
/// Check; limited-use tokens are what replay protection consumes when it is turned on), then a
/// forced ID-token refresh. The two Firebase edges are seams so a test sees exactly what is sent.
struct FirebaseJoinBackend: JoinBackend {
    static let region = "us-central1"
    static let options = HTTPSCallableOptions(requireLimitedUseAppCheckTokens: true)

    typealias Callable = @Sendable (_ name: String, _ options: HTTPSCallableOptions, _ payload: [String: String]) async throws -> Any
    typealias TokenClaims = @Sendable (_ forceRefresh: Bool) async throws -> [String: Any]?

    static let firebaseCallable: Callable = { name, options, payload in
        try await Functions.functions(region: region).httpsCallable(name, options: options).call(payload).data
    }
    static let firebaseClaims: TokenClaims = { forceRefresh in
        guard let user = Auth.auth().currentUser else { return nil }
        return try await user.getIDTokenResult(forcingRefresh: forceRefresh).claims
    }

    let signIn: @MainActor () async -> Bool
    let callable: Callable
    let tokenClaims: TokenClaims

    init(signIn: @escaping @MainActor () async -> Bool, callable: @escaping Callable = FirebaseJoinBackend.firebaseCallable,
         tokenClaims: @escaping TokenClaims = FirebaseJoinBackend.firebaseClaims) {
        self.signIn = signIn
        self.callable = callable
        self.tokenClaims = tokenClaims
    }

    func ensureSignedIn() async -> Bool { await signIn() }

    func callJoin(_ payload: [String: String]) async throws -> JSONValue {
        do {
            return FirestoreJSON.value(try await callable("joinIncident", Self.options, payload))
        } catch {
            throw JoinCallError(error)
        }
    }

    func refreshClaims() async throws -> [String: JSONValue] {
        guard let claims = try await tokenClaims(true) else { throw JoinCallError.other }
        return claims.mapValues(FirestoreJSON.value)
    }

    func currentClaims(forceRefresh: Bool) async -> [String: JSONValue]? {
        guard let claims = (try? await tokenClaims(forceRefresh)) ?? nil else { return nil }
        return claims.mapValues(FirestoreJSON.value)
    }
}
