import Foundation
import PLSCore
import Testing
@testable import PLS

/// The drill incident as the phone reads it after joining: the seed's incident fields
/// (tools/seed/seed_drill.py, urban terrain, the engine settings copied in), the real segment
/// documents from shared/test-vectors/pack-segments-sample.json, an approved plan and the shared
/// profile with other names.
enum DrillDocs {
    static let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    /// Firestore's typed REST value as the SDK gives it to the app.
    static func plain(_ v: JSONValue) -> JSONValue {
        if case let .string(s)? = v["stringValue"] { return .string(s) }
        if case let .string(s)? = v["integerValue"], let n = Int64(s) { return .number(Double(n)) }
        if case let .number(n)? = v["doubleValue"] { return .number(n) }
        if case let .bool(b)? = v["booleanValue"] { return .bool(b) }
        if v["nullValue"] != nil { return .null }
        if let array = v["arrayValue"] {
            guard case let .array(values)? = array["values"] else { return .array([]) }
            return .array(values.map(plain))
        }
        if let map = v["mapValue"] {
            guard case let .object(fields)? = map["fields"] else { return .object([:]) }
            return .object(fields.mapValues(plain))
        }
        return v
    }

    static func segments() throws -> [JSONValue] {
        let sample = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: root.appendingPathComponent("shared/test-vectors/pack-segments-sample.json")))
        guard case let .array(docs)? = sample["segments"] else { throw CocoaError(.fileReadCorruptFile) }
        return docs.compactMap { if case let .object(f)? = $0["fields"] { .object(f.mapValues(plain)) } else { nil } }
    }

    static func incident(status: String = "open", priorVersion: Double = 5) throws -> JSONValue {
        let constants = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: root.appendingPathComponent("shared/constants/engine-params.json")))
        return .object([
            "name": .string("Drill dev 1"), "mode": .string("drill"), "drillLabel": .string("DRILL"), "status": .string(status),
            "ipp": .null, "ippSource": .string("typed"), "plsTimeMs": .null, "terrain": .string("urban"),
            "priorVersion": .number(priorVersion), "priorModel": .string("rings"), "priorSeed": .number(20261122),
            "priorInputEventIds": .array([.string("e1")]), "engineParams": constants["params"] ?? .null, "gridId": .null,
            "conditions": .object(["tempF": .number(38), "wet": .bool(true), "setAtMs": .number(1000)]),
        ])
    }

    static func plan(segmentIds: [String], task: String = "Walk the creek bank.", version: Double = 2, team: String = "T1") -> JSONValue {
        .object(["version": .number(version), "basedOnEventSetHash": .string("h"), "priorVersion": .number(5),
                 "assignments": .array([.object(["teamId": .string(team), "segmentIds": .array(segmentIds.map(JSONValue.string)),
                                                 "taskText": .string(task), "reason": .string("r")])]),
                 "approvedByUid": .string("cmd"), "approvedAt": .number(2000), "createdClientTimeMs": .number(1500)])
    }

    static let shared: JSONValue = .object([
        "answersTo": .string("Margaret"), "nickname": .string("Mom"), "otherNames": .array([.string("Mom"), .string("Peggy")]),
        "ageYears": .number(81), "gender": .string("woman"), "appearance": .string("small, white hair in a bun"),
        "heightFt": .number(5), "heightIn": .number(2), "weightLb": .null, "hair": .string("white"), "eyeColor": .string("blue"),
        "primaryLanguage": .string("English"), "clothingLastWorn": .string("blue robe"), "mobilityAids": .array([]),
        "dementiaType": .null, "flags": .object(["mayNotRespond": .bool(true)]), "triggersToAvoid": .string(""),
        "bestApproach": .string(""), "uniqueDescription": .string(""), "photoTakenOn": .null,
        "approachNoteIds": .array([.string("may_not_respond"), .string("stop_calling_name")]),
    ])
}

@Suite struct MissionBuilderTests {
    let params = try! BundledConstants.engineParams()

