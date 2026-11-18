import Testing
@testable import PLSCore

@Suite struct EventIDTests {
    @Test func eventIdIsLengthPrefixedSha256Truncated() {
        // Reference: Python hashlib over 4-byte big-endian length + UTF-8 per field.
        #expect(EventID.make(incidentId: "I1", deviceId: "D1", seq: 1) == "72516706d9ed9ce4cfd89f527aeec765")
    }

    @Test func fieldsAreNeverJoinedWithASeparator() {
        let a = EventID.make(incidentId: "ab", deviceId: "c", seq: 1)
        let b = EventID.make(incidentId: "a", deviceId: "bc", seq: 1)
        #expect(a == "1633200e31aaefaf098fbbd2c3fe56a9")
        #expect(b == "1911efefeca07147c267a9e23738a131")
        #expect(a != b)
        #expect(a.count == 32)
    }

    @Test func eventSetHashIsOrderFreeAndChangesWithPriorVersion() {
        let ids = [String(repeating: "f", count: 32), String(repeating: "0", count: 32)]
        let h1 = EventSet.hash(priorVersion: 1, eventIds: ids)
        #expect(h1 == "8a0decfd87dccb6af7048ec14121444a4a3d9a5dbe6716e850d1da331d0757ee")
        #expect(EventSet.hash(priorVersion: 1, eventIds: ids.reversed()) == h1)
        #expect(EventSet.hash(priorVersion: 1, eventIds: ids + ids) == h1)
        #expect(EventSet.hash(priorVersion: 2, eventIds: ids) == "a384bb79c65eba5282e4f27ebb1f3e5309fc44a16949bb3ae289236a14bd2cb4")
    }

    @Test func emptySetHashesThePriorVersionAlone() {
        #expect(EventSet.hash(priorVersion: 1, eventIds: []) == "86e1b5d0cd65e7681ee285f08a12933fc359e902c6923b7a51e77c8f511020d0")
    }

    @Test func convergenceCodeIsFourCrockfordCharactersMostSignificantFirst() {
        #expect(EventSet.convergenceCode("8a0decfd87dccb6af7048ec14121444a4a3d9a5dbe6716e850d1da331d0757ee") == "H86Y")
        #expect(EventSet.convergenceCode("86e1b5d0cd65e7681ee285f08a12933fc359e902c6923b7a51e77c8f511020d0") == "GVGV")
        let code = EventSet.convergenceCode(EventSet.hash(priorVersion: 7, eventIds: ["x"]))
        #expect(code.count == 4)
        #expect(code.allSatisfy { "0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains($0) })
    }
}
