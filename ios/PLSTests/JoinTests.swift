import FirebaseAuth
import FirebaseFunctions
import Foundation
import PLSCore
import Testing
@testable import PLS

/// Stands in for Auth and the joinIncident callable.
final class FakeJoinBackend: JoinBackend, @unchecked Sendable {
    var signedIn = true
    var reply: Result<JSONValue, JoinCallError> = .success(.object(["ok": .bool(true), "incidentId": .string("drill-dev-1")]))
    var claims: [String: JSONValue] = ["inc": .string("drill-dev-1"), "role": .string("searcher"), "team": .string("T1")]
    private(set) var steps: [String] = []
    private(set) var payloads: [[String: String]] = []

    /// Runs when the join signs in (for example, a new anonymous user being made).
    var onSignIn: (() -> Void)?
    func ensureSignedIn() async -> Bool { steps.append("signIn"); onSignIn?(); return signedIn }
    /// The claims the server sets when the call succeeds (nil leaves `claims` as they are).
    var claimsAfterJoin: [String: JSONValue]?
    /// Runs while the callable is answering (for example, the account changing meanwhile).
    var duringCall: (() -> Void)?
    func callJoin(_ payload: [String: String]) async throws -> JSONValue {
        steps.append("call")
        payloads.append(payload)
        duringCall?()
        let r = try reply.get()
        if let after = claimsAfterJoin { claims = after }
        return r
    }
    func refreshClaims() async throws -> [String: JSONValue] { steps.append("refresh"); return claims }
    private(set) var claimRefreshes: [Bool] = []
    /// When set, a forced refresh fails (no signal) and only the cached claims answer.
    var refreshFails = false
    /// When set, the next claims read waits here and then answers with the claims as they were
    /// when it started, as a slow token refresh does (one read only).
    var holdNextClaims: ReadGate?
    func currentClaims(forceRefresh: Bool) async -> [String: JSONValue]? {
        claimRefreshes.append(forceRefresh)
        let answer = forceRefresh && refreshFails ? nil : claims
        if let gate = holdNextClaims {
            holdNextClaims = nil
            await gate.wait()
        }
        return answer
    }
    /// What deleteMyAccount answers (true: the server deleted the caller's account), and a hook that runs at the call.
    var deleteAnswer = true
    private(set) var deletes = 0
    var onDelete: (() -> Void)?
    func deleteMyAccount() async -> Bool { steps.append("delete"); deletes += 1; onDelete?(); return deleteAnswer }
}

/// A searcher joins with the code and team command gave: the callable sets the claims, the phone
/// forces a token refresh and checks them before it calls itself joined.
@MainActor
@Suite struct JoinTests {
    let request = try! SearcherJoin.make(code: "abcd-efgh", teamId: "T1", incidentId: "")

    @Test func joinsThenRefreshesTheTokenAndChecksTheClaims() async {
        let backend = FakeJoinBackend()
        #expect(await Joiner(backend: backend).join(request) == .joined(incidentId: "drill-dev-1", teamId: "T1"))
        #expect(backend.steps == ["signIn", "call", "refresh"])
        #expect(backend.payloads == [["joinCode": "ABCDEFGH", "role": "searcher", "teamId": "T1"]])
    }

    @Test func claimsForAnotherTeamOrIncidentAreNotAJoin() async {
        let backend = FakeJoinBackend()
        backend.claims["team"] = .string("T2")
        #expect(await Joiner(backend: backend).join(request) == .failed(Joiner.refused))
        backend.claims = ["inc": .string("other"), "role": .string("searcher"), "team": .string("T1")]
        #expect(await Joiner(backend: backend).join(request) == .failed(Joiner.refused))
    }

    @Test func withNoSignInNothingIsCalled() async {
        let backend = FakeJoinBackend()
        backend.signedIn = false
        #expect(await Joiner(backend: backend).join(request) == .failed(Joiner.notSignedIn))
        #expect(backend.steps == ["signIn"])
    }

    @Test func everyRefusalReadsInPlainWords() async {
        let cases: [(JoinCallError, String)] = [(.refused, Joiner.refused), (.tooMany, Joiner.tooMany), (.appCheck, Joiner.appCheck),
                                                (.offline, Joiner.offline), (.other, Joiner.other)]
        for (error, message) in cases {
            let backend = FakeJoinBackend()
            backend.reply = .failure(error)
            #expect(await Joiner(backend: backend).join(request) == .failed(message))
        }
        #expect(Joiner.tooMany == "Too many join attempts. Try again in an hour.")
    }