    @Test func theDrillIncidentBuildsTheTeamsMission() throws {
        let segments = try DrillDocs.segments()
        let firstId = try #require({ () -> String? in for s in segments { if case let .string(id)? = s["segmentId"], id != "ROW" { return id } }; return nil }())
        let docs = MissionDocs(incident: try DrillDocs.incident(), segments: segments, plan: DrillDocs.plan(segmentIds: [firstId]),
                               sharedProfile: DrillDocs.shared)
        let m = try MissionBuilder.build(incidentId: "drill-dev-1", teamId: "T1", docs: docs, bundledParams: params)
        #expect(m.incidentId == "drill-dev-1" && m.teamId == "T1" && m.mode == "drill" && m.priorVersion == 5)
        #expect(m.grid.count == 2 && m.prior.count == 3)
        #expect(m.assignedSegmentIds == [firstId] && m.assignment?.taskText == "Walk the creek bank.")
        #expect(m.params == params && m.priorInputEventIds == ["e1"] && m.conditions?.wet == true)
        #expect(m.sharedProfile?.namesToCall == ["Mom", "Peggy"] && m.sharedProfile?.approachNoteIds.contains("stop_calling_name") == true)
        #expect(m.rdBasis == .default && m.visualDetectionRangeM == nil)
    }

    /// Before command approves a plan or shares a profile, the mission still loads with no assignment.
    @Test func noPlanAndNoProfileYetStillLoads() throws {
        let docs = MissionDocs(incident: try DrillDocs.incident(), segments: try DrillDocs.segments(), plan: nil, sharedProfile: nil)
        let m = try MissionBuilder.build(incidentId: "drill-dev-1", teamId: "T1", docs: docs, bundledParams: params)
        #expect(m.assignment == nil && m.assignedSegmentIds.isEmpty && m.sharedProfile == nil)
    }

    /// The mission keeps the incident's grid id (the map picks its offline tiles by it) and the
    /// grid's OpenStreetMap line; both are nil when the incident has none.
    @Test func theMissionKeepsTheGridIdAndItsMapCredit() throws {
        guard case var .object(incident) = try DrillDocs.incident() else { Issue.record("no incident"); return }
        let docs = { MissionDocs(incident: .object(incident), segments: try DrillDocs.segments(), plan: nil, sharedProfile: nil) }
        let none = try MissionBuilder.build(incidentId: "drill-dev-1", teamId: "T1", docs: try docs(), bundledParams: params)
        #expect(none.gridId == nil && none.gridAttribution == nil)
        incident["gridId"] = .string("kennesaw-mountain-drill")
        incident["gridAttribution"] = .string("Map data from OpenStreetMap contributors (ODbL)")
        let m = try MissionBuilder.build(incidentId: "drill-dev-1", teamId: "T1", docs: try docs(), bundledParams: params)
        #expect(m.gridId == "kennesaw-mountain-drill" && m.gridAttribution == "Map data from OpenStreetMap contributors (ODbL)")
    }

    /// Only an incident marked exactly "drill" or "judge" may use a model: a missing or mistyped
    /// mode keeps the phone on the rules path.
    @Test func aMissingOrMistypedModeNeverEnablesAModel() throws {
        func mode(_ value: JSONValue?) throws -> String {
            guard case var .object(o) = try DrillDocs.incident() else { throw CocoaError(.coderInvalidValue) }
            o["mode"] = value
            return try MissionBuilder.build(incidentId: "d", teamId: "T1", docs: MissionDocs(incident: .object(o), segments: try DrillDocs.segments()),
                                            bundledParams: params).mode
        }
        let drill = try mode(.string("drill")), judge = try mode(.string("judge"))
        #expect(ReadPlan.modelModes.contains(drill) && ReadPlan.modelModes.contains(judge))
        for bad: JSONValue? in [nil, .null, .number(1), .string("Drill"), .string("training"), .string("")] {
            let read = try mode(bad)
            #expect(!ReadPlan.modelModes.contains(read), "\(String(describing: bad)) read as \(read)")
        }
    }

    @Test func aMissionThatCannotBeTrustedIsRefusedInWords() throws {
        let segments = try DrillDocs.segments()
        #expect(throws: MissionBuilder.Failure.notOpen) {
            try MissionBuilder.build(incidentId: "d", teamId: "T1", docs: MissionDocs(incident: try DrillDocs.incident(status: "found"), segments: segments),
                                     bundledParams: params)
        }
        #expect(throws: MissionBuilder.Failure.priorMismatch) {
            try MissionBuilder.build(incidentId: "d", teamId: "T1", docs: MissionDocs(incident: try DrillDocs.incident(priorVersion: 6), segments: segments),
                                     bundledParams: params)
        }
        let noRow = segments.filter { $0["segmentId"] != .string("ROW") }
        #expect(throws: MissionBuilder.Failure.self) {
            try MissionBuilder.build(incidentId: "d", teamId: "T1", docs: MissionDocs(incident: try DrillDocs.incident(), segments: noRow), bundledParams: params)
        }
        #expect(MissionBuilder.Failure.priorMismatch.message == "Command is rebuilding the search area. Try again in a minute.")
    }
}
