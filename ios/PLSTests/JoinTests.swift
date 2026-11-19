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

    func ensureSignedIn() async -> Bool { steps.append("signIn"); return signedIn }
    /// The claims the server sets when the call succeeds (nil leaves `claims` as they are).
    var claimsAfterJoin: [String: JSONValue]?
    func callJoin(_ payload: [String: String]) async throws -> JSONValue {
        steps.append("call")
        payloads.append(payload)
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
}