    /// The callable's error codes, as Firebase Functions throws them.
    @Test func theCallablesErrorCodesMapToTheseRefusals() {
        func error(_ code: FunctionsErrorCode) -> NSError { NSError(domain: FunctionsErrorDomain, code: code.rawValue) }
        #expect(JoinCallError(error(.permissionDenied)) == .refused && JoinCallError(error(.invalidArgument)) == .refused)
        #expect(JoinCallError(error(.resourceExhausted)) == .tooMany)
        #expect(JoinCallError(error(.unauthenticated)) == .appCheck)
        #expect(JoinCallError(error(.unavailable)) == .offline && JoinCallError(error(.deadlineExceeded)) == .offline)
        #expect(JoinCallError(error(.internal)) == .other && JoinCallError(NSError(domain: "x", code: 1)) == .other)
    }

    /// The real adapter, with its two edges captured: it calls joinIncident with limited-use App
    /// Check tokens, refreshes the token after a join, and reads cached claims only when asked to.
    @Test func theFirebaseAdapterCallsJoinWithLimitedUseTokensAndRefreshesClaims() async throws {
        final class Seen: @unchecked Sendable { var names: [String] = []; var limitedUse: [Bool] = []; var refreshes: [Bool] = [] }
        let seen = Seen()
        let backend = FirebaseJoinBackend(signIn: { true }, callable: { name, options, _ in
            seen.names.append(name)
            seen.limitedUse.append(options.requireLimitedUseAppCheckTokens)
            return ["ok": true, "incidentId": "drill-dev-1"]
        }, tokenClaims: { force in
            seen.refreshes.append(force)
            return ["inc": "drill-dev-1", "role": "searcher", "team": "T1"]
        })
        #expect(await Joiner(backend: backend).join(request) == .joined(incidentId: "drill-dev-1", teamId: "T1"))
        _ = await backend.currentClaims(forceRefresh: false)
        #expect(seen.names == ["joinIncident"] && seen.limitedUse == [true] && seen.refreshes == [true, false])
        #expect(FirebaseJoinBackend.region == "us-central1")
    }

    /// The real adapter deletes the caller's account through the deleteMyAccount callable, with limited-use App Check
    /// tokens and an empty payload; only the server's ok counts as deleted, and an error or any other reply does not.
    @Test func theFirebaseAdapterDeletesTheAccountThroughItsCallable() async {
        final class Seen: @unchecked Sendable {
            var calls: [(String, Bool, [String: String])] = []
            var reply: Result<Any, Error> = .success(["ok": true])
        }
        let seen = Seen()
        let backend = FirebaseJoinBackend(signIn: { true }, callable: { name, options, payload in
            seen.calls.append((name, options.requireLimitedUseAppCheckTokens, payload))
            return try seen.reply.get()
        }, hasUser: { true })
        #expect(await backend.deleteMyAccount())
        #expect(seen.calls.count == 1 && seen.calls[0].0 == "deleteMyAccount" && seen.calls[0].1 && seen.calls[0].2.isEmpty)
        seen.reply = .success(["ok": false])
        #expect(await backend.deleteMyAccount() == false)
        seen.reply = .failure(NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unavailable.rawValue))
        #expect(await backend.deleteMyAccount() == false)
        seen.reply = .failure(NSError(domain: AuthErrorDomain, code: AuthErrorCode.networkError.rawValue))
        #expect(await backend.deleteMyAccount() == false)
    }

    /// An account already gone (a delete whose reply was lost) counts as deleted, so leaving cannot get stuck: Auth's
    /// own answer that the user is gone, Auth having dropped the user during the call, or no user left on the phone.
    @Test func theFirebaseAdapterCountsAnAccountAlreadyGoneAsDeleted() async {
        final class State: @unchecked Sendable { var user = true; var calls = 0; var error: Error? }
        let state = State()
        let backend = FirebaseJoinBackend(signIn: { true }, callable: { _, _, _ in
            state.calls += 1
            throw state.error!
        }, hasUser: { state.user })
        for code in [AuthErrorCode.userNotFound, .userTokenExpired, .userDisabled, .invalidUserToken] {
            state.error = NSError(domain: AuthErrorDomain, code: code.rawValue)
            #expect(await backend.deleteMyAccount(), "\(code)")
        }
        // Auth signs a gone user out during the call; any error then still means there is nothing left to delete.
        state.error = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unauthenticated.rawValue)
        #expect(await backend.deleteMyAccount() == false)
        let gone = FirebaseJoinBackend(signIn: { true }, callable: { _, _, _ in
            state.user = false
            throw NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unauthenticated.rawValue)
        }, hasUser: { state.user })
        #expect(await gone.deleteMyAccount())
        // With no user on the phone there is no account it could delete, and nothing is called.
        let before = state.calls
        #expect(await backend.deleteMyAccount() && state.calls == before)
    }
}
