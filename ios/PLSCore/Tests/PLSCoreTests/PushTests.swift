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
