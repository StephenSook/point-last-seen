import Foundation
import Testing
@testable import PLSCore

@Suite struct MeasurementTests {
    @Test func theTimingDocHasTheThreeSpecFieldsAndItsPath() throws {
        let m = ReadMeasurement(submittedAtMs: 1_000, readDoneAtMs: 1_900, redrawnAtMs: 1_950)
        guard case let .object(o) = try JSONValue(encoding: m) else { Issue.record("not an object"); return }
        #expect(Set(o.keys) == ["submittedAtMs", "readDoneAtMs", "redrawnAtMs"])
        #expect(m.readMs == 900)
        #expect(m.redrawMs == 50)
        #expect(ReadMeasurement.path(incidentId: "I1", teamId: "T1", deviceId: "uid-1", eventId: "e1")
                == "incidents/I1/teams/T1/devices/uid-1/measurements/e1")
    }
}
