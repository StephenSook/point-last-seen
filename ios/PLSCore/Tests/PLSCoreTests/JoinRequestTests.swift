import Testing
@testable import PLSCore

/// The searcher's join, checked on the phone the way the joinIncident callable checks it, so a
/// malformed code never spends one of the hour's ten attempts.
@Suite struct JoinRequestTests {
    @Test func aCodeIsReadWithoutCaseSpacesOrHyphens() {
        #expect(JoinCode.normalize(" ab cd-1234 ") == "ABCD1234")
        #expect(JoinCode.normalize("abcd\t1234") == "ABCD1234")
        #expect(JoinCode.isWellFormed("abcd-efgh"))
        #expect(JoinCode.isWellFormed("0123 4567"))
    }

    /// Eight symbols of the Crockford alphabet: no I, L, O or U, as the server requires.
    @Test func onlyEightCrockfordSymbolsAreACode() {
        for bad in ["ABCDEFG", "ABCDEFGHJ", "ABCDEFGI", "ABCDEFGL", "ABCDEFGO", "ABCDEFGU", "ABCD#FGH", ""] {
            #expect(!JoinCode.isWellFormed(bad), "\(bad)")
        }
    }

    @Test func aSearcherJoinNamesItsTeamAndMayNameTheIncident() throws {
        let join = try SearcherJoin.make(code: "abcd-efgh", teamId: " T1 ", incidentId: "")
        #expect(join.payload == ["joinCode": "ABCDEFGH", "role": "searcher", "teamId": "T1"])
        let named = try SearcherJoin.make(code: "ABCDEFGH", teamId: "T1", incidentId: "drill-dev-1")
        #expect(named.payload["incidentId"] == "drill-dev-1")
    }

    @Test func aJoinThatCannotWorkSaysWhyBeforeAnyCall() {
        #expect(throws: SearcherJoin.InputError.code) { try SearcherJoin.make(code: "ABC", teamId: "T1", incidentId: "") }
        #expect(throws: SearcherJoin.InputError.team) { try SearcherJoin.make(code: "ABCDEFGH", teamId: "", incidentId: "") }
        #expect(throws: SearcherJoin.InputError.team) { try SearcherJoin.make(code: "ABCDEFGH", teamId: "T 1", incidentId: "") }
        #expect(throws: SearcherJoin.InputError.incident) { try SearcherJoin.make(code: "ABCDEFGH", teamId: "T1", incidentId: "a/b") }
        // The server's team rule: no "-", at most 32, never "family".
        for team in ["east-T1", String(repeating: "T", count: 33), "family", "Family"] {
            #expect(throws: SearcherJoin.InputError.team, "\(team)") { try SearcherJoin.make(code: "ABCDEFGH", teamId: team, incidentId: "") }
        }
        #expect(SearcherJoin.InputError.code.message == "The join code has 8 letters and numbers.")
        #expect(SearcherJoin.InputError.team.message == "Type the team command gave you, for example T1.")
    }
}
