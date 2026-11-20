import Testing
@testable import PLSCore

/// New-assignment pushes go to the team's topic and carry ids only (functions: P-06).
@Suite struct PushTests {
    @Test func theTeamsTopicIsNamedByIncidentAndTeam() {
        #expect(PushTopic.name(incidentId: "drill-dev-1", teamId: "T1") == "pls-drill-dev-1-T1")
        // Only ids Firestore and FCM both accept make a topic.
        #expect(PushTopic.name(incidentId: "a/b", teamId: "T1") == nil)
        #expect(PushTopic.name(incidentId: "drill-dev-1", teamId: "") == nil)
    }

    /// Team ids are the server's (functions join.ts and notify.ts): letters, digits and _ only, at most
    /// 32, never "family". With no "-" in a team id, the last "-" in a topic separates incident from
    /// team, so ("north-east", "T1") and ("north", "east-T1") can never share a topic.
    @Test func aTeamIdIsTheServersSoNoTwoTeamsShareATopic() {
        #expect(PushTopic.name(incidentId: "north", teamId: "east-T1") == nil)
        #expect(PushTopic.name(incidentId: "north-east", teamId: "T1") == "pls-north-east-T1")
        #expect(PushTopic.name(incidentId: "I1", teamId: String(repeating: "T", count: 32)) != nil)
        #expect(PushTopic.name(incidentId: "I1", teamId: String(repeating: "T", count: 33)) == nil)
        for family in ["family", "Family", "FAMILY"] { #expect(PushTopic.name(incidentId: "I1", teamId: family) == nil, "\(family)") }
        #expect(PushPayload(userInfo: ["incidentId": "north", "teamId": "east-T1", "planVersion": "1"]) == nil)
        #expect(TeamId.isValid("team_2") && !TeamId.isValid("team-2"))
    }

    @Test func aTapReadsOnlyTheIds() {
        let payload: [AnyHashable: Any] = ["incidentId": "drill-dev-1", "teamId": "T1", "planVersion": "18",
                                           "aps": ["alert": ["title": "New assignment"]], "gcm.message_id": "x"]
        #expect(PushPayload(userInfo: payload) == PushPayload(incidentId: "drill-dev-1", teamId: "T1", planVersion: 18))
        #expect(PushPayload(userInfo: ["incidentId": "drill-dev-1", "teamId": "T1", "planVersion": 18]) ==
                PushPayload(incidentId: "drill-dev-1", teamId: "T1", planVersion: 18))
        #expect(PushPayload(userInfo: ["incidentId": "drill-dev-1"]) == nil)
        #expect(PushPayload(userInfo: ["incidentId": "a/b", "teamId": "T1", "planVersion": "1"]) == nil)
    }
}
