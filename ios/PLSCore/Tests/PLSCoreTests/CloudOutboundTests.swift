import Foundation
import Testing
@testable import PLSCore

/// Builds a document with a distinct, findable value at every leaf the subject-profile schema
/// defines, so a field that leaks into the cloud prompt can be found by its value.
struct SentinelDoc {
    var counter = 800
    var leaves: [(path: String, text: String)] = []

    mutating func value(for schema: JSONValue, path: String) -> JSONValue {
        if case let .array(options)? = schema["anyOf"] {
            let pick = options.first { if case .string("null")? = $0["type"] { false } else { true } } ?? .null
            return value(for: pick, path: path)
        }
        if case let .array(values)? = schema["enum"], let first = values.first {
            if case let .string(s) = first { leaves.append((path, s)) }
            return first
        }
        let type: String = { if case let .string(t)? = schema["type"] { t } else { "" } }()
        switch type {
        case "object":
            guard case let .object(props)? = schema["properties"] else { return .object([:]) }
            var o: [String: JSONValue] = [:]
            for (k, sub) in props.sorted(by: { $0.key < $1.key }) { o[k] = value(for: sub, path: path.isEmpty ? k : "\(path).\(k)") }
            return .object(o)
        case "array":
            return .array([value(for: schema["items"] ?? .null, path: "\(path)[]")])
        case "string":
            if case .string? = schema["pattern"] { leaves.append((path, "1999-09-09")); return .string("1999-09-09") }
            let s = "zq\(path.replacingOccurrences(of: ".", with: "_").replacingOccurrences(of: "[]", with: ""))zq"
            leaves.append((path, s))
            return .string(s)
        case "integer", "number":
            counter += 1
            leaves.append((path, String(counter)))
            return .number(Double(counter))
        case "boolean":
            return .bool(true)
        default:
            return .null
        }
    }
}

@Suite struct CloudOutboundTests {
    /// Design section 9: the cloud route may carry the report text, segmentHere's segment id,
    /// teamAssignment's ids and subjectDescription's clothing and appearance fields. Nothing else
    /// from the subject: no health, behaviour, medication, address, name or contact field.
    @Test func cloudPromptHoldsOnlyNamedFields() throws {
        let schema = try VectorFile.json("schemas/subject-profile.schema.json")
        var maker = SentinelDoc()
        guard case let .object(shared) = maker.value(for: schema["$defs"]?["SharedProfile"] ?? .null, path: ""),
              case let .object(command) = maker.value(for: schema["$defs"]?["CommandProfile"] ?? .null, path: "command") else {
            Issue.record("schema"); return
        }
        // Even a document that wrongly mixes in the command-only fields must not leak them.
        let mixed = JSONValue.object(shared.merging(command) { a, _ in a })
        let report = "Cleared segment AB, coverage point eight."
        let outbound = CloudOutbound.texts(report: report, positionSegmentId: "AC", assignedSegmentIds: ["AB", "AD"],
                                           profile: ModelProfile(shared: mixed))
        let all = outbound.joined(separator: "\n")

        let allowed: Set<String> = ["clothingLastWorn", "appearance", "heightFt", "heightIn", "hair", "mobilityAids[]"]
        #expect(maker.leaves.count >= 25)                                                     // the walk saw the schema
        for leaf in maker.leaves {
            if allowed.contains(leaf.path) {
                #expect(all.contains(leaf.text), "allowed field \(leaf.path) missing")
            } else {
                #expect(!all.contains(leaf.text), "field \(leaf.path) reached the cloud prompt")
            }
        }
        guard case let .object(flags)? = schema["$defs"]?["SharedProfile"]?["properties"]?["flags"]?["properties"] else {
            Issue.record("flags"); return
        }
        for name in flags.keys { #expect(!all.contains(name), "flag \(name) named in the cloud prompt") }
        for forbidden in ["dementia", "medication", "seizure", "address", "phone number", "contact"] {
            #expect(!all.lowercased().contains(forbidden), "\(forbidden) in the cloud prompt")
        }
        #expect(all.contains(report))
        #expect(all.contains("segment AC"))
        #expect(all.contains("AB, AD"))
    }

    @Test func theOutboundListIsExactlyInstructionsReportAndThreeTools() {
        let texts = CloudOutbound.texts(report: "r", positionSegmentId: nil, assignedSegmentIds: [], profile: ModelProfile(shared: .object([:])))
        #expect(texts.first == PromptText.guided)
        #expect(texts[1] == "r")
        #expect(texts.count == 2 + 3 * 3)
        #expect(texts.contains(ToolText.segmentHere(nil)))
        #expect(texts.contains(ToolText.teamAssignment([])))
    }

    /// Apple's model gets no tools: where the team is and what it was assigned are plain sentences in its
    /// instructions, built by code. It gets no description of the subject and no tool names.
    @Test func applesModelsInstructionsCarryPositionAndAssignmentAsSentences() {
        let fix = PromptText.onDeviceGuided(positionSegmentId: "BO", assignedSegmentIds: ["BO", "BP"])
        #expect(fix.contains("The phone's GPS fix puts the team in segment BO."))
        #expect(fix.contains("Command assigned this team segments BO, BP."))
        let none = PromptText.onDeviceGuided(positionSegmentId: nil, assignedSegmentIds: [])
        #expect(none.contains("The phone has no GPS fix, so where the team is standing is not known."))
        #expect(none.contains("Command has not assigned this team yet."))
        for text in [fix, none] {
            #expect(text.contains("Set matchesProfile to unknown.") && text.contains("never leave it empty"))
            for name in [ToolText.segmentHereName, ToolText.teamAssignmentName, ToolText.subjectDescriptionName] { #expect(!text.contains(name)) }
        }
    }

    /// A quote of either sentence is not the report's words, so the validator rejects it.
    @Test func aQuoteOfTheContextSentencesIsRejected() {
        let report = "Cleared segment BO, nothing found."
        for quote in [PromptText.onDevicePosition("BO"), PromptText.onDevicePosition(nil),
                      PromptText.onDeviceAssignment(["BO", "BP"]), PromptText.onDeviceAssignment([])] {
            let r = reading(segmentIds: ["BO"], evidenceQuote: quote)
            #expect(ReadingValidator.validate(r, knownSegmentIds: ["BO", "BP"], rawText: report) == .invalid(reasons: ["quote_not_in_text"]))
        }
    }
}
