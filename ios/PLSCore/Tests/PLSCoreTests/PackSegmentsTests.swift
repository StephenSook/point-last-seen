import Foundation
import Testing
@testable import PLSCore

@Suite struct PackSegmentsTests {
    func cell(_ id: String, _ poa: Double, lon: Double) -> JSONValue {
        let ring = "[[\(lon),0],[\(lon + 0.001),0],[\(lon + 0.001),0.001],[\(lon),0.001],[\(lon),0]]"
        return .object(["segmentId": .string(id), "areaM2": .number(15_625), "centroid": .object(["lat": .number(0.0005), "lon": .number(lon + 0.0005)]),
                        "geometryJson": .string("{\"type\":\"Polygon\",\"coordinates\":[\(ring)]}"), "neighbors": .array([]),
                        "downstream": .array([]), "upstream": .array([]), "priorPoa": .number(poa), "ringPoa": .number(poa), "priorVersion": .number(2)])
    }
    let row: JSONValue = .object(["segmentId": .string("ROW"), "priorPoa": .number(0.4), "ringPoa": .number(0.4), "priorVersion": .number(2),
                                   "areaM2": .null, "centroid": .null, "geometryJson": .null, "neighbors": .array([]), "upstream": .array([]), "downstream": .array([])])

    @Test func gridIsInCodePointOrderAndRowComesLastInThePrior() throws {
        let p = try PackSegments.parse([row, cell("AB", 0.25, lon: 10.001), cell("AA", 0.35, lon: 10.0)])
        #expect(p.grid.map(\.segmentId) == ["AA", "AB"])
        #expect(p.prior == [SegmentPrior(segmentId: "AA", priorPoa: 0.35), SegmentPrior(segmentId: "AB", priorPoa: 0.25), SegmentPrior(segmentId: "ROW", priorPoa: 0.4)])
        #expect(p.priorVersion == 2)
        #expect(Geo.segment(containing: Position(lat: 0.0005, lon: 10.0015, accuracyM: 5), in: p.grid) == "AB")
    }

    @Test func aPackWithoutRowIsRefused() {
        #expect(throws: PackSegments.PackError.missingRow) { try PackSegments.parse([cell("AA", 0.6, lon: 10)]) }
    }

    @Test func aBrokenSegmentNamesItself() {
        guard case var .object(bad) = cell("AC", 0.1, lon: 10) else { return }
        bad["geometryJson"] = .string("not json")
        #expect(throws: PackSegments.PackError.badSegment("AC")) { try PackSegments.parse([.object(bad), row]) }
    }

    @Test func mixedPriorVersionsAreRefused() {
        guard case var .object(old) = cell("AB", 0.2, lon: 10.001) else { return }
        old["priorVersion"] = .number(1)
        #expect(throws: PackSegments.PackError.mixedPriorVersions) { try PackSegments.parse([cell("AA", 0.4, lon: 10), .object(old), row]) }
    }
}
