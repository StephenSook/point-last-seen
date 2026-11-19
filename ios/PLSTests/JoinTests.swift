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
    func callJoin(_ payload: [String: String]) async throws -> JSONValue {
        steps.append("call")
        payloads.append(payload)
        return try reply.get()
    }
    func refreshClaims() async throws -> [String: JSONValue] { steps.append("refresh"); return claims }
    private(set) var claimRefreshes: [Bool] = []
    /// When set, a forced refresh fails (no signal) and only the cached claims answer.
    var refreshFails = false
    func currentClaims(forceRefresh: Bool) async -> [String: JSONValue]? {
        claimRefreshes.append(forceRefresh)
        return forceRefresh && refreshFails ? nil : claims
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

    /// The callable is in us-central1 and enforces App Check with replay protection.
    @Test func theCallableUsesLimitedUseAppCheckTokens() {
        #expect(FirebaseJoinBackend.region == "us-central1" && FirebaseJoinBackend.options.requireLimitedUseAppCheckTokens)
    }
}
